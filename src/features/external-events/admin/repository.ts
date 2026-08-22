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
  normalizeEventbriteEvents,
  normalizeExternalEvents,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function errorMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message || fallback;
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
