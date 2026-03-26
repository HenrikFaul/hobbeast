import { supabase } from '@/integrations/supabase/client';
export type MapyResultType =
  | 'address'
  | 'poi'
  | 'city'
  | 'district'
  | 'street'
  | 'coordinate'
  | 'unknown';

export type MapyRouteType =
  | 'foot_hiking'
  | 'foot_fast'
  | 'bike_road'
  | 'bike_mountain'
  | 'car_fast'
  | 'car_short';

export interface TripPlanPoint {
  label: string;
  lat: number;
  lon: number;
  type?: MapyResultType;
  providerId?: string | null;
  location?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface MapySuggestion extends TripPlanPoint {
  id: string;
  bbox?: [number, number, number, number] | null;
}

export interface TripPlanDraft {
  provider: 'mapy';
  routeType: MapyRouteType;
  start: TripPlanPoint;
  end: TripPlanPoint;
  waypoints: TripPlanPoint[];
  lengthM: number | null;
  durationS: number | null;
  geometry: unknown;
  warnings?: string[];
  externalUrl?: string | null;
  elevationProfile?: Array<{ lat: number; lon: number; elevation: number }> | null;
  elevationSummary?: { ascentM: number; descentM: number } | null;
}

interface MapyEntity {
  name?: string;
  label?: string;
  position?: { lon: number; lat: number } | [number, number];
  type?: string;
  location?: string;
  bbox?: [number, number, number, number];
  id?: string;
  regionalStructure?: Array<{ name?: string; type?: string; isoCode?: string }>;
}

interface RoutePart {
  length?: number;
  duration?: number;
}

interface RouteResponseLike {
  length?: number;
  duration?: number;
  geometry?: unknown;
  parts?: RoutePart[];
  routePoints?: Array<{ mappedPosition?: [number, number]; originalPosition?: [number, number] }>;
}

const MAPY_API_KEY = (import.meta.env.VITE_MAPY_API_KEY as string | undefined) || '';
const MAPY_BASE_URL = (import.meta.env.VITE_MAPY_API_BASE_URL as string | undefined) || 'https://api.mapy.com/v1';
const MAPY_TILE_URL = (import.meta.env.VITE_MAPY_TILE_URL as string | undefined) || `${MAPY_BASE_URL}/maptiles/outdoor/256/{z}/{x}/{y}`;
const MAPY_TILE_ATTRIBUTION = 'Powered by Mapy.com';

const GEOCODE_ENDPOINTS = ['/geocode'];
const SUGGEST_ENDPOINTS = ['/suggest'];
const REVERSE_ENDPOINTS = ['/rgeocode', '/reverse-geocode'];
const ROUTE_ENDPOINTS = ['/routing/route', '/route'];
const ELEVATION_ENDPOINTS = ['/elevation'];

function withApiKey(params: URLSearchParams) {
  if (MAPY_API_KEY) params.set('apikey', MAPY_API_KEY);
  return params;
}

async function invokeMapyFunction<T>(action: 'suggest' | 'geocode' | 'reverse_geocode' | 'route' | 'elevation', params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mapy-routing', { body: { action, params } });
  if (error) throw error;
  return data as T;
}

async function fetchJsonWithFallback<T>(
  endpoints: string[],
  params: URLSearchParams,
  init?: RequestInit,
): Promise<T> {
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    const url = `${MAPY_BASE_URL}${endpoint}?${withApiKey(new URLSearchParams(params)).toString()}`;
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.headers || {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        errors.push(`${endpoint}: ${response.status} ${text}`);
        continue;
      }

      return (await response.json()) as T;
    } catch (error) {
      errors.push(`${endpoint}: ${(error as Error).message}`);
    }
  }

  throw new Error(errors[errors.length - 1] || 'Mapy request failed.');
}

function extractEntityList(payload: unknown): MapyEntity[] {
  if (Array.isArray(payload)) return payload as MapyEntity[];
  if (payload && typeof payload === 'object') {
    const maybe = payload as Record<string, unknown>;
    const candidates = [maybe.items, maybe.results, maybe.data, maybe.places, maybe.entities];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as MapyEntity[];
    }
  }
  return [];
}

