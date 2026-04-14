import type { ProviderName, PlaceRow, TileCenter } from '../types/index.ts';
import { summarizeRows } from '../utils/summarize.ts';

export async function logProviderResults(
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  runId: string,
  provider: ProviderName,
  taskIndex: number,
  taskCursor: number,
  center: TileCenter,
  groupKey: string,
  rawResults: PlaceRow[],
  huResults: PlaceRow[],
) {
  await appendLog('info', 'provider_raw_results', 'Provider raw results received', {
    provider,
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    center_lat: center.lat,
    center_lon: center.lon,
    category_group: groupKey,
    raw_count: rawResults.length,
    sample: summarizeRows(rawResults),
  }, runId);

  await appendLog('info', 'provider_after_hu_filter', 'Results after HU filter', {
    provider,
    task_index: taskIndex,
    task_cursor: taskCursor,
    center_city: center.city,
    category_group: groupKey,
    before_count: rawResults.length,
    after_count: huResults.length,
    dropped_count: rawResults.length - huResults.length,
    sample: summarizeRows(huResults),
    dropped_sample: summarizeRows(rawResults.filter((row) => !['HU', 'HUN', 'HUNGARY'].includes(String(row.country_code || '').toUpperCase()))),
  }, runId);
}
