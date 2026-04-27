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

type ProviderConfigGroup = 'default' | 'personal' | 'venue' | 'trip_planner'
type GeodataTableName = 'public.unified_pois' | 'public.local_pois' | 'public.geoapify_pois'

interface SearchBody {
  action?: ProviderConfigAction
  query?: string
  category?: string
  activityHint?: string
  city?: string
  table?: GeodataTableName | string
  label?: string
  tables?: Partial<DbSearchTableConfig>[]
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
  group?: ProviderConfigGroup | string
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

interface DbSearchTableConfig {
  id: string
  provider: DbProviderMode
  label: string
  table: GeodataTableName
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

const PROVIDER_CONFIG_KEY_PREFIX = 'address_search'
const PROVIDER_GROUPS = ['default', 'personal', 'venue', 'trip_planner'] as const
const DB_TABLE_CONFIG_KEY = `${PROVIDER_CONFIG_KEY_PREFIX}:db_tables`
const GEODATA_DEFAULT_URL = 'https://buuoyyfzincmbxafvihc.supabase.co'
const GEODATA_ALLOWED_TABLES = ['public.unified_pois', 'public.local_pois', 'public.geoapify_pois'] as const

const GEODATA_AVAILABLE_TABLES = [
  { value: 'public.unified_pois', label: 'public.unified_pois', description: 'Egységesített, deduplikált POI tábla — venue kereséshez ajánlott első választás.' },
  { value: 'public.local_pois', label: 'public.local_pois', description: 'Lokális forrásokból egységesített POI tábla, gazdag cím- és szolgáltatásmezőkkel.' },
  { value: 'public.geoapify_pois', label: 'public.geoapify_pois', description: 'Nyers/forrásközeli Geoapify POI tábla, részletes provider metaadatokkal.' },
] as const

const GEODATA_SELECT_COLUMNS: Record<GeodataTableName, string> = {
  'public.unified_pois': [
    'id', 'source_provider', 'source_id', 'name', 'name_international', 'categories', 'country', 'country_code', 'country_code_iso3', 'iso3166_2',
    'state_region', 'city', 'district', 'suburb', 'postal_code', 'street', 'street_number', 'formatted_address', 'address_line1', 'address_line2',
    'lat', 'lon', 'phone', 'email', 'website', 'facebook', 'instagram', 'tripadvisor', 'opening_hours', 'operator', 'brand', 'branch', 'cuisine',
    'diet', 'capacity', 'reservation', 'wheelchair', 'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking',
    'toilets', 'takeaway', 'delivery', 'payment_options', 'classification_code', 'osm_id', 'building_type', 'source_fetched_at', 'unified_at'
  ].join(','),
  'public.local_pois': [
    'id', 'provider_id', 'source_provider', 'name', 'name_international', 'categories', 'country', 'country_code', 'country_code_iso3', 'iso3166_2',
    'state_region', 'city', 'district', 'suburb', 'postal_code', 'street', 'street_number', 'formatted_address', 'address_line1', 'address_line2',
    'lat', 'lon', 'phone', 'email', 'website', 'facebook', 'instagram', 'tripadvisor', 'opening_hours', 'operator', 'brand', 'branch', 'cuisine',
    'diet', 'capacity', 'reservation', 'wheelchair', 'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking',
    'toilets', 'takeaway', 'delivery', 'payment_options', 'classification_code', 'osm_id', 'building_type', 'source_fetched_at', 'source_unified_at',
    'last_loaded_at', 'created_at', 'updated_at'
  ].join(','),
  'public.geoapify_pois': [
    'id', 'external_id', 'name', 'country', 'country_code', 'state', 'city', 'postcode', 'district', 'suburb', 'street', 'housenumber', 'iso3166_2',
    'lat', 'lon', 'formatted_address', 'address_line1', 'address_line2', 'categories', 'details', 'website', 'opening_hours', 'phone', 'email',
    'facebook', 'instagram', 'tripadvisor', 'operator', 'brand', 'branch', 'cuisine', 'diet', 'capacity', 'reservation', 'wheelchair',
    'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking', 'toilets', 'takeaway', 'delivery', 'payment_options',
    'name_international', 'name_other', 'datasource_name', 'osm_id', 'osm_type', 'building_type', 'fetch_category', 'fetched_at'
  ].join(','),
}

const SEARCHABLE_COLUMNS = ['name', 'formatted_address', 'address_line1', 'address_line2', 'street', 'city', 'brand', 'operator', 'cuisine']

class HttpError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status = 500, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

function normalizeUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorJson(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  const status = error instanceof HttpError ? error.status : fallbackStatus
  const details = error instanceof HttpError ? error.details : undefined
  console.error('[place-search] error', { status, message, details })
  return json({ error: message, details }, status)
}

function resolveInternalSupabaseUrl(request: Request) {
  const requestOrigin = normalizeUrl(new URL(request.url).origin)
  if (requestOrigin) {
    try {
      const hostname = new URL(requestOrigin).hostname
      if (/\.supabase\.co$/i.test(hostname)) return requestOrigin
    } catch {
      // fall back to env
    }
  }

  const envUrl = normalizeUrl(Deno.env.get('SUPABASE_URL'))
  if (envUrl) return envUrl
  throw new HttpError('Missing internal Supabase project URL', 500)
}

function resolveInternalServiceRoleKey() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
  if (!key) {
    throw new HttpError('Missing SUPABASE_SERVICE_ROLE_KEY for Hobbeast runtime configuration writes.', 500)
  }
  return key
}

function resolveGeodataAuth() {
  const url = normalizeUrl(Deno.env.get('GEODATA_SUPABASE_URL') || GEODATA_DEFAULT_URL)
  const key =
    Deno.env.get('GEODATA_SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_SECRET_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_ANON_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_PUBLISHABLE_KEY') ||
    ''

  if (!url) throw new HttpError('Missing GEODATA_SUPABASE_URL', 500)
  if (!key) {
    throw new HttpError('Missing Geodata Supabase key. Set GEODATA_SUPABASE_SERVICE_ROLE_KEY or GEODATA_SUPABASE_SECRET_KEY.', 500)
  }
  return { url, key }
}

async function restFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new HttpError(`${response.status} ${response.statusText}: ${text}`, response.status, { url })
  }
  return response
}

