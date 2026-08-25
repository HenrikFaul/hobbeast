import { geocodePlace } from '@/lib/placeSearch';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';
import { buildCanonicalEventIdentity } from '@/lib/recommendationEngine';

export type SourceFilter = 'all' | 'hobbeast' | 'external';
export type DateFilter = 'all' | 'today' | 'week' | 'month';
export type CapacityFilter = 'all' | 'available' | 'waitlist';
export type LatLng = { lat: number; lon: number };
export type EventRelation = 'own' | 'joined' | 'interest' | 'default';

export interface EventData {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  location_district: string | null;
  location_address: string | null;
  location_free_text: string | null;
  location_lat?: number | null;
  location_lon?: number | null;
  location_type: string | null;
  max_attendees: number | null;
  image_emoji: string | null;
  tags: string[] | null;
  description: string | null;
  created_by: string;
  participant_count?: number;
  source?: 'hobbeast' | 'eventbrite';
  source_label?: string;
  eventbrite_url?: string;
  eventbrite_logo_url?: string | null;
  place_name?: string | null;
  place_city?: string | null;
  place_address?: string | null;
  source_last_synced_at?: string | null;
  freshness_state?: 'fresh' | 'aging' | 'stale' | 'unknown';
  import_state?: 'active' | 'stale' | 'review' | 'cancelled' | 'rejected';
  canonical_identity?: string;
  external_event_id?: string;
  /** Present on aggregated programs; the normalizer already supplies these. */
  price_min?: number | null;
  is_free?: boolean | null;
}

export interface ExternalSupplyRow {
  id: string;
  external_source: string;
  external_id: string;
  external_url: string | null;
  title: string;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  location_type: string | null;
  location_city: string | null;
  location_address: string | null;
  location_free_text: string | null;
  location_lat: number | null;
  location_lon: number | null;
  max_attendees: number | null;
  image_url: string | null;
  source_last_synced_at: string | null;
  freshness_state: EventData['freshness_state'];
  import_state: EventData['import_state'];
  canonical_fingerprint: string | null;
}

export interface ProfileLocation {
  city: string | null;
  address: string | null;
  location_lat: number | null;
  location_lon: number | null;
  hobbies: string[] | null;
}

export const SOURCE_FILTERS = [
  { value: 'all' as const, label: 'Minden forrás' },
  { value: 'hobbeast' as const, label: 'Hobbeast' },
  { value: 'external' as const, label: 'Külső programok' },
];

export const EVENT_PAGE_SIZE = 48;

const geocodeCache = new Map<string, LatLng | null>();

