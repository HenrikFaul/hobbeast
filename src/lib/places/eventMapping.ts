import type { NormalizedPlaceDetails, NormalizedPlaceSummary } from './types';

export function placeToLegacyLocation(place: NormalizedPlaceSummary | null) {
  if (!place) {
    return {
      location_type: null,
      location_city: null,
      location_address: null,
      location_free_text: null,
      location_lat: null,
      location_lon: null,
    };
  }

  return {
    location_type: 'address',
    location_city: place.city || null,
    location_address: place.address || place.name || null,
    location_free_text: [place.name, place.city, place.country].filter(Boolean).join(', ') || null,
    location_lat: place.lat,
    location_lon: place.lon,
  };
}

export function placeToEventColumns(place: NormalizedPlaceSummary | null, details?: NormalizedPlaceDetails | null) {
  if (!place) {
    return {
      place_source: null,
      place_source_ids: null,
      place_name: null,
      place_categories: null,
      place_category_confidence: null,
      place_address: null,
      place_city: null,
      place_postcode: null,
      place_country: null,
      place_lat: null,
      place_lon: null,
      place_distance_m: null,
      place_diagnostics: null,
      place_details: null,
    };
  }

  return {
    place_source: place.source,
    place_source_ids: place.sourceIds as unknown as Record<string, unknown>,
    place_name: place.name,
    place_categories: place.categories,
    place_category_confidence: place.categoryConfidence ?? null,
    place_address: place.address ?? null,
    place_city: place.city ?? null,
    place_postcode: place.postcode ?? null,
    place_country: place.country ?? null,
    place_lat: place.lat,
    place_lon: place.lon,
    place_distance_m: typeof place.distanceM === 'number' ? Math.round(place.distanceM) : null,
    place_diagnostics: (place.diagnostics || null) as unknown as Record<string, unknown> | null,
    place_details: (details || null) as unknown as Record<string, unknown> | null,
  };
}
