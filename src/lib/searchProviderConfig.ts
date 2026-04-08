import { supabase } from '@/integrations/supabase/client';
import { isAwsLocationConfigured } from '@/lib/awsLocation';

export type AddressSearchProvider = 'aws' | 'geoapify_tomtom' | 'local_catalog' | 'mapy';

/**
 * Function groups for address search - each can have its own provider.
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

const CONFIG_CACHE_MS = 60_000;

type CachedConfig = { provider: AddressSearchProvider; expiresAt: number };

type ProviderConfigPayload = {
  provider?: AddressSearchProvider;
  providers?: Partial<Record<AddressSearchFunctionGroup, AddressSearchProvider>>;
};

const cachedConfigs: Record<string, CachedConfig> = {};

function cacheKey(group: AddressSearchFunctionGroup = 'default'): string {
  return group;
}

function getDefaultProvider(): AddressSearchProvider {
  return isAwsLocationConfigured() ? 'aws' : 'geoapify_tomtom';
}

function normalizeProvider(value: unknown): AddressSearchProvider {
  if (value === 'geoapify_tomtom' || value === 'local_catalog' || value === 'mapy') return value;
  if (value === 'aws' && isAwsLocationConfigured()) return 'aws';
  return getDefaultProvider();
}

async function invokePlaceSearchConfig<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('place-search', { body });
  if (error) throw error;
  return data as T;
}

export async function getAddressSearchProvider(
  forceOrGroup?: boolean | AddressSearchFunctionGroup,
  group?: AddressSearchFunctionGroup,
): Promise<AddressSearchProvider> {
  let force = false;
  let resolvedGroup: AddressSearchFunctionGroup = 'default';
  if (typeof forceOrGroup === 'boolean') {
    force = forceOrGroup;
    resolvedGroup = group || 'default';
  } else if (typeof forceOrGroup === 'string') {
    resolvedGroup = forceOrGroup;
  }

  const key = cacheKey(resolvedGroup);
  const cached = cachedConfigs[key];
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.provider;
  }

  try {
    const payload = await invokePlaceSearchConfig<ProviderConfigPayload>({
      action: 'get_provider_config',
      group: resolvedGroup,
    });
    const provider = normalizeProvider(payload?.provider);
    cachedConfigs[key] = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
    return provider;
  } catch {
    const fallback = getDefaultProvider();
    cachedConfigs[key] = { provider: fallback, expiresAt: Date.now() + CONFIG_CACHE_MS };
    return fallback;
  }
}

export async function setAddressSearchProvider(
  provider: AddressSearchProvider,
  group: AddressSearchFunctionGroup = 'default',
) {
  const payload = await invokePlaceSearchConfig<ProviderConfigPayload>({
    action: 'save_provider_config',
    group,
    provider,
  });

  const normalized = normalizeProvider(payload?.provider ?? provider);
  cachedConfigs[cacheKey(group)] = { provider: normalized, expiresAt: Date.now() + CONFIG_CACHE_MS };
}

export async function getAllFunctionGroupProviders(): Promise<Record<AddressSearchFunctionGroup, AddressSearchProvider>> {
  try {
    const payload = await invokePlaceSearchConfig<ProviderConfigPayload>({
      action: 'get_all_provider_configs',
    });

    const defaults: Record<AddressSearchFunctionGroup, AddressSearchProvider> = {
      default: getDefaultProvider(),
      personal: getDefaultProvider(),
      venue: getDefaultProvider(),
      trip_planner: getDefaultProvider(),
    };

    const merged = {
      ...defaults,
      ...(payload?.providers || {}),
    } as Record<AddressSearchFunctionGroup, AddressSearchProvider>;

    (Object.keys(merged) as AddressSearchFunctionGroup[]).forEach((group) => {
      const provider = normalizeProvider(merged[group]);
      merged[group] = provider;
      cachedConfigs[cacheKey(group)] = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
    });

    return merged;
  } catch {
    const fallback = getDefaultProvider();
    const result: Record<AddressSearchFunctionGroup, AddressSearchProvider> = {
      default: fallback,
      personal: fallback,
      venue: fallback,
      trip_planner: fallback,
    };
    (Object.keys(result) as AddressSearchFunctionGroup[]).forEach((group) => {
      cachedConfigs[cacheKey(group)] = { provider: result[group], expiresAt: Date.now() + CONFIG_CACHE_MS };
    });
    return result;
  }
}

export function resetAddressSearchProviderCache() {
  for (const key of Object.keys(cachedConfigs)) {
    delete cachedConfigs[key];
  }
}
