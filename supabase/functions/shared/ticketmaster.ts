import { fetchJson, isoNow } from './providerFetch.ts';
import type { ExternalEventNormalized } from './external-events-types.ts';

const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

export interface TicketmasterSearchParams {
  countryCode?: string;
  city?: string;
  localStartDateTime?: string;
  classificationName?: string;
  keyword?: string;
  size?: number;
  page?: number;
  source?: string;
}

interface TicketmasterResponse {
  page?: {
    number?: number;
    size?: number;
    totalElements?: number;
    totalPages?: number;
  };
  _embedded?: {
    events?: any[];
  };
}

function envApiKey() {
  const apiKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!apiKey) throw new Error('Missing TICKETMASTER_API_KEY in Edge Function environment.');
  return apiKey;
}

function first<T>(value: T[] | null | undefined): T | null {
  return Array.isArray(value) && value.length ? value[0] : null;
}

function mapDateTime(value: string | null | undefined) {
  if (!value) return { event_date: null, event_time: null };
  const [datePart, timePart] = value.split('T');
  return {
    event_date: datePart || null,
    event_time: timePart ? timePart.slice(0, 8) : null,
  };
}

function normalizeTicketmasterEvent(event: any): ExternalEventNormalized {
  const venue = first(event?._embedded?.venues) ?? null;
  const classification = first(event?.classifications) ?? null;
  const image = first(event?.images) ?? null;
  const priceRange = first(event?.priceRanges) ?? null;
  const localStart = event?.dates?.start?.localDate && event?.dates?.start?.localTime
    ? `${event.dates.start.localDate}T${event.dates.start.localTime}`
    : event?.dates?.start?.dateTime ?? null;

  const { event_date, event_time } = mapDateTime(localStart);
  const category = classification?.segment?.name ?? null;
  const subcategory = classification?.genre?.name ?? classification?.subGenre?.name ?? null;
  const tags = [
    classification?.segment?.name,
    classification?.genre?.name,
    classification?.subGenre?.name,
    classification?.type?.name,
    classification?.subType?.name,
  ].filter(Boolean);

  return {
    external_source: 'ticketmaster',
    external_id: String(event.id),
    external_url: event.url ?? null,
    title: event.name ?? 'Untitled event',
    category,
    subcategory,
    tags,
    description: event.info ?? event.pleaseNote ?? null,
    event_date,
    event_time,
    location_type: venue ? 'address' : 'free',
    location_city: venue?.city?.name ?? null,
    location_address: venue?.address?.line1 ?? venue?.name ?? null,
    location_free_text: null,
    location_lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
    location_lon: venue?.location?.longitude ? Number(venue.location.longitude) : null,
    price_min: typeof priceRange?.min === 'number' ? priceRange.min : null,
    price_max: typeof priceRange?.max === 'number' ? priceRange.max : null,
    currency: priceRange?.currency ?? null,
    is_free: priceRange && priceRange.min === 0 && priceRange.max === 0 ? true : null,
    max_attendees: null,
    image_url: image?.url ?? null,
    organizer_name: event?.promoter?.name ?? null,
    source_payload: event,
    source_last_synced_at: isoNow(),
  };
}

export async function fetchTicketmasterEvents(params: TicketmasterSearchParams) {
  const url = new URL(BASE_URL);
  const apiKey = envApiKey();
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('size', String(params.size ?? 50));
  url.searchParams.set('page', String(params.page ?? 0));
  if (params.countryCode) url.searchParams.set('countryCode', params.countryCode);
  if (params.city) url.searchParams.set('city', params.city);
  if (params.localStartDateTime) url.searchParams.set('localStartDateTime', params.localStartDateTime);
  if (params.classificationName) url.searchParams.set('classificationName', params.classificationName);
  if (params.keyword) url.searchParams.set('keyword', params.keyword);
  if (params.source) url.searchParams.set('source', params.source);

  const data = await fetchJson<TicketmasterResponse>(url.toString(), { method: 'GET' }, 'Ticketmaster fetch failed');
  const rawEvents = data._embedded?.events ?? [];
  return {
    events: rawEvents.map(normalizeTicketmasterEvent),
    pagination: {
      page: data.page?.number ?? 0,
      pageSize: data.page?.size ?? params.size ?? 50,
      total: data.page?.totalElements ?? null,
      hasMore: (data.page?.number ?? 0) + 1 < (data.page?.totalPages ?? 0),
    },
  };
}