async function restFetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await restFetch(url, init)
  return await response.json() as T
}

function configKey(group: ProviderConfigGroup = 'default') {
  return group === 'default' ? PROVIDER_CONFIG_KEY_PREFIX : `${PROVIDER_CONFIG_KEY_PREFIX}:${group}`
}

function isProviderConfigGroup(value: unknown): value is ProviderConfigGroup {
  return typeof value === 'string' && (PROVIDER_GROUPS as readonly string[]).includes(value)
}

function requireProviderGroup(value: unknown): ProviderConfigGroup {
  if (value === undefined || value === null || value === '') return 'default'
  if (!isProviderConfigGroup(value)) throw new HttpError(`Invalid provider group: ${String(value)}`, 400)
  return value
}

function isDbProvider(value: unknown): value is DbProviderMode {
  return typeof value === 'string' && /^db:[a-z0-9][a-z0-9_-]{1,62}$/i.test(value)
}

function isBaseProvider(value: unknown): value is BaseProviderMode {
  return value === 'aws' || value === 'geoapify_tomtom' || value === 'mapy'
}

function isProviderMode(value: unknown): value is ProviderMode {
  return isBaseProvider(value) || isDbProvider(value)
}

function requireProviderMode(value: unknown): ProviderMode {
  if (isProviderMode(value)) return value
  if (typeof value === 'string' && value.includes('{{')) {
    throw new HttpError(`Unresolved Postman/environment provider variable: ${value}`, 400)
  }
  throw new HttpError(`Invalid provider value: ${String(value || '')}. Expected aws, geoapify_tomtom, mapy, or db:<id>.`, 400)
}

function normalizeProviderConfigValue(value: unknown): ProviderMode {
  if (isProviderMode(value)) return value
  return 'geoapify_tomtom'
}

