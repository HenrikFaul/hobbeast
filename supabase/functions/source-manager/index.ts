// Self-service program-source management.
//
//   inspect     -> fetches a URL, works out which extraction recipe fits, and
//                  returns real sample programs for each one that produced any
//   save        -> writes the source into the collector registry (admins)
//   submit      -> queues a provider's source for admin review (any signed-in user)
//   submissions -> the review queue (admins)
//   review      -> approve / reject a submission (admins)
//   verify      -> targeted collector run for one source (admins)
//
// The recipe engine in ./recipes.mjs is the SAME file the scraper worker runs,
// so what the preview shows is what the production run will do. scripts/
// sync-edge-recipes.mjs keeps the copy in step and a test fails if it drifts.

// Self-contained on purpose: the recipe engine is a plain .mjs file shared with
// the scraper worker, and bundling it together with the ../shared/* tree is what
// the deploy pipeline cannot do. The handful of helpers below are the same ones
// shared/providerFetch.ts and shared/userAuth.ts provide.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  extractWithRule, inspectSource, normalizeSourceUrl, sampleRepeatingBlock, validateRule,
} from './recipes.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) ?? '').trim();
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

function getSupabaseAdmin() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAuthenticatedUserClient(req: Request) {
  const header = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new Error('AUTH_REQUIRED');
  const anonKey = String(
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
  ).trim();
  if (!anonKey) throw new Error('EDGE_AUTH_CONFIGURATION_MISSING');
  const client = createClient(requiredEnv('SUPABASE_URL'), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_INVALID');
  return { client, user: data.user };
}

const REPO = 'HenrikFaul/hobbeast';
const WORKFLOW = 'event-scraper.yml';
const MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; HobbeastSourceInspector/1.0; +https://expericentre.com)';

// A signed-in user chooses the URL we fetch, so the fetcher must never become a
// probe into the platform's own network.
const BLOCKED_HOSTS = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const BLOCKED_IPV4 = /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./;

function assertPublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('BLOCKED_SCHEME');
  if (url.port && !['80', '443', ''].includes(url.port)) throw new Error('BLOCKED_PORT');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.test(host) || BLOCKED_IPV4.test(host) || host === '::1' || host.startsWith('[')) {
    throw new Error('BLOCKED_HOST');
  }
  return url;
}

interface FetchResult { ok: boolean; status: number; text: string; contentType: string }

// Redirects are followed by hand so that every hop is checked, not just the first.
async function fetchText(target: string): Promise<FetchResult> {
  let current: string;
  try {
    current = assertPublicUrl(target).toString();
  } catch {
    return { ok: false, status: 0, text: '', contentType: '' };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'hu,en;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 0, text: '', contentType: '' };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { ok: false, status: res.status, text: '', contentType: '' };
      try {
        current = assertPublicUrl(new URL(location, current).toString()).toString();
      } catch {
        return { ok: false, status: res.status, text: '', contentType: '' };
      }
      continue;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer);
    return { ok: res.ok, status: res.status, text, contentType };
  }
  return { ok: false, status: 310, text: '', contentType: '' };
}

