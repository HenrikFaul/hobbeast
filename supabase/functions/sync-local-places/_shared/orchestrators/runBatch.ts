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

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
  appendLog: AppendLog,
): Promise<BatchExecutionResult> {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');
  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }

  // --- Config load ---
  await appendLog('info', MILESTONES.CONFIG_LOAD_STARTED, 'Loading sync config', {}, runId);
  const syncConfig = await loadSyncConfig(supabaseAdmin);
  await appendLog('info', MILESTONES.CONFIG_LOAD_DONE, 'Sync config loaded', {
    task_batch_size: syncConfig.task_batch_size,
    provider_concurrency: syncConfig.provider_concurrency,
    radius_meters: syncConfig.radius_meters,
    geo_limit: syncConfig.geo_limit,
    tomtom_limit: syncConfig.tomtom_limit,
  }, runId);

  // --- Task building ---
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  await appendLog('info', MILESTONES.TASKS_BUILT, 'Task list built', {
    total_tasks: totalTasks,
    batch_size: syncConfig.task_batch_size,
  }, runId);

  // --- State load ---
  const currentState = await getCurrentSyncState(supabaseAdmin);
  let startCursor = Number(currentState?.cursor ?? 0);

  // --- Optional reset ---
  if (body.reset) {
    await appendLog('warn', MILESTONES.STATE_RESET_STARTED, 'Full catalog reset requested — deleting all catalog rows', {}, runId);
    await deleteAllCatalogRows(supabaseAdmin);
    startCursor = 0;
    await appendLog('warn', MILESTONES.STATE_RESET_DONE, 'Catalog reset complete, cursor reset to 0', {}, runId);
  }

  // --- Batch window ---
  const batchTasks = allTasks.slice(startCursor, startCursor + syncConfig.task_batch_size);
  const startedAt = new Date().toISOString();

  await appendLog('info', MILESTONES.BATCH_WINDOW_RESOLVED, 'Batch window resolved', {
    start_cursor: startCursor,
    end_cursor: startCursor + batchTasks.length,
    batch_task_count: batchTasks.length,
    total_tasks: totalTasks,
    has_more: (startCursor + batchTasks.length) < totalTasks,
  }, runId);

  if (batchTasks.length === 0) {
    const latestStatus = await getStatus(supabaseAdmin);
    await upsertSyncState(supabaseAdmin, {
      key: 'local_places',
      status: 'idle',
      rows_written: latestStatus.totalRows,
      provider_counts: latestStatus.providerCounts,
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });
    await appendLog('success', MILESTONES.RUN_COMPLETED, 'No more tasks to process — sync complete', { total_tasks: totalTasks }, runId);
    return { ok: true, processedTasks: 0, totalTasks, nextCursor: totalTasks, hasMore: false, status: await getStatus(supabaseAdmin) };
  }

  // --- Mark as running ---
  await appendLog('info', MILESTONES.STATE_WRITE_ATTEMPT, 'Writing running state', {}, runId);
  const e0 = await upsertSyncState(supabaseAdmin, {
    key: 'local_places',
    status: 'running',
    rows_written: body.reset ? 0 : Number(currentState?.rows_written ?? 0),
    provider_counts: body.reset ? {} : (currentState?.provider_counts ?? {}),
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: null,
    last_error: null,
  });
  if (e0) {
    await appendLog('warn', MILESTONES.STATE_WRITE_DONE, 'State write had an error (non-fatal)', { error: e0 }, runId);
  } else {
    await appendLog('info', MILESTONES.STATE_WRITE_DONE, 'Running state saved', {}, runId);
  }

  await appendLog('info', MILESTONES.RUN_STARTED, 'Batch processing started', {
    start_cursor: startCursor,
    batch_size: batchTasks.length,
    total_tasks: totalTasks,
  }, runId);

  await appendLog('info', MILESTONES.BATCH_STARTED, 'Executing batch tasks', {
    start_cursor: startCursor,
    batch_size: batchTasks.length,
    total_tasks: totalTasks,
    provider_concurrency: syncConfig.provider_concurrency,
  }, runId);

  // --- Run tasks ---
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

  // --- Dedupe ---
  const rows = dedupeRows(collected);
  await appendLog('info', MILESTONES.TASK_DEDUPE_DONE, 'Cross-task deduplication done', {
    pre_dedupe_count: collected.length,
    post_dedupe_count: rows.length,
    duplicates_removed: collected.length - rows.length,
  }, runId);

  await appendLog('info', MILESTONES.CATALOG_ROWS_BUILT, 'Catalog payload ready', {
    payload_count: rows.length,
    successful_provider_calls: successfulProviderCalls,
    failure_count: failures.length,
  }, runId);

  // --- Write catalog (non-fatal: log error but continue) ---
  let rowsWrittenThisRun = 0;
  let catalogWriteError: string | null = null;
  try {
    rowsWrittenThisRun = await writeCatalogRows({ supabaseAdmin, rows, runId, appendLog });
  } catch (err) {
    catalogWriteError = err instanceof Error ? err.message : String(err);
    await appendLog('error', MILESTONES.CATALOG_WRITE_ERROR, 'Catalog write failed — batch continues with partial result', {
      error: catalogWriteError,
      attempted_row_count: rows.length,
    }, runId);
    failures.push(`catalog_write: ${catalogWriteError}`);
  }

  // --- Finalize state ---
  const nextCursor = Math.min(totalTasks, startCursor + batchTasks.length);
  const hasMore = nextCursor < totalTasks;
  const liveStatus = await getStatus(supabaseAdmin);
  const finalStatus = hasMore
    ? (failures.length > 0 ? 'partial' : 'running')
    : (failures.length > 0 ? 'partial' : 'idle');

  await appendLog('info', MILESTONES.STATE_WRITE_ATTEMPT, 'Writing final batch state', { status: finalStatus, next_cursor: nextCursor }, runId);
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
  if (e2) {
    await appendLog('warn', MILESTONES.STATE_WRITE_DONE, 'Final state write had an error (non-fatal)', { error: e2 }, runId);
  } else {
    await appendLog('info', MILESTONES.STATE_WRITE_DONE, 'Final batch state saved', { status: finalStatus }, runId);
  }

  const level = failures.length > 0 ? 'warn' : 'success';
  const logErr = await appendLog(level, MILESTONES.BATCH_FINISHED, failures.length > 0 ? 'Batch finished with partial failures' : 'Batch finished successfully', {
    processed_tasks: batchTasks.length,
    total_tasks: totalTasks,
    next_cursor: nextCursor,
    has_more: hasMore,
    rows_written_this_run: rowsWrittenThisRun,
    successful_provider_calls: successfulProviderCalls,
    provider_counts: liveStatus.providerCounts,
    partial_failures: failures.slice(0, 5),
  }, runId);

  if (!hasMore) {
    await appendLog('success', MILESTONES.RUN_COMPLETED, 'All tasks processed — run complete', {
      total_tasks: totalTasks,
      final_catalog_rows: liveStatus.totalRows,
      provider_counts: liveStatus.providerCounts,
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
    _stateWriteError: e0 || e2,
    _logWriteError: logErr,
    status: await getStatus(supabaseAdmin),
  };
}
