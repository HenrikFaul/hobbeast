console.log("DEBUG ACTION:", action, "QUERY:", queryAction, "BODY:", body);

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
    // --- ÚJ: Query paramok előre, mert SQL-ből a body gyakran üres ---
    const url = new URL(req.url);
    const queryAction = url.searchParams.get('action');
    const queryReset = url.searchParams.get('reset');

    // --- JSON body csak ha tényleg van ---
    const body = await req.json().catch(() => ({})) as SyncBody;

    // --- ÚJ: action prioritás ---
    const action = (queryAction || body.action || 'status') as SyncAction;

    // --- ÚJ: reset prioritás ---
    const reset = queryReset === 'true' || body.reset === true;

    // --- A batch futtatásához egységesített body ---
    const effectiveBody: SyncBody = {
      ...body,
      action,
      reset,
    };

    // --- ACTION HANDLEREK ---

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

    // --- fallback: sync ---
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

    await appendLog(
      supabaseAdmin,
      'error',
      'sync_error',
      'Lokális címszinkron hiba történt',
      { error: message },
      runId,
    );

    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
