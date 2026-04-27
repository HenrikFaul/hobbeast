import { supabase } from '@/integrations/supabase/client';
import { isAwsLocationConfigured } from '@/lib/awsLocation';

export type BaseAddressSearchProvider = 'aws' | 'geoapify_tomtom' | 'mapy';
export type DbAddressSearchProvider = `db:${string}`;
export type AddressSearchProvider = BaseAddressSearchProvider | DbAddressSearchProvider;

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

export const GEODATA_TABLE_OPTIONS = [
  { value: 'public.unified_pois', label: 'public.unified_pois', description: 'Egységesített, deduplikált POI tábla — venue kereséshez ajánlott első választás.' },
  { value: 'public.local_pois', label: 'public.local_pois', description: 'Lokális forrásokból egységesített POI tábla, gazdag cím- és szolgáltatásmezőkkel.' },
  { value: 'public.geoapify_pois', label: 'public.geoapify_pois', description: 'Nyers/forrásközeli Geoapify POI tábla, részletes provider metaadatokkal.' },
] as const;

export type GeodataTableName = typeof GEODATA_TABLE_OPTIONS[number]['value'];

export interface DbSearchTableConfig {
  id: string;
  provider: DbAddressSearchProvider;
  label: string;
  table: GeodataTableName;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DbSearchTableConfigResponse {
  availableTables: typeof GEODATA_TABLE_OPTIONS;
  tables: DbSearchTableConfig[];
}

export interface DbSearchTableTestInput {
  table?: GeodataTableName;
  provider?: DbAddressSearchProvider;
  label?: string;
  city?: string;
  category?: string | string[];
  categories?: string[];
  source?: string;
  query?: string;
  columns?: string[];
  limit?: number;
}

export interface DbSearchTableTestResult {
  results: unknown[];
  rows?: Record<string, unknown>[];
  columns?: string[];
  totalCount?: number | null;
  debug?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  responseMs?: number;
}

export interface DbFacetOption {
  value: string;
  label: string;
  count: number;
}

export interface DbTableFacetDiscoveryInput {
  table?: GeodataTableName;
  provider?: DbAddressSearchProvider;
  label?: string;
  limit?: number;
}

export interface DbTableFacetDiscoveryResult {
  runtime_version?: string;
  table: GeodataTableName;
  provider: DbAddressSearchProvider;
  rowCount: number | null;
  sampleLimit: number;
  sampleSize: number;
  categories: DbFacetOption[];
  sources: DbFacetOption[];
  cities: DbFacetOption[];
  responseMs: number;
  diagnostics?: {
    tableReachable?: boolean;
    hasAnyRows?: boolean;
    categoryCount?: number;
    sourceCount?: number;
    sourceColumn?: string;
    mode?: string;
    note?: string;
  };
}

const CONFIG_CACHE_MS = 60_000;

type CachedConfig = { provider: AddressSearchProvider; expiresAt: number };

type ProviderConfigPayload = {
  provider?: AddressSearchProvider | string;
  providers?: Partial<Record<AddressSearchFunctionGroup, AddressSearchProvider | string>>;
  dbTables?: DbSearchTableConfig[];
  runtime?: Record<string, unknown>;
};

const cachedConfigs: Record<string, CachedConfig> = {};
let cachedDbTables: { tables: DbSearchTableConfig[]; expiresAt: number } | null = null;

function cacheKey(group: AddressSearchFunctionGroup = 'default'): string {
  return group;
}

function getDefaultProvider(): AddressSearchProvider {
  return isAwsLocationConfigured() ? 'aws' : 'geoapify_tomtom';
}

export function isDbAddressSearchProvider(value: unknown): value is DbAddressSearchProvider {
  return typeof value === 'string' && /^db:[a-z0-9][a-z0-9_-]{1,62}$/i.test(value);
}

export function normalizeDbProviderId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'poi-table';
}

export function makeDbProviderId(label: string, table: string): string {
  const tablePart = table.split('.').pop() || table;
  return normalizeDbProviderId(label || tablePart);
}

