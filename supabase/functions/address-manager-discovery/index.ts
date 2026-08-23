// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  getSupabaseAdmin,
  jsonResponse,
  resolveInternalSupabaseUrl,
  safeServe,
} from '../_address-manager-shared/edgeRuntime.ts';
import { requireAddressManagerAdmin } from '../_address-manager-shared/adminBoundary.ts';
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
import {
  EUROPEAN_COUNTRIES,
  PROVIDERS,
  PROVIDER_CATEGORIES,
  PROVIDER_PAGE_CAPS,
} from '../_address-manager-shared/constants.ts';
import {
  ADDRESS_MANAGER_MAX_RUN_CHUNK_ITERATIONS,
  AddressManagerError,
  assertAddressManagerPost,
  boundedInteger,
  boundedString,
  boundedStringArray,
  readBoundedJsonObject,
  requireRecord,
  validateAddressManagerLimitsPatch,
} from '../_address-manager-shared/requestContract.ts';
import type { MatrixSelectionUpdate, ProviderKey, ProviderSelfTestResult } from '../_address-manager-shared/types.ts';

const ACTIONS = new Set([
  'bootstrap',
  'reseed',
  'health',
  'self_test',
  'save_limits',
  'save_selection',
  'reset_cells',
  'release_stale_locks',
  'list_venues',
  'run_chunk',
]);
const COUNTRY_CODES = new Set(EUROPEAN_COUNTRIES.map((country) => country.code));
const CATEGORY_KEYS = new Set(PROVIDER_CATEGORIES.map((category) => category.key));
const INTERNAL_RESPONSE_MAX_BYTES = 1024 * 1024;
const INTERNAL_TIMEOUT_MS = 52_000;
const SELF_TEST_TIMEOUT_MS = 12_000;

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = text ? JSON.parse(text) as unknown : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function resolvePublicApiKey() {
  return String(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
}

async function callInternalFunction<T>(
  req: Request,
  functionName: 'address-manager-task-generator' | 'address-manager-worker',
  body: Record<string, unknown>,
  correlationId: string,
) {
  const baseUrl = resolveInternalSupabaseUrl(req);
  const authHeader = String(req.headers.get('authorization') || '').trim();
  const publicApiKey = resolvePublicApiKey();
  if (!authHeader) throw new AddressManagerError('AUTH_REQUIRED', 401);
  if (!publicApiKey) throw new AddressManagerError('INTERNAL_FUNCTION_FAILED', 500);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: publicApiKey,
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new AddressManagerError('INTERNAL_FUNCTION_FAILED', 502);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > INTERNAL_RESPONSE_MAX_BYTES) {
    throw new AddressManagerError('INTERNAL_FUNCTION_FAILED', 502);
  }
  const payload = parseJsonObject(text);
  if (!response.ok || payload.ok !== true) {
    throw new AddressManagerError('INTERNAL_FUNCTION_FAILED', 502);
  }
  return payload as T;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SELF_TEST_TIMEOUT_MS);
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
  const radius = 2_000;

  const geoapifyKey = String(Deno.env.get('GEOAPIFY_API_KEY') || '').trim();
  const geoapifyEndpoint = `https://api.geoapify.com/v2/places?categories=catering.restaurant&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=5&apiKey=***`;
  if (!geoapifyKey) {
    results.push({ provider: 'geoapify', ok: false, status: null, sampleCount: 0, error: 'PROVIDER_CONFIG_MISSING', endpoint: geoapifyEndpoint });
  } else {
    try {
      const response = await fetchWithTimeout(
        `https://api.geoapify.com/v2/places?categories=catering.restaurant&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=5&apiKey=${encodeURIComponent(geoapifyKey)}`,
      );
      const payload = parseJsonObject(await response.text());
      results.push({
        provider: 'geoapify',
        ok: response.ok,
        status: response.status,
        sampleCount: Array.isArray(payload.features) ? Math.min(payload.features.length, 5) : 0,
        error: response.ok ? undefined : 'PROVIDER_REQUEST_FAILED',
        endpoint: geoapifyEndpoint,
      });
    } catch {
      results.push({ provider: 'geoapify', ok: false, status: null, sampleCount: 0, error: 'PROVIDER_REQUEST_FAILED', endpoint: geoapifyEndpoint });
    }
  }

  const tomtomKey = String(Deno.env.get('TOMTOM_API_KEY') || '').trim();
  const tomtomEndpoint = `https://api.tomtom.com/search/2/categorySearch/restaurant.json?key=***&lat=${lat}&lon=${lon}&radius=${radius}&limit=5&countrySet=HU`;
  if (!tomtomKey) {
    results.push({ provider: 'tomtom', ok: false, status: null, sampleCount: 0, error: 'PROVIDER_CONFIG_MISSING', endpoint: tomtomEndpoint });
  } else {
    try {
      const response = await fetchWithTimeout(
        `https://api.tomtom.com/search/2/categorySearch/restaurant.json?key=${encodeURIComponent(tomtomKey)}&lat=${lat}&lon=${lon}&radius=${radius}&limit=5&countrySet=HU`,
      );
      const payload = parseJsonObject(await response.text());
      results.push({
        provider: 'tomtom',
        ok: response.ok,
        status: response.status,
        sampleCount: Array.isArray(payload.results) ? Math.min(payload.results.length, 5) : 0,
        error: response.ok ? undefined : 'PROVIDER_REQUEST_FAILED',
        endpoint: tomtomEndpoint,
      });
    } catch {
      results.push({ provider: 'tomtom', ok: false, status: null, sampleCount: 0, error: 'PROVIDER_REQUEST_FAILED', endpoint: tomtomEndpoint });
    }
  }

  return results;
}

