/**
 * Normalized place search client — supports runtime provider switching:
 * - AWS Location
 * - Geoapify + TomTom via Edge Function
 * - Local catalog via Edge Function / RPC
 */

import { getPlace, isAwsLocationConfigured, searchTextPlaces, suggestPlaces } from '@/lib/awsLocation';
import { getAddressSearchProvider, type AddressSearchProvider, type AddressSearchFunctionGroup } from '@/lib/searchProviderConfig';
import { suggestMapyLocations, isMapyConfigured } from '@/lib/mapy';
import { supabase } from '@/integrations/supabase/client';

export interface NormalizedPlace {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  country: string;
  postcode: string;
  lat: number;
  lon: number;
  categories: string[];
  source: 'geoapify' | 'tomtom' | 'aws' | 'local_catalog';
  sourceId: string;
  confidence: number;
}

interface EdgePlaceRow {
  external_id: string;
  provider: string;
  name: string;
  category?: string;
  categories?: string[];
  address?: string;
  city?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  distance_km?: number;
  rating?: number;
  metadata?: Record<string, unknown>;
}

function mapEdgePlace(row: EdgePlaceRow): NormalizedPlace {
  const provider = row.provider === 'tomtom' ? 'tomtom' : row.provider === 'geoapify' ? 'geoapify' : 'local_catalog';
  const district = typeof row.metadata?.district === 'string'
    ? row.metadata.district
    : typeof row.metadata?.county === 'string'
      ? row.metadata.county
      : '';

  return {
    id: `${provider}-${row.external_id}`,
    name: row.name,
    address: row.address || row.name,
    city: row.city || '',
    district,
    country: typeof row.metadata?.country === 'string' ? row.metadata.country : 'Hungary',
    postcode: row.postal_code || '',
    lat: typeof row.latitude === 'number' ? row.latitude : 0,
    lon: typeof row.longitude === 'number' ? row.longitude : 0,
    categories: Array.isArray(row.categories)
      ? row.categories
      : row.category
        ? [row.category]
        : [],
    source: provider,
    sourceId: row.external_id,
    confidence: typeof row.rating === 'number' ? Math.min(1, Math.max(0.4, row.rating / 5)) : 0.7,
  };
}

function resolveUsableProvider(provider: AddressSearchProvider): AddressSearchProvider {
  if (provider === 'aws' && !isAwsLocationConfigured()) return 'geoapify_tomtom';
  if (provider === 'mapy' && !isMapyConfigured()) return 'geoapify_tomtom';
  return provider;
}

async function callPlaceSearch(body: Record<string, unknown>): Promise<NormalizedPlace[]> {
  const { data, error } = await supabase.functions.invoke('place-search', { body });
  if (error) {
    console.error('place-search invoke error:', error);
    return [];
  }
  const rows: EdgePlaceRow[] = Array.isArray((data as any)?.results)
    ? (data as any).results
    : Array.isArray(data)
      ? data as EdgePlaceRow[]
      : [];
  return rows.map(mapEdgePlace).filter((row) => Boolean(row.id && row.name));
}

async function searchAwsPlaces(query: string): Promise<NormalizedPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || !isAwsLocationConfigured()) return [];

  const [suggestions, searchText] = await Promise.all([
    suggestPlaces(trimmed).catch(() => []),
    searchTextPlaces(trimmed).catch(() => []),
  ]);

  const deduped = new Map<string, NormalizedPlace>();
  for (const item of [...suggestions, ...searchText]) {
    const label = item.place?.label || item.text || '';
    if (!label) continue;
    const mapped: NormalizedPlace = {
      id: `aws-${item.placeId || label}`,
      name: label,
      address: [item.place?.street, item.place?.addressNumber].filter(Boolean).join(' ').trim() || label,
      city: item.place?.locality || '',
      district: item.place?.district || '',
      country: item.place?.country || 'Hungary',
      postcode: item.place?.postalCode || '',
      lat: item.place?.position?.[1] || 0,
      lon: item.place?.position?.[0] || 0,
      categories: [],
      source: 'aws',
      sourceId: item.placeId || label,
      confidence: 0.9,
    };
    deduped.set(mapped.id, mapped);
  }

  return Array.from(deduped.values());
}

async function searchMapyPlaces(query: string): Promise<NormalizedPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || !isMapyConfigured()) return [];
  try {
    const suggestions = await suggestMapyLocations(trimmed);
    return suggestions.map((s) => ({
      id: `mapy-${s.id}`,
      name: s.label,
      address: s.label,
      city: s.location || '',
      district: s.region || '',
      country: s.country || 'Hungary',
      postcode: '',
      lat: s.lat,
      lon: s.lon,
      categories: [],
      source: 'geoapify' as const,
      sourceId: s.id,
      confidence: 0.85,
    }));
  } catch {
    return [];
  }
}

export async function searchPlaces(
  query: string,
  bias?: { lat: number; lon: number },
  activityHint?: string,
  providerOverride?: AddressSearchProvider,
  functionGroup?: AddressSearchFunctionGroup,
): Promise<NormalizedPlace[]> {
  if (!query || query.trim().length < 2) return [];
  const provider = resolveUsableProvider(providerOverride || await getAddressSearchProvider(functionGroup || 'default'));

  if (provider === 'mapy') {
    return searchMapyPlaces(query);
  }

  if (provider === 'aws') {
    return searchAwsPlaces(query);
  }

  return callPlaceSearch({
    action: 'autocomplete',
    query: query.trim(),
    bias,
    activityHint,
    provider_mode: provider,
  });
}

export async function reverseGeocodePlace(lat: number, lon: number): Promise<NormalizedPlace | null> {
  const provider = resolveUsableProvider(await getAddressSearchProvider());

  if (provider === 'aws') {
    return null;
  }

  const results = await callPlaceSearch({ action: 'reverse', lat, lon, provider_mode: provider });
  return results[0] || null;
}

export async function geocodePlace(query: string, providerOverride?: AddressSearchProvider): Promise<NormalizedPlace | null> {
  const provider = resolveUsableProvider(providerOverride || await getAddressSearchProvider());

  if (provider === 'aws') {
    const results = await searchAwsPlaces(query);
    if (results[0]?.sourceId && (!results[0].lat || !results[0].lon)) {
      const details = await getPlace(results[0].sourceId).catch(() => null);
      if (details?.position) {
        return {
          ...results[0],
          lat: details.position[1],
          lon: details.position[0],
        };
      }
    }
    return results[0] || null;
  }

  const results = await callPlaceSearch({ action: 'geocode', query, provider_mode: provider });
  return results[0] || null;
}
