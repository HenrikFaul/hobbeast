import { fetchJson, isoNow } from './providerFetch.ts';
import type { ExternalEventNormalized } from './external-events-types.ts';

const BASE_URL = 'https://api.seatgeek.com/2/events';

export interface SeatGeekSearchParams {
  q?: string;
  venueCity?: string;
  datetimeUtcGte?: string;
  taxonomyName?: string;
  perPage?: number;
  page?: number;
  lat?: number;
  lon?: number;
  range?: string;
}

interface SeatGeekResponse {
  events?: any[];
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
  };
}

function authParams() {
  const clientId = Deno.env.get('SEATGEEK_CLIENT_ID');
  const clientSecret = Deno.env.get('SEATGEEK_CLIENT_SECRET');
  if (!clientId) throw new Error('Missing SEATGEEK_CLIENT_ID in Edge Function environment.');
  return { clientId, clientSecret };
}

function mapDateTime(datetimeLocal: string | null | undefined) {
  if (!datetimeLocal) return { event_date: null, event_time: null };
  const [datePart, timePart] = datetimeLocal.split('T');
  return { event_date: datePart || null, event_time: timePart ? timePart.slice(0, 8) : null };
}

function normalizeSeatGeekEvent(event: any): ExternalEventNormalized {
  const venue = event?.venue ?? null;
  const taxonomy = Array.isArray(event?.taxonomies) && event.taxonomies.length ? event.taxonomies[0] : null;
  const { event_date, event_time } = mapDateTime(event?.datetime_local ?? null);
  const lowestPrice = typeof event?.stats?.lowest_price === 'number' ? event.stats.lowest_price : null;
  const highestPrice = typeof event?.stats?.highest_price === 'number' ? event.stats.highest_price : null;

  return {
    external_source: 'seatgeek',
    external_id: String(event.id),
    external_url: event.url ?? null,
    title: event.title ?? 'Untitled event',
    category: taxonomy?.name ?? null,
    subcategory: event.short_title ?? null,
    tags: [taxonomy?.name, ...(Array.isArray(event?.performers) ? event.performers.map((p: any) => p?.name).filter(Boolean).slice(0, 5) : [])],
    description: event.short_title ?? null,
    event_date,
    event_time,
    location_type: venue ? 'address' : 'free',
    location_city: venue?.city ?? null,
    location_address: venue?.address ?? venue?.name ?? null,
    location_free_text: null,
    location_lat: typeof venue?.location?.lat === 'number' ? venue.location.lat : null,
    location_lon: typeof venue?.location?.lon === 'number' ? venue.location.lon : null,
    price_min: lowestPrice,
    price_max: highestPrice,
    currency: null,
    is_free: lowestPrice === 0 && highestPrice === 0 ? true : null,
    max_attendees: null,
    image_url: Array.isArray(event?.performers) && event.performers.length ? event.performers[0]?.image ?? null : null,
    organizer_name: venue?.name ?? null,
    source_payload: event,
    source_last_synced_at: isoNow(),
  };
}

export async function fetchSeatGeekEvents(params: SeatGeekSearchParams) {
  const url = new URL(BASE_URL);
  const { clientId, clientSecret } = authParams();
  url.searchParams.set('client_id', clientId);
  if (clientSecret) url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('per_page', String(params.perPage ?? 50));
  url.searchParams.set('page', String(params.page ?? 1));
  if (params.q) url.searchParams.set('q', params.q);
  if (params.venueCity) url.searchParams.set('venue.city', params.venueCity);
  if (params.datetimeUtcGte) url.searchParams.set('datetime_utc.gte', params.datetimeUtcGte);
  if (params.taxonomyName) url.searchParams.append('taxonomies.name', params.taxonomyName);
  if (typeof params.lat === 'number' && typeof params.lon === 'number') {
    url.searchParams.set('lat', String(params.lat));
    url.searchParams.set('lon', String(params.lon));
    if (params.range) url.searchParams.set('range', params.range);
  }

  const data = await fetchJson<SeatGeekResponse>(url.toString(), { method: 'GET' }, 'SeatGeek fetch failed');
  const events = data.events ?? [];
  return {
    events: events.map(normalizeSeatGeekEvent),
    pagination: {
      page: data.meta?.page ?? params.page ?? 1,
      pageSize: data.meta?.per_page ?? params.perPage ?? 50,
      total: data.meta?.total ?? null,
      hasMore: (data.meta?.page ?? 1) * (data.meta?.per_page ?? params.perPage ?? 50) < (data.meta?.total ?? 0),
    },
  };
}
