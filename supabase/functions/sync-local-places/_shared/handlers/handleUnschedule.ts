import { MILESTONES } from '../constants/sync.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function handleUnschedule(
  supabaseAdmin: any,
  appendLog: AppendLog,
  runId: string,
) {
  const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval');
  if (error) throw error;
  await appendLog('warn', MILESTONES.SCHEDULE_DISABLED, 'Automatic batch schedule disabled', {}, runId);
  return { ok: true };
}
