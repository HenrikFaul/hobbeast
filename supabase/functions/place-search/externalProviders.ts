import type { SearchBody } from './requestContract.ts'
import { fetchProviderJson, HttpError } from './runtime.ts'
import {
  bodyCenter,
  deriveStableProviderId,
  geoapifyCategoryFilter,
  normalizeCategory,
  postgrestSafe,
  rankExternalPlaces,
  tomTomQuery,
} from './normalization.ts'
import type { Coordinates, ProviderPlace } from './types.ts'

interface GeoapifyFeature {
  geometry?: { coordinates?: unknown[] }
  properties?: Record<string, unknown> & {
    place_id?: unknown
    datasource?: { raw?: { osm_id?: unknown } }
    name?: unknown
    address_line1?: unknown
    address_line2?: unknown
    categories?: unknown
    formatted?: unknown
    city?: unknown
    town?: unknown
    village?: unknown
    district?: unknown
    suburb?: unknown
    county?: unknown
    postcode?: unknown
    website?: unknown
    contact?: { phone?: unknown }
    phone?: unknown
    distance?: unknown
  }
}

interface TomTomResult {
  id?: unknown
  dist?: unknown
  position?: { lat?: number; lon?: number }
  address?: {
    freeformAddress?: string
    municipality?: string
    municipalitySubdivision?: string
    countrySecondarySubdivision?: string
    postalCode?: string
  }
  poi?: {
    name?: string
    categories?: unknown
    classifications?: Array<{ code?: string }>
    url?: string
    phone?: string
  }
  [key: string]: unknown
}

export interface ExternalProviderKeys {
  geoapifyKey: string
  tomtomKey: string
}

export type ProviderJsonFetcher = <T>(url: string, timeoutMs?: number) => Promise<T | null>

function indexZero(value: unknown) {
  if (Array.isArray(value)) return value[0]
  if (typeof value === 'string') return value[0]
  if (value && typeof value === 'object') return (value as Record<number, unknown>)[0]
  return undefined
}

export async function geocodeGeoapify(
  query: string,
  apiKey: string,
  fetchJson: ProviderJsonFetcher = fetchProviderJson,
): Promise<Coordinates | null> {
  const url = new URL('https://api.geoapify.com/v1/geocode/search')
  url.searchParams.set('text', query)
  url.searchParams.set('filter', 'countrycode:hu')
  url.searchParams.set('limit', '1')
  url.searchParams.set('apiKey', apiKey)
  const payload = await fetchJson<{ features?: GeoapifyFeature[] }>(url.toString())
  if (!payload) return null
  const feature = payload.features?.[0]
  const lon = feature?.geometry?.coordinates?.[0]
  const lat = feature?.geometry?.coordinates?.[1]
  return typeof lat === 'number' && typeof lon === 'number' ? { latitude: lat, longitude: lon } : null
}

export async function searchGeoapify(
  params: SearchBody,
  apiKey: string,
  center: Coordinates | null,
  query: string,
  fetchJson: ProviderJsonFetcher = fetchProviderJson,
): Promise<ProviderPlace[]> {
  const url = new URL('https://api.geoapify.com/v2/places')
  url.searchParams.set('categories', geoapifyCategoryFilter(params.category, params.activityHint))
  url.searchParams.set('filter', center ? `circle:${center.longitude},${center.latitude},${Math.max(1, params.radius_km || 10) * 1000}` : 'countrycode:hu')
  if (query) url.searchParams.set('name', query)
  if (center) url.searchParams.set('bias', `proximity:${center.longitude},${center.latitude}`)
  url.searchParams.set('limit', String(Math.min(Number(params.limit || 24), 50)))
  url.searchParams.set('apiKey', apiKey)
  const payload = await fetchJson<{ features?: GeoapifyFeature[] }>(url.toString())
  if (!payload) return []
  return (payload.features || []).map((feature) => {
    const p = feature.properties || {}
    return {
      provider: 'geoapify',
      external_id: String(p.place_id || p.datasource?.raw?.osm_id || deriveStableProviderId(
        'geoapify', p.name, p.formatted, p.city, feature.geometry?.coordinates?.[1], feature.geometry?.coordinates?.[0],
      )),
      name: String(p.name || p.address_line1 || 'Helyszín'),
      category: indexZero(p.categories) || normalizeCategory(params.category, params.activityHint),
      categories: Array.isArray(p.categories) ? p.categories : [],
      address: p.formatted || p.address_line2 || p.address_line1,
      city: p.city || p.town || p.village,
      district: p.district || p.suburb || p.county,
      postal_code: p.postcode,
      latitude: feature.geometry?.coordinates?.[1],
      longitude: feature.geometry?.coordinates?.[0],
      website: p.website,
      phone: p.contact?.phone || p.phone,
      distance_km: typeof p.distance === 'number' ? p.distance / 1000 : undefined,
      match_type: query ? 'query' : 'nearby',
      metadata: p,
    } as ProviderPlace
  })
}

