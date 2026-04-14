import { MILESTONES } from '../constants/sync.ts';
import { fetchGeoapify } from '../providers/geoapify.ts';
import { fetchTomTom } from '../providers/tomtom.ts';
import { isHungaryCountryCode } from '../utils/country.ts';
import type { PlaceRow, SyncConfig, SyncTask } from '../types/index.ts';
import { summarizeRows } from '../utils/summarize.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function runTask(params: {
  task: SyncTask;
  taskIndex: number;
  taskCursor: number;
  geoapifyKey: string;
  tomtomKey: string;
  config: SyncConfig;
  appendLog: AppendLog;
  runId: string;
}): Promise<{ rows: PlaceRow[]; failures: string[]; successfulProviderCalls: number }> {
  const { task, taskIndex, taskCursor, geoapifyKey, tomtomKey, config, appendLog, runId } = params;
  const { center, group } = task;

  await appendLog('info', MILESTONES.TASK_STARTED, 'Task started', {
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    center_lat: center.lat,
    center_lon: center.lon,
    category_group: group.key,
  }, runId);

  const rows: PlaceRow[] = [];
  const failures: string[] = [];
  let successfulProviderCalls = 0;

  // --- Geoapify ---
  await appendLog('info', MILESTONES.PROVIDER_FETCH_STARTED, 'Geoapify fetch started', {
    provider: 'geoapify',
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: group.key,
  }, runId);

  let geoRaw: PlaceRow[] = [];
  try {
    geoRaw = await fetchGeoapify(center, group, geoapifyKey, config);
    await appendLog('info', MILESTONES.PROVIDER_FETCH_DONE, 'Geoapify fetch done', {
      provider: 'geoapify',
      task_index: taskIndex,
      raw_count: geoRaw.length,
      sample: summarizeRows(geoRaw),
    }, runId);
    successfulProviderCalls += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(message);
    await appendLog('warn', MILESTONES.PROVIDER_FETCH_DONE, 'Geoapify fetch failed', {
      provider: 'geoapify',
      task_index: taskIndex,
      task_cursor: taskCursor,
      center_city: center.city,
      category_group: group.key,
      error: message,
    }, runId);
  }

  const geoHu = geoRaw.filter((row) => isHungaryCountryCode(row.country_code));
  await appendLog('info', MILESTONES.HU_FILTER_DONE, 'Geoapify HU filter done', {
    provider: 'geoapify',
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: group.key,
    raw_count: geoRaw.length,
    hu_count: geoHu.length,
    dropped: geoRaw.length - geoHu.length,
    sample: summarizeRows(geoHu),
  }, runId);
  rows.push(...geoHu);

  // --- TomTom ---
  await appendLog('info', MILESTONES.PROVIDER_FETCH_STARTED, 'TomTom fetch started', {
    provider: 'tomtom',
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: group.key,
  }, runId);

  let tomtomRaw: PlaceRow[] = [];
  try {
    tomtomRaw = await fetchTomTom(center, group, tomtomKey, config);
    await appendLog('info', MILESTONES.PROVIDER_FETCH_DONE, 'TomTom fetch done', {
      provider: 'tomtom',
      task_index: taskIndex,
      raw_count: tomtomRaw.length,
      sample: summarizeRows(tomtomRaw),
    }, runId);
    successfulProviderCalls += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(message);
    await appendLog('warn', MILESTONES.PROVIDER_FETCH_DONE, 'TomTom fetch failed', {
      provider: 'tomtom',
      task_index: taskIndex,
      task_cursor: taskCursor,
      center_city: center.city,
      category_group: group.key,
      error: message,
    }, runId);
  }

  const tomtomHu = tomtomRaw.filter((row) => isHungaryCountryCode(row.country_code));
  await appendLog('info', MILESTONES.HU_FILTER_DONE, 'TomTom HU filter done', {
    provider: 'tomtom',
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: group.key,
    raw_count: tomtomRaw.length,
    hu_count: tomtomHu.length,
    dropped: tomtomRaw.length - tomtomHu.length,
    sample: summarizeRows(tomtomHu),
  }, runId);
  rows.push(...tomtomHu);

  await appendLog('info', MILESTONES.TASK_FINISHED, 'Task finished', {
    task_index: taskIndex,
    task_cursor: taskCursor,
    row_count: rows.length,
    failure_count: failures.length,
    successful_provider_calls: successfulProviderCalls,
  }, runId);

  return { rows, failures, successfulProviderCalls };
}
