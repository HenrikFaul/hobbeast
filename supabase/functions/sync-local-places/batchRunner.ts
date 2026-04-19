// deno-lint-ignore-file no-explicit-any
import { LOCAL_PLACES_STATE_KEY } from './constants.ts';
import { loadSyncConfig } from './config.ts';
import { MILESTONES, milestone } from './milestones.ts';
import { fetchGeoapifyRows } from './providers/geoapify.ts';
import { fetchTomTomRows } from './providers/tomtom.ts';
import { getStatus, resetCatalog, upsertSyncState, writeCatalogRows } from './repositories.ts';
import { buildTasks } from './taskBuilder.ts';
import type { BatchResult, LocalCatalogRow, SyncBody, SyncTask } from './types.ts';

/** Auto-reset a run that has been stuck in 'running' for longer than this. */
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Max wall-clock time per HTTP call. Caller can invoke again to continue. */
const TIME_BUDGET_MS = 50_000; // 50 seconds

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dedupe(rows: LocalCatalogRow[]) {
  const map = new Map<string, LocalCatalogRow>();
  for (const row of rows) map.set(`${row.provider}:${row.external_id}`, row);
  return Array.from(map.values());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getProviderKeys() {
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');
  if (!geoapifyKey || !tomtomKey) {
    throw new Error('Missing GEOAPIFY_API_KEY or TOMTOM_API_KEY in Edge Function environment.');
  }
  return { geoapifyKey, tomtomKey };
}

async function getCurrentStateRecord(supabaseAdmin: any) {
  const result = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', LOCAL_PLACES_STATE_KEY)
    .maybeSingle();
  return result.data || {};
}

function filterHuRows(rows: LocalCatalogRow[]) {
  return rows.filter((row) => Boolean(row?.external_id) && String(row?.country_code || '').toUpperCase() === 'HU');
}

async function resolveTaskContext(supabaseAdmin: any, body: Partial<SyncBody> = {}) {
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  const requestedTaskIndex = Number.isFinite(Number(body.task_index)) ? Number(body.task_index) : Number(currentState?.cursor || 0);
  const task = body.task || allTasks[requestedTaskIndex] || null;
  return { allTasks, totalTasks, currentState, taskIndex: requestedTaskIndex, task };
}

async function fetchRowsForTask(
  supabaseAdmin: any,
  task: SyncTask,
  syncConfig: Awaited<ReturnType<typeof loadSyncConfig>>,
  runId: string,
  taskIndex: number,
) {
  const { geoapifyKey, tomtomKey } = getProviderKeys();
  const collected: LocalCatalogRow[] = [];
  const failures: string[] = [];
  const { center, group } = task;

  await milestone(supabaseAdmin, 'info', MILESTONES.TASK_STARTED, 'Task feldolgozás indult', { task_index: taskIndex, center, group }, runId);

  await milestone(supabaseAdmin, 'info', MILESTONES.GEOAPIFY_FETCH_STARTED, 'Geoapify hívás indul', { center, group }, runId);
  const geoResult = await fetchGeoapifyRows(center, group, geoapifyKey, syncConfig, { applyHuFilter: true })
    .then((rows) => ({ ok: true as const, rows }))
    .catch((error) => ({ ok: false as const, error }));

  if (geoResult.ok) {
    collected.push(...geoResult.rows);
    await milestone(supabaseAdmin, 'success', MILESTONES.GEOAPIFY_FETCH_COMPLETED, 'Geoapify hívás kész', {
      center, group, row_count: geoResult.rows.length,
    }, runId);
  } else {
    const message = getErrorMessage(geoResult.error);
    failures.push(message);
    await milestone(supabaseAdmin, 'error', MILESTONES.GEOAPIFY_FETCH_COMPLETED, 'Geoapify hívás hibával végződött', {
      center, group, error: message,
    }, runId);
  }

  await milestone(supabaseAdmin, 'info', MILESTONES.TOMTOM_FETCH_STARTED, 'TomTom hívás indul', { center, group }, runId);
  const tomtomResult = await fetchTomTomRows(center, group, tomtomKey, syncConfig, { applyHuFilter: true })
    .then((rows) => ({ ok: true as const, rows }))
    .catch((error) => ({ ok: false as const, error }));

  if (tomtomResult.ok) {
    collected.push(...tomtomResult.rows);
    await milestone(supabaseAdmin, 'success', MILESTONES.TOMTOM_FETCH_COMPLETED, 'TomTom hívás kész', {
      center, group, row_count: tomtomResult.rows.length,
    }, runId);
  } else {
    const message = getErrorMessage(tomtomResult.error);
    failures.push(message);
    await milestone(supabaseAdmin, 'error', MILESTONES.TOMTOM_FETCH_COMPLETED, 'TomTom hívás hibával végződött', {
      center, group, error: message,
    }, runId);
  }

  return { rows: collected, failures };
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      const current = index++;
      await tasks[current]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

// ---------------------------------------------------------------------------
// Phase-based handlers (for step-by-step UI orchestration)
// ---------------------------------------------------------------------------

export async function resetCatalogOnly(supabaseAdmin: any, runId: string) {
  const totalTasks = buildTasks().length;
  await milestone(supabaseAdmin, 'warn', MILESTONES.CATALOG_RESET_STARTED, 'Lokális katalógus ürítése indul', { manual_mode: true }, runId);
  await resetCatalog(supabaseAdmin);
  await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_RESET_COMPLETED, 'Lokális katalógus ürítése kész', { manual_mode: true }, runId);
  const stateWriteError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: 'idle', rows_written: 0, provider_counts: {},
    task_count: totalTasks, cursor: 0, last_run_started_at: null,
    last_run_completed_at: new Date().toISOString(), last_error: null,
  });
  return { ok: true, totalTasks, status: await getStatus(supabaseAdmin), _stateWriteError: stateWriteError };
}

