export async function handleSchedule(
  supabaseAdmin: any,
  minutes: number,
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  runId: string,
) {
  const { error } = await supabaseAdmin.rpc('schedule_local_places_interval', { p_minutes: minutes });
  if (error) throw error;
  await appendLog('success', 'schedule_enabled', `Automatikus batch ütemezés beállítva: ${minutes} percenként`, { interval_minutes: minutes }, runId);
  return { ok: true, interval_minutes: minutes };
}
