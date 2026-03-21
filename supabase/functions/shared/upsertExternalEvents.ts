import type { ExternalEventNormalized } from './external-events-types.ts';
import { supabaseAdmin } from './providerFetch.ts';

export async function upsertExternalEvents(events: ExternalEventNormalized[]) {
  if (!events.length) return { upserted: 0 };

  const rows = events.map((e) => ({
    external_source: e.external_source,
    external_id: e.external_id,
    external_url: e.external_url,
    title: e.title,
    category: e.category,
    subcategory: e.subcategory,
    tags: e.tags,
    description: e.description,
    event_date: e.event_date,
    event_time: e.event_time,
    location_type: e.location_type,
    location_city: e.location_city,
    location_address: e.location_address,
    location_free_text: e.location_free_text,
    location_lat: e.location_lat,
    location_lon: e.location_lon,
    price_min: e.price_min,
    price_max: e.price_max,
    currency: e.currency,
    is_free: e.is_free,
    max_attendees: e.max_attendees,
    image_url: e.image_url,
    organizer_name: e.organizer_name,
    source_payload: e.source_payload,
    source_last_synced_at: e.source_last_synced_at,
    is_active: true,
  }));

  const { error } = await supabaseAdmin
    .from('external_events')
    .upsert(rows, { onConflict: 'external_source,external_id' });

  if (error) throw error;
  return { upserted: rows.length };
}
