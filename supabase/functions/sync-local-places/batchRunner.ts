// deno-lint-ignore-file no-explicit-any
import { LOCAL_PLACES_STATE_KEY } from './constants.ts';
import { loadSyncConfig } from './config.ts';
import { MILESTONES, milestone } from './milestones.ts';
import { fetchGeoapifyRows } from './providers/geoapify.ts';
import { fetchTomTomRows } from './providers/tomtom.ts';
import { getStatus, resetCatalog, upsertSyncState, writeCatalogRows } from './repositories.ts';
import { buildTasks } from './taskBuilder.ts';
import type { BatchResult, LocalCatalogRow, SyncBody, SyncTask } from './types.ts';

function dedupe(rows: LocalCatalogRow[]) {
  const map = new Map<string, LocalCatalogRow>();
  for (const row of rows) {
    map.set(`${row.provider}:${row.external_id}`, row);
  }
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
  const currentStateResult = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', LOCAL_PLACES_STATE_KEY)
    .maybeSingle();

  return currentStateResult.data || {};
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

  return {
    allTasks,
    totalTasks,
    currentState,
    taskIndex: requestedTaskIndex,
    task,
  };
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

  await milestone(supabaseAdmin, 'info', MILESTONES.TASK_STARTED, 'Task feldolgozás indult', {
    task_index: taskIndex,
    center,
    group,
  }, runId);

  await milestone(supabaseAdmin, 'info', MILESTONES.GEOAPIFY_FETCH_STARTED, 'Geoapify hívás indul', { center, group }, runId);
  const geoResult = await fetchGeoapifyRows(center, group, geoapifyKey, syncConfig, { applyHuFilter: true })
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
    const message = getErrorMessage(geoResult.error);
    failures.push(message);
    await milestone(supabaseAdmin, 'error', MILESTONES.GEOAPIFY_FETCH_COMPLETED, 'Geoapify hívás hibával végződött', {
      center,
      group,
      error: message,
    }, runId);
  }

  await milestone(supabaseAdmin, 'info', MILESTONES.TOMTOM_FETCH_STARTED, 'TomTom hívás indul', { center, group }, runId);
  const tomtomResult = await fetchTomTomRows(center, group, tomtomKey, syncConfig, { applyHuFilter: true })
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
    const message = getErrorMessage(tomtomResult.error);
    failures.push(message);
    await milestone(supabaseAdmin, 'error', MILESTONES.TOMTOM_FETCH_COMPLETED, 'TomTom hívás hibával végződött', {
      center,
      group,
      error: message,
    }, runId);
  }

  return {
    rows: collected,
    failures,
  };
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

export async function resetCatalogOnly(supabaseAdmin: any, runId: string) {
  const totalTasks = buildTasks().length;
  const completedAt = new Date().toISOString();

  await milestone(supabaseAdmin, 'warn', MILESTONES.CATALOG_RESET_STARTED, 'Lokális katalógus ürítése indul', {
    manual_mode: true,
  }, runId);
  await resetCatalog(supabaseAdmin);
  await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_RESET_COMPLETED, 'Lokális katalógus ürítése kész', {
    manual_mode: true,
  }, runId);

  const stateWriteError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: 'idle',
    rows_written: 0,
    provider_counts: {},
    task_count: totalTasks,
    cursor: 0,
    last_run_started_at: null,
    last_run_completed_at: completedAt,
    last_error: null,
  });

  return {
    ok: true,
    totalTasks,
    status: await getStatus(supabaseAdmin),
    _stateWriteError: stateWriteError,
  };
}

