export async function upsertSyncState(supabaseAdmin: any, payload: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabaseAdmin
    .from('place_sync_state')
    .upsert(payload, { onConflict: 'key' });

  if (error) {
    const msg = `place_sync_state upsert failed: ${JSON.stringify(error)}`;
    console.error(msg);
    return msg;
  }

  return null;
}

export async function getCurrentSyncState(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', 'local_places')
    .maybeSingle();

  return data || {};
}
