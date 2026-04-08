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

const DEFAULT_SYNC_CONFIG = {
  enabled: false,
  interval_minutes: 15,
  task_batch_size: 2,
  provider_concurrency: 2,
  radius_meters: 16000,
  geo_limit: 60,
  tomtom_limit: 50,
} as const;

type SyncConfig = {
  enabled: boolean;
  interval_minutes: number;
  task_batch_size: number;
  provider_concurrency: number;
  radius_meters: number;
  geo_limit: number;
  tomtom_limit: number;
};

function sanitizeConfig(raw: Partial<SyncConfig> | null | undefined): SyncConfig {
  return {
    enabled: Boolean(raw?.enabled ?? DEFAULT_SYNC_CONFIG.enabled),
    interval_minutes: Math.max(1, Math.min(60, Number(raw?.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes) || DEFAULT_SYNC_CONFIG.interval_minutes)),
    task_batch_size: Math.max(1, Math.min(20, Number(raw?.task_batch_size ?? DEFAULT_SYNC_CONFIG.task_batch_size) || DEFAULT_SYNC_CONFIG.task_batch_size)),
    provider_concurrency: Math.max(1, Math.min(10, Number(raw?.provider_concurrency ?? DEFAULT_SYNC_CONFIG.provider_concurrency) || DEFAULT_SYNC_CONFIG.provider_concurrency)),
    radius_meters: Math.max(1000, Math.min(50000, Number(raw?.radius_meters ?? DEFAULT_SYNC_CONFIG.radius_meters) || DEFAULT_SYNC_CONFIG.radius_meters)),
    geo_limit: Math.max(1, Math.min(200, Number(raw?.geo_limit ?? DEFAULT_SYNC_CONFIG.geo_limit) || DEFAULT_SYNC_CONFIG.geo_limit)),
    tomtom_limit: Math.max(1, Math.min(200, Number(raw?.tomtom_limit ?? DEFAULT_SYNC_CONFIG.tomtom_limit) || DEFAULT_SYNC_CONFIG.tomtom_limit)),
  };
}

async function getConfigRow() {
  const { data, error } = await supabaseAdmin
    .from('app_runtime_config')
    .select('options')
    .eq('key', 'local_places_sync')
    .maybeSingle();

  if (error) {
    console.warn('getConfigRow warning', error.message);
    return null;
  }

  return data;
}

async function loadSyncConfig(): Promise<SyncConfig> {
  const data = await getConfigRow();
  return sanitizeConfig((data as any)?.options || null);
}

async function saveSyncConfig(input: Partial<SyncConfig>) {
  const config = sanitizeConfig(input);
  const { error } = await supabaseAdmin
    .from('app_runtime_config')
    .upsert(
      {
        key: 'local_places_sync',
        provider: 'local_catalog',
        options: config,
      },
      { onConflict: 'key' },
    );

  if (error) throw error;
  return config;
}

async function resolveProjectUrl() {
  return (
    Deno.env.get('SUPABASE_URL') ||
    (await supabaseAdmin.rpc('noop' as any).then(() => null).catch(() => null), null) ||
    null
  );
}

async function resolveVaultSecret(name: string) {
  const { data, error } = await supabaseAdmin
    .from('decrypted_secrets' as any)
    .select('decrypted_secret')
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as any)?.decrypted_secret || null;
}

async function resolveSelfCallConfig() {
  const projectUrl =
    Deno.env.get('SUPABASE_URL') ||
    (await resolveVaultSecret('project_url')) ||
    (await resolveVaultSecret('SUPABASE_URL'));

  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    (await resolveVaultSecret('service_role_key')) ||
    (await resolveVaultSecret('SUPABASE_SERVICE_ROLE_KEY'));

  if (!projectUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/project_url or SUPABASE_SERVICE_ROLE_KEY/service_role_key for self-call.');
  }

  return { projectUrl: String(projectUrl).trim(), serviceRoleKey: String(serviceRoleKey).trim() };
}

async function enqueueBatch(reset = false) {
  const { projectUrl, serviceRoleKey } = await resolveSelfCallConfig();

  const promise = fetch(`${projectUrl.replace(/\/$/, '')}/functions/v1/sync-local-places`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({ action: 'sync', reset }),
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
  } else {
    promise.catch((err: any) => console.error('enqueueBatch self-call error', err));
  }

  return { ok: true, enqueued: true };
}

async function scheduleSync(intervalMinutes: number) {
  const safeMinutes = Math.max(1, Math.min(60, Number(intervalMinutes) || DEFAULT_SYNC_CONFIG.interval_minutes));
  const { error } = await supabaseAdmin.rpc('schedule_local_places_interval' as any, { p_minutes: safeMinutes } as any);
  if (error) throw error;

  const latest = await loadSyncConfig();
  const saved = await saveSyncConfig({ ...latest, enabled: true, interval_minutes: safeMinutes });
  return { ok: true, config: saved };
}

async function unscheduleSync() {
  const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval' as any);
  if (error) throw error;

  const latest = await loadSyncConfig();
  const saved = await saveSyncConfig({ ...latest, enabled: false });
  return { ok: true, config: saved };
}

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

