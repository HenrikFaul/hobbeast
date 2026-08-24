import { supabase } from '@/integrations/supabase/client';
import {
  fetchEventbriteEvents,
  fetchEventbriteOrganizations,
  searchEventbriteEvents,
} from '@/lib/eventbrite';
import { previewSeatGeekEvents, syncSeatGeekEvents } from '@/lib/external-events/seatgeek';
import { previewTicketmasterEvents, syncTicketmasterEvents } from '@/lib/external-events/ticketmaster';
import type { SeatGeekSearchParams, TicketmasterSearchParams } from '@/lib/external-events';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';
import {
  discoverDbSearchTableFacets,
  getAllFunctionGroupProviders,
  getDbSearchTableConfigs,
  saveDbSearchTableConfigs,
  setAddressSearchProvider,
  testDbSearchTableQuery,
  type AddressSearchFunctionGroup,
  type AddressSearchProvider,
  type DbSearchTableConfig,
  type DbSearchTableTestInput,
  type DbSearchTableTestResult,
  type DbTableFacetDiscoveryInput,
  type DbTableFacetDiscoveryResult,
} from '@/lib/searchProviderConfig';
import {
  normalizeEventFeedActionResults,
  normalizeEventFeedStatus,
  normalizeEventbriteEvents,
  normalizeExternalEvents,
  type AdminEventFeedActionResult,
  type AdminEventFeedStatusSnapshot,
  type AdminExternalEventDto,
  type ProviderConfigurationSnapshot,
} from './domain';

export class ExternalEventsAdminRepositoryError extends Error {
  constructor(
    message: string,
    readonly operation: string,
  ) {
    super(message);
    this.name = 'ExternalEventsAdminRepositoryError';
  }
}

interface EventbriteTokenResponse {
  ok?: boolean;
  status?: string | number;
  response?: unknown;
  config?: { webhook_id?: string | null };
}

export interface EventbriteTokenStatus {
  ok: boolean;
  webhookId: string | null;
  status: string;
  response: unknown;
}

export interface EventbriteOrganizationPull {
  hasOrganization: boolean;
  events: AdminExternalEventDto[];
}

interface EventFeedResponseEnvelope {
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export type EventFeedReviewDecision = 'approved' | 'disabled';

type EventFeedReviewInput = {
  sourceId: string;
  reason: string;
} & ({
  decision: 'approved';
  enable: boolean;
  fetchHosts: string[];
  legalReviewStatus: 'approved';
  robotsAllowed: true;
  pollIntervalMinutes: number;
  minPublishQuality: number;
} | {
  decision: 'disabled';
});

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function errorMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message || fallback;
}

async function invokeEventFeed(
  body: Record<string, unknown>,
  operation: string,
): Promise<EventFeedResponseEnvelope> {
  const { data, error } = await supabase.functions.invoke<EventFeedResponseEnvelope>('event-feed-ingest', { body });
  if (error) {
    throw new ExternalEventsAdminRepositoryError(
      errorMessage(error, 'A feed művelet nem hajtható végre.'),
      operation,
    );
  }
  if (!data || typeof data !== 'object') {
    throw new ExternalEventsAdminRepositoryError('A feed szolgáltatás üres választ adott.', operation);
  }
  if (typeof data.error === 'string' && data.error) {
    throw new ExternalEventsAdminRepositoryError(data.error, operation);
  }
  return data;
}

export async function loadEventFeedStatus(): Promise<AdminEventFeedStatusSnapshot> {
  const data = await invokeEventFeed({ action: 'status', page: 1, limit: 20 }, 'event_feed_status');
  return normalizeEventFeedStatus(data);
}

export async function probeEventFeedSource(sourceId: string): Promise<AdminEventFeedActionResult[]> {
  const data = await invokeEventFeed(
    { action: 'probe_source', source_id: sourceId },
    'event_feed_probe',
  );
  return normalizeEventFeedActionResults(data);
}

export async function syncEventFeedSource(sourceId: string): Promise<AdminEventFeedActionResult[]> {
  const data = await invokeEventFeed(
    { action: 'sync_source', source_id: sourceId },
    'event_feed_sync',
  );
  return normalizeEventFeedActionResults(data);
}

