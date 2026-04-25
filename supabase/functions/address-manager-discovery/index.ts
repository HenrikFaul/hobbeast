// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  getSupabaseAdmin,
  jsonResponse,
  resolveInternalSupabaseUrl,
  safeServe,
} from '../_address-manager-shared/edgeRuntime.ts';
import {
  buildSummary,
  ensureMatrixSeeds,
  getMatrix,
  listVenues,
  loadLimits,
  releaseStaleLocks,
  resetCellsByFilter,
  saveLimits,
  setSelections,
} from '../_address-manager-shared/repository.ts';
import { PROVIDER_CATEGORIES, PROVIDER_PAGE_CAPS } from '../_address-manager-shared/constants.ts';
import type { ProviderKey, ProviderSelfTestResult } from '../_address-manager-shared/types.ts';

function resolveServiceKey() {
  return String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
}

async function callInternalFunction<T>(req: Request, functionName: string, body: Record<string, unknown>) {
  const baseUrl = resolveInternalSupabaseUrl(req);
  const serviceKey = resolveServiceKey();
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (cannot call internal function)');

  const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`Internal function ${functionName} failed: ${res.status} ${text.slice(0, 400)}`);
  }
  return payload as T;
}

const FETCH_TIMEOUT_MS = 12_000;
async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runSelfTest(): Promise<ProviderSelfTestResult[]> {
  const results: ProviderSelfTestResult[] = [];
  const lat = 47.4979;
  const lon = 19.0402;
  const radius = 2000;

  // Geoapify
  {
    const apiKey = Deno.env.get('GEOAPIFY_API_KEY') || '';
    const endpoint = `https://api.geoapify.com/v2/places?categories=catering.restaurant&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=5&apiKey=${apiKey ? '***' : ''}`;
    if (!apiKey) {
      results.push({ provider: 'geoapify', ok: false, status: null, sampleCount: 0, error: 'Missing GEOAPIFY_API_KEY', endpoint });
    } else {
      try {
        const res = await fetchWithTimeout(
          `https://api.geoapify.com/v2/places?categories=catering.restaurant&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=5&apiKey=${encodeURIComponent(apiKey)}`,
        );
        const text = await res.text();
        let payload: any = {};
        try { payload = JSON.parse(text); } catch { payload = {}; }
        const sampleCount = Array.isArray(payload?.features) ? payload.features.length : 0;
        results.push({
          provider: 'geoapify',
          ok: res.ok,
          status: res.status,
          sampleCount,
          error: res.ok ? undefined : text.slice(0, 400),
          endpoint,
        });
      } catch (err) {
        results.push({ provider: 'geoapify', ok: false, status: null, sampleCount: 0, error: err instanceof Error ? err.message : String(err), endpoint });
      }
    }
  }

  // TomTom
  {
    const apiKey = Deno.env.get('TOMTOM_API_KEY') || '';
    const endpoint = `https://api.tomtom.com/search/2/categorySearch/restaurant.json?key=${apiKey ? '***' : ''}&lat=${lat}&lon=${lon}&radius=${radius}&limit=5&countrySet=HU`;
    if (!apiKey) {
      results.push({ provider: 'tomtom', ok: false, status: null, sampleCount: 0, error: 'Missing TOMTOM_API_KEY', endpoint });
    } else {
      try {
        const res = await fetchWithTimeout(
          `https://api.tomtom.com/search/2/categorySearch/restaurant.json?key=${encodeURIComponent(apiKey)}&lat=${lat}&lon=${lon}&radius=${radius}&limit=5&countrySet=HU`,
        );
        const text = await res.text();
        let payload: any = {};
        try { payload = JSON.parse(text); } catch { payload = {}; }
        const sampleCount = Array.isArray(payload?.results) ? payload.results.length : 0;
        results.push({
          provider: 'tomtom',
          ok: res.ok,
          status: res.status,
          sampleCount,
          error: res.ok ? undefined : text.slice(0, 400),
          endpoint,
        });
      } catch (err) {
        results.push({ provider: 'tomtom', ok: false, status: null, sampleCount: 0, error: err instanceof Error ? err.message : String(err), endpoint });
      }
    }
  }

  return results;
}

