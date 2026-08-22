import type { MappedEventbriteEvent } from '@/lib/eventbrite';
import type {
  ExternalEventNormalized,
  SeatGeekSearchParams,
  TicketmasterSearchParams,
} from '@/lib/external-events';
import type { NormalizedPlace } from '@/lib/placeSearch';
import type {
  AddressSearchFunctionGroup,
  AddressSearchProvider,
  DbSearchTableConfig,
  DbSearchTableTestResult,
} from '@/lib/searchProviderConfig';

export {
  BASE_PROVIDER_OPTIONS,
  DB_TEST_COLUMN_OPTIONS,
  DEFAULT_DB_TEST_COLUMNS,
  DEFAULT_DB_FORM,
  deriveCategoryAliasInfo,
  enrichMapperRow,
  rankDiscoveredCategoryMatches,
  resolveMappedCategory,
  titleCaseFromKey,
  type DbConfigFormState,
  type RankedCategorySuggestion,
} from '@/components/admin/adminEventbriteHelpers';

export type AdminExternalProviderTab = 'eventbrite' | 'ticketmaster' | 'seatgeek' | 'places';
export type AdminExternalEventProvider = 'eventbrite' | 'ticketmaster' | 'seatgeek';
export type ProviderRunPhase = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface AdminExternalEventDto {
  id: string;
  provider: AdminExternalEventProvider;
  title: string;
  category: string;
  eventDate: string | null;
  eventTime: string | null;
  city: string | null;
  imageEmoji: string;
  externalUrl: string | null;
  sourceLabel: string;
  freshnessState: 'fresh' | 'aging' | 'stale' | 'unknown';
  normalizationVersion: string;
}

export interface ProviderRunState {
  phase: ProviderRunPhase;
  message: string | null;
}

export interface ProviderOptionDto {
  value: AddressSearchProvider;
  label: string;
  detail: string;
}

export interface ProviderConfigurationSnapshot {
  groups: Record<AddressSearchFunctionGroup, AddressSearchProvider>;
  dbConfigs: DbSearchTableConfig[];
}

export interface AdminDbQuerySnapshot {
  places: NormalizedPlace[];
  rows: Record<string, unknown>[];
  columns: string[];
  totalCount: number | null;
  debug: Record<string, unknown>;
  responseMs: number;
}

export const INITIAL_TICKETMASTER_PARAMS: TicketmasterSearchParams = {
  keyword: 'Budapest',
  countryCode: 'HU',
  classificationName: 'music',
  size: 20,
  page: 0,
  source: 'ticketmaster',
};

export const INITIAL_SEATGEEK_PARAMS: SeatGeekSearchParams = {
  q: 'Budapest',
  venueCity: 'Budapest',
  taxonomyName: 'sports',
  perPage: 20,
  page: 1,
};

export const ADDRESS_SEARCH_GROUPS: AddressSearchFunctionGroup[] = [
  'default',
  'personal',
  'venue',
  'trip_planner',
];

export const INITIAL_FUNCTION_GROUP_PROVIDERS: Record<AddressSearchFunctionGroup, AddressSearchProvider> = {
  default: 'aws',
  personal: 'aws',
  venue: 'aws',
  trip_planner: 'aws',
};