export async function startManualRun(supabaseAdmin: any, body: SyncBody, runId: string) {
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const currentState = await getCurrentStateRecord(supabaseAdmin);
  const startedAt = new Date().toISOString();
  const startCursor = body.reset ? 0 : Number(currentState?.cursor || 0);

  await milestone(supabaseAdmin, 'info', MILESTONES.RUN_STARTED, 'Manuális fázis-alapú futás indult', {
    manual_mode: true,
    requested_reset: body.reset === true,
    start_cursor: startCursor,
    total_tasks: totalTasks,
    started_at: startedAt,
  }, runId);

  const stateWriteError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: 'running',
    rows_written: body.reset ? 0 : Number(currentState?.rows_written || 0),
    provider_counts: body.reset ? {} : (currentState?.provider_counts || {}),
    task_count: totalTasks,
    cursor: startCursor,
    last_run_started_at: startedAt,
    last_run_completed_at: body.reset ? null : (currentState?.last_run_completed_at || null),
    last_error: null,
  });

  return {
    ok: true,
    processedTasks: 0,
    totalTasks,
    nextCursor: startCursor,
    hasMore: startCursor < totalTasks,
    status: await getStatus(supabaseAdmin),
    _stateWriteError: stateWriteError,
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
      key: LOCAL_PLACES_STATE_KEY,
      status: 'idle',
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });

    return {
      ok: true,
      task: null,
      rows: [],
      partialFailures: [],
      nextCursor: totalTasks,
      hasMore: false,
      status: await getStatus(supabaseAdmin),
    };
  }

  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: 'running',
    rows_written: Number(currentState?.rows_written || 0),
    provider_counts: currentState?.provider_counts || {},
    task_count: totalTasks,
    cursor,
    last_run_started_at: currentState?.last_run_started_at || new Date().toISOString(),
    last_error: null,
  });

  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_STARTED, 'Manuális következő task előkészítve', {
    manual_mode: true,
    start_cursor: cursor,
    batch_size: 1,
    total_tasks: totalTasks,
    task,
    config: syncConfig,
  }, runId);

  const { rows, failures } = await fetchRowsForTask(supabaseAdmin, task, syncConfig, runId, cursor);

  return {
    ok: true,
    task: {
      taskIndex: cursor,
      totalTasks,
      center: task.center,
      group: task.group,
    },
    rows,
    partialFailures: failures,
    nextCursor: cursor,
    hasMore: cursor + 1 < totalTasks,
    status: await getStatus(supabaseAdmin),
  };
}

export async function prepareNextTaskPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  const { totalTasks, currentState, taskIndex, task } = await resolveTaskContext(supabaseAdmin, body);

  if (!task) {
    await upsertSyncState(supabaseAdmin, {
      key: LOCAL_PLACES_STATE_KEY,
      status: 'idle',
      task_count: totalTasks,
      cursor: totalTasks,
      last_run_completed_at: new Date().toISOString(),
      last_error: null,
    });

    return {
      ok: true,
      task: null,
      taskIndex: totalTasks,
      totalTasks,
      hasMore: false,
      status: await getStatus(supabaseAdmin),
    };
  }

  await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: 'running',
    rows_written: Number(currentState?.rows_written || 0),
    provider_counts: currentState?.provider_counts || {},
    task_count: totalTasks,
    cursor: taskIndex,
    last_run_started_at: currentState?.last_run_started_at || new Date().toISOString(),
    last_error: null,
  });

  await milestone(supabaseAdmin, 'info', 'manual_task_prepared', 'Következő manuális task előkészítve', {
    manual_mode: true,
    task_index: taskIndex,
    total_tasks: totalTasks,
    task,
  }, runId);

  return {
    ok: true,
    task: {
      taskIndex,
      totalTasks,
      center: task.center,
      group: task.group,
    },
    hasMore: taskIndex < totalTasks,
    status: await getStatus(supabaseAdmin),
  };
}

