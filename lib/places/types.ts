export type PlaceProviderSource = 'geoapify' | 'tomtom' | 'merged';

export type CanonicalPlaceCategory =
  | 'food_restaurant'
  | 'cafe'
  | 'bar_nightlife'
  | 'entertainment'
  | 'hobby_games'
  | 'culture'
  | 'sports'
  | 'park_outdoor'
  | 'shopping'
  | 'tourism'
  | 'generic_poi'
  | 'unknown';

export interface PlaceDiagnostics {
  enrichedByTomTom?: boolean;
  fallbackUsed?: boolean;
  lowConfidence?: boolean;
  weakCategoryMapping?: boolean;
  mergeScore?: number;
  fallbackReason?: string;
  cacheUsed?: boolean;
  cacheWritePerformed?: boolean;
  primaryProviderUsed?: PlaceProviderSource;
  enrichmentUsed?: boolean;
  quotaBlockedEscalation?: boolean;
  detailsEnrichedByTomTom?: boolean;
  detailsFallbackUsed?: boolean;
}

export interface SourceIds {
  geoapify?: string;
  tomtom?: string;
}

export interface NormalizedPlaceSummary {
  source: PlaceProviderSource;
  sourceIds: SourceIds;
  name: string;
  categories: CanonicalPlaceCategory[];
  rawCategories?: string[];
  address?: string;
  city?: string;
  district?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lon: number;
  distanceM?: number;
  formattedAddress?: string;
  diagnostics?: PlaceDiagnostics;
}

export interface NormalizedPlaceDetails extends NormalizedPlaceSummary {
  website?: string;
  phone?: string;
  openingHours?: string[];
}

export interface SearchPlacesOptions {
  mode?: 'mixed' | 'address' | 'venue';
  limit?: number;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  countryCodes?: string[];
  detailEnrichment?: boolean;
}

export interface ProviderSearchContext {
  limit: number;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  countryCodes?: string[];
}

export interface PlacesSearchProvider {
  readonly provider: Exclude<PlaceProviderSource, 'merged'>;
  search(query: string, context: ProviderSearchContext): Promise<NormalizedPlaceSummary[]>;
}

export interface GeocodingProvider {
  readonly provider: Exclude<PlaceProviderSource, 'merged'>;
  reverseGeocode(lat: number, lon: number): Promise<NormalizedPlaceSummary | null>;
}

export interface PlaceDetailsProvider {
  readonly provider: Exclude<PlaceProviderSource, 'merged'>;
  loadDetails(place: NormalizedPlaceSummary): Promise<NormalizedPlaceDetails | null>;
}

export interface PlacesProviderSet {
  geoapifySearch?: PlacesSearchProvider & GeocodingProvider & PlaceDetailsProvider;
  tomtomSearch?: PlacesSearchProvider & GeocodingProvider & PlaceDetailsProvider;
}
