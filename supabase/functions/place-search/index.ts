// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchBody {
  query?: string
  category?: string
  latitude?: number
  longitude?: number
  radius_km?: number
  open_now?: boolean
  limit?: number
  lenient?: boolean
}

interface Coordinates {
  latitude: number
  longitude: number
}

interface ProviderPlace {
  provider: string
  external_id: string
  name: string
  category?: string
  address?: string
  city?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  distance_km?: number
  rating?: number
  review_count?: number
  image_url?: string | null
  phone?: string | null
  website?: string | null
  open_now?: boolean
  opening_hours_text?: string[]
  metadata?: Record<string, unknown>
  score?: number
  match_type?: 'query' | 'nearby'
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeCategory(category?: string) {
  const lower = String(category || '').toLowerCase()
  if (lower.includes('restaurant') || lower.includes('étterem')) return 'restaurant'
  if (lower.includes('cafe') || lower.includes('kávé')) return 'cafe'
  if (lower.includes('bar') || lower.includes('bár')) return 'bar'
  return 'pub'
}

function geoapifyCategoryFilter(category?: string) {
  const normalized = normalizeCategory(category)
  if (normalized === 'restaurant') return 'catering.restaurant'
  if (normalized === 'cafe') return 'catering.cafe'
  if (normalized === 'bar') return 'catering.bar'
  return 'catering.pub,catering.bar'
}

function tomTomCategoryQuery(category?: string) {
  const normalized = normalizeCategory(category)
  if (normalized === 'restaurant') return 'restaurant'
  if (normalized === 'cafe') return 'cafe'
  if (normalized === 'bar') return 'bar'
  return 'pub'
}

function textMatchesQuery(row: ProviderPlace, query?: string) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [row.name, row.address, row.city, row.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalizedQuery)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function dedupe(results: ProviderPlace[]) {
  const seen = new Map<string, ProviderPlace>()
  for (const row of results) {
    const key = `${row.name}|${row.address || ''}|${Math.round((row.latitude || 0) * 1000)}|${Math.round((row.longitude || 0) * 1000)}`.toLowerCase()
    const current = seen.get(key)
    if (!current || (row.score || 0) > (current.score || 0)) {
      seen.set(key, row)
    }
  }
  return Array.from(seen.values())
}

function scoreRow(row: ProviderPlace, query: string, center?: Coordinates | null) {
  let score = 0
  if (query && textMatchesQuery(row, query)) score += 100
  if (row.match_type === 'query') score += 40
  if (typeof row.rating === 'number') score += Math.min(row.rating, 5) * 2
  if (typeof row.distance_km === 'number') score += Math.max(0, 30 - row.distance_km)
  if (!row.distance_km && center && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    score += Math.max(0, 30 - haversineKm(center.latitude, center.longitude, row.latitude, row.longitude))
  }
  return score
}

async function geocodeGeoapify(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=1&apiKey=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const payload = await response.json()
  const feature = payload.features?.[0]
  if (!feature?.properties) return null
  return {
    latitude: Number(feature.properties.lat),
    longitude: Number(feature.properties.lon),
  }
}

async function geocodeTomTom(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?limit=1&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const payload = await response.json()
  const row = payload.results?.[0]
  if (!row?.position) return null
  return {
    latitude: Number(row.position.lat),
    longitude: Number(row.position.lon),
  }
}

async function searchGeoapifyNearby(params: SearchBody, apiKey: string, center: Coordinates): Promise<ProviderPlace[]> {
  const category = normalizeCategory(params.category)
  const categories = geoapifyCategoryFilter(params.category)
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${center.longitude},${center.latitude},${radius}&bias=proximity:${center.longitude},${center.latitude}&limit=${params.limit || 24}&apiKey=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => ({
    provider: 'geoapify',
    external_id: feature.properties.place_id,
    name: feature.properties.name || feature.properties.address_line1 || 'Helyszín',
    category,
    address: feature.properties.formatted,
    city: feature.properties.city,
    postal_code: feature.properties.postcode,
    latitude: feature.properties.lat,
    longitude: feature.properties.lon,
    website: feature.properties.website,
    phone: feature.properties.contact?.phone,
    open_now: typeof feature.properties.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : undefined,
    opening_hours_text: Array.isArray(feature.properties.opening_hours?.text) ? feature.properties.opening_hours.text : [],
    image_url: feature.properties.datasource?.raw?.image || null,
    rating: feature.properties.datasource?.raw?.rating || null,
    match_type: 'nearby',
    metadata: feature.properties,
  }))
}

