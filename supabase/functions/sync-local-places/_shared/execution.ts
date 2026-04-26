// deno-lint-ignore-file no-explicit-any
import { appendMilestoneLog } from './logs.ts';
import { buildTasks } from './tasks.ts';
import { fetchGeoapify, fetchTomTom } from './providers.ts';
import { loadSyncConfig } from './config.ts';
import { getStatus } from './status.ts';
import { getCurrentSyncState, upsertSyncState } from './state.ts';
import { resetCatalog, upsertCatalogRows } from './catalog.ts';
import { dedupeByProviderExternalId, runWithConcurrency } from './utils.ts';
import { SYNC_STATE_KEY } from './constants.ts';
import type { LocalCatalogRow, SupabaseAdmin, SyncBody, SyncExecutionResult } from './types.ts';

export async function executeSyncBatch(
  supabaseAdmin: SupabaseAdmin,
  body: SyncBody,
  runId: string,
): Promise<SyncExecutionResult> {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentSyncState(supabaseAdmin);
  const currentCursor = Number(currentState?.cursor || 0);

  let startCursor = currentCursor;
  if (body.reset) {
    startCursor = 0;
    await resetCatalog(supabaseAdmin);
    await appendMilestoneLog(
      supabaseAdmin,
      'catalog_reset',
      'Lokális címtábla teljes újratöltése indult',
      {},
      runId,
    );
  }

  const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);
  const startedAt = new Date().toISOString();

  if (batchTasks.length === 0) {
    const stateWriteError = await upsertSyncState(supabaseAdmin, {
      key: SYNC_STATE_KEY,
      status: 'idle',
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });

    await appendMilestoneLog(
      supabaseAdmin,
      'sync_complete',
      'Nincs több feldolgozandó batch. A lokális címtábla szinkron kész.',
      { total_tasks: totalTasks },
      runId,
    );

    return {
      ok: true,
      processedTasks: 0,
      totalTasks,
      nextCursor: totalTasks,
      hasMore: false,
      _stateWriteError: stateWriteError,
      status: await getStatus(supabaseAdmin),
    };
  }

  const initialStateWriteError = await upsertSyncState(supabaseAdmin, {
    key: SYNC_STATE_KEY,
    status: 'running',
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: null,
    last_error: null,
  });

  await appendMilestoneLog(
    supabaseAdmin,
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

  const collected: LocalCatalogRow[] = [];
  const failures: string[] = [];

  const taskFns: Array<() => Promise<void>> = batchTasks.map(({ center, group }) => async () => {
    const [geoResult, tomtomResult] = await Promise.allSettled([
      fetchGeoapify(center, group, geoapifyKey, syncConfig),
      fetchTomTom(center, group, tomtomKey, syncConfig),
    ]);

    if (geoResult.status === 'fulfilled') {
      collected.push(...geoResult.value);
    } else {
      failures.push(geoResult.reason instanceof Error ? geoResult.reason.message : String(geoResult.reason));
    }

    if (tomtomResult.status === 'fulfilled') {
      collected.push(...tomtomResult.value);
    } else {
      failures.push(tomtomResult.reason instanceof Error ? tomtomResult.reason.message : String(tomtomResult.reason));
    }
  });

  await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

  const rows = dedupeByProviderExternalId(collected);
  await upsertCatalogRows(supabaseAdmin, rows);

  const nextCursor = Math.min(totalTasks, startCursor + batchTasks.length);
  const hasMore = nextCursor < totalTasks;
  const liveStatus = await getStatus(supabaseAdmin);
  const finalStatus = hasMore ? (failures.length > 0 ? 'partial' : 'running') : (failures.length > 0 ? 'partial' : 'idle');

  const finalStateWriteError = await upsertSyncState(supabaseAdmin, {
    key: SYNC_STATE_KEY,
    status: finalStatus,
    rows_written: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    task_count: totalTasks,
    cursor: nextCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: new Date().toISOString(),
    last_error: failures.length > 0 ? failures.slice(0, 5).join(' | ') : null,
  });

  const logWriteError = await appendMilestoneLog(
    supabaseAdmin,
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
    _stateWriteError: initialStateWriteError || finalStateWriteError,
    _logWriteError: logWriteError,
    status: await getStatus(supabaseAdmin),
  };
}