export async function startManualRun(supabaseAdmin: any, body: SyncBody, runId: string) {
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  const startedAt = new Date().toISOString();
  const rawCursor = Number(currentState?.cursor || 0);
  const autoReset = body.reset || rawCursor >= totalTasks;
  const startCursor = autoReset ? 0 : rawCursor;

  await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED, 'Manuális fázis-alapú futás indult', {
    manual_mode: true, requested_reset: body.reset === true, auto_reset: autoReset, start_cursor: startCursor, total_tasks: totalTasks,
  }, runId);

  const stateWriteError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: 'running',
    rows_written: autoReset ? 0 : Number(currentState?.rows_written || 0),
    provider_counts: autoReset ? {} : (currentState?.provider_counts || {}),
    task_count: totalTasks, cursor: startCursor, last_run_started_at: startedAt,
    last_run_completed_at: body.reset ? null : (currentState?.last_run_completed_at || null), last_error: null,
  });

  return {
    ok: true, processedTasks: 0, totalTasks, nextCursor: startCursor,
    hasMore: startCursor < totalTasks, status: await getStatus(supabaseAdmin), _stateWriteError: stateWriteError,
  };
}

export async function fetchNextTaskRows(supabaseAdmin: any, runId: string) {
  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  const cursor = Number(currentState?.cursor || 0);
  const task = allTasks[cursor];

  if (!task) {
    await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY, status: 'idle', task_count: totalTasks,
      cursor: totalTasks, last_run_completed_at: new Date().toISOString(), last_error: null,
    });
    return { ok: true, task: null, rows: [], partialFailures: [], nextCursor: totalTasks, hasMore: false, status: await getStatus(supabaseAdmin) };
  }

  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: 'running',
    rows_written: Number(currentState?.rows_written || 0),
    provider_counts: currentState?.provider_counts || {},
    task_count: totalTasks, cursor,
    last_run_started_at: currentState?.last_run_started_at || new Date().toISOString(), last_error: null,
  });

  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_STARTED, 'Következő task előkészítve', {
    manual_mode: true, start_cursor: cursor, batch_size: 1, total_tasks: totalTasks, task, config: syncConfig,
  }, runId);

  const { rows, failures } = await fetchRowsForTask(supabaseAdmin, task, syncConfig, runId, cursor);

  return {
    ok: true,
    task: { taskIndex: cursor, totalTasks, center: task.center, group: task.group },
    rows, partialFailures: failures, nextCursor: cursor, hasMore: cursor + 1 < totalTasks,
    status: await getStatus(supabaseAdmin),
  };
}

