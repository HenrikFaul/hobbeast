import { describe, expect, it } from 'vitest';
import {
  filterDbRows,
  isAdminExternalProviderTab,
  normalizeDbQueryResult,
  normalizeEventbriteEvent,
  normalizeExternalEvent,
} from './domain';

describe('external-events admin normalized domain', () => {
  it('accepts only the four established provider tabs', () => {
    expect(['eventbrite', 'ticketmaster', 'seatgeek', 'places'].every(isAdminExternalProviderTab)).toBe(true);
    expect(isAdminExternalProviderTab('unknown')).toBe(false);
  });

  it('normalizes Eventbrite DTOs into the shared admin provider card contract', () => {
    expect(normalizeEventbriteEvent({
      id: 'eb-1',
      title: 'Meetup',
      category: 'Community',
      event_date: '2026-09-01',
      event_time: '18:00',
      location_city: 'Budapest',
      location_district: null,
      location_address: null,
      location_free_text: null,
      location_type: 'city',
      max_attendees: null,
      image_emoji: '🤝',
      tags: [],
      description: null,
      created_by: '',
      participant_count: 0,
      source: 'eventbrite',
      eventbrite_url: 'https://example.test/eb',
      eventbrite_logo_url: null,
    })).toEqual(expect.objectContaining({
      id: 'eb-1',
      provider: 'eventbrite',
      title: 'Meetup',
      sourceLabel: 'Eventbrite',
      freshnessState: 'unknown',
    }));
  });

  it('normalizes external event DTOs without leaking provider-specific payload fields', () => {
    const normalized = normalizeExternalEvent({
      external_source: 'ticketmaster',
      external_id: 'tm-1',
      external_url: null,
      title: 'Concert',
      category: 'Music',
      subcategory: 'Live',
      tags: ['night'],
      description: null,
      event_date: '2026-10-01',
      event_time: null,
      location_type: 'city',
      location_city: 'Budapest',
      location_address: null,
      location_free_text: null,
      location_lat: null,
      location_lon: null,
      price_min: null,
      price_max: null,
      currency: null,
      is_free: null,
      max_attendees: null,
      image_url: null,
      organizer_name: null,
      source_payload: { secret_provider_shape: true },
      source_last_synced_at: '2026-08-23T00:00:00.000Z',
    });
    expect(normalized).toEqual(expect.objectContaining({
      id: 'ticketmaster-tm-1',
      provider: 'ticketmaster',
      category: 'Live',
      sourceLabel: 'Ticketmaster',
    }));
    expect(normalized).not.toHaveProperty('source_payload');
  });

  it('normalizes DB provider rows and preserves the selected projection and timing evidence', () => {
    const normalized = normalizeDbQueryResult({
      results: [{ provider: 'db', external_id: '1', name: 'Alpha', city: 'Budapest', latitude: 47, longitude: 19 }],
      rows: [{ id: '1', name: 'Alpha', city: 'Budapest' }],
      columns: ['id', 'name', 'city'],
      totalCount: 4,
      debug: { response_ms: 42 },
    }, ['id'], 'kávé', 'catering.cafe', 70);

    expect(normalized.columns).toEqual(['id', 'name', 'city']);
    expect(normalized.rows).toEqual([{ id: '1', name: 'Alpha', city: 'Budapest' }]);
    expect(normalized.totalCount).toBe(4);
    expect(normalized.responseMs).toBe(42);
    expect(normalized.debug).toEqual(expect.objectContaining({
      requested_category: 'kávé',
      mapped_category: 'catering.cafe',
      frontend_response_ms: 70,
    }));
  });

  it('keeps column filters frontend-only and conjunctive', () => {
    const rows = [
      { name: 'Alpha Café', city: 'Budapest' },
      { name: 'Beta Park', city: 'Budapest' },
      { name: 'Alpha Hall', city: 'Pécs' },
    ];
    expect(filterDbRows(rows, { name: 'alpha', city: 'budapest' })).toEqual([rows[0]]);
    expect(filterDbRows(rows, { name: '', city: '' })).toEqual(rows);
  });
});
