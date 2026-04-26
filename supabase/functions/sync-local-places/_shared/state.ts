// deno-lint-ignore-file no-explicit-any
import { SYNC_STATE_KEY } from './constants.ts';
import type { SupabaseAdmin, SyncStateRow } from './types.ts';

export async function upsertSyncState(
  supabaseAdmin: SupabaseAdmin,
  payload: Omit<SyncStateRow, 'key'> & { key?: string },
): Promise<string | null> {
  const { error } = await supabaseAdmin
    .from('place_sync_state')
    .upsert({ key: payload.key ?? SYNC_STATE_KEY, ...payload }, { onConflict: 'key' });

  if (error) {
    const msg = `place_sync_state upsert failed: ${JSON.stringify(error)}`;
    console.error(msg);
    return msg;
  }

  return null;
}

export async function getCurrentSyncState(supabaseAdmin: SupabaseAdmin): Promise<SyncStateRow> {
  const { data } = await supabaseAdmin
    .from('place_sync_state')
    .select('*')
    .eq('key', SYNC_STATE_KEY)
    .maybeSingle();

  return (data || { key: SYNC_STATE_KEY }) as SyncStateRow;
}
