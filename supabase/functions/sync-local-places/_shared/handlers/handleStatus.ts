import { MILESTONES } from '../constants/sync.ts';
import { getStatus } from '../services/statusService.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function handleStatus(
  supabaseAdmin: any,
  appendLog: AppendLog,
  runId: string,
) {
  await appendLog('info', MILESTONES.STATUS_LOAD_STARTED, 'Loading sync status snapshot', {}, runId);
  const status = await getStatus(supabaseAdmin);
  await appendLog('info', MILESTONES.STATUS_LOAD_DONE, 'Status snapshot loaded', {
    total_rows: status.totalRows,
    provider_counts: status.providerCounts,
    sync_status: (status.state as any)?.status ?? null,
    cursor: (status.state as any)?.cursor ?? null,
    task_count: (status.state as any)?.task_count ?? null,
  }, runId);
  return status;
}