export async function prepareNextTaskPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  const { totalTasks, currentState, taskIndex, task } = await resolveTaskContext(supabaseAdmin, body);

  if (!task) {
    await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY, status: 'idle', task_count: totalTasks,
      cursor: totalTasks, last_run_completed_at: new Date().toISOString(), last_error: null,
    });
    return { ok: true, task: null, taskIndex: totalTasks, totalTasks, hasMore: false, status: await getStatus(supabaseAdmin) };
  }

  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: 'running',
    rows_written: Number(currentState?.rows_written || 0),
    provider_counts: currentState?.provider_counts || {},
    task_count: totalTasks, cursor: taskIndex,
    last_run_started_at: currentState?.last_run_started_at || new Date().toISOString(), last_error: null,
  });

  return {
    ok: true,
    task: { taskIndex, totalTasks, center: task.center, group: task.group },
    hasMore: taskIndex < totalTasks, status: await getStatus(supabaseAdmin),
  };
}

async function fetchProviderRowsPhase(supabaseAdmin: any, body: Partial<SyncBody>, provider: 'geoapify' | 'tomtom', runId: string) {
  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const { taskIndex, totalTasks, task } = await resolveTaskContext(supabaseAdmin, body);

  if (!task) {
    return { ok: true, task: null, rows: [], partialFailures: [], hasMore: false, status: await getStatus(supabaseAdmin) };
  }

  const { geoapifyKey, tomtomKey } = getProviderKeys();
  const { center, group } = task;
  const eventPrefix = provider === 'geoapify' ? 'GEOAPIFY' : 'TOMTOM';

  await milestone(supabaseAdmin, 'info', MILESTONES[`${eventPrefix}_FETCH_STARTED` as keyof typeof MILESTONES],
    `${provider} hívás indul (külön fázis)`,
    { manual_mode: true, task_index: taskIndex, center, group }, runId);

  try {
    const rows = provider === 'geoapify'
      ? await fetchGeoapifyRows(center, group, geoapifyKey, syncConfig, { applyHuFilter: false })
      : await fetchTomTomRows(center, group, tomtomKey, syncConfig, { applyHuFilter: false });

    const huRows = filterHuRows(rows);
    await milestone(supabaseAdmin, 'success', MILESTONES[`${eventPrefix}_FETCH_COMPLETED` as keyof typeof MILESTONES],
      `${provider} hívás kész (külön fázis)`,
      { manual_mode: true, task_index: taskIndex, raw_row_count: rows.length, hu_row_count: huRows.length }, runId);

    return {
      ok: true,
      task: { taskIndex, totalTasks, center, group },
      rows, rowCount: rows.length, huEligibleRowCount: huRows.length,
      partialFailures: [], hasMore: taskIndex + 1 < totalTasks, status: await getStatus(supabaseAdmin),
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await milestone(supabaseAdmin, 'error', MILESTONES[`${eventPrefix}_FETCH_COMPLETED` as keyof typeof MILESTONES],
      `${provider} hívás hibával végződött (külön fázis)`,
      { manual_mode: true, task_index: taskIndex, error: message }, runId);
    return {
      ok: false,
      task: { taskIndex, totalTasks, center, group },
      rows: [], partialFailures: [message], hasMore: taskIndex + 1 < totalTasks, status: await getStatus(supabaseAdmin),
    };
  }
}

export async function fetchGeoapifyRowsPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  return fetchProviderRowsPhase(supabaseAdmin, body, 'geoapify', runId);
}

export async function fetchTomTomRowsPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  return fetchProviderRowsPhase(supabaseAdmin, body, 'tomtom', runId);
}

