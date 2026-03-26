import { supabase } from '@/integrations/supabase/client';
import type { PlaceDetailsResponse, PlacesSearchRequest, PlacesSearchResponse } from './types';

export async function searchNormalizedPlaces(request: PlacesSearchRequest): Promise<PlacesSearchResponse> {
  const { data, error } = await supabase.functions.invoke('places-orchestrator', {
    body: {
      action: 'search',
      request,
    },
  });

  if (error) throw error;
  return (data || { items: [], diagnostics: { resultCount: 0, noResult: true } }) as PlacesSearchResponse;
}

export async function loadPlaceDetails(summary: unknown): Promise<PlaceDetailsResponse> {
  const { data, error } = await supabase.functions.invoke('places-orchestrator', {
    body: {
      action: 'details',
      request: { summary },
    },
  });

  if (error) throw error;
  return (data || { item: null, diagnostics: { noResult: true } }) as PlaceDetailsResponse;
}
