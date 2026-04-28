/**
 * Normalized place search client — supports runtime provider switching:
 * - AWS Location
 * - Geoapify + TomTom via Edge Function
 * - Configured Supabase Geodata table providers via Edge Function (db:* providers)
 *
 * v1.7.5 stability notes:
 * - manual Edge Function fetch path supports AbortController
 * - small in-memory cache prevents repeated calls while typing
 * - stale/aborted requests resolve to [] instead of throwing into modals
 */

import { getPlace, isAwsLocationConfigured, searchTextPlaces, suggestPlaces } from '@/lib/awsLocation';
import {
  getAddressSearchProvider,
  isDbAddressSearchProvider,
  type AddressSearchProvider,
  type AddressSearchFunctionGroup,
} from '@/lib/searchProviderConfig';
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
  source: string;
  sourceId: string;
  confidence: number;
}

interface EdgePlaceRow {
  external_id?: string;
  id?: string;
  provider?: string;
  name?: string;
  category?: string;
  categories?: string[];
  address?: string;
  formatted_address?: string;
  city?: string;
  district?: string;
  postal_code?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  distance_km?: number;
  rating?: number;
  metadata?: Record<string, unknown>;
}

export interface PlaceSearchOptions {
  signal?: AbortSignal;
  limit?: number;
  source?: string;
  category?: string;
  group?: AddressSearchFunctionGroup;
  suppressErrors?: boolean;
}

interface PlaceSearchEdgePayload {
  results?: EdgePlaceRow[];
  rows?: EdgePlaceRow[];
  debug?: Record<string, unknown>;
  error?: string;
  details?: unknown;
}

const PLACE_SEARCH_CACHE_MS = 45_000;
const placeSearchCache = new Map<string, { expiresAt: number; value: NormalizedPlace[] }>();

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function safeNumber(...values: unknown[]): number {
  for (const value of values) {
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return 0;
}

function isValidCoordinate(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001) return false;
  return true;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => (v === true ? k : `${k}:${normalizeText(v)}`));
  }
  return [];
}

function cacheKey(body: Record<string, unknown>): string {
  return JSON.stringify(body, Object.keys(body).sort());
}

function readCache(key: string): NormalizedPlace[] | null {
  const cached = placeSearchCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) placeSearchCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key: string, value: NormalizedPlace[]) {
  placeSearchCache.set(key, { value, expiresAt: Date.now() + PLACE_SEARCH_CACHE_MS });
}

function getSupabaseFunctionBaseUrl(): string {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  if (!url) throw new Error('Missing VITE_SUPABASE_URL for place-search call.');
  return `${url}/functions/v1/place-search`;
}

function getSupabasePublishableKey(): string {
  return String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
}

function mapEdgePlace(row: EdgePlaceRow): NormalizedPlace {
  const provider = normalizeText(row.provider) || 'geoapify';
  const metadata = row.metadata || {};
  const externalId = normalizeText(row.external_id || row.id || metadata.external_id || metadata.id) || crypto.randomUUID();
  const name = normalizeText(row.name || row.formatted_address || row.address || metadata.name) || 'Helyszín';
  const address = normalizeText(row.address || row.formatted_address || metadata.formatted_address || metadata.address || name);
  const district = normalizeText(
    row.district ||
      metadata.district ||
      metadata.suburb ||
      metadata.state_region ||
      metadata.county,
  );

  return {
    id: `${provider}-${externalId}`,
    name,
    address,
    city: normalizeText(row.city || metadata.city),
    district,
    country: normalizeText(metadata.country) || 'Hungary',
    postcode: normalizeText(row.postal_code || row.postcode || metadata.postal_code || metadata.postcode),
    lat: safeNumber(row.latitude, row.lat, metadata.latitude, metadata.lat),
    lon: safeNumber(row.longitude, row.lon, metadata.longitude, metadata.lon),
    categories: coerceStringArray(row.categories || row.category || metadata.categories),
    source: provider,
    sourceId: externalId,
    confidence: typeof row.rating === 'number' ? Math.min(1, Math.max(0.4, row.rating / 5)) : 0.75,
  };
}

function resolveUsableProvider(provider: AddressSearchProvider): AddressSearchProvider {
  if (provider === 'aws' && !isAwsLocationConfigured()) return 'geoapify_tomtom';
  if (provider === 'mapy' && !isMapyConfigured()) return 'geoapify_tomtom';
  if (isDbAddressSearchProvider(provider)) return provider;
  return provider;
}