export function isExternal(event: EventData) {
  return event.source !== undefined && event.source !== 'hobbeast';
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function eventCanonicalIdentity(event: EventData) {
  return event.canonical_identity || buildCanonicalEventIdentity({
    title: event.title,
    startsAt: event.event_date ? `${event.event_date}T${event.event_time || '00:00'}` : null,
    city: event.location_city,
  });
}

export function buildLocationQuery(event: EventData) {
  if (event.location_type === 'online') return null;
  return [event.location_address, event.location_city, event.location_free_text].filter(Boolean).join(', ');
}

export function normalizeText(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getTodayDateString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isUpcomingEventDate(eventDate: string | null | undefined, now = new Date()) {
  return Boolean(eventDate && eventDate >= getTodayDateString(now));
}

export function haversineDistanceKm(from: LatLng, to: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeLocation(query: string): Promise<LatLng | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (geocodeCache.has(normalized)) return geocodeCache.get(normalized) ?? null;
  try {
    const place = await geocodePlace(query);
    const coordinates = place ? { lat: place.lat, lon: place.lon } : null;
    geocodeCache.set(normalized, coordinates);
    return coordinates;
  } catch {
    geocodeCache.set(normalized, null);
    return null;
  }
}

export const SAMPLE_EVENTS: EventData[] = [
  { id: 'sample-1', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-03-15', event_time: '08:00', location_city: 'Budapest', location_district: null, location_address: 'Városliget', location_free_text: null, location_type: 'address', max_attendees: 40, image_emoji: '🏃', tags: ['Futás', 'Reggeli', 'Kezdő-barát'], description: null, created_by: '', participant_count: 23, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-2', title: 'Board Game Night – Társasest', category: 'Társasjátékok', event_date: '2026-03-16', event_time: '18:00', location_city: 'Budapest', location_district: null, location_address: 'Szimpla Kert', location_free_text: null, location_type: 'address', max_attendees: 20, image_emoji: '🎲', tags: ['Társasozás', 'Esti program'], description: null, created_by: '', participant_count: 12, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-3', title: 'Akrilfestés workshop kezdőknek', category: 'Kreatív', event_date: '2026-03-18', event_time: '16:00', location_city: 'Budapest', location_district: null, location_address: 'Művész Stúdió', location_free_text: null, location_type: 'address', max_attendees: 12, image_emoji: '🎨', tags: ['Festés', 'Workshop', 'Kezdő'], description: null, created_by: '', participant_count: 8, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-4', title: 'Buda Hills túra – tavaszi kirándulás', category: 'Túra', event_date: '2026-03-20', event_time: '09:00', location_city: 'Budapest', location_district: null, location_address: 'Normafa', location_free_text: null, location_type: 'address', max_attendees: 50, image_emoji: '🏔️', tags: ['Kirándulás', 'Természet'], description: null, created_by: '', participant_count: 31, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-5', title: 'Akusztikus jam session', category: 'Zene', event_date: '2026-03-22', event_time: '19:30', location_city: 'Wien', location_district: null, location_address: 'Café Prückel', location_free_text: null, location_type: 'address', max_attendees: 15, image_emoji: '🎸', tags: ['Gitár', 'Jam'], description: null, created_by: '', participant_count: 6, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-6', title: 'Street Food & Cooking Challenge', category: 'Gasztronómia', event_date: '2026-03-23', event_time: '11:00', location_city: 'Budapest', location_district: null, location_address: 'Bálna', location_free_text: null, location_type: 'address', max_attendees: 30, image_emoji: '👨‍🍳', tags: ['Főzés', 'Verseny'], description: null, created_by: '', participant_count: 18, source: 'hobbeast', source_label: 'Hobbeast' },
];

const CATEGORY_NAME_MAP = HOBBY_CATALOG.map((category) => ({
  categoryId: category.id,
  categoryNameNormalized: normalizeText(category.name),
  subcategories: category.subcategories.map((subcategory) => ({
    subcategoryId: subcategory.id,
    subcategoryNameNormalized: normalizeText(subcategory.name),
    activities: subcategory.activities.map((activity) => ({
      activityId: activity.id,
      activityNameNormalized: normalizeText(activity.name),
    })),
  })),
}));

function splitCategoryParts(category: string) {
  return category.split(/[›>]/g).map((part) => part.trim()).filter(Boolean);
}

function matchesNormalizedPart(eventPart: string, catalogPart: string) {
  return eventPart === catalogPart || eventPart.includes(catalogPart) || catalogPart.includes(eventPart);
}

export function getEventCategoryKeys(category: string) {
  const [first, second, third] = splitCategoryParts(category).map(normalizeText);
  let categoryId: string | null = null;
  let subcategoryId: string | null = null;
  let activityId: string | null = null;
  const categoryMatch = CATEGORY_NAME_MAP.find((item) => matchesNormalizedPart(first, item.categoryNameNormalized));
  if (categoryMatch) {
    categoryId = categoryMatch.categoryId;
    if (second) {
      const subcategoryMatch = categoryMatch.subcategories.find((item) => matchesNormalizedPart(second, item.subcategoryNameNormalized));
      if (subcategoryMatch) {
        subcategoryId = subcategoryMatch.subcategoryId;
        if (third) {
          const activityMatch = subcategoryMatch.activities.find((item) => matchesNormalizedPart(third, item.activityNameNormalized));
          if (activityMatch) activityId = activityMatch.activityId;
        }
      }
    }
  }
  return { categoryId, subcategoryId, activityId };
}

export type PriceFilter = 'all' | 'free' | 'paid';

/**
 * Free-vs-paid filter. The scraper captures ticket prices, so members can ask
 * the question every comparable platform lets them ask. Programs whose price is
 * unknown are treated as "not proven free": they stay out of the free view
 * rather than promising something we did not verify.
 */
export function eventMatchesPrice(event: EventData, filter: PriceFilter) {
  if (filter === 'all') return true;
  const free = event.is_free === true || event.price_min === 0;
  const paid = typeof event.price_min === 'number' && event.price_min > 0;
  return filter === 'free' ? free : paid;
}

export function eventMatchesFavorites(event: EventData, favorites: string[]) {
  if (!favorites.length) return false;
  const haystack = normalizeText([event.title, event.category, ...(event.tags || [])].join(' '));
  return favorites.some((favorite) => haystack.includes(normalizeText(favorite)));
}
