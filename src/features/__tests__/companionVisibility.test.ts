import { describe, expect, it } from 'vitest';
import { hasCompanionPlan, isExternal, type EventData } from '@/features/events/discoveryModel';

function programme(overrides: Partial<EventData> = {}): EventData {
  return {
    id: 'ext-feed-1',
    title: 'Esti csillagászat',
    category: 'Természet',
    event_date: '2026-09-04',
    event_time: '20:30',
    location_city: 'Bükk',
    location_district: null,
    location_address: null,
    location_free_text: null,
    location_type: 'address',
    max_attendees: null,
    image_emoji: '🔭',
    tags: [],
    description: null,
    created_by: '',
    source: 'eventbrite',
    source_label: 'Programajánló',
    external_event_id: '7031c2cf-2f0e-429f-b8cb-bfa0527e4832',
    ...overrides,
  };
}

/**
 * The rule the product depends on: a companion plan never turns an external
 * program into a Hobbeast event. It stays external — it only earns a place in
 * the Hobbeast view, carrying a label that says what it really is.
 */
describe('companion plans in the discovery filters', () => {
  it('leaves the program external even when a joint visit exists', () => {
    expect(isExternal(programme({ companion_count: 3 }))).toBe(true);
  });

  it('recognises a program that already has a joint visit', () => {
    expect(hasCompanionPlan(programme({ companion_count: 3 }))).toBe(true);
  });

  it('does not claim a plan for a program nobody organised yet', () => {
    expect(hasCompanionPlan(programme({ companion_count: 0 }))).toBe(false);
    expect(hasCompanionPlan(programme())).toBe(false);
  });

  it('never marks a native Hobbeast event as a companion extension', () => {
    const native = programme({ source: 'hobbeast', source_label: 'Hobbeast', external_event_id: undefined });
    expect(isExternal(native)).toBe(false);
    expect(hasCompanionPlan(native)).toBe(false);
  });
});
