export async function appendLog(
  supabaseAdmin: any,
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

export async function getRecentLogs(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from('place_sync_logs')
    .select('id, run_id, created_at, level, event, message, details')
    .order('created_at', { ascending: false })
    .limit(40);

  return data || [];
}
