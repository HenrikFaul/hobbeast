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
} from './databaseDomain';

export type AdminExternalProviderTab = 'eventbrite' | 'ticketmaster' | 'seatgeek' | 'places' | 'feeds';
export type AdminExternalEventProvider = 'eventbrite' | 'ticketmaster' | 'seatgeek';
export type ProviderRunPhase = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface AdminEventFeedSummary {
  total: number;
  pendingReview: number;
  approved: number;
  enabled: number;
  healthy: number;
  quarantinedItems: number;
}

export interface AdminEventFeedSource {
  sourceId: string;
  publisherName: string;
  format: string;
  city: string | null;
  healthStatus: string;
  reviewState: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  nextPollAt: string | null;
  endpointUrl: string | null;
  fetchHosts: string[];
  legalReviewStatus: string;
  robotsAllowed: boolean;
  pollIntervalMinutes: number;
  minPublishQuality: number;
}

export interface AdminEventFeedApprovalDraft {
  fetchHost: string;
  legalReviewApproved: boolean;
  robotsAllowed: boolean;
  enable: boolean;
  pollIntervalMinutes: number;
  minPublishQuality: number;
  reason: string;
}

export interface AdminEventFeedRun {
  id: string;
  sourceId: string;
  action: string;
  status: string;
  discovered: number;
  quarantined: number;
  published: number;
  duplicates: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AdminEventFeedPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminEventFeedStatusSnapshot {
  summary: AdminEventFeedSummary;
  sources: AdminEventFeedSource[];
  runs: AdminEventFeedRun[];
  pagination: AdminEventFeedPagination;
}

export interface AdminEventFeedActionResult {
  sourceId: string;
  status: string;
  discovered: number;
  quarantined: number;
  published: number;
}

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
  return value === 'eventbrite'
    || value === 'ticketmaster'
    || value === 'seatgeek'
    || value === 'places'
    || value === 'feeds';
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

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function hostFromUrl(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.toLocaleLowerCase('en-US');
  } catch {
    return '';
  }
}

function normalizeFeedSource(value: unknown): AdminEventFeedSource | null {
  const row = asRecord(value);
  const sourceId = stringValue(row.source_id ?? row.sourceId ?? row.id);
  if (!sourceId) return null;
  const enabled = row.enabled === true;
  const endpointUrl = nullableString(row.endpoint_url ?? row.endpointUrl);
  const fetchHosts = stringArray(row.fetch_hosts ?? row.fetchHosts);
  return {
    sourceId,
    publisherName: stringValue(row.publisher_name ?? row.publisherName ?? row.name, sourceId),
    format: stringValue(row.format ?? row.endpoint_kind ?? row.endpointKind, 'ismeretlen'),
    city: nullableString(row.city),
    healthStatus: stringValue(row.health_status ?? row.healthStatus, enabled ? 'unknown' : 'disabled'),
    reviewState: stringValue(row.review_state ?? row.reviewState, 'pending_review'),
    enabled,
    lastSuccessAt: nullableString(
      row.last_successful_parse_at ?? row.lastSuccessfulParseAt ?? row.last_success_at ?? row.lastSuccessAt,
    ),
    nextPollAt: nullableString(row.next_poll_at ?? row.nextPollAt),
    endpointUrl,
    fetchHosts,
    legalReviewStatus: stringValue(row.legal_review_status ?? row.legalReviewStatus, 'pending'),
    robotsAllowed: row.robots_allowed === true || row.robotsAllowed === true,
    pollIntervalMinutes: Math.max(15, nonNegativeNumber(row.poll_interval_minutes ?? row.pollIntervalMinutes) || 1440),
    minPublishQuality: Math.min(100, Math.max(50, Number(row.min_publish_quality ?? row.minPublishQuality) || 80)),
  };
}

export function eventFeedApprovalDraft(source: AdminEventFeedSource): AdminEventFeedApprovalDraft {
  return {
    fetchHost: source.fetchHosts[0] || hostFromUrl(source.endpointUrl),
    legalReviewApproved: false,
    robotsAllowed: false,
    enable: source.enabled,
    pollIntervalMinutes: source.pollIntervalMinutes,
    minPublishQuality: source.minPublishQuality,
    reason: '',
  };
}

export function isExactEventFeedHost(value: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
    .test(value.trim().toLocaleLowerCase('en-US'));
}

