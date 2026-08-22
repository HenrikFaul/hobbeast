import { describe, expect, it } from 'vitest';
import {
  buildLocationQuery,
  eventCanonicalIdentity,
  eventMatchesFavorites,
  getEventCategoryKeys,
  getTodayDateString,
  haversineDistanceKm,
  isExternal,
  isUpcomingEventDate,
  safeExternalUrl,
  type EventData,
} from '../discoveryModel';

const event: EventData = {
  id: 'event-1',
  title: 'Kezdő túra',
  category: 'Természet & Túra > Túrázás > Napi túra',
  event_date: '2026-09-10',
  event_time: '09:00',
  location_city: 'Budapest',
  location_district: null,
  location_address: 'Normafa',
  location_free_text: null,
  location_type: 'address',
  max_attendees: 12,
  image_emoji: '🥾',
  tags: ['természet'],
  description: null,
  created_by: 'host-1',
  source: 'hobbeast',
};

describe('event discovery model', () => {
  it('keeps outbound URLs HTTPS-only', () => {
    expect(safeExternalUrl('https://provider.example/events/1')).toBe('https://provider.example/events/1');
    expect(safeExternalUrl('http://provider.example/events/1')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('preserves native/external and location semantics', () => {
    expect(isExternal(event)).toBe(false);
    expect(isExternal({ ...event, source: 'eventbrite' })).toBe(true);
    expect(buildLocationQuery(event)).toBe('Normafa, Budapest');
    expect(buildLocationQuery({ ...event, location_type: 'online' })).toBeNull();
  });

  it('derives deterministic identity and taxonomy keys', () => {
    expect(eventCanonicalIdentity(event)).toBe(eventCanonicalIdentity({ ...event }));
    const keys = getEventCategoryKeys(event.category);
    expect(keys.categoryId).toBeTruthy();
    expect(keys.subcategoryId).toBeTruthy();
  });

  it('matches favorite text accent-insensitively', () => {
    expect(eventMatchesFavorites(event, ['turazas'])).toBe(true);
    expect(eventMatchesFavorites(event, ['sakk'])).toBe(false);
  });

  it('keeps date and distance calculations deterministic', () => {
    const now = new Date('2026-08-23T12:00:00');
    expect(getTodayDateString(now)).toBe('2026-08-23');
    expect(isUpcomingEventDate('2026-08-23', now)).toBe(true);
    expect(isUpcomingEventDate('2026-08-22', now)).toBe(false);
    expect(haversineDistanceKm({ lat: 47.4979, lon: 19.0402 }, { lat: 47.4979, lon: 19.0402 })).toBe(0);
  });
});
