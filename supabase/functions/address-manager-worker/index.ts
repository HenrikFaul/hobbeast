// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import { EUROPEAN_COUNTRIES, PROVIDER_CATEGORIES } from '../address-manager-shared/constants.ts';

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

  const stepLat = clamp((radiusMeters / 111000) * 1.75, 0.15, 3);
  const avgLat = (bounds.minLat + bounds.maxLat) / 2;
  const lonBase = Math.max(0.25, Math.cos((avgLat * Math.PI) / 180));
  const stepLon = clamp((radiusMeters / (111000 * lonBase)) * 1.75, 0.15, 4);

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

function normalize(provider: 'geoapify' | 'tomtom', row: any, country: string, categoryKey: string, tileIndex: number) {
  if (provider === 'geoapify') {
    return {
      provider,
      provider_venue_id: String(row?.properties?.place_id || ''),
      country_code: country,
      category_key: categoryKey,
      name: row?.properties?.name || row?.properties?.address_line1 || 'Unknown',
      address: row?.properties?.formatted || null,
      city: row?.properties?.city || null,
      district: row?.properties?.district || null,
      postal_code: row?.properties?.postcode || null,
      latitude: row?.properties?.lat || null,
      longitude: row?.properties?.lon || null,
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

  return {
    provider,
    provider_venue_id: String(row?.id || ''),
    country_code: country,
    category_key: categoryKey,
    name: row?.poi?.name || 'Unknown',
    address: row?.address?.freeformAddress || null,
    city: row?.address?.municipality || null,
    district: row?.address?.municipalitySubdivision || null,
    postal_code: row?.address?.postalCode || null,
    latitude: row?.position?.lat || null,
    longitude: row?.position?.lon || null,
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

async function fetchGeoapify(categoryName: string, lat: number, lon: number, radiusMeters: number, limit: number, apiKey: string) {
  const params = new URLSearchParams({
    categories: categoryName,
    filter: `circle:${lon},${lat},${radiusMeters}`,
    bias: `proximity:${lon},${lat}`,
    limit: String(limit),
    apiKey,
  });

  const res = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`);
  if (!res.ok) throw new Error(`Geoapify failed: ${res.status}`);
  const payload = await res.json();
  return payload.features || [];
}

async function fetchTomTom(categoryName: string, countryCode: string, lat: number, lon: number, radiusMeters: number, limit: number, apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusMeters),
    limit: String(limit),
    countrySet: countryCode,
  });

  const res = await fetch(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(categoryName)}.json?${params.toString()}`);
  if (!res.ok) throw new Error(`TomTom failed: ${res.status}`);
  const payload = await res.json();
  return payload.results || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseAdmin = getSupabaseAdmin(req);
  const body = await req.json().catch(() => ({}));

  try {
    const task = body.task || {};
    const provider = String(task.provider) as 'geoapify' | 'tomtom';
    const country = String(task.country_code || 'HU').toUpperCase();
    const categoryKey = String(task.category_key || 'restaurant');
    const limits = task.limits || {};
    const matrixId = String(task.matrix_id || '');

    if (!matrixId) return json({ ok: false, error: 'Missing matrix_id' }, 400);

    const category = PROVIDER_CATEGORIES.find((item) => item.key === categoryKey);
    if (!category) return json({ ok: false, error: `Unknown category key: ${categoryKey}` }, 400);

    const radiusMeters = clamp(Number(limits.radius_meters || 30000), 1000, 200000);
    const tileCenters = buildTileCenters(country, radiusMeters);
    const currentTileIndex = Math.max(0, Number(task.cursor?.tile_index || 0));

    if (currentTileIndex >= tileCenters.length) {
      await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'completed',
          last_error: null,
          last_run_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', matrixId);
      return json({ ok: true, written: 0, done: true, tileIndex: currentTileIndex, totalTiles: tileCenters.length });
    }

    const center = tileCenters[currentTileIndex];
    let normalizedRows: any[] = [];

    if (provider === 'geoapify') {
      const apiKey = Deno.env.get('GEOAPIFY_API_KEY');
      if (!apiKey) throw new Error('Missing GEOAPIFY_API_KEY');
      const features = await fetchGeoapify(
        String(category.geoapify || 'catering.restaurant'),
        center.lat,
        center.lon,
        radiusMeters,
        clamp(Number(limits.geoapify_limit || 1000), 1, 1000000),
        apiKey,
      );
      normalizedRows = features.map((item: any) => normalize('geoapify', item, country, categoryKey, currentTileIndex));
    } else {
      const apiKey = Deno.env.get('TOMTOM_API_KEY');
      if (!apiKey) throw new Error('Missing TOMTOM_API_KEY');
      const results = await fetchTomTom(
        String(category.tomtom || 'restaurant'),
        country,
        center.lat,
        center.lon,
        radiusMeters,
        clamp(Number(limits.tomtom_limit || 1000), 1, 1000000),
        apiKey,
      );
      normalizedRows = results.map((item: any) => normalize('tomtom', item, country, categoryKey, currentTileIndex));
    }

    const rows = normalizedRows.filter((row) => row.provider_venue_id);
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from('raw_venues')
        .upsert(rows, { onConflict: 'provider,provider_venue_id', ignoreDuplicates: false });
      if (error) throw error;
    }

    const nextTileIndex = currentTileIndex + 1;
    const totalTiles = tileCenters.length;
    const done = nextTileIndex >= totalTiles;

    const { data: existingCell } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('stats')
      .eq('id', matrixId)
      .maybeSingle();

    const accumulatedFetched = Number(existingCell?.stats?.fetched_rows || 0) + rows.length;

    const { error: updateError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        status: done ? 'completed' : 'pending',
        last_error: null,
        last_run_completed_at: done ? new Date().toISOString() : null,
        cursor: { tile_index: nextTileIndex, total_tiles: totalTiles },
        stats: {
          fetched_rows: accumulatedFetched,
          tile_index: currentTileIndex,
          total_tiles: totalTiles,
          last_tile_center: center,
          provider,
          country,
          categoryKey,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', matrixId);
    if (updateError) throw updateError;

    return json({
      ok: true,
      written: rows.length,
      done,
      tileIndex: currentTileIndex,
      nextTileIndex,
      totalTiles,
      center,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const matrixId = String(body?.task?.matrix_id || '');
    if (matrixId) {
      await supabaseAdmin
        .from('sync_discovery_matrix')
        .update({
          status: 'error',
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matrixId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