export async function searchTomTom(
  params: SearchBody,
  apiKey: string,
  center: Coordinates | null,
  query: string,
  fetchJson: ProviderJsonFetcher = fetchProviderJson,
): Promise<ProviderPlace[]> {
  const url = query
    ? new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`)
    : new URL(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(tomTomQuery(params.category, params.activityHint))}.json`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrySet', 'HU')
  url.searchParams.set('limit', String(Math.min(Number(params.limit || 24), 50)))
  if (center) {
    url.searchParams.set('lat', String(center.latitude))
    url.searchParams.set('lon', String(center.longitude))
    url.searchParams.set('radius', String(Math.max(1, params.radius_km || 10) * 1000))
  }
  const payload = await fetchJson<{ results?: TomTomResult[] }>(url.toString())
  if (!payload) return []
  return (payload.results || []).map((result) => ({
    provider: 'tomtom',
    external_id: String(result.id || deriveStableProviderId(
      'tomtom', result.poi?.name, result.address?.freeformAddress,
      result.address?.municipality, result.position?.lat, result.position?.lon,
    )),
    name: String(result.poi?.name || result.address?.freeformAddress || 'Helyszín'),
    category: result.poi?.classifications?.[0]?.code || tomTomQuery(params.category, params.activityHint),
    categories: Array.isArray(result.poi?.categories) ? result.poi.categories : [],
    address: result.address?.freeformAddress,
    city: result.address?.municipality,
    district: result.address?.municipalitySubdivision || result.address?.countrySecondarySubdivision,
    postal_code: result.address?.postalCode,
    latitude: result.position?.lat,
    longitude: result.position?.lon,
    website: result.poi?.url,
    phone: result.poi?.phone,
    distance_km: typeof result.dist === 'number' ? result.dist / 1000 : undefined,
    match_type: query ? 'query' : 'nearby',
    metadata: result,
  }))
}

export async function searchExternalProviders(
  params: SearchBody,
  keys: ExternalProviderKeys,
  fetchJson: ProviderJsonFetcher = fetchProviderJson,
): Promise<{ results: ProviderPlace[]; debug: Record<string, unknown> }> {
  const query = postgrestSafe(params.query || '')
  const center = bodyCenter(params) || (query ? await geocodeGeoapify(query, keys.geoapifyKey, fetchJson) : null)
  if (!query && !center) throw new HttpError('query or coordinates are required', 400)

  const [geoapify, tomtom] = await Promise.all([
    keys.geoapifyKey ? searchGeoapify(params, keys.geoapifyKey, center, query, fetchJson).catch(() => []) : Promise.resolve([]),
    keys.tomtomKey ? searchTomTom(params, keys.tomtomKey, center, query, fetchJson).catch(() => []) : Promise.resolve([]),
  ])

  const results = rankExternalPlaces(
    [...geoapify, ...tomtom],
    query,
    center,
    Math.min(Number(params.limit || 24), 80),
  )

  return {
    results,
    debug: {
      provider_mode: 'geoapify_tomtom',
      query,
      center,
      geoapify_count: geoapify.length,
      tomtom_count: tomtom.length,
    },
  }
}

