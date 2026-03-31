/**
 * Normalized place search client — calls the place-search edge function
 * which orchestrates Geoapify (primary) + TomTom (fallback/enrichment).
 */

import { supabase } from '@/integrations/supabase/client';

export interface NormalizedPlace {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  country: string;
  postcode: string;
  lat: number;
  lon: number;
  categories: string[];
  source: 'geoapify' | 'tomtom';
  sourceId: string;
  confidence: number;
}

async function callPlaceSearch(body: Record<string, unknown>): Promise<NormalizedPlace[]> {
  const { data, error } = await supabase.functions.invoke('place-search', { body });
  if (error) {
    console.error('place-search invoke error:', error);
    return [];
  }
  return data?.results || [];
}

export async function searchPlaces(query: string, bias?: { lat: number; lon: number }, activityHint?: string): Promise<NormalizedPlace[]> {
  if (!query || query.trim().length < 2) return [];
  return callPlaceSearch({ action: 'autocomplete', query: query.trim(), bias, activityHint });
}

export async function reverseGeocodePlace(lat: number, lon: number): Promise<NormalizedPlace | null> {
  const results = await callPlaceSearch({ action: 'reverse', lat, lon });
  return results[0] || null;
}

export async function geocodePlace(query: string): Promise<NormalizedPlace | null> {
  const results = await callPlaceSearch({ action: 'geocode', query });
  return results[0] || null;
}
