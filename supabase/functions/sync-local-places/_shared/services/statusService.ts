import { getCatalogCounts } from '../repositories/catalogRepo.ts';
import { getRecentLogs } from '../repositories/logRepo.ts';
import type { StatusPayload } from '../types/index.ts';

export async function getStatus(supabaseAdmin: any): Promise<StatusPayload> {
  const [catalog, stateResult, logs] = await Promise.all([
    getCatalogCounts(supabaseAdmin),
    supabaseAdmin.from('place_sync_state').select('*').eq('key', 'local_places').maybeSingle(),
    getRecentLogs(supabaseAdmin),
  ]);

  return {
    totalRows: catalog.totalRows,
    state: stateResult.data || null,
    providerCounts: catalog.providerCounts,
    preview: catalog.preview,
    logs,
  };
}
