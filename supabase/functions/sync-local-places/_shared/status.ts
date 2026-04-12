// deno-lint-ignore-file no-explicit-any
import { STATUS_PREVIEW_LIMIT, SYNC_STATE_KEY } from './constants.ts';
import { getRecentLogs } from './logs.ts';
import type { SupabaseAdmin, SyncStatus } from './types.ts';

export async function getStatus(supabaseAdmin: SupabaseAdmin): Promise<SyncStatus> {
  const [{ count }, stateResult, providerCountResult, preview, logs] = await Promise.all([
    supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('place_sync_state').select('*').eq('key', SYNC_STATE_KEY).maybeSingle(),
    supabaseAdmin.from('places_local_catalog').select('provider, id'),
    supabaseAdmin
      .from('places_local_catalog')
      .select('provider, name, city, category_group, synced_at')
      .order('synced_at', { ascending: false })
      .limit(STATUS_PREVIEW_LIMIT),
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