async function callPlaceSearch(
  body: Record<string, unknown>,
  options: PlaceSearchOptions = {},
): Promise<NormalizedPlace[]> {
  const key = cacheKey(body);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const publishableKey = getSupabasePublishableKey();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (publishableKey) {
      headers.apikey = publishableKey;
      headers.Authorization = `Bearer ${session?.access_token || publishableKey}`;
    }

    const startedAt = performance.now();
    const response = await fetch(getSupabaseFunctionBaseUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const elapsedMs = Math.round(performance.now() - startedAt);

    const payload = (await response.json().catch(() => ({}))) as PlaceSearchEdgePayload;

    if (!response.ok) {
      const error = new Error(payload.error || `place-search HTTP ${response.status}`);
      console.error('[place-search] non-2xx response', {
        status: response.status,
        elapsedMs,
        body,
        payload,
      });
      throw error;
    }

    if (elapsedMs > 500) {
      console.info('[place-search] slow response', { elapsedMs, body, debug: payload.debug });
    }

    const rows: EdgePlaceRow[] = Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.rows)
        ? payload.rows
        : Array.isArray(payload)
          ? (payload as EdgePlaceRow[])
          : [];

    const normalized = rows
      .map(mapEdgePlace)
      .filter((row) => Boolean(row.id && row.name && isValidCoordinate(row.lat, row.lon)));
    writeCache(key, normalized);
    return normalized;
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return [];
    }

    if (!options.suppressErrors) {
      console.error('[place-search] invoke failed', {
        error,
        body,
      });
    }
    return [];
  }
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

    let lon = item.place?.position?.[0] ?? null;
    let lat = item.place?.position?.[1] ?? null;

    if ((!isValidCoordinate(Number(lat), Number(lon))) && item.placeId) {
      const details = await getPlace(item.placeId).catch(() => null);
      if (details?.position) {
        lon = details.position[0];
        lat = details.position[1];
      }
    }

    const normalizedLat = Number(lat);
    const normalizedLon = Number(lon);
    if (!isValidCoordinate(normalizedLat, normalizedLon)) continue;

    const mapped: NormalizedPlace = {
      id: `aws-${item.placeId || label}`,
      name: label,
      address: [item.place?.street, item.place?.addressNumber].filter(Boolean).join(' ').trim() || label,
      city: item.place?.locality || '',
      district: item.place?.district || '',
      country: item.place?.country || 'Hungary',
      postcode: item.place?.postalCode || '',
      lat: normalizedLat,
      lon: normalizedLon,
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
      source: 'mapy',
      sourceId: s.id,
      confidence: 0.85,
    }));
  } catch (error) {
    console.error('[mapy] place search failed', error);
    return [];
  }
}

export async function searchPlaces(
  query: string,
  bias?: { lat: number; lon: number },
  activityHint?: string,
  providerOverride?: AddressSearchProvider,
  functionGroup?: AddressSearchFunctionGroup,
  options: PlaceSearchOptions = {},
): Promise<NormalizedPlace[]> {
  const trimmed = query.trim();
  const resolvedGroup = options.group || functionGroup || 'default';
  const provider = resolveUsableProvider(providerOverride || await getAddressSearchProvider(resolvedGroup));

  // For regular external providers, keep the minimum query guard.
  // For db:* providers, activityHint/category can still be useful even if the user query is short.
  if (trimmed.length < 2 && !isDbAddressSearchProvider(provider)) return [];

  if (provider === 'mapy') {
    return searchMapyPlaces(trimmed);
  }

  if (provider === 'aws') {
    return searchAwsPlaces(trimmed);
  }

  return callPlaceSearch({
    action: 'autocomplete',
    query: trimmed,
    bias,
    activityHint,
    category: options.category,
    source: options.source,
    limit: options.limit || 12,
    provider_mode: provider,
    group: resolvedGroup,
  }, options);
}

export async function reverseGeocodePlace(lat: number, lon: number, options: PlaceSearchOptions = {}): Promise<NormalizedPlace | null> {
  const provider = resolveUsableProvider(await getAddressSearchProvider());

  if (provider === 'aws' || provider === 'mapy' || isDbAddressSearchProvider(provider)) {
    return null;
  }

  const results = await callPlaceSearch({ action: 'reverse', lat, lon, provider_mode: provider }, options);
  return results[0] || null;
}

export async function geocodePlace(
  query: string,
  providerOverride?: AddressSearchProvider,
  options: PlaceSearchOptions = {},
): Promise<NormalizedPlace | null> {
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

  if (provider === 'mapy') {
    return (await searchMapyPlaces(query))[0] || null;
  }

  const results = await callPlaceSearch({ action: 'geocode', query, provider_mode: provider }, options);
  return results[0] || null;
}

export function clearPlaceSearchCache() {
  placeSearchCache.clear();
}
