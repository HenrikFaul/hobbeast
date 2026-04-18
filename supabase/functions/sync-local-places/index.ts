// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse } from '../shared/providerFetch.ts';
import { getTargetProjectAdmin } from '../shared/targetProject.ts';
import { DEFAULT_SYNC_CONFIG } from './constants.ts';
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
import { clamp, loadSyncConfig, saveSyncConfig } from './config.ts';
import { MILESTONES, milestone } from './milestones.ts';
import { getStatus, upsertSyncState } from './repositories.ts';
import type { SyncAction, SyncBody } from './types.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = crypto.randomUUID();
  const supabaseAdmin = getTargetProjectAdmin();

  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get('action');
    const queryReset = url.searchParams.get('reset');
    const body = await req.json().catch(() => ({})) as SyncBody;

    const action = (queryAction || body.action || 'status') as SyncAction;
    const reset = queryReset === 'true' || body.reset === true;
    const effectiveBody: SyncBody = { ...body, action, reset };

    if (action === 'status') {
      return jsonResponse(await getStatus(supabaseAdmin));
    }

    if (action === 'get_config') {
      const config = await loadSyncConfig(supabaseAdmin);
      return jsonResponse({ config });
    }

    if (action === 'save_config') {
      const config = await saveSyncConfig(supabaseAdmin, body.config || {});
      await milestone(supabaseAdmin, 'info', 'config_saved', 'Lokális sync konfiguráció elmentve',
        config as unknown as Record<string, unknown>, runId);
      return jsonResponse({ ok: true, config });
    }

    if (action === 'schedule') {
      const minutes = clamp(Number(body.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes), 1, 60);
      const { error } = await supabaseAdmin.rpc('schedule_local_places_interval', { p_minutes: minutes });
      if (error) throw error;
      await milestone(supabaseAdmin, 'success', 'schedule_enabled',
        `Automatikus batch ütemezés beállítva: ${minutes} percenként`, { interval_minutes: minutes }, runId);
      return jsonResponse({ ok: true, interval_minutes: minutes });
    }

    if (action === 'unschedule') {
      const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval');
      if (error) throw error;
      await milestone(supabaseAdmin, 'warn', 'schedule_disabled', 'Automatikus batch ütemezés kikapcsolva', {}, runId);
      return jsonResponse({ ok: true });
    }

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
      return jsonResponse(await filterHuRowsPhase(supabaseAdmin, body.rows || [], runId));
    }

    if (action === 'dedupe_rows') {
      return jsonResponse(await dedupeRowsPhase(supabaseAdmin, body.rows || [], runId));
    }

    if (action === 'write_rows') {
      return jsonResponse(await writeRowsPhase(
        supabaseAdmin, body.rows || [],
        Number(body.advance_cursor_by ?? 0),
        body.partial_failures || [],
        runId,
      ));
    }

    if (action === 'self_test') {
      const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
      const tomtomKey = Deno.env.get('TOMTOM_API_KEY');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      const [stateRead, catalogRead, catalogWrite] = await Promise.all([
        supabaseAdmin.from('place_sync_state').select('key,status').eq('key', 'local_places').maybeSingle()
          .then((r: any) => ({ ok: !r.error, row: r.data, error: r.error?.message })),
        supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true })
          .then((r: any) => ({ ok: !r.error, total_rows: r.count ?? 0, error: r.error?.message })),
        (async () => {
          const testId = `self-test-${runId}`;
          const ins = await supabaseAdmin.from('places_local_catalog').insert({
            provider: 'manual_test', external_id: testId, name: 'Self-Test Probe',
            category_group: 'test', categories: [], address: null, city: 'Budapest',
            district: null, postal_code: null, country_code: 'HU',
            latitude: 47.4979, longitude: 19.0402, open_now: null, rating: null,
            review_count: null, image_url: null, phone: null, website: null,
            opening_hours_text: [], metadata: { self_test: true }, synced_at: new Date().toISOString(),
          });
          if (ins.error) return { ok: false, phase: 'insert', error: ins.error.message };
          const del = await supabaseAdmin.from('places_local_catalog')
            .delete().eq('provider', 'manual_test').eq('external_id', testId);
          if (del.error) return { ok: false, phase: 'delete', error: del.error.message };
          return { ok: true };
        })(),
      ]);

      const envKeys = {
        ok: Boolean(geoapifyKey && tomtomKey),
        geoapify_key: geoapifyKey ? 'present' : 'MISSING',
        tomtom_key: tomtomKey ? 'present' : 'MISSING',
        supabase_url: supabaseUrl ? 'present' : 'MISSING',
        service_role_key: serviceKey ? 'present' : 'MISSING',
      };

      const results = { state_read: stateRead, catalog_read: catalogRead, catalog_write: catalogWrite, env_keys: envKeys };
      const allOk = Object.values(results).every((r: any) => r.ok !== false);

      await milestone(supabaseAdmin, allOk ? 'success' : 'warn', 'self_test_done',
        allOk ? 'Minden self-test probe sikeres' : 'Néhány self-test probe hibás',
        results as unknown as Record<string, unknown>, runId);

      return jsonResponse({ ok: allOk, run_id: runId, self_test: results });
    }

    if (action === 'enqueue') {
      await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED,
        'Lokális batch közvetlen futtatással elindítva',
        { reset, mode: 'inline_execute', request_id: runId }, runId);
      const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId);
      return jsonResponse({ ...result, requestId: runId, enqueueMode: 'inline_execute' });
    }

    // Default: enqueue
    const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId);
    return jsonResponse(result);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await upsertSyncState(supabaseAdmin, {
      key: 'local_places', status: 'error',
      last_error: message, last_run_completed_at: new Date().toISOString(),
    });
    await milestone(supabaseAdmin, 'error', MILESTONES.RUN_FAILED, 'Lokális címszinkron hiba történt', { error: message }, runId);
    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
