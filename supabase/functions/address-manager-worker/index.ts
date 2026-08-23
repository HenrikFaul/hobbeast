// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, jsonResponse, safeServe } from '../_address-manager-shared/edgeRuntime.ts';
import { requireAddressManagerAdmin } from '../_address-manager-shared/adminBoundary.ts';
import { loadLimits } from '../_address-manager-shared/repository.ts';
import {
  EUROPEAN_COUNTRIES,
  PROVIDER_CATEGORIES,
  PROVIDER_PAGE_CAPS,
} from '../_address-manager-shared/constants.ts';
import {
  ADDRESS_MANAGER_MAX_PROVIDER_REQUESTS_PER_WORKER,
  ADDRESS_MANAGER_MAX_ROWS_PER_WORKER,
  ADDRESS_MANAGER_MAX_TILES_PER_WORKER,
  ADDRESS_MANAGER_TASK_LEASE_MS,
  AddressManagerError,
  assertAddressManagerPost,
  boundedString,
  constantTimeEqual,
  publicDiscoveryStats,
  readBoundedJsonObject,
  requireRecord,
} from '../_address-manager-shared/requestContract.ts';

const FETCH_TIMEOUT_MS = 12_000;
const PROVIDER_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

interface GeoapifyRow {
  properties?: Record<string, unknown> & {
    lat?: unknown;
    lon?: unknown;
    place_id?: unknown;
    name?: unknown;
    address_line1?: unknown;
    country_code?: unknown;
    formatted?: unknown;
    city?: unknown;
    county?: unknown;
    district?: unknown;
    postcode?: unknown;
    contact?: { phone?: unknown };
    website?: unknown;
    opening_hours?: { open_now?: unknown };
    datasource?: { raw?: { rating?: unknown; reviews?: unknown } };
    categories?: unknown;
  };
}

interface TomTomRow {
  id?: unknown;
  position?: { lat?: unknown; lon?: unknown };
  poi?: { name?: unknown; phone?: unknown; url?: unknown; classifications?: unknown };
  address?: {
    countryCode?: unknown;
    freeformAddress?: unknown;
    municipality?: unknown;
    municipalitySubdivision?: unknown;
    postalCode?: unknown;
  };
}

type ProviderRow = GeoapifyRow | TomTomRow;

