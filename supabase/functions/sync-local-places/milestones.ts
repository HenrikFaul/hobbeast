// deno-lint-ignore-file no-explicit-any
import { appendLog } from './repositories.ts';
import type { SyncLevel } from './types.ts';

export const MILESTONES = {
  RUN_STARTED: 'run_started',
  CATALOG_RESET_STARTED: 'catalog_reset_started',
  CATALOG_RESET_COMPLETED: 'catalog_reset_completed',
  BATCH_STARTED: 'batch_started',
  TASK_STARTED: 'task_started',
  GEOAPIFY_FETCH_STARTED: 'geoapify_fetch_started',
  GEOAPIFY_FETCH_COMPLETED: 'geoapify_fetch_completed',
  TOMTOM_FETCH_STARTED: 'tomtom_fetch_started',
  TOMTOM_FETCH_COMPLETED: 'tomtom_fetch_completed',
  PROVIDER_AFTER_HU_FILTER: 'provider_after_hu_filter',
  BATCH_AFTER_DEDUPE: 'batch_after_dedupe',
  CATALOG_WRITE_ATTEMPT: 'catalog_write_attempt',
  CATALOG_WRITE_COMPLETED: 'catalog_write_completed',
  CATALOG_WRITE_FAILED: 'catalog_write_failed',
  STATE_WRITE_COMPLETED: 'state_write_completed',
  BATCH_COMPLETED: 'batch_completed',
  RUN_COMPLETED: 'run_completed',
  RUN_FAILED: 'run_failed',
} as const;

export async function milestone(
  supabaseAdmin: any,
  level: SyncLevel,
  event: string,
  message: string,
  details: Record<string, unknown> = {},
  runId?: string,
) {
  return await appendLog(supabaseAdmin, level, event, message, details, runId);
}
