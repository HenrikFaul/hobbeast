import { supabase } from '@/integrations/supabase/client';
import { isAwsLocationConfigured } from '@/lib/awsLocation';

export type AddressSearchProvider = 'aws' | 'geoapify_tomtom' | 'local_catalog' | 'mapy';

/**
 * Function groups for address search — each can have its own provider.
 * - default: fallback for any unset group
 * - personal: user profile address (distance calculations)
 * - venue: event venue / place search (PlaceAutocomplete)
 * - trip_planner: hike/trip planner (MapyTripPlanner)
 */
export type AddressSearchFunctionGroup = 'default' | 'personal' | 'venue' | 'trip_planner';

export const FUNCTION_GROUP_LABELS: Record<AddressSearchFunctionGroup, string> = {
  default: 'Alapértelmezett (fallback)',
  personal: 'Személyes cím (profil, távolság)',
  venue: 'Helyszínkereső (esemény, venue)',
  trip_planner: 'Túratervező címkereső',
};

const CONFIG_KEY_PREFIX = 'address_search';
const CONFIG_CACHE_MS = 60_000;

type CachedConfig = { provider: AddressSearchProvider; expiresAt: number };

const cachedConfigs: Record<string, CachedConfig> = {};

function configKey(group: AddressSearchFunctionGroup = 'default'): string {
  return group === 'default' ? CONFIG_KEY_PREFIX : `${CONFIG_KEY_PREFIX}:${group}`;
}

function getDefaultProvider(): AddressSearchProvider {
  return isAwsLocationConfigured() ? 'aws' : 'geoapify_tomtom';
}

function normalizeProvider(value: unknown): AddressSearchProvider {
  if (value === 'geoapify_tomtom' || value === 'local_catalog' || value === 'mapy') return value;
  if (value === 'aws' && isAwsLocationConfigured()) return 'aws';
  return getDefaultProvider();
}

export async function getAddressSearchProvider(
  forceOrGroup?: boolean | AddressSearchFunctionGroup,
  group?: AddressSearchFunctionGroup,
): Promise<AddressSearchProvider> {
  // Handle overloaded signature
  let force = false;
  let resolvedGroup: AddressSearchFunctionGroup = 'default';
  if (typeof forceOrGroup === 'boolean') {
    force = forceOrGroup;
    resolvedGroup = group || 'default';
  } else if (typeof forceOrGroup === 'string') {
    resolvedGroup = forceOrGroup;
  }

  const key = configKey(resolvedGroup);
  const cached = cachedConfigs[key];

  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.provider;
  }

  // Try group-specific key first, then fallback to default
  const keysToTry = resolvedGroup !== 'default' ? [key, configKey('default')] : [key];

  for (const k of keysToTry) {
    const { data, error } = await supabase
      .from('app_runtime_config' as any)
      .select('key, provider')
      .eq('key', k)
      .maybeSingle();

    if (!error && data) {
      const safeData = data as unknown as Record<string, unknown>;
      const providerValue = 'provider' in safeData ? safeData.provider : undefined;
      const provider = normalizeProvider(providerValue);
      cachedConfigs[key] = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
      return provider;
    }
  }

  const fallback = getDefaultProvider();
  cachedConfigs[key] = { provider: fallback, expiresAt: Date.now() + CONFIG_CACHE_MS };
  return fallback;
}

export async function setAddressSearchProvider(
  provider: AddressSearchProvider,
  group: AddressSearchFunctionGroup = 'default',
) {
  const key = configKey(group);
  const payload = { key, provider, options: {} };
  const { error } = await supabase
    .from('app_runtime_config' as any)
    .upsert(payload, { onConflict: 'key' });

  if (error) throw error;
  cachedConfigs[key] = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
}

export async function getAllFunctionGroupProviders(): Promise<Record<AddressSearchFunctionGroup, AddressSearchProvider>> {
  const groups: AddressSearchFunctionGroup[] = ['default', 'personal', 'venue', 'trip_planner'];
  const result = {} as Record<AddressSearchFunctionGroup, AddressSearchProvider>;
  await Promise.all(
    groups.map(async (g) => {
      result[g] = await getAddressSearchProvider(true, g);
    }),
  );
  return result;
}

export function resetAddressSearchProviderCache() {
  for (const k of Object.keys(cachedConfigs)) {
    delete cachedConfigs[k];
  }
}