async function fetchProviderRowsPhase(
  supabaseAdmin: any,
  body: Partial<SyncBody>,
  provider: 'geoapify' | 'tomtom',
  runId: string,
) {
  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const { taskIndex, totalTasks, task } = await resolveTaskContext(supabaseAdmin, body);

  if (!task) {
    return {
      ok: true,
      task: null,
      rows: [],
      partialFailures: [],
      hasMore: false,
      status: await getStatus(supabaseAdmin),
    };
  }

  const { geoapifyKey, tomtomKey } = getProviderKeys();
  const { center, group } = task;
  const eventPrefix = provider === 'geoapify' ? 'GEOAPIFY' : 'TOMTOM';

  await milestone(
    supabaseAdmin,
    'info',
    MILESTONES[`${eventPrefix}_FETCH_STARTED` as keyof typeof MILESTONES],
    `${provider === 'geoapify' ? 'Geoapify' : 'TomTom'} hívás indul (külön fázis)`,
    { manual_mode: true, task_index: taskIndex, center, group, hu_filter_separate_phase: true },
    runId,
  );

  try {
    const rows = provider === 'geoapify'
      ? await fetchGeoapifyRows(center, group, geoapifyKey, syncConfig, { applyHuFilter: false })
      : await fetchTomTomRows(center, group, tomtomKey, syncConfig, { applyHuFilter: false });

    const huEligibleRows = filterHuRows(rows);

    await milestone(
      supabaseAdmin,
      'success',
      MILESTONES[`${eventPrefix}_FETCH_COMPLETED` as keyof typeof MILESTONES],
      `${provider === 'geoapify' ? 'Geoapify' : 'TomTom'} hívás kész (külön fázis)`,
      {
        manual_mode: true,
        task_index: taskIndex,
        center,
        group,
        raw_row_count: rows.length,
        hu_row_count: huEligibleRows.length,
        total_tasks: totalTasks,
      },
      runId,
    );

    return {
      ok: true,
      task: {
        taskIndex,
        totalTasks,
        center,
        group,
      },
      rows,
      rowCount: rows.length,
      huEligibleRowCount: huEligibleRows.length,
      partialFailures: [],
      hasMore: taskIndex + 1 < totalTasks,
      status: await getStatus(supabaseAdmin),
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await milestone(
      supabaseAdmin,
      'error',
      MILESTONES[`${eventPrefix}_FETCH_COMPLETED` as keyof typeof MILESTONES],
      `${provider === 'geoapify' ? 'Geoapify' : 'TomTom'} hívás hibával végződött (külön fázis)`,
      { manual_mode: true, task_index: taskIndex, center, group, error: message },
      runId,
    );

    return {
      ok: false,
      task: {
        taskIndex,
        totalTasks,
        center,
        group,
      },
      rows: [],
      partialFailures: [message],
      hasMore: taskIndex + 1 < totalTasks,
      status: await getStatus(supabaseAdmin),
    };
  }
}

export async function fetchGeoapifyRowsPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  return await fetchProviderRowsPhase(supabaseAdmin, body, 'geoapify', runId);
}

export async function fetchTomTomRowsPhase(supabaseAdmin: any, body: Partial<SyncBody>, runId: string) {
  return await fetchProviderRowsPhase(supabaseAdmin, body, 'tomtom', runId);
}

export async function filterHuRowsPhase(supabaseAdmin: any, rows: LocalCatalogRow[], runId: string) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const filteredRows = filterHuRows(safeRows);

  await milestone(supabaseAdmin, 'info', MILESTONES.PROVIDER_AFTER_HU_FILTER, 'Manuális HU-szűrés kész', {
    manual_mode: true,
    before_hu_filter: safeRows.length,
    after_hu_filter: filteredRows.length,
  }, runId);

  return {
    ok: true,
    beforeCount: safeRows.length,
    afterCount: filteredRows.length,
    rows: filteredRows,
    status: await getStatus(supabaseAdmin),
  };
}