export async function reviewEventFeedSource(input: EventFeedReviewInput): Promise<void> {
  const requestId = crypto.randomUUID();
  const body: Record<string, unknown> = {
    action: 'review_source',
    source_id: input.sourceId,
    decision: input.decision,
    reason: input.reason.trim(),
    request_id: requestId,
    idempotency_key: `feed-review:${input.sourceId}:${input.decision}:${requestId}`.slice(0, 100),
  };
  if (input.decision === 'approved') {
    Object.assign(body, {
      enable: input.enable,
      fetch_hosts: input.fetchHosts,
      legal_review_status: input.legalReviewStatus,
      robots_allowed: input.robotsAllowed,
      poll_interval_minutes: input.pollIntervalMinutes,
      min_publish_quality: input.minPublishQuality,
    });
  }
  await invokeEventFeed(body, 'event_feed_review');
}

export async function searchEventbriteAdmin(keyword: string): Promise<AdminExternalEventDto[]> {
  const result = await searchEventbriteEvents(keyword, 1);
  return normalizeEventbriteEvents(result.events);
}

export async function validateEventbriteToken(): Promise<EventbriteTokenStatus> {
  const { data, error } = await supabase.functions.invoke<EventbriteTokenResponse>('eventbrite-import', {
    body: { action: 'validate_token' },
  });
  if (error) {
    throw new ExternalEventsAdminRepositoryError(
      errorMessage(error, 'Az Eventbrite token nem ellenőrizhető.'),
      'validate_eventbrite_token',
    );
  }
  return {
    ok: data?.ok === true,
    webhookId: typeof data?.config?.webhook_id === 'string' ? data.config.webhook_id : null,
    status: String(data?.status || 'ismeretlen'),
    response: data?.response,
  };
}

export async function pullEventbriteOrganizationEvents(): Promise<EventbriteOrganizationPull> {
  const organizationsResponse: unknown = await fetchEventbriteOrganizations();
  const organizations = asRecord(organizationsResponse).organizations;
  if (!Array.isArray(organizations) || organizations.length === 0) {
    return { hasOrganization: false, events: [] };
  }
  const organizationId = asRecord(organizations[0]).id;
  if (typeof organizationId !== 'string' || !organizationId) {
    return { hasOrganization: false, events: [] };
  }
  const result = await fetchEventbriteEvents(organizationId, 1);
  return { hasOrganization: true, events: normalizeEventbriteEvents(result.events) };
}

export async function previewTicketmasterAdmin(params: TicketmasterSearchParams): Promise<AdminExternalEventDto[]> {
  const result = await previewTicketmasterEvents(params);
  return normalizeExternalEvents(result.events);
}

export async function syncTicketmasterAdmin(params: TicketmasterSearchParams): Promise<number> {
  const result = await syncTicketmasterEvents({ ...params, maxPages: 2 });
  return result.synced;
}

export async function previewSeatGeekAdmin(params: SeatGeekSearchParams): Promise<AdminExternalEventDto[]> {
  const result = await previewSeatGeekEvents(params);
  return normalizeExternalEvents(result.events);
}

export async function syncSeatGeekAdmin(params: SeatGeekSearchParams): Promise<number> {
  const result = await syncSeatGeekEvents({ ...params, maxPages: 2 });
  return result.synced;
}

export async function loadProviderConfiguration(): Promise<ProviderConfigurationSnapshot> {
  const [groups, configResponse] = await Promise.all([
    getAllFunctionGroupProviders(),
    getDbSearchTableConfigs(true),
  ]);
  return { groups, dbConfigs: configResponse.tables };
}

export async function saveFunctionGroupProvider(
  group: AddressSearchFunctionGroup,
  provider: AddressSearchProvider,
): Promise<void> {
  await setAddressSearchProvider(provider, group);
}

export async function saveAllFunctionGroupProviders(
  groups: Readonly<Record<AddressSearchFunctionGroup, AddressSearchProvider>>,
): Promise<void> {
  const orderedGroups: AddressSearchFunctionGroup[] = ['default', 'personal', 'venue', 'trip_planner'];
  for (const group of orderedGroups) {
    await setAddressSearchProvider(groups[group], group);
  }
}

export async function saveDbProviderConfigs(configs: DbSearchTableConfig[]): Promise<DbSearchTableConfig[]> {
  const saved = await saveDbSearchTableConfigs(configs);
  return saved.tables;
}

export async function discoverDbProviderFacets(
  input: DbTableFacetDiscoveryInput,
): Promise<DbTableFacetDiscoveryResult> {
  return discoverDbSearchTableFacets(input);
}

export async function queryDbProvider(input: DbSearchTableTestInput): Promise<DbSearchTableTestResult> {
  return testDbSearchTableQuery(input);
}

export async function testAddressProvider(
  query: string,
  provider: AddressSearchProvider,
): Promise<NormalizedPlace[]> {
  return searchPlaces(query, undefined, undefined, provider);
}
