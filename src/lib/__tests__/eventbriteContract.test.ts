import { describe, expect, it } from 'vitest';
import {
  normalizeEventbriteEvent,
  normalizeEventbriteOrganizations,
  normalizeEventbritePage,
} from '../../../supabase/functions/shared/eventbrite';

describe('Eventbrite anti-corruption contract', () => {
  it('normalizes provider payload into the canonical event card DTO', () => {
    const event = normalizeEventbriteEvent({
      id: 'EB-1',
      name: { text: 'Community walk' },
      start: { local: '2026-09-02T18:30:00' },
      url: 'https://eventbrite.test/e/1',
      venue: { name: 'Park', address: { city: 'Budapest', localized_address_display: 'Park 1' } },
      category: { name: 'Community' },
      is_free: true,
    });
    expect(event).toMatchObject({
      id: 'eb-EB-1', external_source: 'eventbrite', external_id: 'EB-1',
      canonical_identity: 'eventbrite:eb-1', title: 'Community walk',
      event_date: '2026-09-02', event_time: '18:30', location_city: 'Budapest',
    });
    expect(JSON.stringify(event)).not.toContain('html');
  });

  it('rejects missing identity and strips non-HTTPS links', () => {
    expect(() => normalizeEventbriteEvent({ name: { text: 'No id' } })).toThrow(/missing an id/);
    expect(normalizeEventbriteEvent({ id: '1', name: { text: 'X' }, url: 'javascript:alert(1)' }).eventbrite_url).toBeNull();
  });

  it('normalizes pagination and organization output without raw provider fields', () => {
    expect(normalizeEventbritePage({ events: [], pagination: { page_number: 1, page_count: 2 } }).pagination.has_more_items).toBe(true);
    expect(normalizeEventbriteOrganizations({ organizations: [{ id: 'org-1', name: { text: 'Community Org' }, secret: 'x' }] }))
      .toEqual({ organizations: [{ id: 'org-1', name: 'Community Org' }] });
  });
});
