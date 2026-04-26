// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type DbProviderMode = `db:${string}`
type BaseProviderMode = 'aws' | 'geoapify_tomtom' | 'mapy'
type ProviderMode = BaseProviderMode | DbProviderMode

type ProviderConfigAction =
  | 'autocomplete'
  | 'geocode'
  | 'reverse'
  | 'get_provider_config'
  | 'get_all_provider_configs'
  | 'save_provider_config'
  | 'get_db_table_config'
  | 'save_db_table_config'
  | 'test_db_table_query'

interface SearchBody {
  action?: ProviderConfigAction
  query?: string
  category?: string
  activityHint?: string
  city?: string
  table?: GeodataTableName
  label?: string
  tables?: DbSearchTableConfig[]
  latitude?: number
  longitude?: number
  lat?: number
  lon?: number
  bias?: { lat?: number; lon?: number }
  radius_km?: number
  open_now?: boolean
  limit?: number
  lenient?: boolean
  provider_mode?: ProviderMode | string
  group?: ProviderConfigGroup
  provider?: ProviderMode | string
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
  email?: string | null
  open_now?: boolean
  opening_hours_text?: string[]
  metadata?: Record<string, unknown>
  score?: number
  match_type?: 'query' | 'nearby' | 'db'
}

const PROVIDER_CONFIG_KEY_PREFIX = 'address_search'
const PROVIDER_GROUPS = ['default', 'personal', 'venue', 'trip_planner'] as const
type ProviderConfigGroup = typeof PROVIDER_GROUPS[number]

const DB_TABLE_CONFIG_KEY = `${PROVIDER_CONFIG_KEY_PREFIX}:db_tables`
const GEODATA_DEFAULT_URL = 'https://buuoyyfzincmbxafvihc.supabase.co'
const GEODATA_ALLOWED_TABLES = ['public.unified_pois', 'public.local_pois', 'public.geoapify_pois'] as const
type GeodataTableName = typeof GEODATA_ALLOWED_TABLES[number]

interface DbSearchTableConfig {
  id: string
  provider: DbProviderMode
  label: string
  table: GeodataTableName
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

const GEODATA_AVAILABLE_TABLES = [
  { value: 'public.unified_pois', label: 'public.unified_pois', description: 'Egységesített, deduplikált POI tábla — venue kereséshez ajánlott első választás.' },
  { value: 'public.local_pois', label: 'public.local_pois', description: 'Lokális forrásokból egységesített POI tábla, gazdag cím- és szolgáltatásmezőkkel.' },
  { value: 'public.geoapify_pois', label: 'public.geoapify_pois', description: 'Nyers/forrásközeli Geoapify POI tábla, részletes provider metaadatokkal.' },
] as const

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

async function restFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return response
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

function configKey(group: ProviderConfigGroup = 'default') {
  return group === 'default' ? PROVIDER_CONFIG_KEY_PREFIX : `${PROVIDER_CONFIG_KEY_PREFIX}:${group}`
}

function isProviderConfigGroup(value: unknown): value is ProviderConfigGroup {
  return typeof value === 'string' && (PROVIDER_GROUPS as readonly string[]).includes(value)
}

function isDbProvider(value: unknown): value is DbProviderMode {
  return typeof value === 'string' && /^db:[a-z0-9][a-z0-9_-]{1,62}$/i.test(value)
}

function normalizeProviderSlug(value: string) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return normalized || 'poi-table'
}

function normalizeProviderConfigValue(value: unknown): ProviderMode {
  if (isDbProvider(value)) return value
  if (value === 'aws' || value === 'geoapify_tomtom' || value === 'mapy') return value
  return 'geoapify_tomtom'
}

