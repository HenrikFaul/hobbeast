export const PLACE_SEARCH_ACTIONS = [
  'autocomplete',
  'geocode',
  'reverse',
  'get_provider_config',
  'get_all_provider_configs',
  'save_provider_config',
  'get_db_table_config',
  'save_db_table_config',
  'discover_db_table_facets',
  'test_db_table_query',
] as const;

export type ProviderConfigAction = (typeof PLACE_SEARCH_ACTIONS)[number];
export type DbProviderMode = `db:${string}`;
export type BaseProviderMode = 'aws' | 'geoapify_tomtom' | 'mapy';
export type ProviderMode = BaseProviderMode | DbProviderMode;
export type ProviderConfigGroup = 'default' | 'personal' | 'venue' | 'trip_planner';
export type GeodataTableName = 'public.unified_pois' | 'public.local_pois' | 'public.geoapify_pois';

export interface DbTableConfigInput {
  id?: string;
  provider?: DbProviderMode;
  label?: string;
  table: GeodataTableName;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const PLACE_SEARCH_ADMIN_ACTIONS = new Set<ProviderConfigAction>([
  'get_all_provider_configs',
  'save_provider_config',
  'get_db_table_config',
  'save_db_table_config',
  'discover_db_table_facets',
  'test_db_table_query',
]);

export interface SearchBody {
  action?: ProviderConfigAction;
  query?: string;
  category?: string | string[];
  categories?: string[];
  activityHint?: string;
  city?: string;
  source?: string;
  table?: GeodataTableName;
  label?: string;
  tables?: DbTableConfigInput[];
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  bias?: { lat?: number; lon?: number };
  radius_km?: number;
  open_now?: boolean;
  limit?: number;
  lenient?: boolean;
  provider_mode?: ProviderMode;
  columns?: string[];
  group?: ProviderConfigGroup;
  provider?: ProviderMode;
}

export class PlaceSearchContractError extends Error {
  readonly status = 400;
}

const MAX_BODY_BYTES = 32 * 1024;
const PROVIDER_GROUPS = ['default', 'personal', 'venue', 'trip_planner'] as const;
const BASE_PROVIDERS = ['aws', 'geoapify_tomtom', 'mapy'] as const;
const GEODATA_TABLES = ['public.unified_pois', 'public.local_pois', 'public.geoapify_pois'] as const;
const BODY_FIELDS = new Set([
  'action', 'query', 'category', 'categories', 'activityHint', 'city', 'source',
  'table', 'label', 'tables', 'latitude', 'longitude', 'lat', 'lon', 'bias',
  'radius_km', 'open_now', 'limit', 'lenient', 'provider_mode', 'columns',
  'group', 'provider',
]);

const ACTION_FIELDS: Record<ProviderConfigAction, ReadonlySet<string>> = {
  autocomplete: new Set(['action', 'query', 'category', 'categories', 'activityHint', 'city', 'source', 'latitude', 'longitude', 'lat', 'lon', 'bias', 'radius_km', 'open_now', 'limit', 'lenient', 'provider_mode', 'group']),
  geocode: new Set(['action', 'query', 'city', 'latitude', 'longitude', 'lat', 'lon', 'bias', 'limit', 'provider_mode', 'group']),
  reverse: new Set(['action', 'latitude', 'longitude', 'lat', 'lon', 'limit', 'provider_mode', 'group']),
  get_provider_config: new Set(['action', 'group']),
  get_all_provider_configs: new Set(['action']),
  save_provider_config: new Set(['action', 'group', 'provider']),
  get_db_table_config: new Set(['action']),
  save_db_table_config: new Set(['action', 'tables']),
  discover_db_table_facets: new Set(['action', 'provider', 'table', 'label', 'limit']),
  test_db_table_query: new Set(['action', 'provider', 'table', 'label', 'query', 'category', 'categories', 'city', 'source', 'columns', 'limit']),
};

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new PlaceSearchContractError(`${field} must be a finite number`);
  return parsed;
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new PlaceSearchContractError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new PlaceSearchContractError(`${field} is too long`);
  return normalized || undefined;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new PlaceSearchContractError(`${field} must be a boolean`);
  return value;
}

function optionalStringArray(value: unknown, field: string, maxItems = 32): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new PlaceSearchContractError(`${field} must be an array with at most ${maxItems} items`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 100) {
      throw new PlaceSearchContractError(`${field}[${index}] must be a non-empty string up to 100 characters`);
    }
    return item.trim();
  });
}

function optionalCategory(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) return optionalStringArray(value, 'category');
  return optionalString(value, 'category', 100);
}

function parseProvider(value: unknown, field: string): ProviderMode | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new PlaceSearchContractError(`${field} must be a provider identifier`);
  const normalized = value.trim();
  if ((BASE_PROVIDERS as readonly string[]).includes(normalized) || /^db:[a-z0-9][a-z0-9_-]{1,62}$/i.test(normalized)) {
    return normalized as ProviderMode;
  }
  throw new PlaceSearchContractError(`${field} is not an allowed provider`);
}

function parseGroup(value: unknown): ProviderConfigGroup | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (PROVIDER_GROUPS as readonly string[]).includes(value)) {
    return value as ProviderConfigGroup;
  }
  throw new PlaceSearchContractError('group is not an allowed provider group');
}

function parseTable(value: unknown, field = 'table'): GeodataTableName | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (GEODATA_TABLES as readonly string[]).includes(value)) {
    return value as GeodataTableName;
  }
  throw new PlaceSearchContractError(`${field} is not an allowed geodata table`);
}

