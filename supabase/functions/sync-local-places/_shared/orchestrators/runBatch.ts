import { MILESTONES } from '../constants/sync.ts';
import { deleteAllCatalogRows } from '../repositories/catalogRepo.ts';
import { loadSyncConfig } from '../repositories/configRepo.ts';
import { getCurrentSyncState, upsertSyncState } from '../repositories/stateRepo.ts';
import { getStatus } from '../services/statusService.ts';
import { buildTasks } from '../tasks/buildTasks.ts';
import { dedupeRows } from '../utils/dedupe.ts';
import { runWithConcurrency } from '../utils/concurrency.ts';
import type { BatchExecutionResult, SyncBody } from '../types/index.ts';
import { runTask } from './runTask.ts';
import { writeCatalogRows } from '../services/catalogWriter.ts';

export async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
): Promise<BatchExecutionResult> {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');
  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentSyncState(supabaseAdmin);
  let startCursor = Number(currentState?.cursor || 0);

  if (body.reset) {
    startCursor = 0;
    await deleteAllCatalogRows(supabaseAdmin);
    await appendLog('warn', 'catalog_reset', 'Lokális címtábla teljes újratöltése indult', {}, runId);
  }

  const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);
  const startedAt = new Date().toISOString();

  if (batchTasks.length === 0) {
    const latestStatus = await getStatus(supabaseAdmin);
    const e1 = await upsertSyncState(supabaseAdmin, {
      key: 'local_places',
      status: 'idle',
      rows_written: latestStatus.totalRows,
      provider_counts: latestStatus.providerCounts,
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });

    await appendLog('success', 'sync_complete', 'Nincs több feldolgozandó batch. A lokális címtábla szinkron kész.', { total_tasks: totalTasks }, runId);
    return { ok: true, processedTasks: 0, totalTasks, nextCursor: totalTasks, hasMore: false, _stateWriteError: e1, status: await getStatus(supabaseAdmin) };
  }

  const e0 = await upsertSyncState(supabaseAdmin, {
    key: 'local_places',
    status: 'running',
    rows_written: body.reset ? 0 : Number(currentState?.rows_written || 0),
    provider_counts: body.reset ? {} : (currentState?.provider_counts || {}),
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: null,
    last_error: null,
  });

  await appendLog('info', MILESTONES.BATCH_STARTED, 'Lokális címbatch feldolgozás elindult', {
    start_cursor: startCursor,
    batch_size: batchTasks.length,
    total_tasks: totalTasks,
    config: syncConfig,
  }, runId);

  const collected: any[] = [];
  const failures: string[] = [];
  let successfulProviderCalls = 0;

  const taskFns = batchTasks.map((task, taskIndex) => async () => {
    const result = await runTask({
      task,
      taskIndex,
      taskCursor: startCursor + taskIndex,
      geoapifyKey,
      tomtomKey,
      config: syncConfig,
      appendLog,
      runId,
    });

    collected.push(...result.rows);
    failures.push(...result.failures);
    successfulProviderCalls += result.successfulProviderCalls;
  });

  await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

  const rows = dedupeRows(collected);
  await appendLog('info', MILESTONES.CATALOG_ROWS_BUILT, 'Catalog payload prepared', {
    payload_count: rows.length,
    successful_provider_calls: successfulProviderCalls,
    failure_count: failures.length,
  }, runId);

  const rowsWrittenThisRun = await writeCatalogRows({ supabaseAdmin, rows, runId, appendLog });

  const nextCursor = Math.min(totalTasks, startCursor + batchTasks.length);
  const hasMore = nextCursor < totalTasks;
  const liveStatus = await getStatus(supabaseAdmin);
  const finalStatus = hasMore ? (failures.length > 0 ? 'partial' : 'running') : (failures.length > 0 ? 'partial' : 'idle');

  const e2 = await upsertSyncState(supabaseAdmin, {
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

  const logErr = await appendLog(failures.length > 0 ? 'warn' : 'success', MILESTONES.BATCH_FINISHED, failures.length > 0 ? 'Lokális batch részlegesen lefutott' : 'Lokális batch sikeresen lefutott', {
    processed_tasks: batchTasks.length,
    total_tasks: totalTasks,
    next_cursor: nextCursor,
    has_more: hasMore,
    rows_written_this_run: rowsWrittenThisRun,
    successful_provider_calls: successfulProviderCalls,
    provider_counts: liveStatus.providerCounts,
    partial_failures: failures.slice(0, 5),
  }, runId);

  return {
    ok: true,
    processedTasks: batchTasks.length,
    totalTasks,
    nextCursor,
    hasMore,
    partialFailures: failures.length,
    rowsWrittenThisRun,
    _stateWriteError: e0 || e2,
    _logWriteError: logErr,
    status: await getStatus(supabaseAdmin),
  };
}
