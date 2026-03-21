export type ExternalEventSource = 'ticketmaster' | 'universe' | 'tickettailor' | 'seatgeek';

export interface ExternalEventNormalized {
  external_source: ExternalEventSource;
  external_id: string;
  external_url: string | null;

  title: string;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  description: string | null;

  event_date: string | null;
  event_time: string | null;

  location_type: 'address' | 'city' | 'online' | 'free';
  location_city: string | null;
  location_address: string | null;
  location_free_text: string | null;
  location_lat: number | null;
  location_lon: number | null;

  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  is_free: boolean | null;

  max_attendees: number | null;
  image_url: string | null;
  organizer_name: string | null;

  source_payload: Record<string, unknown>;
  source_last_synced_at: string;
}

export interface ExternalEventsPagination {
  page: number;
  pageSize: number;
  total?: number | null;
  hasMore?: boolean;
}

export interface ExternalEventsSearchResult {
  events: ExternalEventNormalized[];
  pagination: ExternalEventsPagination;
}

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
