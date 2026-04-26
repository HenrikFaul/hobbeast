import { MILESTONES } from '../constants/sync.ts';
import { deleteAllCatalogRows } from '../repositories/catalogRepo.ts';
import { loadSyncConfig } from '../repositories/configRepo.ts';
import { getCurrentSyncState, upsertSyncState } from '../repositories/stateRepo.ts';
import { getStatus } from '../services/statusService.ts';
import { buildTasks } from '../tasks/buildTasks.ts';
import { dedupeRows } from '../utils/dedupe.ts';
import { runWithConcurrency } from '../utils/concurrency.ts';
import type { BatchExecutionResult, PlaceRow, SyncBody } from '../types/index.ts';
import { runTask } from './runTask.ts';
import { writeCatalogRows } from '../services/catalogWriter.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

/** A run is considered stale if it has been in 'running' state longer than this. */
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * How long the inner loop is allowed to run before stopping and returning.
 * This keeps wall-clock time well under the Supabase edge function limit.
 * Call the function again to continue where it left off (cursor is persisted).
 */
const TIME_BUDGET_MS = 50_000; // 50 seconds

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

  // --- Config ---
  await appendLog('info', MILESTONES.CONFIG_LOAD_STARTED, 'Loading sync config', {}, runId);
  const syncConfig = await loadSyncConfig(supabaseAdmin);
  await appendLog('info', MILESTONES.CONFIG_LOAD_DONE, 'Sync config loaded', {
    task_batch_size: syncConfig.task_batch_size,
    provider_concurrency: syncConfig.provider_concurrency,
    radius_meters: syncConfig.radius_meters,
    geo_limit: syncConfig.geo_limit,
    tomtom_limit: syncConfig.tomtom_limit,
  }, runId);

  // --- Tasks ---
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  await appendLog('info', MILESTONES.TASKS_BUILT, 'Task list built', {
    total_tasks: totalTasks,
    batch_size: syncConfig.task_batch_size,
    time_budget_ms: TIME_BUDGET_MS,
  }, runId);

  // --- Current state ---
  const currentState = await getCurrentSyncState(supabaseAdmin);
  let cursor = Number(currentState?.cursor ?? 0);

  // --- Stale run detection ---
  if (currentState?.status === 'running' && currentState?.last_run_started_at) {
    const ageMs = Date.now() - new Date(String(currentState.last_run_started_at)).getTime();
    if (ageMs > STALE_RUN_THRESHOLD_MS) {
      await appendLog('warn', MILESTONES.STALE_RUN_DETECTED,
        `Stale run detected (${Math.round(ageMs / 1000)}s old) — auto-resetting`,
        { stale_age_ms: ageMs, cursor_at_reset: cursor, started_at: currentState.last_run_started_at }, runId);
      await upsertSyncState(supabaseAdmin, {
        key: 'local_places',
        status: 'error',
        last_error: `Stale run auto-closed after ${Math.round(ageMs / 1000)}s without completing`,
        last_run_completed_at: new Date().toISOString(),
      });
      // Do NOT reset cursor — resume from where it was stuck
    }
    // If NOT stale: the run started recently enough; proceed and overwrite state below
  }

  // --- Optional reset ---
  if (body.reset) {
    await appendLog('warn', MILESTONES.STATE_RESET_STARTED, 'Full catalog reset requested', {}, runId);
    await deleteAllCatalogRows(supabaseAdmin);
    cursor = 0;
    await appendLog('warn', MILESTONES.STATE_RESET_DONE, 'Catalog reset complete, cursor = 0', {}, runId);
  }

  // If all tasks are already done and no reset was requested, return immediately
  if (cursor >= totalTasks) {
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
    await appendLog('success', MILESTONES.RUN_COMPLETED,
      'No tasks left — sync already complete (use reset=true to restart)',
      { total_tasks: totalTasks, cursor }, runId);
    return {
      ok: true,
      processedTasks: 0,
      totalTasks,
      nextCursor: totalTasks,
      hasMore: false,
      batchesExecuted: 0,
      partialFailures: 0,
      rowsWrittenThisRun: 0,
      status: latestStatus,
    };
  }

  // --- Mark as running ---
  const runStartedAt = new Date().toISOString();
  await appendLog('info', MILESTONES.STATE_WRITE_ATTEMPT, 'Writing running state', {}, runId);
  const stateWriteErr = await upsertSyncState(supabaseAdmin, {
    key: 'local_places',
    status: 'running',
    rows_written: body.reset ? 0 : Number(currentState?.rows_written ?? 0),
    provider_counts: body.reset ? {} : (currentState?.provider_counts ?? {}),
    task_count: totalTasks,
    cursor,
    last_run_started_at: runStartedAt,
    last_run_completed_at: null,
    last_error: null,
  });
  await appendLog(
    stateWriteErr ? 'warn' : 'info',
    MILESTONES.STATE_WRITE_DONE,
    stateWriteErr ? 'Running state write had an error (non-fatal)' : 'Running state saved',
    stateWriteErr ? { error: stateWriteErr } : {},
    runId,
  );

  await appendLog('info', MILESTONES.RUN_STARTED, 'Batch processing loop started', {
    start_cursor: cursor,
    total_tasks: totalTasks,
    time_budget_ms: TIME_BUDGET_MS,
  }, runId);

  // ----------------------------------------------------------------
  // Main loop — processes as many batches as the time budget allows
  // ----------------------------------------------------------------
  const loopStart = Date.now();
  let totalProcessed = 0;
  let totalRowsWritten = 0;
  const allFailures: string[] = [];
  let totalProviderCalls = 0;
  let batchesExecuted = 0;

  while (cursor < totalTasks) {
    const elapsed = Date.now() - loopStart;
    if (elapsed >= TIME_BUDGET_MS) {
      await appendLog('warn', MILESTONES.TIME_BUDGET_EXCEEDED,
        `Time budget of ${TIME_BUDGET_MS}ms reached — stopping loop, cursor persisted`,
        { elapsed_ms: elapsed, cursor, remaining_tasks: totalTasks - cursor }, runId);
      break;
    }

    const batchTasks = allTasks.slice(cursor, cursor + syncConfig.task_batch_size);
    if (batchTasks.length === 0) break;

    await appendLog('info', MILESTONES.BATCH_STARTED, `Batch ${batchesExecuted + 1} started`, {
      batch_index: batchesExecuted,
      start_cursor: cursor,
      batch_size: batchTasks.length,
      elapsed_ms: elapsed,
    }, runId);

    // --- Run tasks ---
    const batchCollected: PlaceRow[] = [];
    const batchFailures: string[] = [];
    let batchProviderCalls = 0;

    const taskFns = batchTasks.map((task, taskIndex) => async () => {
      const result = await runTask({
        task,
        taskIndex,
        taskCursor: cursor + taskIndex,
        geoapifyKey,
        tomtomKey,
        config: syncConfig,
        appendLog,
        runId,
      });
      batchCollected.push(...result.rows);
      batchFailures.push(...result.failures);
      batchProviderCalls += result.successfulProviderCalls;
    });

    await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

    // --- Dedupe ---
    const dedupedRows = dedupeRows(batchCollected);
    await appendLog('info', MILESTONES.TASK_DEDUPE_DONE, 'Batch deduplication done', {
      batch_index: batchesExecuted,
      pre_dedupe: batchCollected.length,
      post_dedupe: dedupedRows.length,
    }, runId);

    await appendLog('info', MILESTONES.CATALOG_ROWS_BUILT, 'Catalog payload ready', {
      batch_index: batchesExecuted,
      payload_count: dedupedRows.length,
      provider_calls: batchProviderCalls,
      failure_count: batchFailures.length,
    }, runId);

    // --- Write to catalog (non-fatal) ---
    let batchRowsWritten = 0;
    try {
      batchRowsWritten = await writeCatalogRows({ supabaseAdmin, rows: dedupedRows, runId, appendLog });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendLog('error', MILESTONES.CATALOG_WRITE_ERROR,
        'Catalog write failed — batch continues with partial result',
        { batch_index: batchesExecuted, error: msg, attempted: dedupedRows.length }, runId);
      batchFailures.push(`catalog_write[${batchesExecuted}]: ${msg}`);
    }

    // --- Advance cursor ---
    cursor = Math.min(totalTasks, cursor + batchTasks.length);
    batchesExecuted++;
    totalProcessed += batchTasks.length;
    totalRowsWritten += batchRowsWritten;
    allFailures.push(...batchFailures);
    totalProviderCalls += batchProviderCalls;

    const hasMoreAfterBatch = cursor < totalTasks;

    // Persist cursor progress after every batch so stale-run recovery resumes correctly
    const midStatus = await getStatus(supabaseAdmin);
    const intermediateStatus = hasMoreAfterBatch
      ? (batchFailures.length > 0 ? 'partial' : 'running')
      : (allFailures.length > 0 ? 'partial' : 'idle');

    await appendLog('info', MILESTONES.STATE_WRITE_ATTEMPT,
      `Persisting state after batch ${batchesExecuted}`,
      { cursor, status: intermediateStatus }, runId);

    const midErr = await upsertSyncState(supabaseAdmin, {
      key: 'local_places',
      status: intermediateStatus,
      rows_written: midStatus.totalRows,
      provider_counts: midStatus.providerCounts,
      task_count: totalTasks,
      cursor,
      last_run_started_at: runStartedAt,
      last_run_completed_at: hasMoreAfterBatch ? null : new Date().toISOString(),
      last_error: allFailures.length > 0 ? allFailures.slice(-3).join(' | ') : null,
    });

    await appendLog(
      midErr ? 'warn' : 'info',
      MILESTONES.BATCH_FINISHED,
      `Batch ${batchesExecuted} finished` + (batchFailures.length > 0 ? ' (with failures)' : ''),
      {
        batch_index: batchesExecuted - 1,
        tasks: batchTasks.length,
        rows_written: batchRowsWritten,
        cursor,
        has_more: hasMoreAfterBatch,
        provider_calls: batchProviderCalls,
        failures: batchFailures.slice(0, 3),
        total_catalog_rows: midStatus.totalRows,
      }, runId);
  }

  const hasMore = cursor < totalTasks;

  if (!hasMore) {
    const finalStatus = await getStatus(supabaseAdmin);
    await appendLog('success', MILESTONES.RUN_COMPLETED,
      `All ${totalTasks} tasks processed — sync complete`,
      {
        batches_executed: batchesExecuted,
        rows_written_this_run: totalRowsWritten,
        total_catalog_rows: finalStatus.totalRows,
        provider_counts: finalStatus.providerCounts,
      }, runId);
  }

  const liveStatus = await getStatus(supabaseAdmin);
  return {
    ok: true,
    processedTasks: totalProcessed,
    totalTasks,
    nextCursor: cursor,
    hasMore,
    batchesExecuted,
    partialFailures: allFailures.length,
    rowsWrittenThisRun: totalRowsWritten,
    status: liveStatus,
  };
}
