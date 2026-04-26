import { MILESTONES } from '../constants/sync.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function handleSchedule(
  supabaseAdmin: any,
  minutes: number,
  appendLog: AppendLog,
  runId: string,
) {
  const { error } = await supabaseAdmin.rpc('schedule_local_places_interval', { p_minutes: minutes });
  if (error) throw error;
  await appendLog('success', MILESTONES.SCHEDULE_ENABLED, `Automatic batch schedule set: every ${minutes} minute(s)`, { interval_minutes: minutes }, runId);
  return { ok: true, interval_minutes: minutes };
}
