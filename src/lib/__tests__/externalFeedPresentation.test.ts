import { describe, expect, it } from 'vitest';
import { mapExternalEventToCardLike, providerLabel } from '@/lib/external-events/normalize';
import type { ExternalEventNormalized } from '@/lib/external-events/types';

describe('external feed presentation contract', () => {
  it('keeps feed supply visibly attributed without changing the external card flow', () => {
    const event: ExternalEventNormalized = {
      external_source: 'feed',
      external_id: 'src_12345678:item-1',
      external_url: 'https://program.example/event/1',
      title: 'Közösségi futás',
      category: 'Sport & Mozgás',
      subcategory: 'Futás & Atlétika',
      tags: ['futás'],
      description: 'Közös esti futás.',
      event_date: '2026-09-10',
      event_time: '18:00',
      location_type: 'address',
      location_city: 'Budapest',
      location_address: 'Városliget',
      location_free_text: null,
      location_lat: null,
      location_lon: null,
      price_min: null,
      price_max: null,
      currency: null,
      is_free: true,
      max_attendees: null,
      image_url: null,
      organizer_name: 'Példa szervező',
      source_payload: { source_id: 'src_12345678' },
      source_last_synced_at: '2026-08-25T08:00:00Z',
      import_state: 'active',
      freshness_state: 'fresh',
    };

    expect(providerLabel('feed')).toBe('Ellenőrzött programforrás');
    expect(mapExternalEventToCardLike(event)).toMatchObject({
      id: 'feed-src_12345678:item-1',
      source: 'feed',
      source_label: 'Ellenőrzött programforrás',
      category: 'Futás & Atlétika',
    });
  });
});
