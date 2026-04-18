// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { clamp, loadSyncConfig, saveSyncConfig } from './config.ts';
import { appendLog, getStatus, upsertSyncState } from './repositories.ts';
import {
  dedupeRowsPhase,
  executeSyncBatch,
  fetchGeoapifyRowsPhase,
  fetchNextTaskRows,
  fetchTomTomRowsPhase,
  filterHuRowsPhase,
  prepareNextTaskPhase,
  resetCatalogOnly,
  startManualRun,
  writeRowsPhase,
} from './batchRunner.ts';
import type { SyncBody } from './types.ts';

const DEFAULT_INTERVAL_MINUTES = 15;

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
    const action = (queryAction || body.action || 'status') as string;
    const reset = queryReset === 'true' || body.reset === true;
    const effectiveBody: SyncBody = { ...body, action: action as any, reset };

    // ── Read-only ────────────────────────────────────────────────────────────
    if (action === 'status') {
      return jsonResponse(await getStatus(supabaseAdmin));
    }

    if (action === 'get_config') {
      return jsonResponse({ config: await loadSyncConfig(supabaseAdmin) });
    }

    // ── Config write ─────────────────────────────────────────────────────────
    if (action === 'save_config') {
      const config = await saveSyncConfig(supabaseAdmin, body.config || {});
      await appendLog(supabaseAdmin, 'info', 'config_saved', 'Lokális sync konfiguráció elmentve', config as any, runId);
      return jsonResponse({ ok: true, config });
    }

    // ── Scheduler ────────────────────────────────────────────────────────────
    if (action === 'schedule') {
      const minutes = clamp(Number(body.interval_minutes ?? DEFAULT_INTERVAL_MINUTES), 1, 60);
      const { error } = await supabaseAdmin.rpc('schedule_local_places_interval', { p_minutes: minutes });
      if (error) throw error;
      await appendLog(supabaseAdmin, 'success', 'schedule_enabled', `Automatikus batch ütemezés: ${minutes} perc`, { interval_minutes: minutes }, runId);
      return jsonResponse({ ok: true, interval_minutes: minutes });
    }

    if (action === 'unschedule') {
      const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval');
      if (error) throw error;
      await appendLog(supabaseAdmin, 'warn', 'schedule_disabled', 'Automatikus batch ütemezés kikapcsolva', {}, runId);
      return jsonResponse({ ok: true });
    }

    // ── Phase-based manual run ────────────────────────────────────────────────
    if (action === 'reset_catalog') {
      return jsonResponse(await resetCatalogOnly(supabaseAdmin, runId));
    }

    if (action === 'start_manual_run') {
      return jsonResponse(await startManualRun(supabaseAdmin, effectiveBody, runId));
    }

    if (action === 'fetch_next_task') {
      return jsonResponse(await fetchNextTaskRows(supabaseAdmin, runId));
    }

    if (action === 'prepare_next_task') {
      return jsonResponse(await prepareNextTaskPhase(supabaseAdmin, effectiveBody, runId));
    }

    if (action === 'fetch_geoapify_rows') {
      return jsonResponse(await fetchGeoapifyRowsPhase(supabaseAdmin, effectiveBody, runId));
    }

    if (action === 'fetch_tomtom_rows') {
      return jsonResponse(await fetchTomTomRowsPhase(supabaseAdmin, effectiveBody, runId));
    }

    if (action === 'filter_hu_rows') {
      return jsonResponse(await filterHuRowsPhase(supabaseAdmin, (effectiveBody as any).rows || [], runId));
    }

    if (action === 'dedupe_rows') {
      return jsonResponse(await dedupeRowsPhase(supabaseAdmin, (effectiveBody as any).rows || [], runId));
    }

    if (action === 'write_rows') {
      return jsonResponse(await writeRowsPhase(
        supabaseAdmin,
        (effectiveBody as any).rows || [],
        Number((effectiveBody as any).advance_cursor_by ?? 1),
        (effectiveBody as any).partial_failures || [],
        runId,
      ));
    }

    // ── Auto / legacy batch ───────────────────────────────────────────────────
    if (action === 'enqueue' || action === 'sync') {
      await appendLog(supabaseAdmin, 'info', 'batch_enqueued', 'Batch futtatás elindítva', { reset, mode: 'inline_execute', request_id: runId }, runId);
      const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId);
      return jsonResponse({ ...result, requestId: runId, enqueueMode: 'inline_execute' });
    }

    // Default: auto batch
    return jsonResponse(await executeSyncBatch(supabaseAdmin, effectiveBody, runId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await upsertSyncState(supabaseAdmin, {
      key: 'local_places',
      status: 'error',
      last_error: message,
      last_run_completed_at: new Date().toISOString(),
    });
    await appendLog(supabaseAdmin, 'error', 'sync_error', 'Lokális címszinkron hiba', { error: message }, runId);
    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