function isAllowedGeodataTable(value: unknown): value is GeodataTableName {
  return typeof value === 'string' && (GEODATA_ALLOWED_TABLES as readonly string[]).includes(value)
}

function requireGeodataTable(value: unknown): GeodataTableName {
  if (isAllowedGeodataTable(value)) return value
  if (typeof value === 'string' && value.includes('{{')) {
    throw new HttpError(`Unresolved Postman/environment table variable: ${value}`, 400)
  }
  throw new HttpError(`Invalid Geodata table: ${String(value || '')}`, 400)
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
    const table = requireGeodataTable(row.table)
    const label = String(row.label || table.split('.').pop() || table).trim().slice(0, 80)
    const explicitId = typeof row.id === 'string' && !row.id.includes('{{') ? row.id : ''
    const explicitProvider = isDbProvider(row.provider) ? row.provider.replace(/^db:/, '') : ''
    const baseId = normalizeProviderSlug(explicitProvider || explicitId || makeDbProviderId(label, table))
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
      table,
      enabled: row.enabled !== false,
      createdAt: row.createdAt || now,
      updatedAt: now,
    })
  }

  return cleaned.filter((row) => row.enabled)
}

function appRuntimeHeaders(serviceRoleKey: string, prefer?: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

async function getProviderConfigRow(supabaseUrl: string, serviceRoleKey: string, key: string) {
  const url = `${supabaseUrl}/rest/v1/app_runtime_config?key=eq.${encodeURIComponent(key)}&select=key,provider,options&limit=1`
  const rows = await restFetchJson<any[]>(url, { headers: appRuntimeHeaders(serviceRoleKey) })
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

function compareDbProviderLists(expected: DbSearchTableConfig[], actual: DbSearchTableConfig[]) {
  const normalize = (rows: DbSearchTableConfig[]) => rows
    .map((row) => `${row.provider}|${row.table}|${row.label}|${row.enabled !== false}`)
    .sort()
    .join('\n')
  return normalize(expected) === normalize(actual)
}

function ensurePersistedProviderRow(row: any, expectedKey: string, expectedProvider: ProviderMode) {
  const actualProvider = row?.provider
  if (row?.key !== expectedKey || actualProvider !== expectedProvider) {
    throw new HttpError('Runtime provider config write verification failed.', 500, {
      key: expectedKey,
      expectedProvider,
      persistedKey: row?.key ?? null,
      persistedProvider: actualProvider ?? null,
    })
  }
  return requireProviderMode(actualProvider)
}

async function saveProviderConfigValue(
  supabaseUrl: string,
  serviceRoleKey: string,
  group: ProviderConfigGroup,
  provider: ProviderMode,
) {
  const key = configKey(group)
  const url = `${supabaseUrl}/rest/v1/app_runtime_config?on_conflict=key`
  await restFetchJson<any[]>(url, {
    method: 'POST',
    headers: appRuntimeHeaders(serviceRoleKey, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify([{ key, provider, options: {} }]),
  })

  const persisted = await getProviderConfigRow(supabaseUrl, serviceRoleKey, key)
  return ensurePersistedProviderRow(persisted, key, provider)
}

async function getDbTableConfigs(supabaseUrl: string, serviceRoleKey: string): Promise<DbSearchTableConfig[]> {
  const row = await getProviderConfigRow(supabaseUrl, serviceRoleKey, DB_TABLE_CONFIG_KEY).catch(() => null)
  return sanitizeDbTableConfigs(row?.options?.tables || [])
}

async function saveDbTableConfigs(supabaseUrl: string, serviceRoleKey: string, tables: unknown) {
  const sanitized = sanitizeDbTableConfigs(tables)
  const url = `${supabaseUrl}/rest/v1/app_runtime_config?on_conflict=key`
  await restFetchJson<any[]>(url, {
    method: 'POST',
    headers: appRuntimeHeaders(serviceRoleKey, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify([{
      key: DB_TABLE_CONFIG_KEY,
      provider: 'supabase',
      options: {
        geodata_url: GEODATA_DEFAULT_URL,
        tables: sanitized,
      },
    }]),
  })

  const persisted = await getProviderConfigRow(supabaseUrl, serviceRoleKey, DB_TABLE_CONFIG_KEY)
  const verifiedTables = sanitizeDbTableConfigs(persisted?.options?.tables || [])
  if (persisted?.key !== DB_TABLE_CONFIG_KEY || persisted?.provider !== 'supabase' || !compareDbProviderLists(sanitized, verifiedTables)) {
    throw new HttpError('Runtime db table config write verification failed.', 500, {
      key: DB_TABLE_CONFIG_KEY,
      expectedProvider: 'supabase',
      persistedKey: persisted?.key ?? null,
      persistedProvider: persisted?.provider ?? null,
      expectedTables: sanitized.map(({ id, provider, label, table, enabled }) => ({ id, provider, label, table, enabled })),
      persistedTables: verifiedTables.map(({ id, provider, label, table, enabled }) => ({ id, provider, label, table, enabled })),
    })
  }

  return verifiedTables
}


function geodataHeaders(key: string) {
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  }

  // Legacy service_role/anon JWT keys work as Bearer tokens. New sb_secret_ / sb_publishable_ keys are API keys, not JWT Bearer tokens.
  if (!/^sb_(secret|publishable)_/i.test(key)) {
    headers.Authorization = `Bearer ${key}`
  }

  return headers
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
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => v === true ? k : `${k}:${String(v)}`)
  }
  return []
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function buildAddress(row: Record<string, any>) {
  const formatted = firstString(row.formatted_address, row.address_line1)
  if (formatted) return formatted
  const streetNumber = firstString(row.street_number, row.housenumber)
  const street = firstString(row.street)
  const streetLine = [street, streetNumber].filter(Boolean).join(' ')
  const line = [row.postal_code || row.postcode, row.city, streetLine].filter(Boolean).join(', ')
  return line || firstString(row.address_line2, row.name, row.brand, row.operator)
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
  const lat = Number(row.lat)
  const lon = Number(row.lon)

  return {
    provider: tableConfig.provider,
    external_id: externalId,
    name: firstString(row.name, row.brand, row.operator, address, 'Helyszín'),
    category: categories[0] || providerLabel || 'venue',
    categories,
    address,
    city: firstString(row.city),
    district: firstString(row.district, row.suburb, row.state_region, row.state),
    postal_code: firstString(row.postal_code, row.postcode),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lon) ? lon : undefined,
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
  const haystack = [row.name, row.address, row.city, row.category, ...(row.categories || []), row.metadata?.brand, row.metadata?.operator]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalizedQuery)
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

function dedupe(results: ProviderPlace[]) {
  const seen = new Map<string, ProviderPlace>()
  for (const row of results) {
    const key = `${row.name}|${row.address || ''}|${Math.round((row.latitude || 0) * 1000)}|${Math.round((row.longitude || 0) * 1000)}`.toLowerCase()
    const current = seen.get(key)
    if (!current || (row.score || 0) > (current.score || 0)) seen.set(key, row)
  }
  return Array.from(seen.values())
}

async function resolveDbTableConfig(
  supabaseUrl: string,
  serviceRoleKey: string,
  provider?: unknown,
  directTable?: unknown,
  directLabel?: unknown,
): Promise<DbSearchTableConfig> {
  if (directTable !== undefined && directTable !== null && directTable !== '') {
    const table = requireGeodataTable(directTable)
    const label = String(directLabel || table.split('.').pop() || table).trim()
    const id = makeDbProviderId(label, table)
    return { id, provider: `db:${id}`, label, table, enabled: true }
  }

  if (!isDbProvider(provider)) throw new HttpError('Valid db:* provider or direct table is required.', 400)
  const configs = await getDbTableConfigs(supabaseUrl, serviceRoleKey)
  const match = configs.find((row) => row.provider === provider && row.enabled)
  if (!match) throw new HttpError(`Configured database provider not found: ${provider}`, 404, { configured: configs })
  return match
}

async function queryGeodataTable(tableConfig: DbSearchTableConfig, params: SearchBody): Promise<{ results: ProviderPlace[]; debug: Record<string, unknown> }> {
  const { url, key } = resolveGeodataAuth()
  const limit = Math.min(Math.max(Number(params.limit || 24), 1), 80)
  const fetchLimit = Math.min(Math.max(limit * 8, limit), 200)
  const query = postgrestSafe(params.query || '')
  const city = postgrestSafe(params.city || '')
  const category = postgrestSafe(params.category || params.activityHint || '')
  const center = bodyCenter(params)

  const restUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
  restUrl.searchParams.set('select', GEODATA_SELECT_COLUMNS[tableConfig.table])
  restUrl.searchParams.set('limit', String(fetchLimit))
  restUrl.searchParams.set('order', 'name.asc.nullslast')

  if (city) restUrl.searchParams.set('city', `ilike.*${city}*`)
  if (query) {
    restUrl.searchParams.set('or', `(${SEARCHABLE_COLUMNS.map((column) => `${column}.ilike.*${query}*`).join(',')})`)
  }

  const rows = await restFetchJson<Record<string, any>[]>(restUrl.toString(), {
    headers: geodataHeaders(key),
  })

  const rawRows = Array.isArray(rows) ? rows : []
  const mapped = rawRows
    .map((row) => mapGeodataRow(row, tableConfig))
    .filter((row) => categoryMatches(row, category))
    .filter((row) => textMatchesQuery(row, query))
    .map((row) => ({ ...row, score: scoreRow(row, query, center) }))

  return {
    results: dedupe(mapped).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit),
    debug: {
      geodata_url: url,
      table: tableConfig.table,
      provider: tableConfig.provider,
      query,
      city,
      category,
      fetch_limit: fetchLimit,
      raw_candidate_count: rawRows.length,
      filtered_candidate_count: mapped.length,
    },
  }
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
  return 'venue'
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
  return typeof lat === 'number' && typeof lon === 'number' ? { latitude: lat, longitude: lon } : null
}

async function searchGeoapify(params: SearchBody, apiKey: string, center: Coordinates | null, query: string): Promise<ProviderPlace[]> {
  const url = new URL('https://api.geoapify.com/v2/places')
  url.searchParams.set('categories', geoapifyCategoryFilter(params.category, params.activityHint))
  url.searchParams.set('filter', center ? `circle:${center.longitude},${center.latitude},${Math.max(1, params.radius_km || 10) * 1000}` : 'countrycode:hu')
  if (query) url.searchParams.set('name', query)
  if (center) url.searchParams.set('bias', `proximity:${center.longitude},${center.latitude}`)
  url.searchParams.set('limit', String(Math.min(Number(params.limit || 24), 50)))
  url.searchParams.set('apiKey', apiKey)
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.features || []).map((feature: any) => {
    const p = feature.properties || {}
    return {
      provider: 'geoapify',
      external_id: String(p.place_id || p.datasource?.raw?.osm_id || crypto.randomUUID()),
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
      match_type: query ? 'query' : 'nearby',
      metadata: p,
    } as ProviderPlace
  })
}

