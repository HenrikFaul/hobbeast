import { placesConfig } from '../config';
import { mapProviderCategoriesToCanonical } from '../taxonomy';
import type { NormalizedPlaceDetails, NormalizedPlaceSummary, PlaceDetailsProvider, PlacesSearchProvider, GeocodingProvider, ProviderSearchContext } from '../types';

interface GeoapifyFeature {
  properties?: {
    place_id?: string;
    datasource?: { raw?: { osm_id?: string | number } };
    name?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    county?: string;
    suburb?: string;
    district?: string;
    postcode?: string;
    country?: string;
    lat?: number;
    lon?: number;
    result_type?: string;
    categories?: string[];
    website?: string;
    website_url?: string;
    phone?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface GeoapifyResponse {
  features?: GeoapifyFeature[];
}

const BASE_URL = 'https://api.geoapify.com/v1/geocode';

function buildUrl(path: 'autocomplete' | 'reverse', params: URLSearchParams) {
  params.set('apiKey', placesConfig.geoapifyApiKey || '');
  return `${BASE_URL}/${path}?${params.toString()}`;
}

function mapFeature(feature: GeoapifyFeature): NormalizedPlaceSummary | null {
  const props = feature.properties;
  if (!props) return null;

  const [lon, lat] = feature.geometry?.coordinates ?? [props.lon, props.lat];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const name = props.name || props.address_line1 || props.formatted;
  if (!name) return null;

  const rawCategories = props.categories ?? (props.result_type ? [props.result_type] : []);

  return {
    source: 'geoapify',
    sourceIds: {
      geoapify: props.place_id || String(props.datasource?.raw?.osm_id || ''),
    },
    name,
    categories: mapProviderCategoriesToCanonical(rawCategories),
    rawCategories,
    address: props.address_line1 || props.formatted,
    city: props.city || props.county,
    district: props.district || props.suburb,
    postcode: props.postcode,
    country: props.country,
    lat,
    lon,
    formattedAddress: props.formatted,
  };
}

export class GeoapifyPlacesProvider implements PlacesSearchProvider, GeocodingProvider, PlaceDetailsProvider {
  readonly provider = 'geoapify' as const;

  async search(query: string, context: ProviderSearchContext): Promise<NormalizedPlaceSummary[]> {
    if (!placesConfig.geoapifyApiKey || !query.trim()) return [];

    const params = new URLSearchParams({
      text: query.trim(),
      limit: String(context.limit),
      format: 'geojson',
      lang: 'hu',
    });

    if (context.lat != null && context.lon != null) {
      params.set('bias', `proximity:${context.lon},${context.lat}`);
    }

    if (context.countryCodes?.length) {
      params.set('filter', `countrycode:${context.countryCodes.join(',')}`);
    }

    const response = await fetch(buildUrl('autocomplete', params));
    if (!response.ok) throw new Error(`Geoapify search failed: ${response.status}`);

    const json = (await response.json()) as GeoapifyResponse;
    return (json.features ?? []).map(mapFeature).filter((item): item is NormalizedPlaceSummary => Boolean(item));
  }

  async reverseGeocode(lat: number, lon: number): Promise<NormalizedPlaceSummary | null> {
    if (!placesConfig.geoapifyApiKey) return null;

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'geojson',
      lang: 'hu',
    });

    const response = await fetch(buildUrl('reverse', params));
    if (!response.ok) return null;

    const json = (await response.json()) as GeoapifyResponse;
    return mapFeature(json.features?.[0] ?? {});
  }

  async loadDetails(place: NormalizedPlaceSummary): Promise<NormalizedPlaceDetails | null> {
    return {
      ...place,
      website: undefined,
      phone: undefined,
      openingHours: [],
    };
  }
}