function parseProvider(value: unknown, allowAll = false): ProviderKey | 'all' | undefined {
  if (value === undefined || value === null || value === '') return allowAll ? 'all' : undefined;
  const provider = boundedString(value, 'provider', 16, { required: true });
  if (provider === 'geoapify' || provider === 'tomtom' || (allowAll && provider === 'all')) return provider;
  throw new AddressManagerError('INVALID_PARAMETER', 400);
}

function parseCountries(value: unknown) {
  const countries = boundedStringArray(value, 'countries', {
    maxItems: COUNTRY_CODES.size,
    maxItemLength: 2,
    pattern: /^[A-Z]{2}$/,
    transform: (item) => item.toUpperCase(),
  });
  if (countries.some((country) => !COUNTRY_CODES.has(country))) throw new AddressManagerError('INVALID_PARAMETER', 400);
  return countries;
}

function parseCategories(value: unknown) {
  const categories = boundedStringArray(value, 'categories', {
    maxItems: CATEGORY_KEYS.size,
    maxItemLength: 32,
    pattern: /^[a-z_]+$/,
  });
  if (categories.some((category) => !CATEGORY_KEYS.has(category))) throw new AddressManagerError('INVALID_PARAMETER', 400);
  return categories;
}

function parseSelectionUpdates(value: unknown): MatrixSelectionUpdate[] {
  if (!Array.isArray(value) || value.length > PROVIDERS.length * COUNTRY_CODES.size * CATEGORY_KEYS.size) {
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  return value.map((item) => {
    const row = requireRecord(item, 'updates');
    const provider = parseProvider(row.provider);
    const country = parseCountries([row.country_code])[0];
    const category = parseCategories([row.category_key])[0];
    if (!provider || provider === 'all' || typeof row.selected !== 'boolean') {
      throw new AddressManagerError('INVALID_PARAMETER', 400);
    }
    return { provider, country_code: country, category_key: category, selected: row.selected };
  });
}

serve(safeServe(async (req, { correlationId }) => {
  assertAddressManagerPost(req);
  const body = await readBoundedJsonObject(req);
  const action = boundedString(body.action ?? 'bootstrap', 'action', 32, { required: true, pattern: /^[a-z_]+$/ });
  if (!ACTIONS.has(action)) throw new AddressManagerError('INVALID_ACTION', 400);

  const supabaseAdmin = getSupabaseAdmin(req);
  await requireAddressManagerAdmin(req, supabaseAdmin);

  if (action === 'health') {
    const canResolveInternalUrl = (() => {
      try { return Boolean(resolveInternalSupabaseUrl(req)); } catch { return false; }
    })();
    return jsonResponse({
      ok: true,
      action,
      scheduler: { enabled: false, trustBoundary: 'admin_auth_only' },
      env: {
        hasSupabaseUrl: Boolean(Deno.env.get('SUPABASE_URL')),
        hasServiceRole: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
        hasGeoapifyKey: Boolean(Deno.env.get('GEOAPIFY_API_KEY')),
        hasTomTomKey: Boolean(Deno.env.get('TOMTOM_API_KEY')),
        canResolveInternalUrl,
      },
      pageCaps: PROVIDER_PAGE_CAPS,
      categories: PROVIDER_CATEGORIES.map((category) => category.key),
    }, 200, correlationId);
  }

  if (action === 'bootstrap' || action === 'reseed') await ensureMatrixSeeds(supabaseAdmin);

  if (action === 'self_test') {
    return jsonResponse({
      ok: true,
      action,
      providerResults: await runSelfTest(),
      env: {
        hasGeoapifyKey: Boolean(Deno.env.get('GEOAPIFY_API_KEY')),
        hasTomTomKey: Boolean(Deno.env.get('TOMTOM_API_KEY')),
        hasServiceRole: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
      },
      pageCaps: PROVIDER_PAGE_CAPS,
      categories: PROVIDER_CATEGORIES,
    }, 200, correlationId);
  }

  if (action === 'save_limits') {
    const limits = await saveLimits(supabaseAdmin, validateAddressManagerLimitsPatch(body.limits));
    return jsonResponse({
      ok: true,
      limits,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    }, 200, correlationId);
  }

  if (action === 'save_selection') {
    await setSelections(supabaseAdmin, parseSelectionUpdates(body.updates));
    return jsonResponse({
      ok: true,
      limits: await loadLimits(supabaseAdmin),
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    }, 200, correlationId);
  }

  if (action === 'reset_cells') {
    await resetCellsByFilter(supabaseAdmin, {
      provider: parseProvider(body.provider) as ProviderKey | undefined,
      country_codes: parseCountries(body.countries),
      category_keys: parseCategories(body.categories),
      onlyCompleted: body.onlyCompleted === true,
    });
    return jsonResponse({
      ok: true,
      limits: await loadLimits(supabaseAdmin),
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    }, 200, correlationId);
  }

  if (action === 'release_stale_locks') {
    const olderThanMinutes = boundedInteger(body.olderThanMinutes, 'olderThanMinutes', 5, 1_440, 10);
    await releaseStaleLocks(supabaseAdmin, olderThanMinutes);
    return jsonResponse({
      ok: true,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    }, 200, correlationId);
  }

  if (action === 'list_venues') {
    const venues = await listVenues(supabaseAdmin, {
      provider: parseProvider(body.provider, true),
      countries: parseCountries(body.countries),
      categories: parseCategories(body.categories),
      page: boundedInteger(body.page, 'page', 1, 100_000, 1),
      pageSize: boundedInteger(body.pageSize, 'pageSize', 1, 200, 25),
    });
    return jsonResponse({ ok: true, ...venues, summary: await buildSummary(supabaseAdmin) }, 200, correlationId);
  }

  if (action === 'run_chunk') {
    const limits = await loadLimits(supabaseAdmin);
    const requestedIterations = boundedInteger(body.iterations, 'iterations', 1, 100, limits.worker_chunk_size);
    const iterations = Math.min(requestedIterations, ADDRESS_MANAGER_MAX_RUN_CHUNK_ITERATIONS);
    const steps: Array<Record<string, unknown>> = [];
    let totalWritten = 0;

    for (let index = 0; index < iterations; index += 1) {
      const idempotencyKey = `${correlationId}:${index + 1}`;
      const generated = await callInternalFunction<{
        ok: true;
        generated: boolean;
        task?: Record<string, unknown>;
        reason?: string;
      }>(req, 'address-manager-task-generator', { idempotency_key: idempotencyKey }, correlationId);

      if (!generated.generated || !generated.task) {
        steps.push({ step: index + 1, generated: false, reason: generated.reason || 'done' });
        break;
      }

      const worker = await callInternalFunction<{
        ok: true;
        written?: number;
        processedTiles?: number;
        done?: boolean;
        tileIndex?: number;
        totalTiles?: number;
      }>(req, 'address-manager-worker', { task: generated.task }, correlationId);

      totalWritten += Number(worker.written || 0);
      steps.push({
        step: index + 1,
        generated: true,
        matrixId: String(generated.task.matrix_id || ''),
        provider: String(generated.task.provider || ''),
        country: String(generated.task.country_code || ''),
        category: String(generated.task.category_key || ''),
        worker,
      });
    }

    return jsonResponse({
      ok: true,
      processedSteps: steps.length,
      requestedIterations,
      enforcedIterations: iterations,
      totalWritten,
      steps,
      limits,
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    }, 200, correlationId);
  }

  return jsonResponse({
    ok: true,
    limits: await loadLimits(supabaseAdmin),
    matrix: await getMatrix(supabaseAdmin),
    summary: await buildSummary(supabaseAdmin),
    pageCaps: PROVIDER_PAGE_CAPS,
  }, 200, correlationId);
}, 'address-manager-discovery'));
