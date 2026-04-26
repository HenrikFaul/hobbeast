// deno-lint-ignore-file no-explicit-any
import { CATALOG_UPSERT_CHUNK_SIZE, LOCAL_PLACES_STATE_KEY } from './constants.ts';
import type { LocalCatalogRow, SyncLevel } from './types.ts';

export async function appendLog(
  supabaseAdmin: any,
  level: SyncLevel,
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

export async function resetCatalog(supabaseAdmin: any) {
  const { error } = await supabaseAdmin
    .from('places_local_catalog')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

export async function writeCatalogRows(supabaseAdmin: any, rows: LocalCatalogRow[]) {
  if (rows.length === 0) return 0;

  let actuallyWritten = 0;
  for (let index = 0; index < rows.length; index += CATALOG_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CATALOG_UPSERT_CHUNK_SIZE);
    const { data, error } = await supabaseAdmin
      .from('places_local_catalog')
      .upsert(chunk, { onConflict: 'provider,external_id' as any, ignoreDuplicates: false })
      .select('provider, external_id');
    if (error) throw error;
    const returnedCount = Array.isArray(data) ? data.length : 0;
    actuallyWritten += returnedCount;
    if (returnedCount === 0 && chunk.length > 0) {
      throw new Error(
        `places_local_catalog upsert returned 0 rows for ${chunk.length} attempted — ` +
        `check SUPABASE_SERVICE_ROLE_KEY matches the project (silent RLS/service-role failure).`,
      );
    }
  }
  return actuallyWritten;
}

export async function getRecentLogs(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from('place_sync_logs')
    .select('id, created_at, level, event, message, details')
    .order('created_at', { ascending: false })
    .limit(40);
  return data || [];
}

export async function getStatus(supabaseAdmin: any) {
  const [{ count }, stateResult, providerCountResult, preview, logs] = await Promise.all([
    supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('place_sync_state').select('*').eq('key', LOCAL_PLACES_STATE_KEY).maybeSingle(),
    supabaseAdmin.from('places_local_catalog').select('provider, id'),
    supabaseAdmin.from('places_local_catalog')
      .select('provider, name, city, category_group, synced_at')
      .order('synced_at', { ascending: false })
      .limit(8),
    getRecentLogs(supabaseAdmin),
  ]);

  const providerCounts = Array.isArray(providerCountResult.data)
    ? providerCountResult.data.reduce((acc: Record<string, number>, row: any) => {
        acc[row.provider] = (acc[row.provider] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : {};

  return {
    totalRows: count || 0,
    state: stateResult.data || null,
    providerCounts,
    preview: preview.data || [],
    logs,
  };
}
