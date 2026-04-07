// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, supabaseAdmin } from '../shared/providerFetch.ts';

const HUNGARY_BOUNDS = {
  minLat: 45.74,
  maxLat: 48.62,
  minLon: 16.08,
  maxLon: 22.91,
} as const;

const TILE_STEP_DEGREES = 0.55;

const CATEGORY_GROUPS = [
  { key: 'restaurant', geo: 'catering.restaurant,catering.cafe,catering.bar,catering.pub', tomtom: 'restaurant' },
  { key: 'cafe', geo: 'catering.cafe,catering.restaurant', tomtom: 'cafe' },
  { key: 'bar', geo: 'catering.bar,catering.pub', tomtom: 'bar' },
  { key: 'leisure', geo: 'leisure,sport', tomtom: 'leisure' },
  { key: 'entertainment', geo: 'entertainment,tourism', tomtom: 'entertainment' },
] as const;

const RADIUS_METERS = 32000;
const GEO_LIMIT = 120;
const TOMTOM_LIMIT = 100;
const PROVIDER_CONCURRENCY = 3;

function normalizeGeoapifyRow(feature: any, groupKey: string, centerCity: string) {
  return {
    provider: 'geoapify',
    external_id: String(feature?.properties?.place_id || ''),
    name: String(feature?.properties?.name || feature?.properties?.address_line1 || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(feature?.properties?.categories) ? feature.properties.categories : [],
    address: feature?.properties?.formatted || null,
    city: feature?.properties?.city || centerCity,
    district: feature?.properties?.county || feature?.properties?.district || null,
    postal_code: feature?.properties?.postcode || null,
    country_code: String(feature?.properties?.country_code || 'HU').toUpperCase(),
    latitude: typeof feature?.properties?.lat === 'number' ? feature.properties.lat : null,
    longitude: typeof feature?.properties?.lon === 'number' ? feature.properties.lon : null,
    open_now: typeof feature?.properties?.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : null,
    rating: typeof feature?.properties?.datasource?.raw?.rating === 'number' ? feature.properties.datasource.raw.rating : null,
    review_count: typeof feature?.properties?.datasource?.raw?.reviews === 'number' ? feature.properties.datasource.raw.reviews : null,
    image_url: feature?.properties?.datasource?.raw?.image || null,
    phone: feature?.properties?.contact?.phone || null,
    website: feature?.properties?.website || null,
    opening_hours_text: Array.isArray(feature?.properties?.opening_hours?.text) ? feature.properties.opening_hours.text : [],
    metadata: feature?.properties || {},
    synced_at: new Date().toISOString(),
  };
}

function normalizeTomTomRow(result: any, groupKey: string, centerCity: string) {
  return {
    provider: 'tomtom',
    external_id: String(result?.id || ''),
    name: String(result?.poi?.name || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(result?.poi?.categories) ? result.poi.categories : [],
    address: result?.address?.freeformAddress || null,
    city: result?.address?.municipality || centerCity,
    district: result?.address?.municipalitySubdivision || result?.address?.countrySecondarySubdivision || null,
    postal_code: result?.address?.postalCode || null,
    country_code: String(result?.address?.countryCode || 'HU').toUpperCase(),
    latitude: typeof result?.position?.lat === 'number' ? result.position.lat : null,
    longitude: typeof result?.position?.lon === 'number' ? result.position.lon : null,
    open_now: null,
    rating: null,
    review_count: null,
    image_url: null,
    phone: result?.poi?.phone || null,
    website: result?.poi?.url || null,
    opening_hours_text: [],
    metadata: result || {},
    synced_at: new Date().toISOString(),
  };
}

async function fetchGeoapify(center: { city: string; lat: number; lon: number }, group: (typeof CATEGORY_GROUPS)[number], apiKey: string) {
  const params = new URLSearchParams({
    categories: group.geo,
    filter: `circle:${center.lon},${center.lat},${RADIUS_METERS}`,
    bias: `proximity:${center.lon},${center.lat}`,
    limit: String(GEO_LIMIT),
    apiKey,
  });
  const res = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Geoapify ${center.city}/${group.key}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return (data.features || [])
    .map((feature: any) => normalizeGeoapifyRow(feature, group.key, center.city))
    .filter((row: any) => row.external_id && row.country_code === 'HU');
}

async function fetchTomTom(center: { city: string; lat: number; lon: number }, group: (typeof CATEGORY_GROUPS)[number], apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    countrySet: 'HU',
    limit: String(TOMTOM_LIMIT),
    lat: String(center.lat),
    lon: String(center.lon),
    radius: String(RADIUS_METERS),
    openingHours: 'nextSevenDays',
  });
  const res = await fetch(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(group.tomtom)}.json?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TomTom ${center.city}/${group.key}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return (data.results || [])
    .map((result: any) => normalizeTomTomRow(result, group.key, center.city))
    .filter((row: any) => row.external_id && row.country_code === 'HU');
}