async function getProviderConfigRow(supabaseUrl: string, serviceRoleKey: string, key: string) {
  const response = await restFetch(`${supabaseUrl}/rest/v1/app_runtime_config?key=eq.${encodeURIComponent(key)}&select=key,provider,options&limit=1`, {
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
  return 'geoapify_tomtom' as ProviderMode
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

function isAllowedGeodataTable(value: unknown): value is GeodataTableName {
  return typeof value === 'string' && (GEODATA_ALLOWED_TABLES as readonly string[]).includes(value)
}

function makeDbProviderId(label: string, table: string) {
  const tablePart = table.split('.').pop() || table
  return normalizeProviderSlug(label || tablePart)
}

function sanitizeDbTableConfigs(input: unknown): DbSearchTableConfig[] {
  const rows = Array.isArray(input) ? input : []
  const used = new Set<string>()
  const now = new Date().toISOString()
  const cleaned: DbSearchTableConfig[] = []

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Partial<DbSearchTableConfig>
    if (!isAllowedGeodataTable(row.table)) continue
    const label = String(row.label || row.table.split('.').pop() || row.table).trim().slice(0, 80)
    const baseId = normalizeProviderSlug(row.id || makeDbProviderId(label, row.table))
    let id = baseId
    let suffix = 2
    while (used.has(id)) {
      id = `${baseId}-${suffix}`.slice(0, 56)
      suffix += 1
    }
    used.add(id)
    cleaned.push({
      id,
      provider: `db:${id}` as DbProviderMode,
      label,
      table: row.table,
      enabled: row.enabled !== false,
      createdAt: row.createdAt || now,
      updatedAt: now,
    })
  }

  return cleaned.filter((row) => row.enabled)
}

async function getDbTableConfigs(supabaseUrl: string, serviceRoleKey: string): Promise<DbSearchTableConfig[]> {
  const row = await getProviderConfigRow(supabaseUrl, serviceRoleKey, DB_TABLE_CONFIG_KEY).catch(() => null)
  return sanitizeDbTableConfigs(row?.options?.tables || [])
}

async function saveDbTableConfigs(supabaseUrl: string, serviceRoleKey: string, tables: unknown) {
  const sanitized = sanitizeDbTableConfigs(tables)
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
        key: DB_TABLE_CONFIG_KEY,
        provider: 'supabase',
        options: {
          geodata_url: GEODATA_DEFAULT_URL,
          tables: sanitized,
        },
      },
    ]),
  })
  const rows = await response.json()
  return sanitizeDbTableConfigs(rows?.[0]?.options?.tables || sanitized)
}

function resolveGeodataAuth() {
  const url = normalizeInternalUrl(Deno.env.get('GEODATA_SUPABASE_URL') || GEODATA_DEFAULT_URL)
  const key =
    Deno.env.get('GEODATA_SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_ANON_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_PUBLISHABLE_KEY') ||
    ''

  if (!url) throw new Error('Missing GEODATA_SUPABASE_URL')
  if (!key) {
    throw new Error('Missing Geodata Supabase key. Set GEODATA_SUPABASE_SERVICE_ROLE_KEY or GEODATA_SUPABASE_ANON_KEY for buuoyyfzincmbxafvihc.')
  }

  return { url, key }
}

