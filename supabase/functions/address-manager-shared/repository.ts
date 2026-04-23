// deno-lint-ignore-file no-explicit-any
import { EUROPEAN_COUNTRIES, PROVIDERS, PROVIDER_CATEGORIES } from './constants.ts';
import type { AddressManagerLimits, DiscoveryCell, MatrixSelectionUpdate, ProviderKey } from './types.ts';

export const DEFAULT_LIMITS: AddressManagerLimits = {
  geoapify_limit: 1000,
  tomtom_limit: 1000,
  radius_meters: 30000,
  worker_chunk_size: 5,
  max_parallel_workers: 2,
};

export function sanitizePositiveInt(value: unknown, fallback: number, max = 1000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function ensureMatrixSeeds(supabaseAdmin: any) {
  const rows: Record<string, unknown>[] = [];
  for (const provider of PROVIDERS) {
    for (const country of EUROPEAN_COUNTRIES) {
      for (const category of PROVIDER_CATEGORIES) {
        rows.push({
          provider,
          country_code: country.code,
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
    .upsert(rows, { onConflict: 'provider,country_code,category_key', ignoreDuplicates: true });

  if (error) throw error;
}

export async function getMatrix(supabaseAdmin: any, provider?: ProviderKey): Promise<DiscoveryCell[]> {
  let query = supabaseAdmin
    .from('sync_discovery_matrix')
    .select('id,provider,country_code,category_key,category_label,selected,status,cursor,stats,last_error,last_run_started_at,last_run_completed_at,updated_at')
    .order('provider')
    .order('country_code')
    .order('category_key');

  if (provider) query = query.eq('provider', provider);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as DiscoveryCell[];
}

export async function setSelections(supabaseAdmin: any, updates: MatrixSelectionUpdate[]) {
  if (!updates.length) return;
  for (const row of updates) {
    const payload: Record<string, unknown> = {
      selected: row.selected,
      updated_at: new Date().toISOString(),
    };
    if (row.selected) {
      payload.status = 'pending';
      payload.last_error = null;
    }
    const { error } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update(payload)
      .eq('provider', row.provider)
      .eq('country_code', row.country_code)
      .eq('category_key', row.category_key);
    if (error) throw error;
  }
}

export async function loadLimits(supabaseAdmin: any): Promise<AddressManagerLimits> {
  const { data, error } = await supabaseAdmin
    .from('app_runtime_config')
    .select('options')
    .eq('key', 'address_manager_limits')
    .maybeSingle();
  if (error) throw error;

  return {
    geoapify_limit: sanitizePositiveInt(data?.options?.geoapify_limit, DEFAULT_LIMITS.geoapify_limit),
    tomtom_limit: sanitizePositiveInt(data?.options?.tomtom_limit, DEFAULT_LIMITS.tomtom_limit),
    radius_meters: sanitizePositiveInt(data?.options?.radius_meters, DEFAULT_LIMITS.radius_meters),
    worker_chunk_size: sanitizePositiveInt(data?.options?.worker_chunk_size, DEFAULT_LIMITS.worker_chunk_size, 250),
    max_parallel_workers: sanitizePositiveInt(data?.options?.max_parallel_workers, DEFAULT_LIMITS.max_parallel_workers, 25),
  };
}

export async function saveLimits(supabaseAdmin: any, limits: Partial<AddressManagerLimits>) {
  const current = await loadLimits(supabaseAdmin);
  const merged: AddressManagerLimits = {
    geoapify_limit: sanitizePositiveInt(limits.geoapify_limit, current.geoapify_limit),
    tomtom_limit: sanitizePositiveInt(limits.tomtom_limit, current.tomtom_limit),
    radius_meters: sanitizePositiveInt(limits.radius_meters, current.radius_meters),
    worker_chunk_size: sanitizePositiveInt(limits.worker_chunk_size, current.worker_chunk_size, 250),
    max_parallel_workers: sanitizePositiveInt(limits.max_parallel_workers, current.max_parallel_workers, 25),
  };

  const { error } = await supabaseAdmin
    .from('app_runtime_config')
    .upsert({ key: 'address_manager_limits', provider: 'address_manager', options: merged }, { onConflict: 'key' });
  if (error) throw error;
  return merged;
}

export async function listVenues(
  supabaseAdmin: any,
  params: {
    provider?: ProviderKey | 'all';
    countries?: string[];
    categories?: string[];
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from('raw_venues')
    .select('id,provider,provider_venue_id,country_code,category_key,name,address,city,district,postal_code,latitude,longitude,website,discovered_at,updated_at', {
      count: 'exact',
    })
    .order('discovered_at', { ascending: false })
    .range(from, to);

  if (params.provider && params.provider !== 'all') query = query.eq('provider', params.provider);
  if (params.countries?.length) query = query.in('country_code', params.countries);
  if (params.categories?.length) query = query.in('category_key', params.categories);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

export async function buildSummary(supabaseAdmin: any) {
  const [{ count: totalRaw }, { count: totalSelected }, { count: totalCompleted }] = await Promise.all([
    supabaseAdmin.from('raw_venues').select('id', { head: true, count: 'exact' }),
    supabaseAdmin.from('sync_discovery_matrix').select('id', { head: true, count: 'exact' }).eq('selected', true),
    supabaseAdmin.from('sync_discovery_matrix').select('id', { head: true, count: 'exact' }).eq('status', 'completed'),
  ]);

  return {
    totalRawVenues: totalRaw || 0,
    totalSelectedCells: totalSelected || 0,
    totalCompletedCells: totalCompleted || 0,
  };
}
