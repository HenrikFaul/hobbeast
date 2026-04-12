// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { DEFAULT_SYNC_CONFIG } from './_shared/constants.ts';
import { executeSyncBatch } from './_shared/execution.ts';
import { appendMilestoneLog } from './_shared/logs.ts';
import { getStatus } from './_shared/status.ts';
import { upsertSyncState } from './_shared/state.ts';
import { clamp } from './_shared/utils.ts';
import { loadSyncConfig, saveSyncConfig } from './_shared/config.ts';
import type { SyncAction, SyncBody } from './_shared/types.ts';

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
      await appendMilestoneLog(
        supabaseAdmin,
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

      await appendMilestoneLog(
        supabaseAdmin,
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

      await appendMilestoneLog(
        supabaseAdmin,
        'schedule_disabled',
        'Automatikus batch ütemezés kikapcsolva',
        {},
        runId,
      );

      return jsonResponse({ ok: true });
    }

    if (action === 'enqueue') {
      await appendMilestoneLog(
        supabaseAdmin,
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

    await upsertSyncState(supabaseAdmin, {
      status: 'error',
      last_error: message,
      last_run_completed_at: new Date().toISOString(),
    });

    await appendMilestoneLog(
      supabaseAdmin,
      'sync_error',
      'Lokális címszinkron hiba történt',
      { error: message },
      runId,
    );

    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
