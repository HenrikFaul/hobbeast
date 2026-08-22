import type {
  BaseProviderMode,
  DbProviderMode,
  GeodataTableName,
  ProviderConfigGroup,
  ProviderMode,
} from './requestContract.ts'
import { HttpError, restFetchJson } from './runtime.ts'
import type { DbSearchTableConfig, RuntimeConfigRow } from './types.ts'

const PROVIDER_CONFIG_KEY_PREFIX = 'address_search'
export const PROVIDER_GROUPS = ['default', 'personal', 'venue', 'trip_planner'] as const
export const DB_TABLE_CONFIG_KEY = `${PROVIDER_CONFIG_KEY_PREFIX}:db_tables`
export const GEODATA_DEFAULT_URL = 'https://buuoyyfzincmbxafvihc.supabase.co'
export const GEODATA_ALLOWED_TABLES = ['public.unified_pois', 'public.local_pois', 'public.geoapify_pois'] as const

export const GEODATA_AVAILABLE_TABLES = [
  { value: 'public.unified_pois', label: 'public.unified_pois', description: 'Egységesített, deduplikált POI tábla — venue kereséshez ajánlott első választás.' },
  { value: 'public.local_pois', label: 'public.local_pois', description: 'Lokális forrásokból egységesített POI tábla, gazdag cím- és szolgáltatásmezőkkel.' },
  { value: 'public.geoapify_pois', label: 'public.geoapify_pois', description: 'Nyers/forrásközeli Geoapify POI tábla, részletes provider metaadatokkal.' },
] as const

function configKey(group: ProviderConfigGroup = 'default') {
  return group === 'default' ? PROVIDER_CONFIG_KEY_PREFIX : `${PROVIDER_CONFIG_KEY_PREFIX}:${group}`
}

function isProviderConfigGroup(value: unknown): value is ProviderConfigGroup {
  return typeof value === 'string' && (PROVIDER_GROUPS as readonly string[]).includes(value)
}

export function requireProviderGroup(value: unknown): ProviderConfigGroup {
  if (value === undefined || value === null || value === '') return 'default'
  if (!isProviderConfigGroup(value)) throw new HttpError(`Invalid provider group: ${String(value)}`, 400)
  return value
}

export function isDbProvider(value: unknown): value is DbProviderMode {
  return typeof value === 'string' && /^db:[a-z0-9][a-z0-9_-]{1,62}$/i.test(value)
}

function isBaseProvider(value: unknown): value is BaseProviderMode {
  return value === 'aws' || value === 'geoapify_tomtom' || value === 'mapy'
}

function isProviderMode(value: unknown): value is ProviderMode {
  return isBaseProvider(value) || isDbProvider(value)
}

export function requireProviderMode(value: unknown): ProviderMode {
  if (isProviderMode(value)) return value
  if (typeof value === 'string' && value.includes('{{')) {
    throw new HttpError(`Unresolved Postman/environment provider variable: ${value}`, 400)
  }
  throw new HttpError(`Invalid provider value: ${String(value || '')}. Expected aws, geoapify_tomtom, mapy, or db:<id>.`, 400)
}

export function normalizeProviderConfigValue(value: unknown): ProviderMode {
  if (isProviderMode(value)) return value
  return 'geoapify_tomtom'
}

function isAllowedGeodataTable(value: unknown): value is GeodataTableName {
  return typeof value === 'string' && (GEODATA_ALLOWED_TABLES as readonly string[]).includes(value)
}

export function requireGeodataTable(value: unknown): GeodataTableName {
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

export function makeDbProviderId(label: string, table: string) {
  const tablePart = table.split('.').pop() || table
  return normalizeProviderSlug(label || tablePart)
}

export function sanitizeDbTableConfigs(input: unknown): DbSearchTableConfig[] {
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
  const rows = await restFetchJson<RuntimeConfigRow[]>(url, { headers: appRuntimeHeaders(serviceRoleKey) })
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

export async function getProviderConfigValue(supabaseUrl: string, serviceRoleKey: string, group: ProviderConfigGroup) {
  const specific = await getProviderConfigRow(supabaseUrl, serviceRoleKey, configKey(group)).catch(() => null)
  if (specific?.provider) return normalizeProviderConfigValue(specific.provider)
  if (group !== 'default') {
    const fallback = await getProviderConfigRow(supabaseUrl, serviceRoleKey, configKey('default')).catch(() => null)
    if (fallback?.provider) return normalizeProviderConfigValue(fallback.provider)
  }
  return 'geoapify_tomtom' as ProviderMode
}

export async function getAllProviderConfigValues(supabaseUrl: string, serviceRoleKey: string) {
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

function ensurePersistedProviderRow(row: RuntimeConfigRow | null, expectedKey: string, expectedProvider: ProviderMode) {
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

export async function saveProviderConfigValue(
  supabaseUrl: string,
  serviceRoleKey: string,
  group: ProviderConfigGroup,
  provider: ProviderMode,
) {
  const key = configKey(group)
  const url = `${supabaseUrl}/rest/v1/app_runtime_config?on_conflict=key`
  await restFetchJson<RuntimeConfigRow[]>(url, {
    method: 'POST',
    headers: appRuntimeHeaders(serviceRoleKey, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify([{ key, provider, options: {} }]),
  })

  const persisted = await getProviderConfigRow(supabaseUrl, serviceRoleKey, key)
  return ensurePersistedProviderRow(persisted, key, provider)
}

export async function getDbTableConfigs(supabaseUrl: string, serviceRoleKey: string): Promise<DbSearchTableConfig[]> {
  const row = await getProviderConfigRow(supabaseUrl, serviceRoleKey, DB_TABLE_CONFIG_KEY).catch(() => null)
  return sanitizeDbTableConfigs(row?.options?.tables || [])
}

export async function saveDbTableConfigs(supabaseUrl: string, serviceRoleKey: string, tables: unknown) {
  const sanitized = sanitizeDbTableConfigs(tables)
  const url = `${supabaseUrl}/rest/v1/app_runtime_config?on_conflict=key`
  await restFetchJson<RuntimeConfigRow[]>(url, {
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

export async function resolveDbTableConfig(
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