function parseBias(value: unknown): SearchBody['bias'] {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlaceSearchContractError('bias must be an object');
  }
  const raw = value as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((key) => key !== 'lat' && key !== 'lon');
  if (unknown.length) throw new PlaceSearchContractError(`Unsupported bias field: ${unknown[0]}`);
  const lat = optionalFiniteNumber(raw.lat, 'bias.lat');
  const lon = optionalFiniteNumber(raw.lon, 'bias.lon');
  if (lat !== undefined && Math.abs(lat) > 90) throw new PlaceSearchContractError('bias.lat is outside its valid range');
  if (lon !== undefined && Math.abs(lon) > 180) throw new PlaceSearchContractError('bias.lon is outside its valid range');
  return lat === undefined && lon === undefined ? undefined : { lat, lon };
}

function parseTables(value: unknown): DbTableConfigInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 20) {
    throw new PlaceSearchContractError('tables must contain at most 20 entries');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new PlaceSearchContractError(`tables[${index}] must be an object`);
    }
    const raw = item as Record<string, unknown>;
    const allowed = new Set(['id', 'provider', 'label', 'table', 'enabled', 'createdAt', 'updatedAt']);
    const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
    if (unknown.length) throw new PlaceSearchContractError(`Unsupported tables[${index}] field: ${unknown[0]}`);
    const table = parseTable(raw.table, `tables[${index}].table`);
    if (!table) throw new PlaceSearchContractError(`tables[${index}].table is required`);
    const provider = parseProvider(raw.provider, `tables[${index}].provider`);
    if (provider && !provider.startsWith('db:')) {
      throw new PlaceSearchContractError(`tables[${index}].provider must use db:<id>`);
    }
    return {
      id: optionalString(raw.id, `tables[${index}].id`, 64),
      provider: provider as DbProviderMode | undefined,
      label: optionalString(raw.label, `tables[${index}].label`, 80),
      table,
      enabled: optionalBoolean(raw.enabled, `tables[${index}].enabled`),
      createdAt: optionalString(raw.createdAt, `tables[${index}].createdAt`, 64),
      updatedAt: optionalString(raw.updatedAt, `tables[${index}].updatedAt`, 64),
    };
  });
}

export function normalizePlaceSearchBody(value: unknown): SearchBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlaceSearchContractError('JSON object body required');
  }
  const body = value as Record<string, unknown>;
  const unknownField = Object.keys(body).find((field) => !BODY_FIELDS.has(field));
  if (unknownField) throw new PlaceSearchContractError(`Unsupported place-search field: ${unknownField}`);
  const rawAction = body.action ?? 'autocomplete';
  if (typeof rawAction !== 'string' || !(PLACE_SEARCH_ACTIONS as readonly string[]).includes(rawAction)) {
    throw new PlaceSearchContractError('Unsupported place-search action');
  }

  const action = rawAction as ProviderConfigAction;
  const unsupportedForAction = Object.keys(body).find((field) => !ACTION_FIELDS[action].has(field));
  if (unsupportedForAction) {
    throw new PlaceSearchContractError(`${unsupportedForAction} is not allowed for ${action}`);
  }

  const query = optionalString(body.query, 'query', 300);
  const limit = optionalFiniteNumber(body.limit, 'limit');
  const radiusKm = optionalFiniteNumber(body.radius_km, 'radius_km');
  if (radiusKm !== undefined && (radiusKm <= 0 || radiusKm > 500)) {
    throw new PlaceSearchContractError('radius_km must be between 0 and 500');
  }
  const lat = optionalFiniteNumber(body.lat, 'lat');
  const lon = optionalFiniteNumber(body.lon, 'lon');
  const latitude = optionalFiniteNumber(body.latitude, 'latitude');
  const longitude = optionalFiniteNumber(body.longitude, 'longitude');
  for (const [field, coordinate, max] of [
    ['lat', lat, 90],
    ['latitude', latitude, 90],
    ['lon', lon, 180],
    ['longitude', longitude, 180],
  ] as const) {
    if (coordinate !== undefined && Math.abs(coordinate) > max) {
      throw new PlaceSearchContractError(`${field} is outside its valid range`);
    }
  }

  const columns = optionalStringArray(body.columns, 'columns', 64);
  if (columns?.some((column) => !/^[a-z_][a-z0-9_]{0,62}$/i.test(column))) {
    throw new PlaceSearchContractError('columns contains an invalid identifier');
  }

  return {
    action,
    query,
    category: optionalCategory(body.category),
    categories: optionalStringArray(body.categories, 'categories'),
    activityHint: optionalString(body.activityHint, 'activityHint', 100),
    city: optionalString(body.city, 'city', 100),
    source: optionalString(body.source, 'source', 100),
    table: parseTable(body.table),
    label: optionalString(body.label, 'label', 80),
    tables: parseTables(body.tables),
    limit: limit === undefined ? undefined : Math.max(1, Math.min(80, Math.round(limit))),
    lat,
    lon,
    latitude,
    longitude,
    bias: parseBias(body.bias),
    radius_km: radiusKm,
    open_now: optionalBoolean(body.open_now, 'open_now'),
    lenient: optionalBoolean(body.lenient, 'lenient'),
    provider_mode: parseProvider(body.provider_mode, 'provider_mode'),
    columns,
    group: parseGroup(body.group),
    provider: parseProvider(body.provider, 'provider'),
  };
}

export async function parsePlaceSearchRequest(request: Request): Promise<SearchBody> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PlaceSearchContractError('Request body is too large');
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new PlaceSearchContractError('Request body is too large');
  }
  if (!rawBody.trim()) return normalizePlaceSearchBody({});
  try {
    return normalizePlaceSearchBody(JSON.parse(rawBody));
  } catch (error) {
    if (error instanceof PlaceSearchContractError) throw error;
    throw new PlaceSearchContractError('Malformed JSON body');
  }
}