function inferResultType(type?: string): MapyResultType {
  const normalized = (type || '').toLowerCase();
  if (normalized.includes('address')) return 'address';
  if (normalized.includes('street')) return 'street';
  if (normalized.includes('poi')) return 'poi';
  if (normalized.includes('municipality') || normalized.includes('city')) return 'city';
  if (normalized.includes('district') || normalized.includes('part')) return 'district';
  if (normalized.includes('coordinate')) return 'coordinate';
  return 'unknown';
}

function normalizeEntity(entity: MapyEntity, fallbackId: string): MapySuggestion | null {
  if (!entity.position) return null;
  let lon: number, lat: number;
  if (Array.isArray(entity.position)) {
    if (entity.position.length < 2) return null;
    [lon, lat] = entity.position;
  } else {
    lon = entity.position.lon;
    lat = entity.position.lat;
  }
  const region = entity.regionalStructure?.find((item) => item.type?.includes('region'))?.name || null;
  const country = entity.regionalStructure?.find((item) => item.type === 'regional.country')?.isoCode ||
    entity.regionalStructure?.find((item) => item.type === 'regional.country')?.name || null;

  return {
    id: entity.id || fallbackId,
    label: entity.label || entity.name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    lat,
    lon,
    type: inferResultType(entity.type),
    providerId: entity.id || null,
    location: entity.location || null,
    region,
    country,
    bbox: entity.bbox || null,
  };
}

export function isMapyConfigured() {
  return true;
}

export function getMapyTileUrl(mapset: 'outdoor' | 'basic' | 'winter' | 'aerial' = 'outdoor') {
  if (MAPY_TILE_URL.includes('{z}')) {
    const base = MAPY_TILE_URL.replace('/outdoor/', `/${mapset}/`);
    return MAPY_API_KEY ? `${base}?apikey=${encodeURIComponent(MAPY_API_KEY)}` : base;
  }
  return MAPY_TILE_URL;
}

export function getMapyAttributionText() {
  return MAPY_TILE_ATTRIBUTION;
}

export async function suggestMapyLocations(query: string, locality?: string): Promise<MapySuggestion[]> {
  try {
    const payload = await invokeMapyFunction<unknown>('suggest', { query, locality });
    return extractEntityList(payload)
      .map((entity, index) => normalizeEntity(entity, `${query}-${index}`))
      .filter((item): item is MapySuggestion => Boolean(item));
  } catch {
    const params = new URLSearchParams({ query: query.trim(), lang: 'en', limit: '8', type: 'regional,poi' });
    if (locality) params.set('locality', locality);
    const payload = await fetchJsonWithFallback<unknown>(SUGGEST_ENDPOINTS, params);
    return extractEntityList(payload)
      .map((entity, index) => normalizeEntity(entity, `${query}-${index}`))
      .filter((item): item is MapySuggestion => Boolean(item));
  }
}

export async function geocodeMapyLocation(query: string, locality?: string): Promise<MapySuggestion[]> {
  try {
    const payload = await invokeMapyFunction<unknown>('geocode', { query, locality });
    return extractEntityList(payload)
      .map((entity, index) => normalizeEntity(entity, `${query}-${index}`))
      .filter((item): item is MapySuggestion => Boolean(item));
  } catch {
    const params = new URLSearchParams({ query: query.trim(), lang: 'en', limit: '8', type: 'regional,poi' });
    if (locality) params.set('locality', locality);
    const payload = await fetchJsonWithFallback<unknown>(GEOCODE_ENDPOINTS, params);
    return extractEntityList(payload)
      .map((entity, index) => normalizeEntity(entity, `${query}-${index}`))
      .filter((item): item is MapySuggestion => Boolean(item));
  }
}

export async function reverseGeocodeMapyPoint(lat: number, lon: number): Promise<MapySuggestion | null> {
  try {
    const payload = await invokeMapyFunction<unknown>('reverse_geocode', { lat, lon });
    const entity = extractEntityList(payload)[0];
    return entity ? normalizeEntity(entity, `reverse-${lat}-${lon}`) : null;
  } catch {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: 'en' });
    const payload = await fetchJsonWithFallback<unknown>(REVERSE_ENDPOINTS, params);
    const entity = extractEntityList(payload)[0];
    return entity ? normalizeEntity(entity, `reverse-${lat}-${lon}`) : null;
  }
}