async function fetchGeoapify(center: { city: string; lat: number; lon: number }, group: (typeof CATEGORY_GROUPS)[number], apiKey: string, config: SyncConfig) {
  const params = new URLSearchParams({
    categories: group.geo,
    filter: `circle:${center.lon},${center.lat},${config.radius_meters}`,
    bias: `proximity:${center.lon},${center.lat}`,
    limit: String(config.geo_limit),
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

async function fetchTomTom(center: { city: string; lat: number; lon: number }, group: (typeof CATEGORY_GROUPS)[number], apiKey: string, config: SyncConfig) {
  const params = new URLSearchParams({
    key: apiKey,
    countrySet: 'HU',
    limit: String(config.tomtom_limit),
    lat: String(center.lat),
    lon: String(center.lon),
    radius: String(config.radius_meters),
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

function buildTasks() {
  const centers = buildHungaryCenters();
  const tasks: Array<{ center: { city: string; lat: number; lon: number }; group: (typeof CATEGORY_GROUPS)[number] }> = [];
  for (const center of centers) {
    for (const group of CATEGORY_GROUPS) {
      tasks.push({ center, group });
    }
  }
  return tasks;
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
    const body = await req.json().catch(() => ({})) as {
      action?: 'status' | 'sync' | 'get_config' | 'save_config' | 'enqueue' | 'schedule' | 'unschedule';
      reset?: boolean;
      config?: Partial<SyncConfig>;
      interval_minutes?: number;
    };
    const action = body.action || 'status';

    if (action === 'status') {
      return jsonResponse(await getStatus());
    }

    if (action === 'get_config') {
      const config = await loadSyncConfig();
      return jsonResponse({ ok: true, config });
    }

    if (action === 'save_config') {
      const config = await saveSyncConfig(body.config || {});
      return jsonResponse({ ok: true, config });
    }

    if (action === 'enqueue') {
      const result = await enqueueBatch(Boolean(body.reset));
      return jsonResponse({ requestId: result.requestId || null, ok: true });
    }

    if (action === 'schedule') {
      const result = await scheduleSync(Number(body.interval_minutes || DEFAULT_SYNC_CONFIG.interval_minutes));
      return jsonResponse(result);
    }

    if (action === 'unschedule') {
      const result = await unscheduleSync();
      return jsonResponse(result);
    }

    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

    if (!geoapifyKey || !tomtomKey) {
      throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
    }

    const syncConfig = await loadSyncConfig();
    const allTasks = buildTasks();
    const totalTasks = allTasks.length;

    const currentStateResult = await supabaseAdmin
      .from('place_sync_state')
      .select('*')
      .eq('key', 'local_places')
      .maybeSingle();

    const currentState = currentStateResult.data || {};
    const currentCursor = Number((currentState as any)?.cursor || 0);

    let startCursor = currentCursor;
    if (body.reset) {
      startCursor = 0;
      await supabaseAdmin.from('places_local_catalog').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);
    const startedAt = new Date().toISOString();

    await supabaseAdmin.from('place_sync_state').upsert({
      key: 'local_places',
      status: 'running',
      task_count: totalTasks,
      cursor: startCursor,
      last_run_started_at: startedAt,
      last_error: null,
    });

    const collected: any[] = [];
    const failures: string[] = [];
    let successfulProviderCalls = 0;

    const taskFns: Array<() => Promise<void>> = batchTasks.map(({ center, group }) => async () => {
      const [geoResult, tomtomResult] = await Promise.allSettled([
        fetchGeoapify(center, group, geoapifyKey, syncConfig),
        fetchTomTom(center, group, tomtomKey, syncConfig),
      ]);

      if (geoResult.status === 'fulfilled') {
        collected.push(...geoResult.value);
        successfulProviderCalls += 1;
      } else {
        const message = geoResult.reason instanceof Error ? geoResult.reason.message : String(geoResult.reason);
        failures.push(message);
      }

      if (tomtomResult.status === 'fulfilled') {
        collected.push(...tomtomResult.value);
        successfulProviderCalls += 1;
      } else {
        const message = tomtomResult.reason instanceof Error ? tomtomResult.reason.message : String(tomtomResult.reason);
        failures.push(message);
      }
    });

    await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

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

    const shouldAdvanceCursor = successfulProviderCalls > 0 || rows.length > 0;
    const nextCursor = shouldAdvanceCursor
      ? Math.min(totalTasks, startCursor + batchTasks.length)
      : startCursor;
    const hasMore = nextCursor < totalTasks;
    const liveStatus = await getStatus();

    await supabaseAdmin.from('place_sync_state').upsert({
      key: 'local_places',
      status: failures.length > 0 ? 'partial' : (hasMore ? 'running' : 'idle'),
      rows_written: liveStatus.totalRows,
      provider_counts: liveStatus.providerCounts,
      task_count: totalTasks,
      cursor: nextCursor,
      last_run_started_at: startedAt,
      last_run_completed_at: new Date().toISOString(),
      last_error: failures.length > 0 ? failures.slice(0, 5).join(' | ') : null,
    });

    return jsonResponse({
      ok: true,
      processedTasks: batchTasks.length,
      totalTasks,
      nextCursor,
      hasMore,
      partialFailures: failures.length,
      rowsWrittenThisRun: rows.length,
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
    } catch (_) {
      // swallow
    }
    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