interface WorkerRequestBody {
  task?: {
    matrix_id?: unknown;
    lock_token?: unknown;
    idempotency_hash?: unknown;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildTileCenters(countryCode: string, radiusMeters: number) {
  const bounds = EUROPEAN_COUNTRIES.find((country) => country.code === countryCode);
  if (!bounds) throw new AddressManagerError('INVALID_TASK', 409);

  // Step is ~1.75x radius converted to degrees, with hard min/max so very small
  // or very large radii don't degenerate. Lon scaling depends on latitude.
  const stepLat = clamp((radiusMeters / 111000) * 1.75, 0.05, 3);
  const avgLat = (bounds.minLat + bounds.maxLat) / 2;
  const lonBase = Math.max(0.25, Math.cos((avgLat * Math.PI) / 180));
  const stepLon = clamp((radiusMeters / (111000 * lonBase)) * 1.75, 0.05, 4);

  const centers: Array<{ lat: number; lon: number }> = [];
  for (let lat = bounds.minLat; lat <= bounds.maxLat + 0.0001; lat += stepLat) {
    for (let lon = bounds.minLon; lon <= bounds.maxLon + 0.0001; lon += stepLon) {
      centers.push({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
      });
    }
  }
  return centers;
}

function fallbackVenueId(prefix: string, lat: number, lon: number, name: string) {
  // Stable surrogate ID when provider didn't return its own ID.
  // Composes prefix + rounded coords + name slug.
  const cleanName = String(name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return `${prefix}::${lat.toFixed(5)},${lon.toFixed(5)}::${cleanName}`;
}

function normalize(
  provider: 'geoapify' | 'tomtom',
  row: ProviderRow,
  country: string,
  categoryKey: string,
  tileIndex: number,
) {
  if (provider === 'geoapify') {
    const feature = row as GeoapifyRow;
    const lat = typeof feature.properties?.lat === 'number' ? feature.properties.lat : null;
    const lon = typeof feature.properties?.lon === 'number' ? feature.properties.lon : null;
    const placeId = feature.properties?.place_id ? String(feature.properties.place_id) : '';
    const name = String(feature.properties?.name || feature.properties?.address_line1 || 'Unknown');
    return {
      provider,
      provider_venue_id: placeId || fallbackVenueId('geoapify', lat ?? 0, lon ?? 0, name),
      country_code: (feature.properties?.country_code ? String(feature.properties.country_code).toUpperCase() : country) || country,
      category_key: categoryKey,
      name,
      address: typeof feature.properties?.formatted === 'string' ? feature.properties.formatted : null,
      city: typeof feature.properties?.city === 'string' ? feature.properties.city : typeof feature.properties?.county === 'string' ? feature.properties.county : null,
      district: typeof feature.properties?.district === 'string' ? feature.properties.district : null,
      postal_code: typeof feature.properties?.postcode === 'string' ? feature.properties.postcode : null,
      latitude: lat,
      longitude: lon,
      phone: typeof feature.properties?.contact?.phone === 'string' ? feature.properties.contact.phone : null,
      website: typeof feature.properties?.website === 'string' ? feature.properties.website : null,
      open_now: typeof feature.properties?.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : null,
      rating: typeof feature.properties?.datasource?.raw?.rating === 'number' ? feature.properties.datasource.raw.rating : null,
      review_count: typeof feature.properties?.datasource?.raw?.reviews === 'number' ? feature.properties.datasource.raw.reviews : null,
      metadata: {
        source: 'geoapify',
        categories: Array.isArray(feature.properties?.categories) ? feature.properties.categories : [],
        tile_index: tileIndex,
        raw: feature.properties || {},
      },
      updated_at: new Date().toISOString(),
    };
  }

  const result = row as TomTomRow;
  const lat = typeof result.position?.lat === 'number' ? result.position.lat : null;
  const lon = typeof result.position?.lon === 'number' ? result.position.lon : null;
  const id = result.id ? String(result.id) : '';
  const name = String(result.poi?.name || 'Unknown');
  return {
    provider,
    provider_venue_id: id || fallbackVenueId('tomtom', lat ?? 0, lon ?? 0, name),
    country_code: (result.address?.countryCode ? String(result.address.countryCode).toUpperCase() : country) || country,
    category_key: categoryKey,
    name,
    address: typeof result.address?.freeformAddress === 'string' ? result.address.freeformAddress : null,
    city: typeof result.address?.municipality === 'string' ? result.address.municipality : null,
    district: typeof result.address?.municipalitySubdivision === 'string' ? result.address.municipalitySubdivision : null,
    postal_code: typeof result.address?.postalCode === 'string' ? result.address.postalCode : null,
    latitude: lat,
    longitude: lon,
    phone: typeof result.poi?.phone === 'string' ? result.poi.phone : null,
    website: typeof result.poi?.url === 'string' ? result.poi.url : null,
    open_now: null,
    rating: null,
    review_count: null,
    metadata: {
      source: 'tomtom',
      classifications: Array.isArray(result.poi?.classifications) ? result.poi.classifications : [],
      tile_index: tileIndex,
      raw: result,
    },
    updated_at: new Date().toISOString(),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new AddressManagerError('PROVIDER_REQUEST_FAILED', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readProviderPayload(response: Response): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > PROVIDER_RESPONSE_MAX_BYTES) {
    throw new AddressManagerError('PROVIDER_RESPONSE_TOO_LARGE', 502);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > PROVIDER_RESPONSE_MAX_BYTES) {
    throw new AddressManagerError('PROVIDER_RESPONSE_TOO_LARGE', 502);
  }
  try {
    const payload = JSON.parse(text) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AddressManagerError('PROVIDER_REQUEST_FAILED', 502);
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AddressManagerError) throw error;
    throw new AddressManagerError('PROVIDER_REQUEST_FAILED', 502);
  }
}

async function fetchGeoapifyPage(opts: {
  categoryName: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  pageSize: number; // <= PROVIDER_PAGE_CAPS.geoapify
  offset: number;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    categories: opts.categoryName,
    filter: `circle:${opts.lon},${opts.lat},${opts.radiusMeters}`,
    bias: `proximity:${opts.lon},${opts.lat}`,
    limit: String(opts.pageSize),
    offset: String(opts.offset),
    apiKey: opts.apiKey,
  });

  const url = `https://api.geoapify.com/v2/places?${params.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new AddressManagerError('PROVIDER_REQUEST_FAILED', 502);
  const payload = await readProviderPayload(res);
  return Array.isArray(payload.features) ? payload.features.slice(0, opts.pageSize) as GeoapifyRow[] : [];
}

async function fetchTomTomPage(opts: {
  categoryName: string;
  countryCode: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  pageSize: number; // <= PROVIDER_PAGE_CAPS.tomtom
  offset: number;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    key: opts.apiKey,
    lat: String(opts.lat),
    lon: String(opts.lon),
    radius: String(opts.radiusMeters),
    limit: String(opts.pageSize),
    ofs: String(opts.offset),
    countrySet: opts.countryCode,
  });

  const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(opts.categoryName)}.json?${params.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new AddressManagerError('PROVIDER_REQUEST_FAILED', 502);
  const payload = await readProviderPayload(res);
  return Array.isArray(payload.results) ? payload.results.slice(0, opts.pageSize) as TomTomRow[] : [];
}

type WorkerMatrixRow = {
  id: string;
  provider: string;
  country_code: string;
  category_key: string;
  selected: boolean;
  status: string;
  cursor: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
};

type TaskLease = {
  token: string;
  idempotency_hash: string;
  state: 'claimed' | 'working';
  claimed_at: string;
  worker_run_id?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readTaskLease(stats: unknown): TaskLease | null {
  const lock = record(record(stats).address_manager_lock);
  const state = String(lock.state || '');
  if (!['claimed', 'working'].includes(state)) return null;
  return {
    token: String(lock.token || ''),
    idempotency_hash: String(lock.idempotency_hash || ''),
    state: state as TaskLease['state'],
    claimed_at: String(lock.claimed_at || ''),
    worker_run_id: lock.worker_run_id ? String(lock.worker_run_id) : undefined,
  };
}

serve(safeServe(async (req, { correlationId }) => {
  assertAddressManagerPost(req);
  const body = await readBoundedJsonObject(req, 8 * 1024) as WorkerRequestBody;
  const task = requireRecord(body.task, 'task');
  const matrixId = boundedString(task.matrix_id, 'matrix_id', 36, {
    required: true,
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  });
  const lockToken = boundedString(task.lock_token, 'lock_token', 96, {
    required: true,
    pattern: /^[0-9a-f-]{72}$/i,
  });
  const idempotencyHash = boundedString(task.idempotency_hash, 'idempotency_hash', 64, {
    required: true,
    pattern: /^[0-9a-f]{64}$/,
  });

  const supabaseAdmin = getSupabaseAdmin(req);
  await requireAddressManagerAdmin(req, supabaseAdmin);

  let leaseAcquired = false;
  let baseStats: Record<string, unknown> = {};
  const leaseMatcher = {
    address_manager_lock: {
      token: lockToken,
      idempotency_hash: idempotencyHash,
      state: 'working',
      worker_run_id: correlationId,
    },
  };

  try {
    const { data: cellData, error: cellError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('id,provider,country_code,category_key,selected,status,cursor,stats')
      .eq('id', matrixId)
      .maybeSingle();
    if (cellError) throw cellError;
    const cell = cellData as WorkerMatrixRow | null;
    if (!cell || !cell.selected || cell.status !== 'running') {
      throw new AddressManagerError('INVALID_TASK', 409);
    }

    const lease = readTaskLease(cell.stats);
    if (!lease || !constantTimeEqual(lease.token, lockToken) || !constantTimeEqual(lease.idempotency_hash, idempotencyHash)) {
      throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
    }
    const leaseAgeMs = Date.now() - Date.parse(lease.claimed_at);
    if (!Number.isFinite(leaseAgeMs) || leaseAgeMs < 0 || leaseAgeMs > ADDRESS_MANAGER_TASK_LEASE_MS) {
      throw new AddressManagerError('TASK_LEASE_EXPIRED', 409);
    }
    if (lease.state === 'working') throw new AddressManagerError('TASK_ALREADY_RUNNING', 409);

    baseStats = publicDiscoveryStats(cell.stats);
    const workingLease: TaskLease = { ...lease, state: 'working', worker_run_id: correlationId };
    const { data: acquired, error: acquireError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        stats: { ...record(cell.stats), address_manager_lock: workingLease },
        updated_at: new Date().toISOString(),
      })
      .eq('id', matrixId)
      .eq('status', 'running')
      .contains('stats', {
        address_manager_lock: {
          token: lockToken,
          idempotency_hash: idempotencyHash,
          state: 'claimed',
        },
      })
      .select('id')
      .maybeSingle();
    if (acquireError) throw acquireError;
    if (!acquired) throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
    leaseAcquired = true;

    const provider = cell.provider === 'geoapify' || cell.provider === 'tomtom'
      ? cell.provider
      : null;
    const country = String(cell.country_code || '').toUpperCase();
    const categoryKey = String(cell.category_key || '');
    const category = PROVIDER_CATEGORIES.find((item) => item.key === categoryKey);
    if (!provider || !EUROPEAN_COUNTRIES.some((item) => item.code === country) || !category) {
      throw new AddressManagerError('INVALID_TASK', 409);
    }

    // Task limits and cursor are always loaded from server-owned state. Values
    // submitted in the request body are intentionally ignored.
    const limits = await loadLimits(supabaseAdmin);
    const radiusMeters = limits.radius_meters;
    const timeBudgetMs = limits.worker_time_budget_ms;
    const maxPagesPerTile = limits.worker_max_pages_per_tile;
    const maxTilesThisRun = Math.min(limits.worker_chunk_size, ADDRESS_MANAGER_MAX_TILES_PER_WORKER);
    const requestedPerTile = provider === 'geoapify' ? limits.geoapify_limit : limits.tomtom_limit;
    const pageCap = PROVIDER_PAGE_CAPS[provider];
    const tileCenters = buildTileCenters(country, radiusMeters);
    const cursorValue = Number(record(cell.cursor).tile_index || 0);
    let cursorTileIndex = Number.isFinite(cursorValue)
      ? Math.min(tileCenters.length, Math.max(0, Math.floor(cursorValue)))
      : 0;
    const startedAt = Date.now();

    if (cursorTileIndex >= tileCenters.length) {
      const completedAt = new Date().toISOString();
      const { data: completed, error: completeError } = await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'completed',
          stats: { ...baseStats, address_manager_last_idempotency_hash: idempotencyHash },
          last_error: null,
          last_run_completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', matrixId)
        .eq('status', 'running')
        .contains('stats', leaseMatcher)
        .select('id')
        .maybeSingle();
      if (completeError) throw completeError;
      if (!completed) throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
      leaseAcquired = false;
      return jsonResponse({ ok: true, written: 0, processedTiles: 0, done: true, tileIndex: cursorTileIndex, totalTiles: tileCenters.length }, 200, correlationId);
    }

    const apiKey = String(provider === 'geoapify' ? Deno.env.get('GEOAPIFY_API_KEY') : Deno.env.get('TOMTOM_API_KEY') || '').trim();
    if (!apiKey) throw new AddressManagerError('PROVIDER_CONFIG_MISSING', 503);

    let totalWritten = 0;
    let processedTiles = 0;
    let providerRequests = 0;
    let lastTileCenter: { lat: number; lon: number } | null = null;

    while (
      cursorTileIndex < tileCenters.length &&
      processedTiles < maxTilesThisRun &&
      providerRequests < ADDRESS_MANAGER_MAX_PROVIDER_REQUESTS_PER_WORKER &&
      totalWritten < ADDRESS_MANAGER_MAX_ROWS_PER_WORKER &&
      Date.now() - startedAt < timeBudgetMs
    ) {
      const center = tileCenters[cursorTileIndex];
      lastTileCenter = center;
      let offsetForTile = 0;
      let pagesForTile = 0;
      const collected: ProviderRow[] = [];

      while (
        collected.length < requestedPerTile &&
        pagesForTile < maxPagesPerTile &&
        providerRequests < ADDRESS_MANAGER_MAX_PROVIDER_REQUESTS_PER_WORKER &&
        totalWritten + collected.length < ADDRESS_MANAGER_MAX_ROWS_PER_WORKER &&
        Date.now() - startedAt < timeBudgetMs
      ) {
        const remainingPerTile = requestedPerTile - collected.length;
        const remainingRunRows = ADDRESS_MANAGER_MAX_ROWS_PER_WORKER - totalWritten - collected.length;
        const pageSize = Math.min(pageCap, remainingPerTile, remainingRunRows);
        if (pageSize <= 0) break;

        providerRequests += 1;
        let pageRows: ProviderRow[];
        if (provider === 'geoapify') {
          pageRows = await fetchGeoapifyPage({
            categoryName: String(category.geoapify || 'catering.restaurant'),
            lat: center.lat,
            lon: center.lon,
            radiusMeters,
            pageSize,
            offset: offsetForTile,
            apiKey,
          });
        } else {
          pageRows = await fetchTomTomPage({
            categoryName: String(category.tomtom || 'restaurant'),
            countryCode: country,
            lat: center.lat,
            lon: center.lon,
            radiusMeters,
            pageSize,
            offset: offsetForTile,
            apiKey,
          });
        }

        collected.push(...pageRows.slice(0, pageSize));
        offsetForTile += Math.min(pageRows.length, pageSize);
        pagesForTile += 1;
        if (pageRows.length < pageSize) break;
      }

      const seen = new Set<string>();
      const dedup = collected
        .map((item) => normalize(provider, item, country, categoryKey, cursorTileIndex))
        .filter((row) => {
          if (!row.provider_venue_id || seen.has(row.provider_venue_id)) return false;
          seen.add(row.provider_venue_id);
          return true;
        })
        .slice(0, ADDRESS_MANAGER_MAX_ROWS_PER_WORKER - totalWritten);

      for (let index = 0; index < dedup.length; index += 500) {
        const { error } = await supabaseAdmin
          .from('raw_venues')
          .upsert(dedup.slice(index, index + 500), { onConflict: 'provider,provider_venue_id', ignoreDuplicates: false });
        if (error) throw error;
      }
      totalWritten += dedup.length;
      cursorTileIndex += 1;
      processedTiles += 1;
    }

    const totalTiles = tileCenters.length;
    const done = cursorTileIndex >= totalTiles;
    const previousFetched = Number(baseStats.fetched_rows || 0);
    const accumulatedFetched = (Number.isFinite(previousFetched) ? previousFetched : 0) + totalWritten;
    const finishedAt = new Date().toISOString();
    const finalStats = {
      ...baseStats,
      fetched_rows: accumulatedFetched,
      last_chunk_written: totalWritten,
      last_chunk_tiles: processedTiles,
      provider_requests: providerRequests,
      tile_index: cursorTileIndex,
      total_tiles: totalTiles,
      last_tile_center: lastTileCenter,
      provider,
      country,
      categoryKey,
      time_budget_ms: timeBudgetMs,
      page_cap: pageCap,
      address_manager_last_idempotency_hash: idempotencyHash,
    };

    const { data: finalized, error: updateError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        status: done ? 'completed' : 'pending',
        last_error: null,
        last_run_completed_at: done ? finishedAt : null,
        cursor: { tile_index: cursorTileIndex, total_tiles: totalTiles },
        stats: finalStats,
        updated_at: finishedAt,
      })
      .eq('id', matrixId)
      .eq('status', 'running')
      .contains('stats', leaseMatcher)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!finalized) throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
    leaseAcquired = false;

    return jsonResponse({
      ok: true,
      written: totalWritten,
      processedTiles,
      providerRequests,
      done,
      tileIndex: cursorTileIndex,
      totalTiles,
      lastTileCenter,
      timeBudgetMs,
      elapsedMs: Date.now() - startedAt,
    }, 200, correlationId);
  } catch (error) {
    const safeError = error instanceof AddressManagerError
      ? error
      : new AddressManagerError('INTERNAL_ERROR', 500);
    if (leaseAcquired) {
      const failedAt = new Date().toISOString();
      await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'error',
          last_error: safeError.code,
          stats: {
            ...baseStats,
            last_failure_code: safeError.code,
            address_manager_last_idempotency_hash: idempotencyHash,
          },
          updated_at: failedAt,
        })
        .eq('id', matrixId)
        .eq('status', 'running')
        .contains('stats', leaseMatcher);
    }
    throw safeError;
  }
}, 'address-manager-worker'));