function roundCoord(value: number) {
  return Number(value.toFixed(5));
}

function buildHungaryCenters() {
  const centers: Array<{ city: string; lat: number; lon: number }> = [];
  let row = 0;
  for (let lat = HUNGARY_BOUNDS.minLat; lat <= HUNGARY_BOUNDS.maxLat; lat += TILE_STEP_DEGREES) {
    const lonOffset = row % 2 === 0 ? 0 : TILE_STEP_DEGREES / 2;
    for (let lon = HUNGARY_BOUNDS.minLon + lonOffset; lon <= HUNGARY_BOUNDS.maxLon; lon += TILE_STEP_DEGREES) {
      centers.push({
        city: `HU-TILE-${row + 1}`,
        lat: roundCoord(lat),
        lon: roundCoord(lon),
      });
    }
    row += 1;
  }
  return centers;
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

function dedupe(rows: any[]) {
  const map = new Map<string, any>();
  for (const row of rows) {
    const key = `${row.provider}:${row.external_id}`;
    map.set(key, row);
  }
  return Array.from(map.values());
}

async function getStatus() {
  const [{ count }, stateResult, providerCountResult] = await Promise.all([
    supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('place_sync_state').select('*').eq('key', 'local_places').maybeSingle(),
    supabaseAdmin.from('places_local_catalog').select('provider, id'),
  ]);

  const providerCounts = Array.isArray(providerCountResult.data)
    ? providerCountResult.data.reduce<Record<string, number>>((acc, row: any) => {
        acc[row.provider] = (acc[row.provider] || 0) + 1;
        return acc;
      }, {})
    : {};

  const preview = await supabaseAdmin
    .from('places_local_catalog')
    .select('provider, name, city, category_group, synced_at')
    .order('synced_at', { ascending: false })
    .limit(8);

  return {
    totalRows: count || 0,
    state: stateResult.data || null,
    providerCounts,
    preview: preview.data || [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as { action?: 'status' | 'sync'; reset?: boolean };
    const action = body.action || 'status';

    if (action === 'status') {
      return jsonResponse(await getStatus());
    }

    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

    if (!geoapifyKey || !tomtomKey) {
      throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
    }

    const startedAt = new Date().toISOString();
    await supabaseAdmin.from('place_sync_state').upsert({
      key: 'local_places',
      status: 'running',
      last_run_started_at: startedAt,
      last_error: null,
    });

    if (body.reset) {
      await supabaseAdmin.from('places_local_catalog').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const centers = buildHungaryCenters();
    const collected: any[] = [];
    const failures: string[] = [];
    const tasks: Array<() => Promise<void>> = [];

    for (const center of centers) {
      for (const group of CATEGORY_GROUPS) {
        tasks.push(async () => {
          try {
            const [geoRows, tomtomRows] = await Promise.all([
              fetchGeoapify(center, group, geoapifyKey),
              fetchTomTom(center, group, tomtomKey),
            ]);
            collected.push(...geoRows, ...tomtomRows);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(message);
          }
        });
      }
    }

    await runWithConcurrency(tasks, PROVIDER_CONCURRENCY);

    const rows = dedupe(collected);
    if (rows.length > 0) {
      const chunkSize = 250;
      for (let index = 0; index < rows.length; index += chunkSize) {
        const chunk = rows.slice(index, index + chunkSize);
        const { error } = await supabaseAdmin
          .from('places_local_catalog')
          .upsert(chunk, { onConflict: 'provider,external_id' as any, ignoreDuplicates: false });
        if (error) throw error;
      }
    }

    const providerCounts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.provider] = (acc[row.provider] || 0) + 1;
      return acc;
    }, {});

    await supabaseAdmin.from('place_sync_state').upsert({
      key: 'local_places',
      status: failures.length > 0 ? 'partial' : 'idle',
      rows_written: rows.length,
      provider_counts: providerCounts,
      last_run_started_at: startedAt,
      last_run_completed_at: new Date().toISOString(),
      last_error: failures.length > 0 ? failures.slice(0, 5).join(' | ') : null,
    });

    return jsonResponse({
      ok: true,
      rowsWritten: rows.length,
      providerCounts,
      centers: centers.length,
      partialFailures: failures.length,
      status: await getStatus(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    try {
      await supabaseAdmin.from('place_sync_state').upsert({
        key: 'local_places',
        status: 'error',
        last_error: message,
        last_run_completed_at: new Date().toISOString(),
      });
    } catch (_) { /* swallow */ }
    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