function normalizeProvider(value: unknown): AddressSearchProvider {
  if (isDbAddressSearchProvider(value)) return value;
  if (value === 'geoapify_tomtom' || value === 'mapy') return value;
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
  if (normalized !== provider) {
    throw new Error(`A backend más providert igazolt vissza (${normalized}), mint amit menteni próbáltunk (${provider}).`);
  }

  cachedConfigs[cacheKey(group)] = { provider: normalized, expiresAt: Date.now() + CONFIG_CACHE_MS };

  const verified = await getAddressSearchProvider(true, group);
  if (verified !== provider) {
    throw new Error(`A provider mentése nem maradt meg visszaolvasáskor: ${group}=${verified}, várt=${provider}.`);
  }
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
    } as Record<AddressSearchFunctionGroup, AddressSearchProvider | string>;

    const result = {} as Record<AddressSearchFunctionGroup, AddressSearchProvider>;
    (Object.keys(defaults) as AddressSearchFunctionGroup[]).forEach((group) => {
      const provider = normalizeProvider(merged[group]);
      result[group] = provider;
      cachedConfigs[cacheKey(group)] = { provider, expiresAt: Date.now() + CONFIG_CACHE_MS };
    });

    return result;
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

export async function getDbSearchTableConfigs(force = false): Promise<DbSearchTableConfigResponse> {
  if (!force && cachedDbTables && cachedDbTables.expiresAt > Date.now()) {
    return { availableTables: GEODATA_TABLE_OPTIONS, tables: cachedDbTables.tables };
  }

  const payload = await invokePlaceSearchConfig<Partial<DbSearchTableConfigResponse>>({
    action: 'get_db_table_config',
  });

  const allowed = new Set(GEODATA_TABLE_OPTIONS.map((item) => item.value));
  const tables = (payload?.tables || [])
    .filter((row): row is DbSearchTableConfig => Boolean(
      row &&
      row.enabled !== false &&
      typeof row.id === 'string' &&
      isDbAddressSearchProvider(row.provider) &&
      allowed.has(row.table as GeodataTableName),
    ));

  cachedDbTables = { tables, expiresAt: Date.now() + CONFIG_CACHE_MS };
  return { availableTables: GEODATA_TABLE_OPTIONS, tables };
}

export async function saveDbSearchTableConfigs(tables: DbSearchTableConfig[]): Promise<DbSearchTableConfigResponse> {
  const payload = await invokePlaceSearchConfig<Partial<DbSearchTableConfigResponse>>({
    action: 'save_db_table_config',
    tables,
  });

  const savedTables = (payload?.tables || []) as DbSearchTableConfig[];
  if (tables.length > 0 && savedTables.length === 0) {
    throw new Error('A backend nem igazolta vissza a mentett db provider konfigurációt.');
  }

  cachedDbTables = null;
  resetAddressSearchProviderCache();

  // Read back from the runtime store immediately. This prevents optimistic UI
  // state from showing success when the row was not actually persisted.
  return getDbSearchTableConfigs(true);
}

export async function discoverDbSearchTableFacets(input: DbTableFacetDiscoveryInput): Promise<DbTableFacetDiscoveryResult> {
  return invokePlaceSearchConfig<DbTableFacetDiscoveryResult>({
    action: 'discover_db_table_facets',
    ...input,
  });
}

export async function testDbSearchTableQuery(input: DbSearchTableTestInput): Promise<DbSearchTableTestResult> {
  return invokePlaceSearchConfig<DbSearchTableTestResult>({
    action: 'test_db_table_query',
    ...input,
  });
}

export function getProviderDisplayLabel(provider: AddressSearchProvider | string, tables: DbSearchTableConfig[] = []): string {
  if (provider === 'aws') return 'AWS Places';
  if (provider === 'geoapify_tomtom') return 'Geoapify+TomTom';
  if (provider === 'mapy') return 'Mapy.cz';
  if (isDbAddressSearchProvider(provider)) {
    const match = tables.find((table) => table.provider === provider);
    return match ? `${provider} · ${match.label}` : provider;
  }
  return String(provider || '—');
}

export function resetAddressSearchProviderCache() {
  for (const key of Object.keys(cachedConfigs)) {
    delete cachedConfigs[key];
  }
  cachedDbTables = null;
}
