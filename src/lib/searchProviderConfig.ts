import { supabase } from '@/integrations/supabase/client';
import { isAwsLocationConfigured } from '@/lib/awsLocation';

export type AddressSearchProvider = 'aws' | 'geoapify_tomtom' | 'local_catalog';

const CONFIG_KEY = 'address_search';
const CONFIG_CACHE_MS = 60_000;

type CachedConfig = { provider: AddressSearchProvider; expiresAt: number };

let cachedConfig: CachedConfig | null = null;

function getDefaultProvider(): AddressSearchProvider {
  return isAwsLocationConfigured() ? 'aws' : 'geoapify_tomtom';
}

function normalizeProvider(value: unknown): AddressSearchProvider {
  if (value === 'geoapify_tomtom' || value === 'local_catalog') return value;
  if (value === 'aws' && isAwsLocationConfigured()) return 'aws';
  return getDefaultProvider();
}

export async function getAddressSearchProvider(force = false): Promise<AddressSearchProvider> {
  if (!force && cachedConfig && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.provider;
  }

  const { data, error } = await supabase
    .from('app_runtime_config' as any)
    .select('key, provider')
    .eq('key', CONFIG_KEY)
    .maybeSingle();

  if (error || !data) {
    const fallback = getDefaultProvider();
    cachedConfig = { provider: fallback, expiresAt: Date.now() + CONFIG_CACHE_MS };
    return fallback;
  }

  const providerValue =
    data && typeof data === 'object' && 'provider' in data
      ? (data as { provider?: unknown }).provider
      : undefined;

  const provider = normalizeProvider(providerValue);
  cachedConfig = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
  return provider;
}

export async function setAddressSearchProvider(provider: AddressSearchProvider) {
  const payload = { key: CONFIG_KEY, provider, options: {} };
  const { error } = await supabase
    .from('app_runtime_config' as any)
    .upsert(payload, { onConflict: 'key' });

  if (error) throw error;
  cachedConfig = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
}

export function resetAddressSearchProviderCache() {
  cachedConfig = null;
}