export async function filterHuRowsPhase(supabaseAdmin: any, rows: LocalCatalogRow[], runId: string) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const filteredRows = filterHuRows(safeRows);
  await milestone(supabaseAdmin, 'info', MILESTONES.PROVIDER_AFTER_HU_FILTER, 'Manuális HU-szűrés kész', {
    manual_mode: true, before_hu_filter: safeRows.length, after_hu_filter: filteredRows.length,
  }, runId);
  return { ok: true, beforeCount: safeRows.length, afterCount: filteredRows.length, rows: filteredRows, status: await getStatus(supabaseAdmin) };
}

export async function dedupeRowsPhase(supabaseAdmin: any, rows: LocalCatalogRow[], runId: string) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const dedupedRows = dedupe(safeRows);
  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_AFTER_DEDUPE, 'Manuális deduplikálás kész', {
    manual_mode: true, before_dedupe: safeRows.length, after_dedupe: dedupedRows.length,
  }, runId);
  return { ok: true, beforeCount: safeRows.length, afterCount: dedupedRows.length, rows: dedupedRows, status: await getStatus(supabaseAdmin) };
}

export async function writeRowsPhase(
  supabaseAdmin: any,
  rows: LocalCatalogRow[],
  advanceCursorBy: number,
  partialFailures: string[],
  runId: string,
): Promise<BatchResult> {
  const safeRows = dedupe(Array.isArray(rows) ? rows : []);
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  const totalTasks = buildTasks().length;
  const startCursor = Number(currentState?.cursor || 0);
  const safeAdvanceCursorBy = Math.max(0, Number(advanceCursorBy || 0));

  await milestone(supabaseAdmin, 'info', MILESTONES.CATALOG_WRITE_ATTEMPT, 'Manuális katalógus írás indul', {
    manual_mode: true, row_count: safeRows.length, start_cursor: startCursor, advance_cursor_by: safeAdvanceCursorBy,
  }, runId);

  let rowsWrittenThisRun = 0;
  try {
    rowsWrittenThisRun = await writeCatalogRows(supabaseAdmin, safeRows);
    await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_WRITE_COMPLETED, 'Manuális katalógus írás kész', {
      manual_mode: true, row_count: rowsWrittenThisRun,
    }, runId);
  } catch (error) {
    const msg = getErrorMessage(error);
    await milestone(supabaseAdmin, 'error', MILESTONES.CATALOG_WRITE_FAILED, 'Manuális katalógus írás sikertelen', {
      manual_mode: true, error: msg,
    }, runId);
    throw error;
  }

  const nextCursor = Math.min(totalTasks, startCursor + safeAdvanceCursorBy);
  const liveStatus = await getStatus(supabaseAdmin);
  const failureMessages = Array.isArray(partialFailures) ? partialFailures.filter(Boolean) : [];
  const hasMore = nextCursor < totalTasks;
  const finalStatus = hasMore ? (failureMessages.length > 0 ? 'partial' : 'running') : (failureMessages.length > 0 ? 'partial' : 'idle');
  const completedAt = new Date().toISOString();

  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: finalStatus,
    rows_written: liveStatus.totalRows, provider_counts: liveStatus.providerCounts,
    task_count: totalTasks, cursor: nextCursor,
    last_run_started_at: currentState?.last_run_started_at || completedAt,
    last_run_completed_at: completedAt,
    last_error: failureMessages.length > 0 ? failureMessages.slice(0, 5).join(' | ') : null,
  });

  await milestone(supabaseAdmin, failureMessages.length > 0 ? 'warn' : 'success', MILESTONES.BATCH_COMPLETED,
    failureMessages.length > 0 ? 'Manuális batch részlegesen kész' : 'Manuális batch kész',
    { manual_mode: true, processed_tasks: safeAdvanceCursorBy, next_cursor: nextCursor, has_more: hasMore, rows_written_this_run: rowsWrittenThisRun },
    runId);

  if (!hasMore) {
    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED, 'Teljes manuális futás befejeződött', {
      manual_mode: true, total_tasks: totalTasks, total_rows: liveStatus.totalRows,
    }, runId);
  }

  return {
    ok: true, processedTasks: safeAdvanceCursorBy, totalTasks, nextCursor, hasMore,
    partialFailures: failureMessages.length, rowsWrittenThisRun,
    _stateWriteError: null, _logWriteError: null, status: await getStatus(supabaseAdmin),
  };
}

