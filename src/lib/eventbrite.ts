import { supabase } from "@/integrations/supabase/client";

// Types for Eventbrite API responses
export interface EventbriteEvent {
  id: string;
  name: { text: string; html: string };
  description: { text: string; html: string } | null;
  start: { timezone: string; local: string; utc: string };
  end: { timezone: string; local: string; utc: string };
  url: string;
  capacity: number | null;
  status: string;
  currency: string;
  logo: { url: string; original: { url: string } } | null;
  venue: EventbriteVenue | null;
  category: { name: string; short_name: string } | null;
  is_free: boolean;
}

export interface EventbriteVenue {
  name: string | null;
  address: {
    city: string | null;
    region: string | null;
    country: string | null;
    localized_address_display: string | null;
  };
}

export interface EventbritePagination {
  object_count: number;
  page_number: number;
  page_size: number;
  page_count: number;
  has_more_items: boolean;
}

export interface EventbriteListResponse {
  events: EventbriteEvent[];
  pagination: EventbritePagination;
}

// Map Eventbrite event to our internal EventData format
export interface MappedEventbriteEvent {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  location_district: string | null;
  location_address: string | null;
  location_free_text: string | null;
  location_type: string | null;
  max_attendees: number | null;
  image_emoji: string | null;
  tags: string[];
  description: string | null;
  created_by: string;
  participant_count: number;
  source: 'eventbrite';
  eventbrite_url: string;
  eventbrite_logo_url: string | null;
}

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  'Music': '🎵',
  'Business': '💼',
  'Food & Drink': '🍽️',
  'Community': '🤝',
  'Arts': '🎨',
  'Film & Media': '🎬',
  'Sports & Fitness': '🏃',
  'Health': '🧘',
  'Science & Tech': '💻',
  'Travel & Outdoor': '🏔️',
  'Charity & Causes': '❤️',
  'Government': '🏛️',
  'Fashion': '👗',
  'Home & Lifestyle': '🏠',
  'Auto, Boat & Air': '🚗',
  'Hobbies': '🎯',
  'School Activities': '📚',
  'Holiday': '🎉',
  'Other': '📅',
};

function mapEventbriteToInternal(event: EventbriteEvent): MappedEventbriteEvent {
  const startLocal = event.start?.local;
  const datePart = startLocal ? startLocal.split('T')[0] : null;
  const timePart = startLocal ? startLocal.split('T')[1]?.substring(0, 5) : null;

  const categoryName = event.category?.name || event.category?.short_name || 'Egyéb';
  const emoji = CATEGORY_EMOJI_MAP[categoryName] || '📅';

  const venue = event.venue;
  const city = venue?.address?.city || null;
  const addressDisplay = venue?.address?.localized_address_display || venue?.name || null;

  return {
    id: `eb-${event.id}`,
    title: event.name?.text || 'Névtelen esemény',
    category: categoryName,
    event_date: datePart,
    event_time: timePart,
    location_city: city,
    location_district: null,
    location_address: addressDisplay,
    location_free_text: null,
    location_type: venue ? 'address' : 'online',
    max_attendees: event.capacity,
    image_emoji: emoji,
    tags: [
      'Eventbrite',
      ...(event.is_free ? ['Ingyenes'] : []),
      ...(event.category?.short_name ? [event.category.short_name] : []),
    ],
    description: event.description?.text?.substring(0, 300) || null,
    created_by: '',
    participant_count: 0,
    source: 'eventbrite',
    eventbrite_url: event.url,
    eventbrite_logo_url: event.logo?.original?.url || event.logo?.url || null,
  };
}

// Fetch organizations associated with the Eventbrite account
export async function fetchEventbriteOrganizations() {
  const { data, error } = await supabase.functions.invoke('eventbrite-import', {
    body: { action: 'list_organizations' },
  });
  if (error) throw new Error(error.message);
  return data;
}

// Fetch events from a specific organization
export async function fetchEventbriteEvents(
  organizationId: string,
  page = 1
): Promise<{ events: MappedEventbriteEvent[]; pagination: EventbritePagination }> {
  const { data, error } = await supabase.functions.invoke('eventbrite-import', {
    body: { action: 'list_events', organization_id: organizationId, page },
  });
  if (error) throw new Error(error.message);

  const response = data as EventbriteListResponse;
  return {
    events: (response.events || []).map(mapEventbriteToInternal),
    pagination: response.pagination,
  };
}

// Search Eventbrite events by keyword
export async function searchEventbriteEvents(
  keyword: string,
  page = 1
): Promise<{ events: MappedEventbriteEvent[]; pagination: EventbritePagination }> {
  const { data, error } = await supabase.functions.invoke('eventbrite-import', {
    body: { action: 'search_events', keyword, page },
  });
  if (error) throw new Error(error.message);

  const response = data as EventbriteListResponse;
  return {
    events: (response.events || []).map(mapEventbriteToInternal),
    pagination: response.pagination,
  };
}