async function searchTomTom(params: SearchBody, apiKey: string, center: Coordinates | null, query: string): Promise<ProviderPlace[]> {
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
  const response = await fetch(url.toString())
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.results || []).map((result: any) => ({
    provider: 'tomtom',
    external_id: String(result.id || crypto.randomUUID()),
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

async function searchExternalProviders(params: SearchBody): Promise<{ results: ProviderPlace[]; debug: Record<string, unknown> }> {
  const query = postgrestSafe(params.query || '')
  const center = bodyCenter(params) || (query ? await geocodeGeoapify(query, Deno.env.get('GEOAPIFY_API_KEY') || '') : null)
  if (!query && !center) throw new HttpError('query or coordinates are required', 400)

  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY') || ''
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY') || Deno.env.get('TOMTOM_SEARCH_API_KEY') || ''

  const [geoapify, tomtom] = await Promise.all([
    geoapifyKey ? searchGeoapify(params, geoapifyKey, center, query).catch(() => []) : Promise.resolve([]),
    tomtomKey ? searchTomTom(params, tomtomKey, center, query).catch(() => []) : Promise.resolve([]),
  ])

  const results = dedupe([...geoapify, ...tomtom]
    .map((row) => ({ ...row, score: scoreRow(row, query, center) })))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, Math.min(Number(params.limit || 24), 80))

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

async function handleConfigAction(action: ProviderConfigAction, body: SearchBody, request: Request) {
  const supabaseUrl = resolveInternalSupabaseUrl(request)
  const serviceRoleKey = resolveInternalServiceRoleKey()

  if (action === 'get_provider_config') {
    const group = requireProviderGroup(body.group)
    const provider = await getProviderConfigValue(supabaseUrl, serviceRoleKey, group)
    return json({ group, provider })
  }

  if (action === 'get_all_provider_configs') {
    const [providers, dbTables] = await Promise.all([
      getAllProviderConfigValues(supabaseUrl, serviceRoleKey),
      getDbTableConfigs(supabaseUrl, serviceRoleKey),
    ])
    return json({ providers, dbTables, runtime: { supabaseUrl, dbTableConfigKey: DB_TABLE_CONFIG_KEY } })
  }

  if (action === 'save_provider_config') {
    const group = requireProviderGroup(body.group)
    const provider = requireProviderMode(body.provider)
    const saved = await saveProviderConfigValue(supabaseUrl, serviceRoleKey, group, provider)
    const providers = await getAllProviderConfigValues(supabaseUrl, serviceRoleKey)
    return json({ group, provider: saved, providers })
  }

  if (action === 'get_db_table_config') {
    const tables = await getDbTableConfigs(supabaseUrl, serviceRoleKey)
    return json({ availableTables: GEODATA_AVAILABLE_TABLES, tables, geodata_url: GEODATA_DEFAULT_URL })
  }

  if (action === 'save_db_table_config') {
    const tables = await saveDbTableConfigs(supabaseUrl, serviceRoleKey, body.tables || [])
    return json({ availableTables: GEODATA_AVAILABLE_TABLES, tables, geodata_url: GEODATA_DEFAULT_URL })
  }

  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await request.json().catch(() => ({})) as SearchBody
    const action = (body.action || 'autocomplete') as ProviderConfigAction

    const configResponse = await handleConfigAction(action, body, request)
    if (configResponse) return configResponse

    const supabaseUrl = resolveInternalSupabaseUrl(request)
    const serviceRoleKey = resolveInternalServiceRoleKey()

    if (action === 'test_db_table_query') {
      const tableConfig = await resolveDbTableConfig(supabaseUrl, serviceRoleKey, body.provider, body.table, body.label)
      const { results, debug } = await queryGeodataTable(tableConfig, body)
      return json({ results, debug })
    }

    const requestedProvider = body.provider_mode || body.provider
    const providerMode = requestedProvider
      ? normalizeProviderConfigValue(requestedProvider)
      : await getProviderConfigValue(supabaseUrl, serviceRoleKey, requireProviderGroup(body.group || 'default'))

    if (isDbProvider(providerMode)) {
      const tableConfig = await resolveDbTableConfig(supabaseUrl, serviceRoleKey, providerMode)
      const { results, debug } = await queryGeodataTable(tableConfig, body)
      return json({ results, debug })
    }

    if (action === 'reverse') {
      // The old function did not support DB reverse geocoding. Keep a safe no-op fallback instead of breaking callers.
      return json({ results: [], debug: { action, provider_mode: providerMode, note: 'reverse lookup is not supported by this hotfix handler' } })
    }

    const { results, debug } = await searchExternalProviders(body)
    return json({ results, debug: { ...debug, requested_provider: providerMode } })
  } catch (error) {
    return errorJson(error, error instanceof HttpError ? error.status : 500)
  }
})