// Best-effort burst guard. Instances are short-lived, so this only blunts a
// hammering client; the durable limits are the DB-side submission caps.
const recentCalls = new Map<string, number[]>();
function overRateLimit(userId: string, perMinute = 12) {
  const now = Date.now();
  const calls = (recentCalls.get(userId) ?? []).filter((t) => now - t < 60_000);
  calls.push(now);
  recentCalls.set(userId, calls);
  if (recentCalls.size > 500) recentCalls.clear();
  return calls.length > perMinute;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' }, request_id: requestId }, 405);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const { client: asUser, user } = await requireAuthenticatedUserClient(req);
    const admin = getSupabaseAdmin();

    const requireAdmin = async () => {
      const { data, error } = await admin.rpc('admin_has_capability', {
        _user_id: user.id, _capability_key: 'providers.manage',
      });
      if (error || !data) throw new Error('CAPABILITY_REQUIRED');
      return true;
    };

    if (action === 'inspect') {
      if (overRateLimit(user.id)) {
        return jsonResponse({ error: { code: 'RATE_LIMITED' }, request_id: requestId }, 429);
      }
      const url = normalizeSourceUrl(String(body.url ?? ''));
      if (!url) return jsonResponse({ error: { code: 'INVALID_URL' }, request_id: requestId }, 400);
      const result = await inspectSource(url, { fetchText, maxDetailFetches: 5 });
      return jsonResponse({ ...result, request_id: requestId });
    }

    if (action === 'test-rule') {
      if (overRateLimit(user.id)) {
        return jsonResponse({ error: { code: 'RATE_LIMITED' }, request_id: requestId }, 429);
      }
      const url = normalizeSourceUrl(String(body.url ?? ''));
      if (!url) return jsonResponse({ error: { code: 'INVALID_URL' }, request_id: requestId }, 400);
      const check = validateRule(body.rule);
      if (!check.ok) {
        return jsonResponse({ events: [], errors: check.errors, request_id: requestId });
      }
      const page = await fetchText(url);
      if (!page.ok) {
        return jsonResponse({
          events: [],
          errors: [`Az oldal nem érhető el (HTTP ${page.status}).`],
          request_id: requestId,
        });
      }
      const result = extractWithRule(page.text, body.rule, url);
      return jsonResponse({
        events: result.events.slice(0, 10),
        total: result.events.length,
        errors: result.errors,
        // A statically fetched page cannot show a JS-built listing; say so
        // rather than letting an empty result look like a broken rule.
        note: result.events.length === 0
          ? 'Ha az oldal JavaScripttel építi a listát, itt üres marad — mentés után a próbafuttatás böngészővel tölti be.'
          : null,
        request_id: requestId,
      });
    }

    if (action === 'suggest-rule') {
      await requireAdmin();
      const url = normalizeSourceUrl(String(body.url ?? ''));
      if (!url) return jsonResponse({ error: { code: 'INVALID_URL' }, request_id: requestId }, 400);
      const page = await fetchText(url);
      if (!page.ok) {
        return jsonResponse({ error: { code: 'PAGE_UNREACHABLE', status: page.status }, request_id: requestId }, 502);
      }
      const block = sampleRepeatingBlock(page.text);
      const fallbackRule = {
        version: 1,
        container: block.hintSelector ?? '.event',
        fields: {
          title: { selector: 'h1, h2, h3, .title' },
          date: { selector: 'time, .date, .datum' },
          url: { selector: 'a', attr: 'href' },
        },
        dateFormat: 'auto',
      };

      const apiKey = String(Deno.env.get('GEMINI_API_KEY') ?? '').trim();
      if (!apiKey) {
        const tried = extractWithRule(page.text, fallbackRule, url);
        return jsonResponse({
          rule: fallbackRule,
          events: tried.events.slice(0, 10),
          errors: tried.errors,
          candidates: block.candidates,
          source: 'heuristic',
          note: 'AI kulcs nincs beállítva, ezért a leggyakoribb ismétlődő elemből készült javaslat.',
          request_id: requestId,
        });
      }

      // The model returns a RULE, never code. Whatever it answers is validated
      // against our schema and then interpreted by our own reader, so a hostile
      // page cannot turn this into execution.
      const prompt = [
        'You extract event listings. Given an HTML fragment, answer with ONE JSON object and nothing else.',
        'Schema: {"version":1,"container":"<css selector for the repeating event element>",',
        '"fields":{"title":{"selector":"..."},"date":{"selector":"...","attr":"text|datetime"},',
        '"time":{"selector":"..."},"url":{"selector":"a","attr":"href"},"image":{"selector":"img","attr":"src"},',
        '"location":{"selector":"..."},"price":{"selector":"..."}},"dateFormat":"auto|hu|iso"}',
        'Only these selector features are supported: tag, .class, #id, [attr], [attr=v], [attr^=v], [attr$=v],',
        '[attr*=v], descendant (space) and child (>) combinators. No pseudo-classes, no :has, no :nth-child.',
        'Field selectors are resolved INSIDE the container element. Omit fields the page does not have.',
        'Prefer stable class names over generated ones. Dates are usually Hungarian free text.',
        block.hintSelector ? `A likely container is ${block.hintSelector}.` : '',
        'HTML fragment:',
        block.snippet,
      ].filter(Boolean).join('\n');

      let rule = null;
      let modelError = null;
      try {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='
            + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        rule = JSON.parse(text);
      } catch (error) {
        modelError = error instanceof Error ? error.message.slice(0, 120) : 'unknown';
      }

      const check = rule ? validateRule(rule) : { ok: false, errors: [] };
      const chosen = check.ok ? rule : fallbackRule;
      const tried = extractWithRule(page.text, chosen, url);
      return jsonResponse({
        rule: chosen,
        events: tried.events.slice(0, 10),
        total: tried.events.length,
        errors: [...(check.ok ? [] : check.errors), ...tried.errors],
        candidates: block.candidates,
        source: check.ok ? 'ai' : 'heuristic',
        note: check.ok
          ? null
          : (modelError
            ? `Az AI javaslat nem érkezett meg (${modelError}); a leggyakoribb ismétlődő elemből készült javaslat.`
            : 'Az AI válasza nem felelt meg a szabály-sémának, ezért a heurisztikus javaslat látszik.'),
        request_id: requestId,
      });
    }

    if (action === 'save') {
      await requireAdmin();
      const { data, error } = await admin.rpc('admin_upsert_scraper_source', {
        p_endpoint_url: String(body.endpoint_url ?? ''),
        p_publisher_name: String(body.publisher_name ?? ''),
        p_strategy: String(body.strategy ?? 'render'),
        p_homepage_url: body.homepage_url ? String(body.homepage_url) : null,
        p_city: body.city ? String(body.city) : null,
        p_categories: Array.isArray(body.categories) ? body.categories.map(String).slice(0, 6) : [],
        p_scrape_enabled: body.scrape_enabled !== false,
        p_note: body.note ? String(body.note).slice(0, 300) : null,
        p_source_id: body.source_id ? String(body.source_id) : null,
        p_rule: body.rule ?? null,
      });
      if (error) {
        console.error(JSON.stringify({ level: 'error', code: 'SAVE_FAILED', detail: error.message, request_id: requestId }));
        return jsonResponse({ error: { code: 'SAVE_FAILED', detail: error.message } , request_id: requestId }, 400);
      }
      return jsonResponse({ source_id: data, request_id: requestId }, 201);
    }

    if (action === 'submit') {
      // Runs as the caller: submit_event_source keys everything off auth.uid().
      const { data, error } = await asUser.rpc('submit_event_source', {
        p_endpoint_url: String(body.endpoint_url ?? ''),
        p_publisher_name: String(body.publisher_name ?? ''),
        p_strategy: String(body.strategy ?? 'render'),
        p_homepage_url: body.homepage_url ? String(body.homepage_url) : null,
        p_city: body.city ? String(body.city) : null,
        p_categories: Array.isArray(body.categories) ? body.categories.map(String).slice(0, 6) : [],
        p_note: body.note ? String(body.note).slice(0, 500) : null,
        p_inspection: body.inspection ?? {},
        p_detected_events: Number(body.detected_events ?? 0) || 0,
      });
      if (error) {
        return jsonResponse({ error: { code: 'SUBMIT_FAILED', detail: error.message }, request_id: requestId }, 400);
      }
      return jsonResponse({ submission_id: data, request_id: requestId }, 201);
    }

    if (action === 'submissions') {
      await requireAdmin();
      const { data, error } = await asUser.rpc('admin_list_source_submissions', {
        p_status: body.status ? String(body.status) : null,
      });
      if (error) throw new Error('SUBMISSIONS_FAILED');
      return jsonResponse({ submissions: data ?? [], request_id: requestId });
    }

    if (action === 'review') {
      await requireAdmin();
      const { data, error } = await asUser.rpc('admin_review_source_submission', {
        p_id: String(body.id ?? ''),
        p_approve: body.approve === true,
        p_note: body.note ? String(body.note).slice(0, 500) : null,
      });
      if (error) {
        return jsonResponse({ error: { code: 'REVIEW_FAILED', detail: error.message }, request_id: requestId }, 400);
      }
      return jsonResponse({ source_id: data, request_id: requestId });
    }

    if (action === 'verify') {
      await requireAdmin();
      const sourceId = String(body.source_id ?? '');
      if (!/^src_[a-f0-9]{8}$/.test(sourceId)) {
        return jsonResponse({ error: { code: 'INVALID_SOURCE_ID' }, request_id: requestId }, 400);
      }
      const { data: token, error: vaultError } = await admin.rpc('get_scraper_dispatch_token');
      if (vaultError || !token) {
        return jsonResponse({ error: { code: 'DISPATCH_TOKEN_MISSING' }, request_id: requestId }, 503);
      }
      const ghRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'hobbeast-source-manager',
        },
        body: JSON.stringify({ ref: 'main', inputs: { only: sourceId, sources: '1', details: '60' } }),
      });
      if (ghRes.status !== 204) {
        const detail = (await ghRes.text()).slice(0, 120);
        console.error(JSON.stringify({ level: 'error', code: 'DISPATCH_FAILED', status: ghRes.status, detail, request_id: requestId }));
        return jsonResponse({ error: { code: 'DISPATCH_FAILED' }, request_id: requestId }, 502);
      }
      return jsonResponse({ dispatched: true, started_at: new Date().toISOString(), request_id: requestId }, 202);
    }

    return jsonResponse({ error: { code: 'INVALID_ACTION' }, request_id: requestId }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SOURCE_MANAGER_FAILED';
    const code = /^(AUTH_|CAPABILITY_REQUIRED)/.test(message) ? message : 'SOURCE_MANAGER_FAILED';
    const status = code === 'CAPABILITY_REQUIRED' ? 403 : code.startsWith('AUTH_') ? 401 : 500;
    if (status === 500) {
      console.error(JSON.stringify({ level: 'error', code, detail: message.slice(0, 200) }));
    }
    return jsonResponse({ error: { code } }, status);
  }
});
