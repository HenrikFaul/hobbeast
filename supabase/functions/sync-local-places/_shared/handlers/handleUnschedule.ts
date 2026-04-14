export async function handleUnschedule(
  supabaseAdmin: any,
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  runId: string,
) {
  const { error } = await supabaseAdmin.rpc('unschedule_local_places_interval');
  if (error) throw error;
  await appendLog('warn', 'schedule_disabled', 'Automatikus batch ütemezés kikapcsolva', {}, runId);
  return { ok: true };
}