// ---------------------------------------------------------------------------
// executeSyncBatch — internal 50 s loop, stale-run auto-reset
// ---------------------------------------------------------------------------

export async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
): Promise<BatchResult> {
  getProviderKeys(); // early validation — throws if keys missing

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const startedAt = new Date().toISOString();
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  let cursor = Number(currentState?.cursor || 0);

  // --- Stale run auto-reset ---
  if (currentState?.status === 'running' && currentState?.last_run_started_at) {
    const ageMs = Date.now() - new Date(String(currentState.last_run_started_at)).getTime();
    if (ageMs > STALE_RUN_THRESHOLD_MS) {
      await milestone(supabaseAdmin, 'warn', MILESTONES.STALE_RUN_DETECTED,
        `Lefagyott futás észlelve (${Math.round(ageMs / 1000)}s régi) — automatikus visszaállítás`,
        { stale_age_ms: ageMs, cursor_at_reset: cursor }, runId);
      await upsertSyncState(supabaseAdmin, {
        key: LOCAL_PLACES_STATE_KEY, status: 'error',
        last_error: `Lefagyott futás automatikusan lezárva ${Math.round(ageMs / 1000)}s után`,
        last_run_completed_at: new Date().toISOString(),
      });
      // Do NOT reset cursor — resume from where it was stuck
    }
  }

  // --- Optional full reset ---
  if (body.reset) {
    await milestone(supabaseAdmin, 'warn', MILESTONES.CATALOG_RESET_STARTED, 'Teljes újratöltés — katalógus ürítése indul', {}, runId);
    await resetCatalog(supabaseAdmin);
    await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_RESET_COMPLETED, 'Katalógus ürítve, kurzor nullázva', {}, runId);
    cursor = 0;
  }

  await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED, 'Batch futás indult', {
    start_cursor: cursor, total_tasks: totalTasks, time_budget_ms: TIME_BUDGET_MS,
  }, runId);

  // --- Already complete? ---
  if (cursor >= totalTasks) {
    await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY, status: 'idle', task_count: totalTasks,
      cursor: totalTasks, last_run_completed_at: new Date().toISOString(), last_error: null,
    });
    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED,
      'Nincs több feldolgozandó task — sync kész (reset=true a restart-hoz)', { total_tasks: totalTasks, cursor }, runId);
    return {
      ok: true, processedTasks: 0, totalTasks, nextCursor: totalTasks, hasMore: false,
      batchesExecuted: 0, partialFailures: 0, rowsWrittenThisRun: 0, status: await getStatus(supabaseAdmin),
    };
  }

  // --- Mark running ---
  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY, status: 'running',
    rows_written: body.reset ? 0 : Number(currentState?.rows_written || 0),
    provider_counts: body.reset ? {} : (currentState?.provider_counts || {}),
    task_count: totalTasks, cursor, last_run_started_at: startedAt,
    last_run_completed_at: null, last_error: null,
  });

  // --- Internal loop — process batches until time budget runs out ---
  const loopStart = Date.now();
  let totalProcessed = 0;
  let totalRowsWritten = 0;
  const allFailures: string[] = [];
  let batchesExecuted = 0;

  while (cursor < totalTasks) {
    const elapsed = Date.now() - loopStart;
    if (elapsed >= TIME_BUDGET_MS) {
      await milestone(supabaseAdmin, 'warn', MILESTONES.TIME_BUDGET_EXCEEDED,
        `Időkeret (${TIME_BUDGET_MS}ms) kimerült — megállás, kurzor mentve`,
        { elapsed_ms: elapsed, cursor, remaining_tasks: totalTasks - cursor }, runId);
      break;
    }

    const batchTasks = allTasks.slice(cursor, cursor + syncConfig.task_batch_size);
    if (batchTasks.length === 0) break;

    await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_STARTED, `Batch ${batchesExecuted + 1} elindult`, {
      batch_index: batchesExecuted, start_cursor: cursor, batch_size: batchTasks.length, elapsed_ms: elapsed,
    }, runId);

    const collected: LocalCatalogRow[] = [];
    const batchFailures: string[] = [];

    const taskFns = batchTasks.map((task, taskIndex) => async () => {
      const result = await fetchRowsForTask(supabaseAdmin, task, syncConfig, runId, cursor + taskIndex);
      collected.push(...result.rows);
      batchFailures.push(...result.failures);
    });

    await runWithConcurrency(taskFns, syncConfig.provider_concurrency);

    const dedupedRows = dedupe(collected);
    await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_AFTER_DEDUPE, 'Deduplikálás kész', {
      batch_index: batchesExecuted, before: collected.length, after: dedupedRows.length,
    }, runId);

    let batchRowsWritten = 0;
    try {
      await milestone(supabaseAdmin, 'info', MILESTONES.CATALOG_WRITE_ATTEMPT, 'Katalógus írás indul', {
        batch_index: batchesExecuted, row_count: dedupedRows.length,
      }, runId);
      batchRowsWritten = await writeCatalogRows(supabaseAdmin, dedupedRows);
      await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_WRITE_COMPLETED, 'Katalógus írás kész', {
        batch_index: batchesExecuted, rows_written: batchRowsWritten,
      }, runId);
    } catch (err) {
      const msg = getErrorMessage(err);
      await milestone(supabaseAdmin, 'error', MILESTONES.CATALOG_WRITE_FAILED, 'Katalógus írás sikertelen (batch folytatódik)', {
        batch_index: batchesExecuted, error: msg,
      }, runId);
      batchFailures.push(`catalog_write[${batchesExecuted}]: ${msg}`);
    }

    cursor = Math.min(totalTasks, cursor + batchTasks.length);
    batchesExecuted++;
    totalProcessed += batchTasks.length;
    totalRowsWritten += batchRowsWritten;
    allFailures.push(...batchFailures);

    const hasMoreAfterBatch = cursor < totalTasks;
    const midStatus = hasMoreAfterBatch
      ? (batchFailures.length > 0 ? 'partial' : 'running')
      : (allFailures.length > 0 ? 'partial' : 'idle');
    const liveStatus = await getStatus(supabaseAdmin);

    await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY, status: midStatus,
      rows_written: liveStatus.totalRows, provider_counts: liveStatus.providerCounts,
      task_count: totalTasks, cursor, last_run_started_at: startedAt,
      last_run_completed_at: hasMoreAfterBatch ? null : new Date().toISOString(),
      last_error: allFailures.length > 0 ? allFailures.slice(-3).join(' | ') : null,
    });

    await milestone(supabaseAdmin, batchFailures.length > 0 ? 'warn' : 'success', MILESTONES.BATCH_COMPLETED,
      `Batch ${batchesExecuted} kész` + (batchFailures.length > 0 ? ' (részleges hibák)' : ''),
      {
        batch_index: batchesExecuted - 1, tasks: batchTasks.length, rows_written: batchRowsWritten,
        cursor, has_more: hasMoreAfterBatch, total_catalog_rows: liveStatus.totalRows,
        failures: batchFailures.slice(0, 3),
      }, runId);
  }

  const hasMore = cursor < totalTasks;
  const liveStatus = await getStatus(supabaseAdmin);

  if (!hasMore) {
    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED,
      `Összes ${totalTasks} task feldolgozva — sync kész`,
      { batches_executed: batchesExecuted, rows_written_this_run: totalRowsWritten, total_catalog_rows: liveStatus.totalRows },
      runId);
  }

  return {
    ok: true, processedTasks: totalProcessed, totalTasks, nextCursor: cursor, hasMore,
    batchesExecuted, partialFailures: allFailures.length, rowsWrittenThisRun: totalRowsWritten,
    status: liveStatus,
  };
}