function postgrestSafe(value: string) {
  return String(value || '')
    .trim()
    .replace(/[*,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function tablePath(table: GeodataTableName) {
  return table.split('.').pop() || table
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value]
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => v === true ? k : `${k}:${String(v)}`)
  return []
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function buildAddress(row: Record<string, any>) {
  const formatted = firstString(row.formatted_address, row.address_line1)
  if (formatted) return formatted

  const streetNumber = firstString(row.street_number, row.housenumber)
  const street = firstString(row.street)
  const line = [row.postal_code || row.postcode, row.city, [street, streetNumber].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return line || firstString(row.address_line2, row.name)
}

function rowCategories(row: Record<string, any>) {
  return Array.from(new Set([
    ...coerceStringArray(row.categories),
    ...coerceStringArray(row.details),
    ...coerceStringArray(row.payment_options),
    ...coerceStringArray(row.diet),
    firstString(row.fetch_category),
    firstString(row.classification_code),
    firstString(row.cuisine),
    firstString(row.building_type),
  ].filter(Boolean)))
}

function mapGeodataRow(row: Record<string, any>, tableConfig: DbSearchTableConfig): ProviderPlace {
  const categories = rowCategories(row)
  const address = buildAddress(row)
  const externalId = firstString(row.source_id, row.provider_id, row.external_id, row.osm_id, row.id) || crypto.randomUUID()
  const providerLabel = firstString(row.source_provider, row.datasource_name, tableConfig.table)

  return {
    provider: tableConfig.provider,
    external_id: externalId,
    name: firstString(row.name, row.brand, row.operator, address, 'Helyszín'),
    category: categories[0] || providerLabel,
    categories,
    address,
    city: firstString(row.city),
    district: firstString(row.district, row.suburb, row.state_region, row.state),
    postal_code: firstString(row.postal_code, row.postcode),
    latitude: Number.isFinite(Number(row.lat)) ? Number(row.lat) : undefined,
    longitude: Number.isFinite(Number(row.lon)) ? Number(row.lon) : undefined,
    phone: firstString(row.phone) || null,
    email: firstString(row.email) || null,
    website: firstString(row.website, row.facebook, row.instagram, row.tripadvisor) || null,
    opening_hours_text: coerceStringArray(row.opening_hours),
    match_type: 'db',
    metadata: {
      table: tableConfig.table,
      provider_key: tableConfig.provider,
      provider_label: tableConfig.label,
      source_provider: providerLabel,
      brand: row.brand ?? null,
      operator: row.operator ?? null,
      branch: row.branch ?? null,
      cuisine: row.cuisine ?? null,
      capacity: row.capacity ?? null,
      reservation: row.reservation ?? null,
      wheelchair: row.wheelchair ?? null,
      outdoor_seating: row.outdoor_seating ?? null,
      indoor_seating: row.indoor_seating ?? null,
      internet_access: row.internet_access ?? null,
      air_conditioning: row.air_conditioning ?? null,
      smoking: row.smoking ?? null,
      toilets: row.toilets ?? null,
      takeaway: row.takeaway ?? null,
      delivery: row.delivery ?? null,
      raw: row.raw_data ?? row,
    },
  }
}

function categoryMatches(row: ProviderPlace, category?: string) {
  const normalized = String(category || '').trim().toLowerCase()
  if (!normalized) return true
  const haystack = [row.category, ...(row.categories || []), row.metadata?.brand, row.metadata?.operator, row.metadata?.cuisine]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalized)
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

async function queryGeodataTable(tableConfig: DbSearchTableConfig, params: SearchBody): Promise<ProviderPlace[]> {
  const { url, key } = resolveGeodataAuth()
  const limit = Math.min(Math.max(Number(params.limit || 24), 1), 80)
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 200)
  const query = postgrestSafe(params.query || '')
  const city = postgrestSafe(params.city || '')
  const category = postgrestSafe(params.category || params.activityHint || '')

  const restUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
  restUrl.searchParams.set('select', '*')
  restUrl.searchParams.set('limit', String(fetchLimit))

  if (city) {
    restUrl.searchParams.set('city', `ilike.*${city}*`)
  }

  if (query) {
    const searchableColumns = ['name', 'formatted_address', 'address_line1', 'address_line2', 'street', 'city', 'brand', 'operator', 'cuisine']
    restUrl.searchParams.set('or', `(${searchableColumns.map((column) => `${column}.ilike.*${query}*`).join(',')})`)
  }

  const response = await restFetch(restUrl.toString(), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  })

  const rows = await response.json()
  const mapped = (Array.isArray(rows) ? rows : [])
    .map((row) => mapGeodataRow(row, tableConfig))
    .filter((row) => categoryMatches(row, category))

  return mapped.slice(0, limit)
}

async function resolveDbTableConfig(
  supabaseUrl: string,
  serviceRoleKey: string,
  provider?: unknown,
  directTable?: unknown,
  directLabel?: unknown,
): Promise<DbSearchTableConfig> {
  if (isAllowedGeodataTable(directTable)) {
    const label = String(directLabel || directTable.split('.').pop() || directTable).trim()
    const id = makeDbProviderId(label, directTable)
    return { id, provider: `db:${id}`, label, table: directTable, enabled: true }
  }

  if (!isDbProvider(provider)) throw new Error('Valid db:* provider or table is required')
  const configs = await getDbTableConfigs(supabaseUrl, serviceRoleKey)
  const match = configs.find((row) => row.provider === provider && row.enabled)
  if (!match) throw new Error(`Configured database provider not found: ${provider}`)
  return match
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
  if (row.match_type === 'db') score += 35
  if (typeof row.rating === 'number') score += Math.min(row.rating, 5) * 2
  if (typeof row.distance_km === 'number') score += Math.max(0, 30 - row.distance_km)
  if (!row.distance_km && center && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    score += Math.max(0, 30 - haversineKm(center.latitude, center.longitude, row.latitude, row.longitude))
  }
  return score
}

async function resolveProviderMode(supabaseUrl: string, serviceRoleKey: string, requested?: ProviderMode | string): Promise<ProviderMode> {
  if (requested) return normalizeProviderConfigValue(requested)
  try {
    const provider = await getProviderConfigValue(supabaseUrl, serviceRoleKey, 'default')
    return normalizeProviderConfigValue(provider)
  } catch {
    return 'geoapify_tomtom'
  }
}

async function geocodeGeoapify(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = new URL('https://api.geoapify.com/v1/geocode/search')
  url.searchParams.set('text', query)
  url.searchParams.set('filter', 'countrycode:hu')
  url.searchParams.set('limit', '1')
  url.searchParams.set('apiKey', apiKey)
  const response = await fetch(url.toString())
  if (!response.ok) return null
  const payload = await response.json()
  const feature = payload.features?.[0]
  const lon = feature?.geometry?.coordinates?.[0]
  const lat = feature?.geometry?.coordinates?.[1]
  if (typeof lat === 'number' && typeof lon === 'number') return { latitude: lat, longitude: lon }
  return null
}

async function geocodeTomTom(query: string, apiKey: string): Promise<Coordinates | null> {
  const url = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrySet', 'HU')
  url.searchParams.set('limit', '1')
  const response = await fetch(url.toString())
  if (!response.ok) return null
  const payload = await response.json()
  const pos = payload.results?.[0]?.position
  if (typeof pos?.lat === 'number' && typeof pos?.lon === 'number') return { latitude: pos.lat, longitude: pos.lon }
  return null
}

async function searchGeoapifyByName(params: SearchBody, apiKey: string, center: Coordinates | null, query: string): Promise<ProviderPlace[]> {
  const url = new URL('https://api.geoapify.com/v2/places')
  url.searchParams.set('categories', geoapifyCategoryFilter(params.category, params.activityHint))
  url.searchParams.set('filter', 'countrycode:hu')
  url.searchParams.set('name', query)
  url.searchParams.set('limit', String(Math.min(params.limit || 24, 50)))
  if (center) url.searchParams.set('bias', `proximity:${center.longitude},${center.latitude}`)
  url.searchParams.set('apiKey', apiKey)
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => {
    const p = feature.properties || {}
    return {
      provider: 'geoapify',
      external_id: String(p.place_id || feature.properties?.datasource?.raw?.osm_id || crypto.randomUUID()),
      name: String(p.name || p.address_line1 || 'Helyszín'),
      category: p.categories?.[0] || normalizeCategory(params.category, params.activityHint),
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
      match_type: 'query',
      metadata: p,
    } as ProviderPlace
  })
}

