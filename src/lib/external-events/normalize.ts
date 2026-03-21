import type { ExternalEventNormalized } from './types';

export interface ExternalEventCardLike {
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
  source: 'ticketmaster' | 'seatgeek';
  source_label: string;
  external_url: string | null;
  image_url: string | null;
  organizer_name: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  is_free: boolean | null;
}

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  Music: '🎵',
  Sports: '🏃',
  Sports_Fitness: '🏃',
  Business: '💼',
  Arts: '🎨',
  Food: '🍽️',
  Food_Drink: '🍽️',
  Community: '🤝',
  Film: '🎬',
  Family: '👨‍👩‍👧‍👦',
  Theater: '🎭',
  Other: '📅',
};

export function providerLabel(source: ExternalEventNormalized['external_source']) {
  switch (source) {
    case 'ticketmaster':
      return 'Ticketmaster';
    case 'seatgeek':
      return 'SeatGeek';
    case 'universe':
      return 'Universe';
    case 'tickettailor':
      return 'Ticket Tailor';
    default:
      return 'Külső forrás';
  }
}

export function categoryEmoji(category: string | null) {
  if (!category) return '📅';
  return CATEGORY_EMOJI_MAP[category.replace(/\s+/g, '_')] || CATEGORY_EMOJI_MAP[category] || '📅';
}

export function mapExternalEventToCardLike(event: ExternalEventNormalized): ExternalEventCardLike {
  return {
    id: `${event.external_source}-${event.external_id}`,
    title: event.title,
    category: event.subcategory || event.category || 'Külső esemény',
    event_date: event.event_date,
    event_time: event.event_time,
    location_city: event.location_city,
    location_district: null,
    location_address: event.location_address,
    location_free_text: event.location_free_text,
    location_type: event.location_type,
    max_attendees: event.max_attendees,
    image_emoji: categoryEmoji(event.category),
    tags: [providerLabel(event.external_source), ...event.tags],
    description: event.description,
    created_by: '',
    participant_count: 0,
    source: event.external_source === 'ticketmaster' ? 'ticketmaster' : 'seatgeek',
    source_label: providerLabel(event.external_source),
    external_url: event.external_url,
    image_url: event.image_url,
    organizer_name: event.organizer_name,
    price_min: event.price_min,
    price_max: event.price_max,
    currency: event.currency,
    is_free: event.is_free,
  };
}
