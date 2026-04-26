// deno-lint-ignore-file no-explicit-any
import { DEFAULT_SYNC_CONFIG } from './constants.ts';
import type { SyncConfig } from './types.ts';

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeSyncConfig(input?: Partial<SyncConfig>): SyncConfig {
  const raw = input || {};
  return {
    enabled: Boolean(raw.enabled ?? DEFAULT_SYNC_CONFIG.enabled),
    interval_minutes: clamp(Number(raw.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes), 1, 60),
    radius_meters: clamp(Number(raw.radius_meters ?? DEFAULT_SYNC_CONFIG.radius_meters), 1000, 50000),
    geo_limit: clamp(Number(raw.geo_limit ?? DEFAULT_SYNC_CONFIG.geo_limit), 1, 1000000),
    tomtom_limit: clamp(Number(raw.tomtom_limit ?? DEFAULT_SYNC_CONFIG.tomtom_limit), 1, 1000000),
    provider_concurrency: clamp(Number(raw.provider_concurrency ?? DEFAULT_SYNC_CONFIG.provider_concurrency), 1, 10),
    task_batch_size: clamp(Number(raw.task_batch_size ?? DEFAULT_SYNC_CONFIG.task_batch_size), 1, 20),
  };
}

export async function loadSyncConfig(supabaseAdmin: any): Promise<SyncConfig> {
  const { data } = await supabaseAdmin
    .from('app_runtime_config')
    .select('options')
    .eq('key', 'local_places_sync')
    .maybeSingle();
  return sanitizeSyncConfig((data?.options || {}) as Partial<SyncConfig>);
}

export async function saveSyncConfig(supabaseAdmin: any, config: Partial<SyncConfig>) {
  const safe = sanitizeSyncConfig(config);
  const { error } = await supabaseAdmin
    .from('app_runtime_config')
    .upsert({ key: 'local_places_sync', provider: 'local_catalog', options: safe }, { onConflict: 'key' });
  if (error) throw error;
  return safe;
}
