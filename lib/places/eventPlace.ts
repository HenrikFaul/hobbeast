import type { Tables } from '@/integrations/supabase/types';
import type { AddressSelection } from '@/components/AddressAutocomplete';

export function buildEventPlaceFields(selection: AddressSelection | null, details?: unknown) {
  if (!selection) {
    return {
      place_name: null,
      place_source: null,
      place_source_ids: null,
      place_categories: null,
      place_lat: null,
      place_lon: null,
      place_details: null,
      place_diagnostics: null,
    };
  }

  return {
    place_name: selection.name || selection.displayName || selection.address || null,
    place_source: selection.source ?? null,
    place_source_ids: selection.sourceIds ?? null,
    place_categories: selection.categories?.length ? selection.categories : null,
    place_lat: selection.lat ?? null,
    place_lon: selection.lon ?? null,
    place_details: details ?? selection.details ?? null,
    place_diagnostics: selection.diagnostics ?? null,
  };
}

export function hydrateEventPlace(event: Tables<'events'> | Partial<Tables<'events'>>) {
  if (!event.place_name && !event.place_lat && !event.place_lon) return null;

  return {
    displayName: event.place_name || event.location_address || event.location_free_text || '',
    name: event.place_name || event.location_address || '',
    city: event.location_city || '',
    district: event.location_district || '',
    address: event.location_address || '',
    lat: Number(event.place_lat ?? 0),
    lon: Number(event.place_lon ?? 0),
    categories: event.place_categories || [],
    source: (event.place_source as AddressSelection['source']) ?? 'geoapify',
    sourceIds: (event.place_source_ids as AddressSelection['sourceIds']) ?? {},
    diagnostics: (event.place_diagnostics as AddressSelection['diagnostics']) ?? {},
    details: (event.place_details as AddressSelection['details']) ?? null,
  } as AddressSelection;
}