export function isAdminExternalProviderTab(value: string): value is AdminExternalProviderTab {
  return value === 'eventbrite' || value === 'ticketmaster' || value === 'seatgeek' || value === 'places';
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function normalizeEventbriteEvent(event: MappedEventbriteEvent): AdminExternalEventDto {
  return {
    id: event.id,
    provider: 'eventbrite',
    title: event.title,
    category: event.category || 'Egyéb',
    eventDate: event.event_date,
    eventTime: event.event_time,
    city: event.location_city,
    imageEmoji: event.image_emoji || '📅',
    externalUrl: event.eventbrite_url,
    sourceLabel: 'Eventbrite',
    freshnessState: 'unknown',
    normalizationVersion: 'eventbrite-admin-v1',
  };
}

export function normalizeExternalEvent(event: ExternalEventNormalized): AdminExternalEventDto {
  const provider: AdminExternalEventProvider = event.external_source === 'ticketmaster'
    ? 'ticketmaster'
    : 'seatgeek';
  return {
    id: `${event.external_source}-${event.external_id}`,
    provider,
    title: event.title,
    category: event.subcategory || event.category || 'Külső esemény',
    eventDate: event.event_date,
    eventTime: event.event_time,
    city: event.location_city,
    imageEmoji: categoryEmoji(event.category),
    externalUrl: event.external_url,
    sourceLabel: providerLabel(event.external_source),
    freshnessState: event.freshness_state || 'unknown',
    normalizationVersion: event.normalization_version || 'external-event-v1',
  };
}

export function normalizeEventbriteEvents(events: readonly MappedEventbriteEvent[]): AdminExternalEventDto[] {
  return events.map(normalizeEventbriteEvent);
}

export function normalizeExternalEvents(events: readonly ExternalEventNormalized[]): AdminExternalEventDto[] {
  return events.map(normalizeExternalEvent);
}

function providerLabel(source: ExternalEventNormalized['external_source']): string {
  if (source === 'ticketmaster') return 'Ticketmaster';
  if (source === 'universe') return 'Universe';
  if (source === 'tickettailor') return 'Ticket Tailor';
  return 'SeatGeek';
}

function categoryEmoji(category: string | null): string {
  const normalized = (category || '').toLocaleLowerCase('en-US');
  if (normalized.includes('music') || normalized.includes('concert')) return '🎵';
  if (normalized.includes('sport') || normalized.includes('fitness')) return '🏃';
  if (normalized.includes('food')) return '🍽️';
  if (normalized.includes('art')) return '🎨';
  return '📅';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getNestedValue(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => asRecord(current)[key], source);
}

function mappedProviderValue(value: unknown, column: string): unknown {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  const aliases: Record<string, unknown> = {
    id: row.id ?? row.external_id,
    external_id: row.external_id,
    name: row.name,
    city: row.city,
    district: row.district,
    formatted_address: row.formatted_address ?? row.address,
    address: row.address,
    lat: row.lat ?? row.latitude,
    lon: row.lon ?? row.longitude,
    latitude: row.latitude,
    longitude: row.longitude,
    categories: row.categories,
    source_provider: metadata.source_provider ?? row.source_provider ?? row.provider,
    datasource_name: metadata.datasource_name ?? metadata.source_provider ?? row.datasource_name,
    brand: metadata.brand ?? row.brand,
    operator: metadata.operator ?? row.operator,
    cuisine: metadata.cuisine ?? row.cuisine,
    phone: row.phone,
    website: row.website,
    email: row.email,
    postal_code: row.postal_code,
    provider: row.provider,
  };
  return column in aliases
    ? aliases[column]
    : row[column] ?? metadata[column] ?? getNestedValue(row, column) ?? getNestedValue(metadata, column);
}

function projectDbRows(result: DbSearchTableTestResult, columns: readonly string[]): Record<string, unknown>[] {
  const sourceRows: unknown[] = Array.isArray(result.rows) && result.rows.length > 0
    ? result.rows
    : result.results;
  return sourceRows.map((value) => {
    const row = asRecord(value);
    const projected: Record<string, unknown> = {};
    columns.forEach((column) => {
      projected[column] = Array.isArray(result.rows) && result.rows.length > 0
        ? row[column]
        : mappedProviderValue(value, column);
    });
    return projected;
  });
}

function normalizeDbPlace(value: unknown): NormalizedPlace | null {
  const row = asRecord(value);
  if (Object.keys(row).length === 0) return null;
  const metadata = asRecord(row.metadata);
  const provider = typeof row.provider === 'string' ? row.provider : 'db';
  const sourceId = typeof row.external_id === 'string' ? row.external_id : '';
  const name = typeof row.name === 'string' ? row.name : '';
  const categories = Array.isArray(row.categories)
    ? row.categories.filter((category): category is string => typeof category === 'string')
    : typeof row.category === 'string'
      ? [row.category]
      : [];
  return {
    id: `${provider}-${sourceId}`,
    name,
    address: typeof row.address === 'string' ? row.address : name,
    city: typeof row.city === 'string' ? row.city : '',
    district: typeof row.district === 'string' ? row.district : '',
    country: typeof metadata.country === 'string' ? metadata.country : 'Hungary',
    postcode: typeof row.postal_code === 'string' ? row.postal_code : '',
    lat: typeof row.latitude === 'number' ? row.latitude : 0,
    lon: typeof row.longitude === 'number' ? row.longitude : 0,
    categories,
    source: provider,
    sourceId,
    confidence: 0.75,
  };
}

export function normalizeDbQueryResult(
  result: DbSearchTableTestResult,
  fallbackColumns: readonly string[],
  requestedCategory: string,
  mappedCategory: string,
  frontendResponseMs: number,
): AdminDbQuerySnapshot {
  const columns = Array.isArray(result.columns) && result.columns.length > 0
    ? result.columns
    : [...fallbackColumns];
  const rows = projectDbRows(result, columns);
  const debug = asRecord(result.debug);
  const totalCount = typeof result.totalCount === 'number'
    ? result.totalCount
    : typeof debug.total_count === 'number'
      ? debug.total_count
      : typeof debug.filtered_candidate_count === 'number'
        ? debug.filtered_candidate_count
        : typeof debug.raw_candidate_count === 'number'
          ? debug.raw_candidate_count
          : rows.length > 0
            ? rows.length
            : null;
  const places = result.results
    .map(normalizeDbPlace)
    .filter((place): place is NormalizedPlace => Boolean(place));
  return {
    places,
    rows,
    columns,
    totalCount,
    responseMs: typeof debug.response_ms === 'number' ? debug.response_ms : frontendResponseMs,
    debug: {
      ...debug,
      requested_category: requestedCategory,
      mapped_category: mappedCategory,
      frontend_response_ms: frontendResponseMs,
    },
  };
}

export function formatDbCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return String(value);
}

export function filterDbRows(
  rows: readonly Record<string, unknown>[],
  filters: Readonly<Record<string, string>>,
): Record<string, unknown>[] {
  return rows.filter((row) => Object.entries(filters).every(([column, filterValue]) => {
    const query = filterValue.trim().toLocaleLowerCase('hu-HU');
    return !query || formatDbCell(row[column]).toLocaleLowerCase('hu-HU').includes(query);
  }));
}

export function buildProviderOptions(
  baseOptions: readonly ProviderOptionDto[],
  dbConfigs: readonly DbSearchTableConfig[],
): ProviderOptionDto[] {
  return [
    ...baseOptions,
    ...dbConfigs.map((config) => ({
      value: config.provider,
      label: `${config.provider} · ${config.label}`,
      detail: config.table,
    })),
  ];
}
