// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import {
  EUROPEAN_COUNTRIES,
  PROVIDER_CATEGORIES,
  PROVIDER_PAGE_CAPS,
} from '../address-manager-shared/constants.ts';

const FETCH_TIMEOUT_MS = 20_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildTileCenters(countryCode: string, radiusMeters: number) {
  const bounds = EUROPEAN_COUNTRIES.find((country) => country.code === countryCode);
  if (!bounds) throw new Error(`Unsupported country code: ${countryCode}`);

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
  row: any,
  country: string,
  categoryKey: string,
  tileIndex: number,
) {
  if (provider === 'geoapify') {
    const lat = typeof row?.properties?.lat === 'number' ? row.properties.lat : null;
    const lon = typeof row?.properties?.lon === 'number' ? row.properties.lon : null;
    const placeId = row?.properties?.place_id ? String(row.properties.place_id) : '';
    const name = row?.properties?.name || row?.properties?.address_line1 || 'Unknown';
    return {
      provider,
      provider_venue_id: placeId || fallbackVenueId('geoapify', lat ?? 0, lon ?? 0, name),
      country_code: (row?.properties?.country_code ? String(row.properties.country_code).toUpperCase() : country) || country,
      category_key: categoryKey,
      name,
      address: row?.properties?.formatted || null,
      city: row?.properties?.city || row?.properties?.county || null,
      district: row?.properties?.district || null,
      postal_code: row?.properties?.postcode || null,
      latitude: lat,
      longitude: lon,
      phone: row?.properties?.contact?.phone || null,
      website: row?.properties?.website || null,
      open_now: row?.properties?.opening_hours?.open_now ?? null,
      rating: row?.properties?.datasource?.raw?.rating ?? null,
      review_count: row?.properties?.datasource?.raw?.reviews ?? null,
      metadata: {
        source: 'geoapify',
        categories: row?.properties?.categories || [],
        tile_index: tileIndex,
        raw: row?.properties || {},
      },
      updated_at: new Date().toISOString(),
    };
  }

  const lat = typeof row?.position?.lat === 'number' ? row.position.lat : null;
  const lon = typeof row?.position?.lon === 'number' ? row.position.lon : null;
  const id = row?.id ? String(row.id) : '';
  const name = row?.poi?.name || 'Unknown';
  return {
    provider,
    provider_venue_id: id || fallbackVenueId('tomtom', lat ?? 0, lon ?? 0, name),
    country_code: (row?.address?.countryCode ? String(row.address.countryCode).toUpperCase() : country) || country,
    category_key: categoryKey,
    name,
    address: row?.address?.freeformAddress || null,
    city: row?.address?.municipality || null,
    district: row?.address?.municipalitySubdivision || null,
    postal_code: row?.address?.postalCode || null,
    latitude: lat,
    longitude: lon,
    phone: row?.poi?.phone || null,
    website: row?.poi?.url || null,
    open_now: null,
    rating: null,
    review_count: null,
    metadata: {
      source: 'tomtom',
      classifications: row?.poi?.classifications || [],
      tile_index: tileIndex,
      raw: row || {},
    },
    updated_at: new Date().toISOString(),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Geoapify ${res.status}: ${body.slice(0, 400)}`);
  }
  const payload = await res.json();
  return (payload?.features || []) as any[];
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TomTom ${res.status}: ${body.slice(0, 400)}`);
  }
  const payload = await res.json();
  return (payload?.results || []) as any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseAdmin = getSupabaseAdmin(req);
  const body = await req.json().catch(() => ({}));

  const matrixId = String(body?.task?.matrix_id || '');

  try {
    const task = body.task || {};
    const provider = String(task.provider) as 'geoapify' | 'tomtom';
    const country = String(task.country_code || 'HU').toUpperCase();
    const categoryKey = String(task.category_key || 'restaurant');
    const limits = task.limits || {};

    if (!matrixId) return json({ ok: false, error: 'Missing matrix_id' }, 400);

    const category = PROVIDER_CATEGORIES.find((item) => item.key === categoryKey);
    if (!category) return json({ ok: false, error: `Unknown category key: ${categoryKey}` }, 400);

    const radiusMeters = clamp(Number(limits.radius_meters || 30000), 1000, 200000);
    const tileCenters = buildTileCenters(country, radiusMeters);
    const startedAt = Date.now();
    const timeBudgetMs = clamp(Number(limits.worker_time_budget_ms || 35_000), 5_000, 55_000);
    const maxPagesPerTile = clamp(Number(limits.worker_max_pages_per_tile || 20), 1, 200);

    // Per-tile target rows the admin asked for.
    const requestedPerTile =
      provider === 'geoapify'
        ? clamp(Number(limits.geoapify_limit || 1000), 1, 10_000_000)
        : clamp(Number(limits.tomtom_limit || 1000), 1, 10_000_000);

    const pageCap = PROVIDER_PAGE_CAPS[provider];

    let cursorTileIndex = Math.max(0, Number(task.cursor?.tile_index || 0));

    if (cursorTileIndex >= tileCenters.length) {
      await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'completed',
          last_error: null,
          last_run_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', matrixId);
      return json({
        ok: true,
        written: 0,
        done: true,
        tileIndex: cursorTileIndex,
        totalTiles: tileCenters.length,
      });
    }

    let totalWritten = 0;
    let processedTiles = 0;
    const apiKey =
      provider === 'geoapify'
        ? Deno.env.get('GEOAPIFY_API_KEY')
        : Deno.env.get('TOMTOM_API_KEY');
    if (!apiKey) throw new Error(`Missing ${provider === 'geoapify' ? 'GEOAPIFY_API_KEY' : 'TOMTOM_API_KEY'}`);

    let lastTileCenter: { lat: number; lon: number } | null = null;

    // Iterate as many tiles as fit in the time budget — bulk crawling.
    while (cursorTileIndex < tileCenters.length) {
      if (Date.now() - startedAt > timeBudgetMs) break;

      const center = tileCenters[cursorTileIndex];
      lastTileCenter = center;

      let offsetForTile = 0;
      let pagesForTile = 0;
      const collected: any[] = [];

      while (
        collected.length < requestedPerTile &&
        pagesForTile < maxPagesPerTile &&
        Date.now() - startedAt < timeBudgetMs
      ) {
        const remaining = requestedPerTile - collected.length;
        const pageSize = Math.min(pageCap, remaining);

        let pageRows: any[] = [];
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

        collected.push(...pageRows);
        offsetForTile += pageRows.length;
        pagesForTile += 1;

        // Provider returned fewer than requested → no more pages available.
        if (pageRows.length < pageSize) break;
      }

      const normalized = collected
        .map((item) => normalize(provider, item, country, categoryKey, cursorTileIndex))
        .filter((row) => row.provider_venue_id);

      // Dedup within this batch (provider_venue_id), keep first.
      const seen = new Set<string>();
      const dedup = normalized.filter((row) => {
        if (seen.has(row.provider_venue_id)) return false;
        seen.add(row.provider_venue_id);
        return true;
      });

      if (dedup.length > 0) {
        // Chunked upserts to keep request payloads sane.
        const CHUNK = 500;
        for (let i = 0; i < dedup.length; i += CHUNK) {
          const slice = dedup.slice(i, i + CHUNK);
          const { error } = await supabaseAdmin
            .from('raw_venues')
            .upsert(slice, { onConflict: 'provider,provider_venue_id', ignoreDuplicates: false });
          if (error) throw error;
        }
        totalWritten += dedup.length;
      }

      cursorTileIndex += 1;
      processedTiles += 1;
    }

    const totalTiles = tileCenters.length;
    const done = cursorTileIndex >= totalTiles;

    const { data: existingCell } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('stats')
      .eq('id', matrixId)
      .maybeSingle();

    const accumulatedFetched = Number(existingCell?.stats?.fetched_rows || 0) + totalWritten;

    const { error: updateError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        status: done ? 'completed' : 'pending',
        last_error: null,
        last_run_completed_at: done ? new Date().toISOString() : null,
        cursor: { tile_index: cursorTileIndex, total_tiles: totalTiles },
        stats: {
          fetched_rows: accumulatedFetched,
          last_chunk_written: totalWritten,
          last_chunk_tiles: processedTiles,
          tile_index: cursorTileIndex,
          total_tiles: totalTiles,
          last_tile_center: lastTileCenter,
          provider,
          country,
          categoryKey,
          time_budget_ms: timeBudgetMs,
          page_cap: pageCap,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', matrixId);
    if (updateError) throw updateError;

    return json({
      ok: true,
      written: totalWritten,
      processedTiles,
      done,
      tileIndex: cursorTileIndex,
      totalTiles,
      lastTileCenter,
      timeBudgetMs,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (matrixId) {
      await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'error',
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', matrixId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
