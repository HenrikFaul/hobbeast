// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ProviderMode = 'aws' | 'geoapify_tomtom' | 'local_catalog' | 'mapy'

type ProviderConfigAction =
  | 'autocomplete'
  | 'geocode'
  | 'reverse'
  | 'get_provider_config'
  | 'get_all_provider_configs'
  | 'save_provider_config'

interface SearchBody {
  action?: ProviderConfigAction
  query?: string
  category?: string
  activityHint?: string
  latitude?: number
  longitude?: number
  lat?: number
  lon?: number
  bias?: { lat?: number; lon?: number }
  radius_km?: number
  open_now?: boolean
  limit?: number
  lenient?: boolean
  provider_mode?: ProviderMode
  group?: 'default' | 'personal' | 'venue' | 'trip_planner'
  provider?: ProviderMode
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
  categories?: string[]
  address?: string
  city?: string
  district?: string
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
  match_type?: 'query' | 'nearby' | 'local'
}


function normalizeInternalUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function resolveInternalSupabaseUrl(request: Request) {
  const requestOrigin = normalizeInternalUrl(new URL(request.url).origin)
  if (requestOrigin) {
    try {
      const hostname = new URL(requestOrigin).hostname
      if (/\.supabase\.co$/i.test(hostname)) {
        return requestOrigin
      }
    } catch {
      // ignore invalid URL and fall back to env
    }
  }

  const envUrl = normalizeInternalUrl(Deno.env.get('SUPABASE_URL'))
  if (envUrl) return envUrl

  throw new Error('Missing internal Supabase project URL')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bodyCenter(body: SearchBody): Coordinates | null {
  if (Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude))) {
    return { latitude: Number(body.latitude), longitude: Number(body.longitude) }
  }
  if (Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lon))) {
    return { latitude: Number(body.lat), longitude: Number(body.lon) }
  }
  if (Number.isFinite(Number(body.bias?.lat)) && Number.isFinite(Number(body.bias?.lon))) {
    return { latitude: Number(body.bias?.lat), longitude: Number(body.bias?.lon) }
  }
  return null
}


const PROVIDER_CONFIG_KEY_PREFIX = 'address_search'
const PROVIDER_GROUPS = ['default', 'personal', 'venue', 'trip_planner'] as const
type ProviderConfigGroup = typeof PROVIDER_GROUPS[number]

function configKey(group: ProviderConfigGroup = 'default') {
  return group === 'default' ? PROVIDER_CONFIG_KEY_PREFIX : `${PROVIDER_CONFIG_KEY_PREFIX}:${group}`
}

function normalizeProviderConfigValue(value: unknown): ProviderMode {
  if (value === 'aws' || value === 'geoapify_tomtom' || value === 'local_catalog' || value === 'mapy') return value
  return 'geoapify_tomtom'
}

function normalizeProviderModeForSearch(value: ProviderMode): 'geoapify_tomtom' | 'local_catalog' {
  return value === 'local_catalog' ? 'local_catalog' : 'geoapify_tomtom'
}

async function getProviderConfigRow(supabaseUrl: string, serviceRoleKey: string, key: string) {
  const response = await restFetch(`${supabaseUrl}/rest/v1/app_runtime_config?key=eq.${encodeURIComponent(key)}&select=key,provider&limit=1`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })
  const rows = await response.json()
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

async function getProviderConfigValue(supabaseUrl: string, serviceRoleKey: string, group: ProviderConfigGroup) {
  const specific = await getProviderConfigRow(supabaseUrl, serviceRoleKey, configKey(group)).catch(() => null)
  if (specific?.provider) return normalizeProviderConfigValue(specific.provider)
  if (group !== 'default') {
    const fallback = await getProviderConfigRow(supabaseUrl, serviceRoleKey, configKey('default')).catch(() => null)
    if (fallback?.provider) return normalizeProviderConfigValue(fallback.provider)
  }
  return 'geoapify_tomtom'
}

async function getAllProviderConfigValues(supabaseUrl: string, serviceRoleKey: string) {
  const values = {} as Record<ProviderConfigGroup, ProviderMode>
  for (const group of PROVIDER_GROUPS) {
    values[group] = await getProviderConfigValue(supabaseUrl, serviceRoleKey, group)
  }
  return values
}