async function searchGeoapifyNearby(params: SearchBody, apiKey: string, center: Coordinates): Promise<ProviderPlace[]> {
  const radius = Math.max(1, params.radius_km || 10) * 1000
  const url = new URL('https://api.geoapify.com/v2/places')
  url.searchParams.set('categories', geoapifyCategoryFilter(params.category, params.activityHint))
  url.searchParams.set('filter', `circle:${center.longitude},${center.latitude},${radius}`)
  url.searchParams.set('bias', `proximity:${center.longitude},${center.latitude}`)
  url.searchParams.set('limit', String(Math.min(params.limit || 24, 50)))
  url.searchParams.set('apiKey', apiKey)
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => {
    const p = feature.properties || {}
    return {
      provider: 'geoapify',
      external_id: String(p.place_id || feature.properties?.datasource?.raw?.osm_id || crypto.randomUUID()),
      name: String(p.name || p.address_line1 || 'Helyszín'),
      category: p.categories?.[0] || normalizeCategory(params.category, params.activityHint),
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
      match_type: 'nearby',
      metadata: p,
    } as ProviderPlace
  })
}

async function searchTomTomByName(params: SearchBody, apiKey: string, center: Coordinates | null, query: string): Promise<ProviderPlace[]> {
  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrySet', 'HU')
  url.searchParams.set('limit', String(Math.min(params.limit || 24, 50)))
  if (center) {
    url.searchParams.set('lat', String(center.latitude))
    url.searchParams.set('lon', String(center.longitude))
  }
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: String(result.id),
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
    // cache write is best-effort only
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = (await request.json().catch(() => ({}))) as SearchBody
    const trimmedQuery = String(body.query || '').trim()
    const explicitCenter = bodyCenter(body)
    const limit = Math.min(Math.max(Number(body.limit || 24), 1), 80)
    const action = body.action || 'autocomplete'

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = resolveInternalSupabaseUrl(request)
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ results: [], error: 'Missing Supabase service env', debug: { raw_candidate_count: 0 } }, 500)
    }

    const requestedGroup = isProviderConfigGroup(body.group) ? body.group : 'default'

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

    if (action === 'get_db_table_config') {
      const tables = await getDbTableConfigs(supabaseUrl, serviceRoleKey)
      return json({ availableTables: GEODATA_AVAILABLE_TABLES, tables })
    }

    if (action === 'save_db_table_config') {
      const tables = await saveDbTableConfigs(supabaseUrl, serviceRoleKey, body.tables || [])
      return json({ availableTables: GEODATA_AVAILABLE_TABLES, tables })
    }

    if (action === 'test_db_table_query') {
      const tableConfig = await resolveDbTableConfig(supabaseUrl, serviceRoleKey, body.provider, body.table, body.label)
      const results = await queryGeodataTable(tableConfig, { ...body, limit })
      return json({
        results,
        debug: {
          provider_mode: tableConfig.provider,
          table: tableConfig.table,
          returned_count: results.length,
          city: body.city || null,
          category: body.category || null,
          geodata_url: GEODATA_DEFAULT_URL,
        },
      })
    }

    if (!explicitCenter && !trimmedQuery) {
      return json({ results: [], error: 'query or coordinates are required', debug: { raw_candidate_count: 0 } }, 400)
    }

    const providerMode = await resolveProviderMode(supabaseUrl, serviceRoleKey, body.provider_mode)

    if (isDbProvider(providerMode)) {
      const tableConfig = await resolveDbTableConfig(supabaseUrl, serviceRoleKey, providerMode)
      const dbRows = await queryGeodataTable(tableConfig, { ...body, query: trimmedQuery, limit })
      const scored = dbRows
        .map((row) => ({ ...row, score: scoreRow(row, trimmedQuery, explicitCenter) + 100 }))
        .filter((row) => !trimmedQuery || textMatchesQuery(row, trimmedQuery) || body.lenient)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit)
      return json({
        results: scored,
        debug: {
          provider_mode: providerMode,
          table: tableConfig.table,
          raw_candidate_count: dbRows.length,
          returned_count: scored.length,
          used_lenient_mode: Boolean(body.lenient),
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

    const rawCandidates = dedupe([...geoByName, ...tomtomByName, ...geoNearby, ...tomtomNearby]).map((row) => ({
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
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ results: [], error: message, debug: { raw_candidate_count: 0 } }, 500)
  }
})
