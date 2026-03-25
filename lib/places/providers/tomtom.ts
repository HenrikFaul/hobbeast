import { placesConfig } from '../config';
import { mapProviderCategoriesToCanonical } from '../taxonomy';
import type { GeocodingProvider, NormalizedPlaceDetails, NormalizedPlaceSummary, PlaceDetailsProvider, PlacesSearchProvider, ProviderSearchContext } from '../types';

interface TomTomResult {
  id?: string;
  dist?: number;
  position?: { lat?: number; lon?: number };
  poi?: {
    name?: string;
    categories?: string[];
    categorySet?: Array<{ id: number }>;
    url?: string;
    phone?: string;
  };
  address?: {
    freeformAddress?: string;
    municipality?: string;
    countrySubdivision?: string;
    postalCode?: string;
    countryCodeISO3?: string;
    countrySecondarySubdivision?: string;
    streetName?: string;
    municipalitySubdivision?: string;
  };
}

interface TomTomResponse {
  results?: TomTomResult[];
}

function buildSearchUrl(query: string, context: ProviderSearchContext) {
  const params = new URLSearchParams({
    key: placesConfig.tomtomApiKey || '',
    limit: String(context.limit),
    language: 'hu-HU',
  });

  if (context.countryCodes?.length) {
    params.set('countrySet', context.countryCodes.map((code) => code.toUpperCase()).join(','));
  }
  if (context.lat != null && context.lon != null) {
    params.set('lat', String(context.lat));
    params.set('lon', String(context.lon));
    if (context.radiusMeters != null) params.set('radius', String(context.radiusMeters));
  }

  return `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params.toString()}`;
}

function mapResult(result: TomTomResult): NormalizedPlaceSummary | null {
  const lat = result.position?.lat;
  const lon = result.position?.lon;
  const name = result.poi?.name;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !name) return null;

  const rawCategories = result.poi?.categories ?? [];

  return {
    source: 'tomtom',
    sourceIds: { tomtom: result.id },
    name,
    categories: mapProviderCategoriesToCanonical(rawCategories),
    rawCategories,
    address: result.address?.freeformAddress || result.address?.streetName,
    city: result.address?.municipality,
    district: result.address?.municipalitySubdivision || result.address?.countrySubdivision || result.address?.countrySecondarySubdivision,
    postcode: result.address?.postalCode,
    country: result.address?.countryCodeISO3,
    lat,
    lon,
    distanceM: result.dist,
    formattedAddress: result.address?.freeformAddress,
    diagnostics: {
      enrichedByTomTom: true,
    },
  };
}

export class TomTomPlacesProvider implements PlacesSearchProvider, GeocodingProvider, PlaceDetailsProvider {
  readonly provider = 'tomtom' as const;

  async search(query: string, context: ProviderSearchContext): Promise<NormalizedPlaceSummary[]> {
    if (!placesConfig.tomtomApiKey || !query.trim()) return [];
    const response = await fetch(buildSearchUrl(query, context));
    if (!response.ok) throw new Error(`TomTom search failed: ${response.status}`);
    const json = (await response.json()) as TomTomResponse;
    return (json.results ?? []).map(mapResult).filter((item): item is NormalizedPlaceSummary => Boolean(item));
  }

  async reverseGeocode(lat: number, lon: number): Promise<NormalizedPlaceSummary | null> {
    if (!placesConfig.tomtomApiKey) return null;
    const params = new URLSearchParams({
      key: placesConfig.tomtomApiKey,
      language: 'hu-HU',
    });
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const json = (await response.json()) as TomTomResponse;
    return mapResult(json.results?.[0] ?? {});
  }

  async loadDetails(place: NormalizedPlaceSummary): Promise<NormalizedPlaceDetails | null> {
    const results = await this.search(place.name, { limit: 3, lat: place.lat, lon: place.lon, radiusMeters: 250, countryCodes: place.country ? [place.country] : undefined });
    const candidate = results[0];
    if (!candidate) return null;
    return {
      ...candidate,
      website: undefined,
      phone: undefined,
      openingHours: [],
    };
  }
}
