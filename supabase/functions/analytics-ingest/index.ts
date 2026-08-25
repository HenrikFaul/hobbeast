import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, getSupabaseAdmin, resolveInternalSupabaseUrl } from '../shared/providerFetch.ts';
import { correlationIdFromRequest, logEdgeEvent, observeEdgeOperation } from '../shared/edgeObservability.ts';

const EVENTS = new Set([
  'onboarding_started', 'onboarding_completed', 'interest_selected', 'event_impression',
  'event_detail', 'event_join', 'waitlist_joined', 'checked_in', 'completed',
  'post_event_feedback', 'reconnection_sent', 'reconnection_mutual', 'circle_created',
  'circle_joined', 'organizer_event_created', 'organizer_event_completed', 'hub_qualified',
  'auto_event_proposed', 'auto_event_published', 'verified_or_confirmed_real_world_participation',
  'external_social_intent', 'explore_search',
]);
const SAFE_KEYS = new Set([
  'event_id', 'category', 'source', 'surface', 'status', 'city_bucket', 'cohort',
  'experiment_key', 'variant', 'duration_bucket', 'count_bucket', 'schema_version',
]);
const FORBIDDEN_KEY = /(email|phone|address|lat|lon|name|bio|message|description|text|token|secret|password)/i;
const MAX_BODY_BYTES = 8 * 1024;
const headers = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-correlation-id, idempotency-key`,
};

function respond(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
  });
}

async function pseudonymize(value: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return respond({ ok: false, code: 'METHOD_NOT_ALLOWED', correlationId }, 405, correlationId);

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    const body = JSON.parse(raw) as Record<string, unknown>;
    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new Error('UNAUTHORIZED');
    const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
    const salt = String(Deno.env.get('ANALYTICS_HASH_SALT') || '').trim();
    if (!anonKey || salt.length < 16) throw new Error('SERVER_CONFIG');

    const userClient = createClient(resolveInternalSupabaseUrl(req), anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('UNAUTHORIZED');
    const admin = getSupabaseAdmin(req);

    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    const cohort = roleRows?.length ? 'internal' : null;
    const { data: flagEnabled, error: flagError } = await observeEdgeOperation('flags.evaluate_analytics', correlationId, () =>
      admin.rpc('evaluate_feature_flag', {
        _flag_key: 'analytics', _subject_id: user.id, _cohort: cohort,
      }), { feature_flags: ['analytics'] });
    if (flagError) throw new Error('FLAG_CHECK_FAILED');
    if (!flagEnabled) return respond({ ok: true, accepted: false, suppressedReason: 'feature_disabled', correlationId }, 202, correlationId);

    const { data: consent, error: consentError } = await observeEdgeOperation('privacy.read_analytics_consent', correlationId, () =>
      admin
        .from('consent_records')
        .select('decision')
        .eq('user_id', user.id)
        .eq('purpose', 'analytics')
        .order('decided_at', { ascending: false })
        .limit(1)
        .maybeSingle(), { feature_flags: ['analytics'] });
    if (consentError) throw new Error('CONSENT_CHECK_FAILED');
    if (consent?.decision !== 'granted') {
      return respond({ ok: true, accepted: false, suppressedReason: 'consent_missing', correlationId }, 202, correlationId);
    }

    const eventName = String(body.eventName || '');
    const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || '');
    const occurredAt = String(body.occurredAt || '');
    const properties = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
      ? body.properties as Record<string, unknown>
      : {};
    if (!EVENTS.has(eventName) || idempotencyKey.length < 8 || idempotencyKey.length > 128 || Number.isNaN(Date.parse(occurredAt))) {
      throw new Error('INVALID_EVENT');
    }
    const safeProperties: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!SAFE_KEYS.has(key) || FORBIDDEN_KEY.test(key)) throw new Error('FORBIDDEN_PROPERTY');
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('INVALID_PROPERTY');
      if (typeof value === 'string' && value.length > 120) throw new Error('INVALID_PROPERTY');
      safeProperties[key] = value as string | number | boolean | null;
    }

    const actorPseudonym = await pseudonymize(user.id, salt);
    const { error: insertError } = await observeEdgeOperation('analytics.upsert_event', correlationId, () =>
      admin.from('product_analytics_events').upsert({
        event_name: eventName,
        schema_version: 1,
        actor_pseudonym: actorPseudonym,
        properties: safeProperties,
        source: 'web',
        idempotency_key: idempotencyKey,
        correlation_id: correlationId,
        occurred_at: occurredAt,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true }), { feature_flags: ['analytics'] });
    if (insertError) throw new Error('ANALYTICS_WRITE_FAILED');
    logEdgeEvent('info', 'analytics_event_accepted', correlationId, { event_name: eventName, schema_version: 1 });
    return respond({ ok: true, accepted: true, correlationId }, 202, correlationId);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'BODY_TOO_LARGE' ? 413 : code === 'SERVER_CONFIG' ? 503 : code.startsWith('INVALID') || code === 'FORBIDDEN_PROPERTY' ? 400 : 500;
    logEdgeEvent(status >= 500 ? 'error' : 'warn', 'analytics_ingest_failed', correlationId, { code, status });
    return respond({ ok: false, code, correlationId }, status, correlationId);
  }
});