export async function planMapyRoute(input: {
  routeType: MapyRouteType;
  start: TripPlanPoint;
  end: TripPlanPoint;
  waypoints?: TripPlanPoint[];
  avoidHighways?: boolean;
  avoidToll?: boolean;
}): Promise<TripPlanDraft> {
  const payload = await invokeMapyFunction<RouteResponseLike>('route', input as unknown as Record<string, unknown>);
  return {
    provider: 'mapy',
    routeType: input.routeType,
    start: input.start,
    end: input.end,
    waypoints: input.waypoints || [],
    lengthM: payload.length ?? null,
    durationS: payload.duration ?? null,
    geometry: payload.geometry ?? null,
    warnings: [],
    externalUrl: buildMapyExternalRouteUrl({
      routeType: input.routeType,
      start: input.start,
      end: input.end,
      waypoints: input.waypoints || [],
    }),
  };
}

export async function enrichMapyElevation(plan: TripPlanDraft): Promise<TripPlanDraft> {
  const points = sampleGeoJsonGeometry(plan.geometry, 128);
  if (!points.length) return plan;

  try {
    const payload = await invokeMapyFunction<Array<{ position?: [number, number]; elevation?: number }>>('elevation', { coordinates: points.map((p) => [p.lon, p.lat]) });
    const profile = payload
      .filter((item) => item.position && typeof item.elevation === 'number')
      .map((item) => ({ lat: item.position![1], lon: item.position![0], elevation: item.elevation! }));

    let ascentM = 0;
    let descentM = 0;
    for (let i = 1; i < profile.length; i++) {
      const delta = profile[i].elevation - profile[i - 1].elevation;
      if (delta > 0) ascentM += delta;
      if (delta < 0) descentM += Math.abs(delta);
    }

    return {
      ...plan,
      elevationProfile: profile,
      elevationSummary: {
        ascentM: Math.round(ascentM),
        descentM: Math.round(descentM),
      },
    };
  } catch {
    return plan;
  }
}

export function buildMapyExternalRouteUrl(input: {
  routeType: MapyRouteType;
  start: TripPlanPoint;
  end: TripPlanPoint;
  waypoints?: TripPlanPoint[];
}) {
  const params = new URLSearchParams({
    mapset: 'outdoor',
    start: `${input.start.lon},${input.start.lat}`,
    end: `${input.end.lon},${input.end.lat}`,
    routeType: input.routeType,
  });
  if (input.waypoints?.length) {
    params.set('waypoints', input.waypoints.map((p) => `${p.lon},${p.lat}`).join(';'));
  }
  return `https://mapy.com/fnc/v1/route?${params.toString()}`;
}

function sampleGeoJsonGeometry(geometry: unknown, maxPoints: number): Array<{ lat: number; lon: number }> {
  const line = extractLineCoordinates(geometry);
  if (!line.length) return [];
  if (line.length <= maxPoints) return line.map(([lon, lat]) => ({ lat, lon }));
  const step = Math.max(1, Math.floor(line.length / maxPoints));
  const sampled = line.filter((_, index) => index % step === 0);
  if (sampled[sampled.length - 1] !== line[line.length - 1]) sampled.push(line[line.length - 1]);
  return sampled.slice(0, maxPoints).map(([lon, lat]) => ({ lat, lon }));
}

export function extractLineCoordinates(geometry: unknown): [number, number][] {
  if (!geometry) return [];
  const maybe = geometry as Record<string, unknown>;
  if (maybe.type === 'FeatureCollection' && Array.isArray(maybe.features)) {
    for (const feature of maybe.features as any[]) {
      const coords = extractLineCoordinates(feature?.geometry);
      if (coords.length) return coords;
    }
  }
  if (maybe.type === 'Feature' && maybe.geometry) {
    return extractLineCoordinates(maybe.geometry);
  }
  if (maybe.type === 'LineString' && Array.isArray(maybe.coordinates)) {
    return maybe.coordinates as [number, number][];
  }
  if (maybe.type === 'MultiLineString' && Array.isArray(maybe.coordinates) && Array.isArray((maybe.coordinates as any[])[0])) {
    return (maybe.coordinates as [number, number][][]).flat();
  }
  return [];
}