export async function dedupeRowsPhase(supabaseAdmin: any, rows: LocalCatalogRow[], runId: string) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const dedupedRows = dedupe(safeRows);

  await milestone(supabaseAdmin, 'info', MILESTONES.BATCH_AFTER_DEDUPE, 'Manuális deduplikálás kész', {
    manual_mode: true,
    before_dedupe: safeRows.length,
    after_dedupe: dedupedRows.length,
  }, runId);

  return {
    ok: true,
    beforeCount: safeRows.length,
    afterCount: dedupedRows.length,
    rows: dedupedRows,
    status: await getStatus(supabaseAdmin),
  };
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
    manual_mode: true,
    row_count: safeRows.length,
    start_cursor: startCursor,
    advance_cursor_by: safeAdvanceCursorBy,
  }, runId);

  let rowsWrittenThisRun = 0;
  let catalogWriteError: string | null = null;

  try {
    rowsWrittenThisRun = await writeCatalogRows(supabaseAdmin, safeRows);
    await milestone(supabaseAdmin, 'success', MILESTONES.CATALOG_WRITE_COMPLETED, 'Manuális katalógus írás kész', {
      manual_mode: true,
      row_count: rowsWrittenThisRun,
    }, runId);
  } catch (error) {
    catalogWriteError = getErrorMessage(error);
    await milestone(supabaseAdmin, 'error', MILESTONES.CATALOG_WRITE_FAILED, 'Manuális katalógus írás sikertelen', {
      manual_mode: true,
      error: catalogWriteError,
    }, runId);
    throw error;
  }

  const nextCursor = Math.min(totalTasks, startCursor + safeAdvanceCursorBy);
  const liveStatus = await getStatus(supabaseAdmin);
  const failureMessages = Array.isArray(partialFailures) ? partialFailures.filter(Boolean) : [];
  const hasMore = nextCursor < totalTasks;
  const finalStatus = hasMore ? (failureMessages.length > 0 ? 'partial' : 'running') : (failureMessages.length > 0 ? 'partial' : 'idle');
  const completedAt = new Date().toISOString();

  const stateEndError = await upsertSyncState(supabaseAdmin, {
    key: LOCAL_PLACES_STATE_KEY,
    status: finalStatus,
    rows_written: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    task_count: totalTasks,
    cursor: nextCursor,
    last_run_started_at: currentState?.last_run_started_at || completedAt,
    last_run_completed_at: completedAt,
    last_error: failureMessages.length > 0 ? failureMessages.slice(0, 5).join(' | ') : null,
  });

  await milestone(supabaseAdmin, 'success', MILESTONES.STATE_WRITE_COMPLETED, 'Manuális state frissítés kész', {
    manual_mode: true,
    next_cursor: nextCursor,
    total_rows: liveStatus.totalRows,
    provider_counts: liveStatus.providerCounts,
    final_status: finalStatus,
  }, runId);

  await milestone(
    supabaseAdmin,
    failureMessages.length > 0 ? 'warn' : 'success',
    MILESTONES.BATCH_COMPLETED,
    failureMessages.length > 0 ? 'Manuális batch részlegesen kész' : 'Manuális batch kész',
    {
      manual_mode: true,
      processed_tasks: safeAdvanceCursorBy,
      total_tasks: totalTasks,
      next_cursor: nextCursor,
      has_more: hasMore,
      rows_written_this_run: rowsWrittenThisRun,
      provider_counts: liveStatus.providerCounts,
      partial_failures: failureMessages.slice(0, 5),
      catalog_write_error: catalogWriteError,
    },
    runId,
  );

  if (!hasMore) {
    await milestone(supabaseAdmin, 'success', MILESTONES.RUN_COMPLETED, 'Teljes manuális futás befejeződött', {
      manual_mode: true,
      total_tasks: totalTasks,
      total_rows: liveStatus.totalRows,
    }, runId);
  }

  return {
    ok: true,
    processedTasks: safeAdvanceCursorBy,
    totalTasks,
    nextCursor,
    hasMore,
    partialFailures: failureMessages.length,
    rowsWrittenThisRun,
    _stateWriteError: stateEndError,
    _logWriteError: null,
    status: await getStatus(supabaseAdmin),
  };
}

export async function executeSyncBatch(
  supabaseAdmin: any,
  body: SyncBody,
  runId: string,
): Promise<BatchResult> {
  getProviderKeys();

  const syncConfig = await loadSyncConfig(supabaseAdmin);
  const allTasks = buildTasks();
  const totalTasks = allTasks.length;
  const startedAt = new Date().toISOString();

  const currentState = await getCurrentStateRecord(supabaseAdmin);
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

  const taskFns = batchTasks.map((task, taskIndex) => async () => {
    const fetched = await fetchRowsForTask(supabaseAdmin, task, syncConfig, runId, startCursor + taskIndex);
    collected.push(...fetched.rows);
    failures.push(...fetched.failures);
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
    catalogWriteError = getErrorMessage(error);
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
