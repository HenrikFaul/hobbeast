import type { PlaceRow } from '../types/index.ts';

export async function deleteAllCatalogRows(supabaseAdmin: any) {
  const { error } = await supabaseAdmin
    .from('places_local_catalog')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw error;
}

export async function getCatalogCounts(supabaseAdmin: any) {
  const [{ count }, providerCountResult, preview] = await Promise.all([
    supabaseAdmin.from('places_local_catalog').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('places_local_catalog').select('provider, id'),
    supabaseAdmin.from('places_local_catalog')
      .select('provider, name, city, category_group, synced_at')
      .order('synced_at', { ascending: false })
      .limit(8),
  ]);

  const providerCounts = Array.isArray(providerCountResult.data)
    ? providerCountResult.data.reduce((acc: Record<string, number>, row: any) => {
        acc[row.provider] = (acc[row.provider] || 0) + 1;
        return acc;
      }, {})
    : {};

  return {
    totalRows: count || 0,
    providerCounts,
    preview: preview.data || [],
  };
}

export async function upsertCatalogChunk(supabaseAdmin: any, rows: PlaceRow[]) {
  return supabaseAdmin
    .from('places_local_catalog')
    .upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: false })
    .select('provider, external_id, name, synced_at');
}
