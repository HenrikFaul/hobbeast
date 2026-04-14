import { MILESTONES } from '../constants/sync.ts';
import { fetchGeoapify } from '../providers/geoapify.ts';
import { fetchTomTom } from '../providers/tomtom.ts';
import { isHungaryCountryCode } from '../utils/country.ts';
import type { PlaceRow, SyncConfig, SyncTask } from '../types/index.ts';
import { logProviderResults } from '../services/providerResultLogger.ts';

export async function runTask(params: {
  task: SyncTask;
  taskIndex: number;
  taskCursor: number;
  geoapifyKey: string;
  tomtomKey: string;
  config: SyncConfig;
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;
  runId: string;
}): Promise<{ rows: PlaceRow[]; failures: string[]; successfulProviderCalls: number }> {
  const { task, taskIndex, taskCursor, geoapifyKey, tomtomKey, config, appendLog, runId } = params;
  const { center, group } = task;

  await appendLog('info', MILESTONES.TASK_STARTED, 'Task processing started', {
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: group.key,
  }, runId);

  const [geoResult, tomtomResult] = await Promise.allSettled([
    fetchGeoapify(center, group, geoapifyKey, config),
    fetchTomTom(center, group, tomtomKey, config),
  ]);

  const rows: PlaceRow[] = [];
  const failures: string[] = [];
  let successfulProviderCalls = 0;

  if (geoResult.status === 'fulfilled') {
    const huResults = geoResult.value.filter((row) => isHungaryCountryCode(row.country_code));
    await logProviderResults(appendLog, runId, 'geoapify', taskIndex, taskCursor, center, group.key, geoResult.value, huResults);
    rows.push(...huResults);
    successfulProviderCalls += 1;
  } else {
    const message = geoResult.reason instanceof Error ? geoResult.reason.message : String(geoResult.reason);
    failures.push(message);
    await appendLog('warn', 'provider_fetch_error', 'Geoapify fetch failed', {
      provider: 'geoapify',
      task_index: taskIndex,
      task_cursor: taskCursor,
      center_city: center.city,
      category_group: group.key,
      error: message,
    }, runId);
  }

  if (tomtomResult.status === 'fulfilled') {
    const huResults = tomtomResult.value.filter((row) => isHungaryCountryCode(row.country_code));
    await logProviderResults(appendLog, runId, 'tomtom', taskIndex, taskCursor, center, group.key, tomtomResult.value, huResults);
    rows.push(...huResults);
    successfulProviderCalls += 1;
  } else {
    const message = tomtomResult.reason instanceof Error ? tomtomResult.reason.message : String(tomtomResult.reason);
    failures.push(message);
    await appendLog('warn', 'provider_fetch_error', 'TomTom fetch failed', {
      provider: 'tomtom',
      task_index: taskIndex,
      task_cursor: taskCursor,
      center_city: center.city,
      category_group: group.key,
      error: message,
    }, runId);
  }

  await appendLog('info', MILESTONES.TASK_FINISHED, 'Task processing finished', {
    task_index: taskIndex,
    task_cursor: taskCursor,
    row_count: rows.length,
    failure_count: failures.length,
  }, runId);

  return { rows, failures, successfulProviderCalls };
}
