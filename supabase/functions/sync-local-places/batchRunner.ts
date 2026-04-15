// deno-lint-ignore-file no-explicit-any
import { LOCAL_PLACES_STATE_KEY } from './constants.ts';
import { loadSyncConfig } from './config.ts';
import { MILESTONES, milestone } from './milestones.ts';
import { fetchGeoapifyRows } from './providers/geoapify.ts';
import { fetchTomTomRows } from './providers/tomtom.ts';
import { getStatus, resetCatalog, upsertSyncState, writeCatalogRows } from './repositories.ts';
import { buildTasks } from './taskBuilder.ts';
import type { BatchResult, LocalCatalogRow, SyncBody } from './types.ts';

function dedupe(rows: LocalCatalogRow[]) {
  const map = new Map<string, LocalCatalogRow>();
  for (const row of rows) {
    map.set(`${row.provider}:${row.external_id}`, row);
  }
  return Array.from(map.values());
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

export async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
): Promise<BatchResult> {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const startedAt = new Date().toISOString();

  const currentStateResult = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', LOCAL_PLACES_STATE_KEY)
    .maybeSingle();

  const currentState = currentStateResult.data || {};
  let startCursor = Number(currentState?.cursor || 0);

  if (body.reset) {
    await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED, 'Teljes újratöltés indult', {
      requested_reset: true,
      total_tasks: totalTasks,
      started_at: startedAt,
    }, runId);

    await milestone(supabaseAdmin, 'warn', MILESTONES.CATALOG_RESET_STARTED, 'Lokális katalógus ürítése indul', {}, runId);
    await resetCatalog(supabaseAdmin);
    await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_RESET_COMPLETED, 'Lokális katalógus ürítése kész', {}, runId);
    startCursor = 0;
  } else {
    await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED, 'Batch futás indult', {
      requested_reset: false,
      start_cursor: startCursor,
      total_tasks: totalTasks,
      started_at: startedAt,
    }, runId);
  }

  const stateStartError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: 'running',
    rows_written: Number(currentState?.rows_written || 0),
    provider_counts: currentState?.provider_counts || {},
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: null,
    last_error: null,
  });

  const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);

  if (batchTasks.length === 0) {
    const stateEndError = await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY,
      status: 'idle',
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });

    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED, 'Nincs több feldolgozandó batch', {
      total_tasks: totalTasks,
    }, runId);

    return {
      ok: true,
      processedTasks: 0,
      totalTasks,
      nextCursor: totalTasks,
      hasMore: false,
      _stateWriteError: stateStartError || stateEndError,
      status: await getStatus(supabaseAdmin),
    };
  }

  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_STARTED, 'Batch feldolgozás elindult', {
    start_cursor: startCursor,
    batch_size: batchTasks.length,
    total_tasks: totalTasks,
    config: syncConfig,
  }, runId);

  const collected: LocalCatalogRow[] = [];
  const failures: string[] = [];

  const taskFns = batchTasks.map(({ center, group }, taskIndex) => async () => {
    await milestone(supabaseAdmin, 'info', MILESTONES.TASK_STARTED, 'Task feldolgozás indult', {
      task_index: startCursor + taskIndex,
      center,
      group,
    }, runId);

    await milestone(supabaseAdmin, 'info', MILESTONES.GEOAPIFY_FETCH_STARTED, 'Geoapify hívás indul', { center, group }, runId);
    const geoResult = await fetchGeoapifyRows(center, group, geoapifyKey, syncConfig)
      .then((rows) => ({ ok: true as const, rows }))
      .catch((error) => ({ ok: false as const, error }));

    if (geoResult.ok) {
      collected.push(...geoResult.rows);
      await milestone(supabaseAdmin, 'success', MILESTONES.GEOAPIFY_FETCH_COMPLETED, 'Geoapify hívás kész', {
        center,
        group,
        row_count: geoResult.rows.length,
      }, runId);
      await milestone(supabaseAdmin, 'info', MILESTONES.PROVIDER_AFTER_HU_FILTER, 'Geoapify HU-szűrés utáni sorok', {
        provider: 'geoapify',
        center,
        group,
        row_count: geoResult.rows.length,
      }, runId);
    } else {
      const message = geoResult.error instanceof Error ? geoResult.error.message : String(geoResult.error);
      failures.push(message);
      await milestone(supabaseAdmin, 'error', MILESTONES.GEOAPIFY_FETCH_COMPLETED, 'Geoapify hívás hibával végződött', {
        center,
        group,
        error: message,
      }, runId);
    }

    await milestone(supabaseAdmin, 'info', MILESTONES.TOMTOM_FETCH_STARTED, 'TomTom hívás indul', { center, group }, runId);
    const tomtomResult = await fetchTomTomRows(center, group, tomtomKey, syncConfig)
      .then((rows) => ({ ok: true as const, rows }))
      .catch((error) => ({ ok: false as const, error }));

    if (tomtomResult.ok) {
      collected.push(...tomtomResult.rows);
      await milestone(supabaseAdmin, 'success', MILESTONES.TOMTOM_FETCH_COMPLETED, 'TomTom hívás kész', {
        center,
        group,
        row_count: tomtomResult.rows.length,
      }, runId);
      await milestone(supabaseAdmin, 'info', MILESTONES.PROVIDER_AFTER_HU_FILTER, 'TomTom HU-szűrés utáni sorok', {
        provider: 'tomtom',
        center,
        group,
        row_count: tomtomResult.rows.length,
      }, runId);
    } else {
      const message = tomtomResult.error instanceof Error ? tomtomResult.error.message : String(tomtomResult.error);
      failures.push(message);
      await milestone(supabaseAdmin, 'error', MILESTONES.TOMTOM_FETCH_COMPLETED, 'TomTom hívás hibával végződött', {
        center,
        group,
        error: message,
      }, runId);
    }
  });

  await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

  const dedupedRows = dedupe(collected);
  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_AFTER_DEDUPE, 'Batch deduplikálás kész', {
    before_dedupe: collected.length,
    after_dedupe: dedupedRows.length,
  }, runId);

  let rowsWrittenThisRun = 0;
  let catalogWriteError: string | null = null;

  try {
    await milestone(supabaseAdmin, 'info', MILESTONES.CATALOG_WRITE_ATTEMPT, 'Katalógus írás indul', {
      row_count: dedupedRows.length,
    }, runId);
    rowsWrittenThisRun = await writeCatalogRows(supabaseAdmin, dedupedRows);
    await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_WRITE_COMPLETED, 'Katalógus írás kész', {
      row_count: rowsWrittenThisRun,
    }, runId);
  } catch (error) {
    catalogWriteError = error instanceof Error ? error.message : String(error);
    await milestone(supabaseAdmin, 'error', MILESTONES.CATALOG_WRITE_FAILED, 'Katalógus írás sikertelen', {
      error: catalogWriteError,
    }, runId);
    throw error;
  }

  const nextCursor = Math.min(totalTasks, startCursor + batchTasks.length);
  const hasMore = nextCursor < totalTasks;
  const liveStatus = await getStatus(supabaseAdmin);
  const finalStatus = hasMore ? (failures.length > 0 ? 'partial' : 'running') : (failures.length > 0 ? 'partial' : 'idle');
  const completedAt = new Date().toISOString();

  const stateEndError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: finalStatus,
    rows_written: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    task_count: totalTasks,
    cursor: nextCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: completedAt,
    last_error: failures.length > 0 ? failures.slice(0, 5).join(' | ') : null,
  });

  await milestone(supabaseAdmin, 'success', MILESTONES.STATE_WRITE_COMPLETED, 'State frissítés kész', {
    next_cursor: nextCursor,
    total_rows: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    final_status: finalStatus,
  }, runId);

  await milestone(
    supabaseAdmin,
    failures.length > 0 ? 'warn' : 'success',
    MILESTONES.BATCH_COMPLETED,
    failures.length > 0 ? 'Batch részlegesen kész' : 'Batch sikeresen kész',
    {
      processed_tasks: batchTasks.length,
      total_tasks: totalTasks,
      next_cursor: nextCursor,
      has_more: hasMore,
      rows_written_this_run: rowsWrittenThisRun,
      provider_counts: liveStatus.providerCounts,
      partial_failures: failures.slice(0, 5),
      catalog_write_error: catalogWriteError,
    },
    runId,
  );

  if (!hasMore) {
    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED, 'Teljes futás befejeződött', {
      total_tasks: totalTasks,
      total_rows: liveStatus.totalRows,
    }, runId);
  }

  return {
    ok: true,
    processedTasks: batchTasks.length,
    totalTasks,
    nextCursor,
    hasMore,
    partialFailures: failures.length,
    rowsWrittenThisRun,
    _stateWriteError: stateStartError || stateEndError,
    _logWriteError: null,
    status: await getStatus(supabaseAdmin),
  };
}
