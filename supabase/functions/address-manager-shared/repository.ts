// deno-lint-ignore-file no-explicit-any
import { PROVIDERS, EUROPEAN_COUNTRIES, PROVIDER_CATEGORIES } from './constants.ts';
import type { AddressManagerLimits, DiscoveryCell, ProviderKey } from './types.ts';

export const DEFAULT_LIMITS: AddressManagerLimits = {
  geoapify_limit: 1000,
  tomtom_limit: 1000,
  radius_meters: 30000,
  worker_chunk_size: 5,
  max_parallel_workers: 2,
};

export async function ensureMatrixSeeds(supabaseAdmin: any) {
  const rows: Record<string, unknown>[] = [];
  for (const provider of PROVIDERS) {
    for (const country of EUROPEAN_COUNTRIES) {
      for (const category of PROVIDER_CATEGORIES) {
        rows.push({
          provider,
          country_code: country,
          category_key: category.key,
          category_label: category.label,
          selected: false,
          status: 'pending',
        });
      }
    }
  }

  const { error } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .upsert(rows, { onConflict: 'provider,country_code,category_key', ignoreDuplicates: false });

  if (error) throw error;
}

export async function getMatrix(supabaseAdmin: any): Promise<DiscoveryCell[]> {
  const { data, error } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .select('provider,country_code,category_key,category_label,selected,status,cursor,stats')
    .order('provider')
    .order('country_code')
    .order('category_key');

  if (error) throw error;
  return (data || []) as DiscoveryCell[];
}

export async function setSelections(
  supabaseAdmin: any,
  updates: Array<{ provider: ProviderKey; country_code: string; category_key: string; selected: boolean }>,
) {
  if (!updates.length) return;
  for (const row of updates) {
    const { error } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({ selected: row.selected, updated_at: new Date().toISOString() })
      .eq('provider', row.provider)
      .eq('country_code', row.country_code)
      .eq('category_key', row.category_key);
    if (error) throw error;
  }
}

export async function loadLimits(supabaseAdmin: any): Promise<AddressManagerLimits> {
  const { data } = await supabaseAdmin
    .from('app_runtime_config')
    .select('options')
    .eq('key', 'address_manager_limits')
    .maybeSingle();

  return { ...DEFAULT_LIMITS, ...((data?.options || {}) as Record<string, number>) };
}

export async function saveLimits(supabaseAdmin: any, limits: Partial<AddressManagerLimits>) {
  const current = await loadLimits(supabaseAdmin);
  const merged = { ...current, ...limits };
  const { error } = await supabaseAdmin
    .from('app_runtime_config')
    .upsert({ key: 'address_manager_limits', provider: 'address_manager', options: merged }, { onConflict: 'key' });
  if (error) throw error;
  return merged;
}