serve(safeServe(async (req) => {
  const body = (await req.json().catch(() => ({}))) as any;
  const action = String(body.action || 'bootstrap');

  // ---- health: zero DB access, only env probe ----
  if (action === 'health') {
    const baseUrlOk = (() => {
      try { return Boolean(resolveInternalSupabaseUrl(req)); } catch { return false; }
    })();
    return jsonResponse({
      ok: true,
      action,
      env: {
        hasSupabaseUrl: Boolean(Deno.env.get('SUPABASE_URL')),
        hasServiceRole: Boolean(resolveServiceKey()),
        hasGeoapifyKey: Boolean(Deno.env.get('GEOAPIFY_API_KEY')),
        hasTomTomKey: Boolean(Deno.env.get('TOMTOM_API_KEY')),
        canResolveInternalUrl: baseUrlOk,
      },
      pageCaps: PROVIDER_PAGE_CAPS,
      categories: PROVIDER_CATEGORIES.map((c) => c.key),
    });
  }

  const supabaseAdmin = getSupabaseAdmin(req);

  // Only seed the matrix on bootstrap action — every other action assumes
  // the seeds are already there. This avoids 512-row upsert on every call.
  if (action === 'bootstrap' || action === 'reseed') {
    await ensureMatrixSeeds(supabaseAdmin);
  }

  if (action === 'self_test') {
    const providerResults = await runSelfTest();
    return jsonResponse({
      ok: true,
      action,
      providerResults,
      env: {
        hasGeoapifyKey: Boolean(Deno.env.get('GEOAPIFY_API_KEY')),
        hasTomTomKey: Boolean(Deno.env.get('TOMTOM_API_KEY')),
        hasServiceRole: Boolean(resolveServiceKey()),
      },
      pageCaps: PROVIDER_PAGE_CAPS,
      categories: PROVIDER_CATEGORIES,
    });
  }

  if (action === 'save_limits') {
    const limits = await saveLimits(supabaseAdmin, body.limits || {});
    return jsonResponse({
      ok: true,
      limits,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  }

  if (action === 'save_selection') {
    await setSelections(supabaseAdmin, Array.isArray(body.updates) ? body.updates : []);
    return jsonResponse({
      ok: true,
      limits: await loadLimits(supabaseAdmin),
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  }

  if (action === 'reset_cells') {
    await resetCellsByFilter(supabaseAdmin, {
      provider: body.provider as ProviderKey | undefined,
      country_codes: Array.isArray(body.countries) ? body.countries : undefined,
      category_keys: Array.isArray(body.categories) ? body.categories : undefined,
      onlyCompleted: Boolean(body.onlyCompleted),
    });
    return jsonResponse({
      ok: true,
      limits: await loadLimits(supabaseAdmin),
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  }

  if (action === 'release_stale_locks') {
    await releaseStaleLocks(supabaseAdmin, Number(body.olderThanMinutes || 10));
    return jsonResponse({
      ok: true,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  }

  if (action === 'list_venues') {
    const provider = String(body.provider || 'all') as ProviderKey | 'all';
    const countries = Array.isArray(body.countries) ? body.countries.map((item: unknown) => String(item).toUpperCase()) : [];
    const categories = Array.isArray(body.categories) ? body.categories.map((item: unknown) => String(item)) : [];
    const venues = await listVenues(supabaseAdmin, {
      provider,
      countries,
      categories,
      page: Number(body.page || 1),
      pageSize: Number(body.pageSize || 25),
    });
    return jsonResponse({ ok: true, ...venues, summary: await buildSummary(supabaseAdmin) });
  }

  if (action === 'run_chunk') {
    const limits = await loadLimits(supabaseAdmin);
    const iterations = Math.max(1, Math.min(Number(body.iterations || limits.worker_chunk_size || 1), 100));
    const steps: Array<Record<string, unknown>> = [];
    let totalWritten = 0;

    for (let index = 0; index < iterations; index += 1) {
      const generated = await callInternalFunction<{
        ok: boolean;
        generated: boolean;
        task?: Record<string, unknown>;
        reason?: string;
      }>(req, 'address-manager-task-generator', {});

      if (!generated.ok || !generated.generated || !generated.task) {
        steps.push({ step: index + 1, generated: generated.generated || false, reason: generated.reason || 'done' });
        break;
      }

      const worker = await callInternalFunction<{
        ok: boolean;
        written?: number;
        processedTiles?: number;
        done?: boolean;
        tileIndex?: number;
        totalTiles?: number;
        error?: string;
      }>(req, 'address-manager-worker', { task: generated.task });

      totalWritten += Number(worker.written || 0);
      steps.push({
        step: index + 1,
        generated: true,
        task: generated.task,
        worker,
      });

      if (!worker.ok) break;
    }

    return jsonResponse({
      ok: true,
      processedSteps: steps.length,
      totalWritten,
      steps,
      limits,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  }

  // Default = bootstrap
  return jsonResponse({
    ok: true,
    limits: await loadLimits(supabaseAdmin),
    matrix: await getMatrix(supabaseAdmin),
    summary: await buildSummary(supabaseAdmin),
    pageCaps: PROVIDER_PAGE_CAPS,
  });
}));
