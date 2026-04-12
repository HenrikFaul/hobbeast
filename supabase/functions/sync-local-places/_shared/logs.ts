// deno-lint-ignore-file no-explicit-any
import { RECENT_LOG_LIMIT } from './constants.ts';
import type { SupabaseAdmin, SyncMilestone } from './types.ts';

export async function appendLog(
  supabaseAdmin: SupabaseAdmin,
  level: 'info' | 'warn' | 'error' | 'success',
  event: string,
  message: string,
  details: Record<string, unknown> = {},
  runId?: string,
): Promise<string | null> {
  const { error } = await supabaseAdmin.from('place_sync_logs').insert({
    run_id: runId ?? null,
    level,
    event,
    message,
    details,
  });

  if (error) {
    const msg = `place_sync_logs insert failed [${event}]: ${JSON.stringify(error)}`;
    console.error(msg);
    return msg;
  }

  return null;
}

export async function appendMilestoneLog(
  supabaseAdmin: SupabaseAdmin,
  milestone: SyncMilestone,
  message: string,
  details: Record<string, unknown> = {},
  runId?: string,
) {
  const level = resolveMilestoneLevel(milestone);
  return appendLog(supabaseAdmin, level, milestone, message, details, runId);
}

export async function getRecentLogs(supabaseAdmin: SupabaseAdmin) {
  const { data } = await supabaseAdmin
    .from('place_sync_logs')
    .select('id, created_at, level, event, message, details')
    .order('created_at', { ascending: false })
    .limit(RECENT_LOG_LIMIT);

  return data || [];
}

function resolveMilestoneLevel(milestone: SyncMilestone): 'info' | 'warn' | 'error' | 'success' {
  switch (milestone) {
    case 'catalog_reset':
    case 'schedule_disabled':
      return 'warn';
    case 'sync_error':
      return 'error';
    case 'config_saved':
    case 'schedule_enabled':
    case 'batch_enqueued':
    case 'batch_started':
      return 'info';
    case 'batch_completed':
    case 'sync_complete':
    default:
      return 'success';
  }
}
