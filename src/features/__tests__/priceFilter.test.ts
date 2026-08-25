import { describe, expect, it } from 'vitest';
import { eventMatchesPrice, type EventData } from '@/features/events/discoveryModel';

const program = (extra: Partial<EventData>): EventData => ({
  id: 'e1', title: 'Program', category: 'Zene', event_date: '2026-09-01', event_time: null,
  location_city: 'Budapest', location_district: null, location_address: null,
  location_free_text: null, location_type: 'address', max_attendees: null,
  image_emoji: null, tags: [], description: null, created_by: '', ...extra,
});

describe('free vs paid filter', () => {
  it('passes everything through when no filter is applied', () => {
    expect(eventMatchesPrice(program({ price_min: 4500 }), 'all')).toBe(true);
    expect(eventMatchesPrice(program({}), 'all')).toBe(true);
  });

  it('treats an explicit zero price or is_free flag as free', () => {
    expect(eventMatchesPrice(program({ price_min: 0 }), 'free')).toBe(true);
    expect(eventMatchesPrice(program({ is_free: true }), 'free')).toBe(true);
  });

  it('keeps priced programs out of the free view', () => {
    expect(eventMatchesPrice(program({ price_min: 3900 }), 'free')).toBe(false);
    expect(eventMatchesPrice(program({ price_min: 3900 }), 'paid')).toBe(true);
  });

  it('does not promise "free" for programs with unknown price', () => {
    // Most scraped programs carry no price; claiming they are free would mislead.
    const unknown = program({ price_min: null, is_free: null });
    expect(eventMatchesPrice(unknown, 'free')).toBe(false);
    expect(eventMatchesPrice(unknown, 'paid')).toBe(false);
  });
});