async function saveProviderConfigValue(
  supabaseUrl: string,
  serviceRoleKey: string,
  group: ProviderConfigGroup,
  provider: ProviderMode,
) {
  const response = await restFetch(`${supabaseUrl}/rest/v1/app_runtime_config?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([
      {
        key: configKey(group),
        provider,
        options: {},
      },
    ]),
  })
  const rows = await response.json()
  return Array.isArray(rows) && rows[0]?.provider ? normalizeProviderConfigValue(rows[0].provider) : provider
}

function normalizeCategory(category?: string, activityHint?: string) {
  const lower = `${category || ''} ${activityHint || ''}`.toLowerCase()
  if (/(restaurant|étterem|food|drink|gasztro)/.test(lower)) return 'restaurant'
  if (/(cafe|kávé|coffee)/.test(lower)) return 'cafe'
  if (/(bar|bár|nightlife|cocktail)/.test(lower)) return 'bar'
  if (/(pub|board game|tarsas|társas|game|jatek|játék)/.test(lower)) return 'pub'
  if (/(entertainment|music|concert|show)/.test(lower)) return 'entertainment'
  if (/(leisure|sport|fitness|outdoor|hike|tura|túra)/.test(lower)) return 'leisure'
  return 'venue'
}

function geoapifyCategoryFilter(category?: string, activityHint?: string) {
  const normalized = normalizeCategory(category, activityHint)
  if (normalized === 'restaurant') return 'catering.restaurant,catering.cafe,catering.bar,catering.pub'
  if (normalized === 'cafe') return 'catering.cafe,catering.restaurant'
  if (normalized === 'bar') return 'catering.bar,catering.pub'
  if (normalized === 'entertainment') return 'entertainment'
  if (normalized === 'leisure') return 'leisure,sport'
  return 'catering.restaurant,catering.cafe,catering.bar,catering.pub,entertainment,leisure'
}

function tomTomQuery(category?: string, activityHint?: string) {
  const normalized = normalizeCategory(category, activityHint)
  if (normalized === 'restaurant') return 'restaurant'
  if (normalized === 'cafe') return 'cafe'
  if (normalized === 'bar') return 'bar'
  if (normalized === 'entertainment') return 'entertainment'
  if (normalized === 'leisure') return 'leisure'
  return 'pub'
}

function textMatchesQuery(row: ProviderPlace, query?: string) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [row.name, row.address, row.city, row.category, ...(row.categories || [])]
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
  if (row.match_type === 'local') score += 25
  if (typeof row.rating === 'number') score += Math.min(row.rating, 5) * 2
  if (typeof row.distance_km === 'number') score += Math.max(0, 30 - row.distance_km)
  if (!row.distance_km && center && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    score += Math.max(0, 30 - haversineKm(center.latitude, center.longitude, row.latitude, row.longitude))
  }
  return score
}

async function restFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return response
}

async function resolveProviderMode(supabaseUrl: string, serviceRoleKey: string, requested?: ProviderMode): Promise<'geoapify_tomtom' | 'local_catalog'> {
  if (requested) return normalizeProviderModeForSearch(requested)
  try {
    const provider = await getProviderConfigValue(supabaseUrl, serviceRoleKey, 'default')
    return normalizeProviderModeForSearch(provider)
  } catch {
    return 'geoapify_tomtom'
  }
}

async function searchLocalCatalog(supabaseUrl: string, serviceRoleKey: string, body: SearchBody) {
  const response = await restFetch(`${supabaseUrl}/rest/v1/rpc/search_local_places`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_query: body.query?.trim() || null,
      p_category: normalizeCategory(body.category, body.activityHint),
      p_lat: bodyCenter(body)?.latitude ?? null,
      p_lon: bodyCenter(body)?.longitude ?? null,
      p_radius_km: body.radius_km ?? 40,
      p_limit: body.limit ?? 24,
    }),
  })
  const rows = await response.json()
  return Array.isArray(rows) ? rows : []
}

async function geocodeGeoapify(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&filter=countrycode:hu&limit=1&apiKey=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const payload = await response.json()
  const feature = payload.features?.[0]
  if (!feature?.properties) return null
  return { latitude: Number(feature.properties.lat), longitude: Number(feature.properties.lon) }
}

async function geocodeTomTom(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?countrySet=HU&limit=1&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const payload = await response.json()
  const row = payload.results?.[0]
  if (!row?.position) return null
  return { latitude: Number(row.position.lat), longitude: Number(row.position.lon) }
}

async function searchGeoapifyNearby(params: SearchBody, apiKey: string, center: Coordinates): Promise<ProviderPlace[]> {
  const categories = geoapifyCategoryFilter(params.category, params.activityHint)
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}&filter=${encodeURIComponent(`circle:${center.longitude},${center.latitude},${radius}`)}&bias=${encodeURIComponent(`proximity:${center.longitude},${center.latitude}`)}&limit=${Math.min(params.limit || 24, 50)}&apiKey=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => ({
    provider: 'geoapify',
    external_id: String(feature.properties.place_id),
    name: String(feature.properties.name || feature.properties.address_line1 || 'Helyszín'),
    category: normalizeCategory(params.category, params.activityHint),
    categories: Array.isArray(feature.properties.categories) ? feature.properties.categories : [],
    address: feature.properties.formatted,
    city: feature.properties.city,
    district: feature.properties.county || feature.properties.district,
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
  const categories = geoapifyCategoryFilter(params.category, params.activityHint)
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const parts = [
    `categories=${encodeURIComponent(categories)}`,
    `name=${encodeURIComponent(trimmedQuery)}`,
    `limit=${Math.min(params.limit || 24, 50)}`,
    `apiKey=${apiKey}`,
  ]
  if (center) {
    parts.push(`filter=${encodeURIComponent(`circle:${center.longitude},${center.latitude},${radius}`)}`)
    parts.push(`bias=${encodeURIComponent(`proximity:${center.longitude},${center.latitude}`)}`)
  } else {
    parts.push(`filter=${encodeURIComponent('rect:16.1,45.7,22.95,48.62')}`)
  }
  const response = await fetch(`https://api.geoapify.com/v2/places?${parts.join('&')}`)
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => ({
    provider: 'geoapify',
    external_id: String(feature.properties.place_id),
    name: String(feature.properties.name || feature.properties.address_line1 || 'Helyszín'),
    category: normalizeCategory(params.category, params.activityHint),
    categories: Array.isArray(feature.properties.categories) ? feature.properties.categories : [],
    address: feature.properties.formatted,
    city: feature.properties.city,
    district: feature.properties.county || feature.properties.district,
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
  const url = new URL(`https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(trimmedQuery)}.json`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrySet', 'HU')
  url.searchParams.set('limit', String(Math.min(params.limit || 24, 50)))
  if (center) {
    url.searchParams.set('lat', String(center.latitude))
    url.searchParams.set('lon', String(center.longitude))
    url.searchParams.set('radius', String(radius))
  }
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: String(result.id),
    name: String(result.poi?.name || 'Helyszín'),
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
    match_type: 'query',
    metadata: result,
  }))
}

async function searchTomTomNearby(params: SearchBody, apiKey: string, center: Coordinates): Promise<ProviderPlace[]> {
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const url = new URL(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(tomTomQuery(params.category, params.activityHint))}.json`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrySet', 'HU')
  url.searchParams.set('limit', String(Math.min(params.limit || 24, 50)))
  url.searchParams.set('lat', String(center.latitude))
  url.searchParams.set('lon', String(center.longitude))
  url.searchParams.set('radius', String(radius))
  url.searchParams.set('openingHours', 'nextSevenDays')
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: String(result.id),
    name: String(result.poi?.name || 'Helyszín'),
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
    match_type: 'nearby',
    metadata: result,
  }))
}

async function cacheRemoteRows(supabaseUrl: string, serviceRoleKey: string, rows: ProviderPlace[]) {
  if (rows.length === 0) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/places_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(
        rows.map((row) => ({
          cache_key: `${row.provider}:${row.external_id}`,
          provider: row.provider,
          response_data: row,
          expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        }))
      ),
    })
  } catch {
    // no-op
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = (await request.json().catch(() => ({}))) as SearchBody
    const trimmedQuery = String(body.query || '').trim()
    const explicitCenter = bodyCenter(body)
    const limit = Math.min(Math.max(Number(body.limit || 24), 1), 48)

    const action = body.action || 'autocomplete'

    if (action !== 'get_provider_config' && action !== 'get_all_provider_configs' && action !== 'save_provider_config' && !explicitCenter && !trimmedQuery) {
      return json({ results: [], error: 'query or coordinates are required', debug: { raw_candidate_count: 0 } }, 400)
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = resolveInternalSupabaseUrl(request)
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ results: [], error: 'Missing Supabase service env', debug: { raw_candidate_count: 0 } }, 500)
    }

    const requestedGroup = (body.group || 'default') as ProviderConfigGroup

    if (action === 'get_provider_config') {
      const provider = await getProviderConfigValue(supabaseUrl, serviceRoleKey, requestedGroup)
      return json({ group: requestedGroup, provider })
    }

    if (action === 'get_all_provider_configs') {
      const providers = await getAllProviderConfigValues(supabaseUrl, serviceRoleKey)
      return json({ providers })
    }

    if (action === 'save_provider_config') {
      if (!body.provider) return json({ error: 'provider is required' }, 400)
      const provider = await saveProviderConfigValue(
        supabaseUrl,
        serviceRoleKey,
        requestedGroup,
        normalizeProviderConfigValue(body.provider),
      )
      return json({ group: requestedGroup, provider })
    }

    const providerMode = await resolveProviderMode(supabaseUrl, serviceRoleKey, body.provider_mode)

    const localRows = await searchLocalCatalog(supabaseUrl, serviceRoleKey, body)
    const normalizedLocal = localRows.map((row: any) => ({
      ...row,
      provider: row.provider || 'local_catalog',
      match_type: 'local',
    })) as ProviderPlace[]

    if (providerMode === 'local_catalog') {
      const scoredLocal = normalizedLocal
        .map((row) => ({ ...row, score: scoreRow(row, trimmedQuery, explicitCenter) + 100 }))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit)
      return json({
        results: scoredLocal,
        debug: {
          provider_mode: providerMode,
          raw_candidate_count: normalizedLocal.length,
          strict_match_count: normalizedLocal.length,
          returned_count: scoredLocal.length,
          used_lenient_mode: false,
          resolved_center: explicitCenter,
        },
      })
    }

    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY') || ''
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY') || ''

    let resolvedCenter = explicitCenter
    if (!resolvedCenter && trimmedQuery) {
      resolvedCenter = (geoapifyKey ? await geocodeGeoapify(trimmedQuery, geoapifyKey) : null) || (tomtomKey ? await geocodeTomTom(trimmedQuery, tomtomKey) : null)
    }

    const [geoByName, tomtomByName, geoNearby, tomtomNearby] = await Promise.all([
      trimmedQuery && geoapifyKey ? searchGeoapifyByName({ ...body, limit }, geoapifyKey, explicitCenter || resolvedCenter, trimmedQuery) : Promise.resolve([]),
      trimmedQuery && tomtomKey ? searchTomTomByName({ ...body, limit }, tomtomKey, explicitCenter || resolvedCenter, trimmedQuery) : Promise.resolve([]),
      resolvedCenter && geoapifyKey ? searchGeoapifyNearby({ ...body, limit }, geoapifyKey, resolvedCenter) : Promise.resolve([]),
      resolvedCenter && tomtomKey ? searchTomTomNearby({ ...body, limit }, tomtomKey, resolvedCenter) : Promise.resolve([]),
    ])

    const rawCandidates = dedupe([...normalizedLocal, ...geoByName, ...tomtomByName, ...geoNearby, ...tomtomNearby]).map((row) => ({
      ...row,
      distance_km:
        typeof row.distance_km === 'number'
          ? row.distance_km
          : resolvedCenter && typeof row.latitude === 'number' && typeof row.longitude === 'number'
            ? haversineKm(resolvedCenter.latitude, resolvedCenter.longitude, row.latitude, row.longitude)
            : undefined,
    }))

    let merged = rawCandidates.map((row) => ({
      ...row,
      score: scoreRow(row, trimmedQuery, resolvedCenter) + (row.match_type === 'local' ? 100 : 0),
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

    await cacheRemoteRows(supabaseUrl, serviceRoleKey, finalResults)

    return json({
      results: finalResults,
      debug: {
        provider_mode: providerMode,
        raw_candidate_count: rawCandidates.length,
        strict_match_count: strictMatches.length,
        returned_count: finalResults.length,
        used_lenient_mode: Boolean(body.lenient) || (strictMatches.length === 0 && merged.length > 0),
        resolved_center: resolvedCenter,
        local_candidate_count: normalizedLocal.length,
      },
    })
  } catch (error) {
    return json({ results: [], error: String(error), debug: { raw_candidate_count: 0 } }, 500)
  }
})
