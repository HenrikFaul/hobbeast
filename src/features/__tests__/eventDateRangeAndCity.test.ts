import { describe, expect, it } from 'vitest';
import {
  eventMatchesCity,
  eventMatchesDateRange,
  isIsoDate,
  normalizeDateRange,
  type EventData,
} from '@/features/events/discoveryModel';

function ev(overrides: Partial<EventData> = {}): EventData {
  return {
    id: 'e1',
    title: 'Program',
    category: 'Egyéb',
    event_date: '2026-09-10',
    event_time: '19:00',
    location_city: 'Budapest',
    location_district: null,
    location_address: null,
    location_free_text: null,
    location_type: 'address',
    max_attendees: null,
    image_emoji: null,
    tags: [],
    description: null,
    created_by: '',
    ...overrides,
  };
}

describe('normalizeDateRange', () => {
  it('keeps a well-formed range', () => {
    expect(normalizeDateRange('2026-09-01', '2026-09-30'))
      .toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  /** People type the two boxes in whichever order they think of them. */
  it('swaps a range entered backwards instead of returning nothing', () => {
    expect(normalizeDateRange('2026-09-30', '2026-09-01'))
      .toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('accepts a half-open range', () => {
    expect(normalizeDateRange('2026-09-01', null)).toEqual({ from: '2026-09-01', to: null });
    expect(normalizeDateRange(null, '2026-09-30')).toEqual({ from: null, to: '2026-09-30' });
  });

  it('ignores anything that is not an ISO date', () => {
    expect(normalizeDateRange('holnap', '')).toEqual({ from: null, to: null });
    expect(normalizeDateRange('2026-9-1', undefined)).toEqual({ from: null, to: null });
    expect(isIsoDate('2026-09-01')).toBe(true);
    expect(isIsoDate('01/09/2026')).toBe(false);
  });
});

describe('eventMatchesDateRange', () => {
  const event = ev({ event_date: '2026-09-10' });

  it('includes both ends of the range', () => {
    expect(eventMatchesDateRange(event, { from: '2026-09-10', to: '2026-09-10' })).toBe(true);
    expect(eventMatchesDateRange(event, { from: '2026-09-01', to: '2026-09-10' })).toBe(true);
    expect(eventMatchesDateRange(event, { from: '2026-09-10', to: '2026-09-20' })).toBe(true);
  });

  it('excludes what falls outside', () => {
    expect(eventMatchesDateRange(event, { from: '2026-09-11', to: '2026-09-20' })).toBe(false);
    expect(eventMatchesDateRange(event, { from: '2026-09-01', to: '2026-09-09' })).toBe(false);
  });

  it('an empty range matches everything', () => {
    expect(eventMatchesDateRange(event, { from: null, to: null })).toBe(true);
  });

  it('a programme with no date cannot satisfy a range', () => {
    expect(eventMatchesDateRange(ev({ event_date: null }), { from: '2026-09-01', to: null })).toBe(false);
    // …but it is not excluded when no range was asked for.
    expect(eventMatchesDateRange(ev({ event_date: null }), { from: null, to: null })).toBe(true);
  });
});

describe('eventMatchesCity', () => {
  it('matches on the city, ignoring case and accents', () => {
    expect(eventMatchesCity(ev({ location_city: 'Győr' }), 'gyor')).toBe(true);
    expect(eventMatchesCity(ev({ location_city: 'Debrecen' }), 'DEBRECEN')).toBe(true);
  });

  it('also looks at the district and the address', () => {
    expect(eventMatchesCity(ev({ location_city: 'Budapest', location_district: 'XIII' }), 'XIII')).toBe(true);
    expect(eventMatchesCity(ev({ location_address: 'Bartók Béla út 12., Szeged' }), 'szeged')).toBe(true);
  });

  it('rejects a different town', () => {
    expect(eventMatchesCity(ev({ location_city: 'Budapest' }), 'Pécs')).toBe(false);
  });

  /** No filter must never remove anything — this is the regression guard. */
  it('an empty filter matches everything', () => {
    expect(eventMatchesCity(ev(), '')).toBe(true);
    expect(eventMatchesCity(ev(), '   ')).toBe(true);
    expect(eventMatchesCity(ev(), null)).toBe(true);
    expect(eventMatchesCity(ev({ location_city: null }), null)).toBe(true);
  });
});
