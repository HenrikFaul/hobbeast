// deno-lint-ignore-file no-explicit-any
import { UPSERT_CHUNK_SIZE } from './constants.ts';
import type { LocalCatalogRow, SupabaseAdmin } from './types.ts';

export async function resetCatalog(supabaseAdmin: SupabaseAdmin) {
  const { error } = await supabaseAdmin
    .from('places_local_catalog')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw error;
}

export async function upsertCatalogRows(supabaseAdmin: SupabaseAdmin, rows: LocalCatalogRow[]) {
  if (rows.length === 0) return;

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await supabaseAdmin
      .from('places_local_catalog')
      .upsert(chunk, { onConflict: 'provider,external_id' as any, ignoreDuplicates: false });

    if (error) throw error;
  }
}
