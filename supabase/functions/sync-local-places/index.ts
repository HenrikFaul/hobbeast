// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';

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
  radius_meters: 16000,
  geo_limit: 60,
  tomtom_limit: 50,
  provider_concurrency: 2,
  task_batch_size: 2,
} as const;

type SyncConfig = {
  enabled: boolean;
  interval_minutes: number;
  radius_meters: number;
  geo_limit: number;
  tomtom_limit: number;
  provider_concurrency: number;
  task_batch_size: number;
};

type SyncAction =
  | 'status'
  | 'sync'
  | 'get_config'
  | 'save_config'
  | 'enqueue'
  | 'schedule'
  | 'unschedule';

type SyncBody = {
  action?: SyncAction;
  reset?: boolean;
  interval_minutes?: number;
  config?: Partial<SyncConfig>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeSyncConfig(input?: Partial<SyncConfig>): SyncConfig {
  const raw = input || {};
  return {
    enabled: Boolean(raw.enabled ?? DEFAULT_SYNC_CONFIG.enabled),
    interval_minutes: clamp(Number(raw.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes), 1, 60),
    radius_meters: clamp(Number(raw.radius_meters ?? DEFAULT_SYNC_CONFIG.radius_meters), 1000, 50000),
    geo_limit: clamp(Number(raw.geo_limit ?? DEFAULT_SYNC_CONFIG.geo_limit), 1, 200),
    tomtom_limit: clamp(Number(raw.tomtom_limit ?? DEFAULT_SYNC_CONFIG.tomtom_limit), 1, 200),
    provider_concurrency: clamp(Number(raw.provider_concurrency ?? DEFAULT_SYNC_CONFIG.provider_concurrency), 1, 10),
    task_batch_size: clamp(Number(raw.task_batch_size ?? DEFAULT_SYNC_CONFIG.task_batch_size), 1, 20),
  };
}

async function loadSyncConfig(supabaseAdmin: any): Promise<SyncConfig> {
  const { data } = await supabaseAdmin
    .from('app_runtime_config')
    .select('options')
    .eq('key', 'local_places_sync')
    .maybeSingle();

  return sanitizeSyncConfig((data?.options || {}) as Partial<SyncConfig>);
}

async function saveSyncConfig(supabaseAdmin: any, config: Partial<SyncConfig>) {
  const safe = sanitizeSyncConfig(config);
  const { error } = await supabaseAdmin
    .from('app_runtime_config')
    .upsert({
      key: 'local_places_sync',
      provider: 'local_catalog',
      options: safe,
    }, { onConflict: 'key' });

  if (error) throw error;
  return safe;
}

async function appendLog(
  supabaseAdmin: any,
  level: 'info' | 'warn' | 'error' | 'success',
  event: string,
  message: string,
  details: Record<string, unknown> = {},
  runId?: string,
) {
  try {
    await supabaseAdmin.from('place_sync_logs').insert({
      run_id: runId ?? null,
      level,
      event,
      message,
      details,
    });
  } catch (error) {
    console.error('place_sync_logs insert failed', error);
  }
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

async function fetchGeoapify(
  center: { city: string; lat: number; lon: number },
  group: (typeof CATEGORY_GROUPS)[number],
  apiKey: string,
  config: SyncConfig,
) {
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

async function fetchTomTom(
  center: { city: string; lat: number; lon: number },
  group: (typeof CATEGORY_GROUPS)[number],
  apiKey: string,
  config: SyncConfig,
) {
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

async function getRecentLogs(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from('place_sync_logs')
    .select('id, created_at, level, event, message, details')
    .order('created_at', { ascending: false })
    .limit(40);

  return data || [];
}

async function getStatus(supabaseAdmin: any) {
  const [{ count }, stateResult, providerCountResult, preview, logs] = await Promise.all([
    supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('place_sync_state').select('*').eq('key', 'local_places').maybeSingle(),
    supabaseAdmin.from('places_local_catalog').select('provider, id'),
    supabaseAdmin.from('places_local_catalog')
      .select('provider, name, city, category_group, synced_at')
      .order('synced_at', { ascending: false })
      .limit(8),
    getRecentLogs(supabaseAdmin),
  ]);

  const providerCounts = Array.isArray(providerCountResult.data)
    ? providerCountResult.data.reduce((acc: Record<string, number>, row: any) => {
        acc[row.provider] = (acc[row.provider] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : {};

  return {
    totalRows: count || 0,
    state: stateResult.data || null,
    providerCounts,
    preview: preview.data || [],
    logs,
  };
}

async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
) {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;

  const currentStateResult = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', 'local_places')
    .maybeSingle();

  const currentState = currentStateResult.data || {};
  const currentCursor = Number(currentState?.cursor || 0);

  let startCursor = currentCursor;
  if (body.reset) {
    startCursor = 0;
    const { error: resetError } = await supabaseAdmin
      .from('places_local_catalog')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (resetError) throw resetError;
    await appendLog(supabaseAdmin, 'warn', 'catalog_reset', 'Lokális címtábla teljes újratöltése indult', {}, runId);
  }

  const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);
  const startedAt = new Date().toISOString();

  if (batchTasks.length === 0) {
    await supabaseAdmin.from('place_sync_state').upsert({
      key: 'local_places',
      status: 'idle',
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });
    await appendLog(supabaseAdmin, 'success', 'sync_complete', 'Nincs több feldolgozandó batch. A lokális címtábla szinkron kész.', { total_tasks: totalTasks }, runId);
    return {
      ok: true,
      processedTasks: 0,
      totalTasks,
      nextCursor: totalTasks,
      hasMore: false,
      status: await getStatus(supabaseAdmin),
    };
  }

  await supabaseAdmin.from('place_sync_state').upsert({
    key: 'local_places',
    status: 'running',
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: null,
    last_error: null,
  });

  await appendLog(
    supabaseAdmin,
    'info',
    'batch_started',
    'Lokális címbatch feldolgozás elindult',
    {
      start_cursor: startCursor,
      batch_size: batchTasks.length,
      total_tasks: totalTasks,
      config: syncConfig,
    },
    runId,
  );

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
  const liveStatus = await getStatus(supabaseAdmin);
  const finalStatus = hasMore ? (failures.length > 0 ? 'partial' : 'running') : (failures.length > 0 ? 'partial' : 'idle');

  await supabaseAdmin.from('place_sync_state').upsert({
    key: 'local_places',
    status: finalStatus,
    rows_written: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    task_count: totalTasks,
    cursor: nextCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: new Date().toISOString(),
    last_error: failures.length > 0 ? failures.slice(0, 5).join(' | ') : null,
  });

  await appendLog(
    supabaseAdmin,
    failures.length > 0 ? 'warn' : 'success',
    'batch_completed',
    failures.length > 0 ? 'Lokális batch részlegesen lefutott' : 'Lokális batch sikeresen lefutott',
    {
      processed_tasks: batchTasks.length,
      total_tasks: totalTasks,
      next_cursor: nextCursor,
      has_more: hasMore,
      rows_written_this_run: rows.length,
      provider_counts: liveStatus.providerCounts,
      partial_failures: failures.slice(0, 5),
    },
    runId,
  );

  return {
    ok: true,
    processedTasks: batchTasks.length,
    totalTasks,
    nextCursor,
    hasMore,
    partialFailures: failures.length,
    rowsWrittenThisRun: rows.length,
    status: await getStatus(supabaseAdmin),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = crypto.randomUUID();
  const supabaseAdmin = getSupabaseAdmin(req);

  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get('action');
    const queryReset = url.searchParams.get('reset');

    const body = await req.json().catch(() => ({})) as SyncBody;

    const action = (queryAction || body.action || 'status') as SyncAction;
    const reset = queryReset === 'true' || body.reset === true;

    const effectiveBody: SyncBody = {
      ...body,
      action,
      reset,
    };

    if (action === 'status') {
      return jsonResponse(await getStatus(supabaseAdmin));
    }

    if (action === 'get_config') {
      const config = await loadSyncConfig(supabaseAdmin);
      return jsonResponse({ config });
    }

    if (action === 'save_config') {
      const config = await saveSyncConfig(supabaseAdmin, body.config || {});
      await appendLog(
        supabaseAdmin,
        'info',
        'config_saved',
        'Lokális sync konfiguráció elmentve',
        config as unknown as Record<string, unknown>,
        runId,
      );
      return jsonResponse({ ok: true, config });
    }

    if (action === 'schedule') {
      const minutes = clamp(Number(body.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes), 1, 60);
      const { error } = await supabaseAdmin.rpc('schedule_local_places_interval', { p_minutes: minutes });
      if (error) throw error;
      await appendLog(
        supabaseAdmin,
        'success',
        'schedule_enabled',
        `Automatikus batch ütemezés beállítva: ${minutes} percenként`,
        { interval_minutes: minutes },
        runId,
      );
      return jsonResponse({ ok: true, interval_minutes: minutes });
    }

    if (action === 'unschedule') {
      const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval');
      if (error) throw error;
      await appendLog(
        supabaseAdmin,
        'warn',
        'schedule_disabled',
        'Automatikus batch ütemezés kikapcsolva',
        {},
        runId,
      );
      return jsonResponse({ ok: true });
    }

    if (action === 'enqueue') {
      await appendLog(
        supabaseAdmin,
        'info',
        'batch_enqueued',
        'Lokális batch közvetlen futtatással elindítva',
        { reset, mode: 'inline_execute', request_id: runId },
        runId,
      );

      const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId);
      return jsonResponse({ ...result, requestId: runId, enqueueMode: 'inline_execute' });
    }

    const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId);
    return jsonResponse(result);
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
    await appendLog(supabaseAdmin, 'error', 'sync_error', 'Lokális címszinkron hiba történt', { error: message }, runId);
    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