export function isEventFeedApprovalDraftReady(draft: AdminEventFeedApprovalDraft | undefined): boolean {
  return Boolean(
    draft
      && isExactEventFeedHost(draft.fetchHost)
      && draft.legalReviewApproved
      && draft.robotsAllowed
      && Number.isInteger(draft.pollIntervalMinutes)
      && draft.pollIntervalMinutes >= 15
      && draft.pollIntervalMinutes <= 10_080
      && Number.isFinite(draft.minPublishQuality)
      && draft.minPublishQuality >= 50
      && draft.minPublishQuality <= 100
      && draft.reason.trim().length >= 8,
  );
}

export function hasEventFeedApprovalEvidence(source: AdminEventFeedSource): boolean {
  return source.reviewState === 'approved'
    && source.legalReviewStatus === 'approved'
    && source.robotsAllowed;
}

export function isEventFeedSourceTrustedActive(source: AdminEventFeedSource): boolean {
  return source.enabled && hasEventFeedApprovalEvidence(source);
}

function normalizeFeedRun(value: unknown): AdminEventFeedRun | null {
  const row = asRecord(value);
  const id = stringValue(row.id ?? row.run_id ?? row.runId);
  const sourceId = stringValue(row.source_id ?? row.sourceId);
  if (!id || !sourceId) return null;
  const counts = asRecord(row.counts);
  return {
    id,
    sourceId,
    action: stringValue(row.action, 'sync'),
    status: stringValue(row.status, 'unknown'),
    discovered: nonNegativeNumber(row.discovered_count ?? row.discovered ?? counts.discovered),
    quarantined: nonNegativeNumber(row.quarantined_count ?? row.quarantined ?? counts.quarantined),
    published: nonNegativeNumber(row.published_count ?? row.published ?? counts.published),
    duplicates: nonNegativeNumber(row.duplicate_count ?? row.duplicates ?? counts.duplicates),
    startedAt: nullableString(row.started_at ?? row.startedAt),
    finishedAt: nullableString(row.finished_at ?? row.finishedAt),
  };
}

export function normalizeEventFeedStatus(value: unknown): AdminEventFeedStatusSnapshot {
  const response = asRecord(value);
  const summary = asRecord(response.summary);
  const rawPagination = asRecord(response.pagination);
  const rawSources = Array.isArray(response.sources)
    ? response.sources
    : Array.isArray(response.items)
      ? response.items
      : [];
  const rawRuns = Array.isArray(response.runs) ? response.runs : [];
  const sources = rawSources
    .map(normalizeFeedSource)
    .filter((source): source is AdminEventFeedSource => Boolean(source));
  const runs = rawRuns
    .map(normalizeFeedRun)
    .filter((run): run is AdminEventFeedRun => Boolean(run));
  const limit = Math.max(1, Math.trunc(nonNegativeNumber(rawPagination.limit) || 20));
  const total = nonNegativeNumber(rawPagination.total ?? summary.total ?? sources.length);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.trunc(nonNegativeNumber(rawPagination.page) || 1)),
  );

  return {
    summary: {
      total: nonNegativeNumber(summary.total ?? sources.length),
      pendingReview: nonNegativeNumber(
        summary.pending_review ?? summary.pendingReview
          ?? sources.filter((source) => source.reviewState === 'pending_review').length,
      ),
      approved: nonNegativeNumber(
        summary.approved ?? sources.filter((source) => source.reviewState === 'approved').length,
      ),
      enabled: nonNegativeNumber(summary.enabled ?? sources.filter((source) => source.enabled).length),
      healthy: nonNegativeNumber(
        summary.healthy ?? sources.filter((source) => source.healthStatus === 'healthy').length,
      ),
      quarantinedItems: nonNegativeNumber(summary.quarantined_items ?? summary.quarantinedItems),
    },
    sources,
    runs,
    pagination: { page, limit, total, totalPages },
  };
}

export function normalizeEventFeedActionResults(value: unknown): AdminEventFeedActionResult[] {
  const response = asRecord(value);
  const rawResults = Array.isArray(response.results)
    ? response.results
    : response.result
      ? [response.result]
      : [];
  return rawResults.map((value) => {
    const row = asRecord(value);
    return {
      sourceId: stringValue(row.source_id ?? row.sourceId),
      status: stringValue(row.status, response.ok === true ? 'succeeded' : 'unknown'),
      discovered: nonNegativeNumber(row.discovered),
      quarantined: nonNegativeNumber(row.quarantined),
      published: nonNegativeNumber(row.published),
    };
  }).filter((result) => Boolean(result.sourceId));
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