async function searchGeoapifyByName(params: SearchBody, apiKey: string, center?: Coordinates | null, query?: string): Promise<ProviderPlace[]> {
  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) return []
  const category = normalizeCategory(params.category)
  const categories = geoapifyCategoryFilter(params.category)
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const spatial = center
    ? `&filter=circle:${center.longitude},${center.latitude},${radius}&bias=proximity:${center.longitude},${center.latitude}`
    : ''
  const url = `https://api.geoapify.com/v2/places?categories=${categories}&name=${encodeURIComponent(trimmedQuery)}${spatial}&limit=${params.limit || 24}&apiKey=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => ({
    provider: 'geoapify',
    external_id: feature.properties.place_id,
    name: feature.properties.name || feature.properties.address_line1 || 'Helyszín',
    category,
    address: feature.properties.formatted,
    city: feature.properties.city,
    postal_code: feature.properties.postcode,
    latitude: feature.properties.lat,
    longitude: feature.properties.lon,
    website: feature.properties.website,
    phone: feature.properties.contact?.phone,
    open_now: typeof feature.properties.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : undefined,
    opening_hours_text: Array.isArray(feature.properties.opening_hours?.text) ? feature.properties.opening_hours.text : [],
    image_url: feature.properties.datasource?.raw?.image || null,
    rating: feature.properties.datasource?.raw?.rating || null,
    match_type: 'query',
    metadata: feature.properties,
  }))
}

async function searchTomTomByName(params: SearchBody, apiKey: string, center?: Coordinates | null, textQuery?: string): Promise<ProviderPlace[]> {
  const trimmedQuery = String(textQuery || '').trim()
  if (!trimmedQuery) return []
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const locationPart = center ? `lat=${center.latitude}&lon=${center.longitude}&radius=${radius}&` : ''
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(trimmedQuery)}.json?${locationPart}limit=${params.limit || 24}&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: result.id,
    name: result.poi?.name || 'Helyszín',
    category: result.poi?.classifications?.[0]?.code || tomTomCategoryQuery(params.category),
    address: result.address?.freeformAddress,
    city: result.address?.municipality,
    postal_code: result.address?.postalCode,
    latitude: result.position?.lat,
    longitude: result.position?.lon,
    website: result.poi?.url,
    phone: result.poi?.phone,
    distance_km: typeof result.dist === 'number' ? result.dist / 1000 : undefined,
    match_type: 'query',
    metadata: result,
  }))
}

async function searchTomTomNearby(params: SearchBody, apiKey: string, center: Coordinates): Promise<ProviderPlace[]> {
  const categoryQuery = tomTomCategoryQuery(params.category)
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(categoryQuery)}.json?lat=${center.latitude}&lon=${center.longitude}&radius=${radius}&limit=${params.limit || 24}&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: result.id,
    name: result.poi?.name || 'Helyszín',
    category: result.poi?.classifications?.[0]?.code || categoryQuery,
    address: result.address?.freeformAddress,
    city: result.address?.municipality,
    postal_code: result.address?.postalCode,
    latitude: result.position?.lat,
    longitude: result.position?.lon,
    website: result.poi?.url,
    phone: result.poi?.phone,
    distance_km: typeof result.dist === 'number' ? result.dist / 1000 : undefined,
    match_type: 'nearby',
    metadata: result,
  }))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = (await request.json()) as SearchBody
    const trimmedQuery = String(body.query || '').trim()
    const hasCoords = Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude))
    const explicitCenter = hasCoords ? { latitude: Number(body.latitude), longitude: Number(body.longitude) } : null

    if (!explicitCenter && !trimmedQuery) {
      return json({ results: [], error: 'query or coordinates are required', debug: { raw_candidate_count: 0 } }, 400)
    }

    const limit = Math.min(Math.max(Number(body.limit || 24), 1), 48)
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY') || ''
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY') || ''

    let resolvedCenter = explicitCenter
    if (!resolvedCenter && trimmedQuery) {
      resolvedCenter =
        (geoapifyKey ? await geocodeGeoapify(trimmedQuery, geoapifyKey) : null) ||
        (tomtomKey ? await geocodeTomTom(trimmedQuery, tomtomKey) : null)
    }

    const [geoByName, tomtomByName, geoNearby, tomtomNearby] = await Promise.all([
      trimmedQuery && geoapifyKey ? searchGeoapifyByName({ ...body, limit }, geoapifyKey, explicitCenter || resolvedCenter, trimmedQuery) : Promise.resolve([]),
      trimmedQuery && tomtomKey ? searchTomTomByName({ ...body, limit }, tomtomKey, explicitCenter || resolvedCenter, trimmedQuery) : Promise.resolve([]),
      resolvedCenter && geoapifyKey ? searchGeoapifyNearby({ ...body, limit }, geoapifyKey, resolvedCenter) : Promise.resolve([]),
      resolvedCenter && tomtomKey ? searchTomTomNearby({ ...body, limit }, tomtomKey, resolvedCenter) : Promise.resolve([]),
    ])

    const rawCandidates = dedupe([...geoByName, ...tomtomByName, ...geoNearby, ...tomtomNearby]).map((row) => {
      const distance =
        typeof row.distance_km === 'number'
          ? row.distance_km
          : resolvedCenter && typeof row.latitude === 'number' && typeof row.longitude === 'number'
            ? haversineKm(resolvedCenter.latitude, resolvedCenter.longitude, row.latitude, row.longitude)
            : undefined
      return {
        ...row,
        distance_km: distance,
      }
    })

    let merged = rawCandidates.map((row) => ({
      ...row,
      score: scoreRow(row, trimmedQuery, resolvedCenter),
    }))

    if (body.open_now) {
      merged = merged.filter((row) => row.open_now !== false)
    }

    const strictMatches = trimmedQuery
      ? merged.filter((row) => textMatchesQuery(row, trimmedQuery))
      : merged

    const finalResults = (strictMatches.length > 0 && !body.lenient ? strictMatches : merged)
      .sort((left, right) => {
        const scoreDelta = (right.score || 0) - (left.score || 0)
        if (scoreDelta !== 0) return scoreDelta
        const leftDistance = typeof left.distance_km === 'number' ? left.distance_km : Number.MAX_SAFE_INTEGER
        const rightDistance = typeof right.distance_km === 'number' ? right.distance_km : Number.MAX_SAFE_INTEGER
        if (leftDistance !== rightDistance) return leftDistance - rightDistance
        return (right.rating || 0) - (left.rating || 0)
      })
      .slice(0, limit)

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    if (serviceRoleKey && supabaseUrl && finalResults.length > 0) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/places_cache?on_conflict=provider,external_id`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(
            finalResults.map((row) => ({
              provider: row.provider,
              external_id: row.external_id,
              name: row.name,
              category: row.category,
              address: row.address,
              city: row.city,
              postal_code: row.postal_code,
              latitude: row.latitude,
              longitude: row.longitude,
              rating: row.rating,
              image_url: row.image_url,
              metadata: row.metadata || {},
              updated_at: new Date().toISOString(),
            }))
          ),
        })
      } catch {
        // cache write should not block search results
      }
    }

    return json({
      results: finalResults,
      debug: {
        raw_candidate_count: rawCandidates.length,
        strict_match_count: strictMatches.length,
        returned_count: finalResults.length,
        used_lenient_mode: Boolean(body.lenient) || (strictMatches.length === 0 && merged.length > 0),
        resolved_center: resolvedCenter,
      },
    })
  } catch (error) {
    return json({ results: [], error: String(error), debug: { raw_candidate_count: 0 } }, 500)
  }
})
