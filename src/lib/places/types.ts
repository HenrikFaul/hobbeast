export type PlaceProvider = 'geoapify' | 'tomtom' | 'merged';

export type CanonicalPlaceCategory =
  | 'restaurant_food'
  | 'bar_nightlife'
  | 'entertainment'
  | 'hobby_games'
  | 'generic_poi'
  | 'unknown';

export interface ProviderDiagnostics {
  primaryProviderUsed?: 'geoapify' | 'tomtom';
  enrichedByTomTom?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: 'NO_RESULT' | 'LOW_CONFIDENCE' | 'DETAILS_ENRICHMENT' | 'FEATURE_PATH';
  cacheUsed?: boolean;
  cacheWritePerformed?: boolean;
  cacheFreshnessState?: 'fresh' | 'stale' | 'miss';
  quotaBlockedEscalation?: boolean;
  mergeOutcome?: 'geoapify_only' | 'tomtom_only' | 'merged_with_geoapify_primary' | 'no_merge_low_confidence';
  mergeScore?: number;
  warnings?: string[];
}

export interface NormalizedPlaceSummary {
  id: string;
  source: PlaceProvider;
  sourceIds: Partial<Record<'geoapify' | 'tomtom', string>>;
  name: string;
  categories: CanonicalPlaceCategory[];
  providerCategories?: string[];
  categoryConfidence?: number;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lon: number;
  distanceM?: number;
  ratingSignals?: {
    providerScore?: number;
    popularity?: number;
  };
  diagnostics?: ProviderDiagnostics;
}

export interface NormalizedPlaceDetails extends NormalizedPlaceSummary {
  website?: string;
  phone?: string;
  openingHours?: string[];
  detailsCompleteness?: 'base' | 'enriched' | 'degraded';
}

export interface PlacesSearchRequest {
  query: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  featurePath?: 'event_create' | 'event_edit' | 'event_detail' | 'venue_search' | 'details';
  preferDetails?: boolean;
  categoryHint?: string;
}

export interface PlacesSearchResponse {
  items: NormalizedPlaceSummary[];
  diagnostics: ProviderDiagnostics & {
    resultCount: number;
    noResult?: boolean;
  };
}

export interface PlaceDetailsResponse {
  item: NormalizedPlaceDetails | null;
  diagnostics: ProviderDiagnostics & {
    noResult?: boolean;
  };
}
