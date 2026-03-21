// AWS Location Service configuration and helpers

const AWS_REGION = (import.meta.env.VITE_AWS_LOCATION_REGION || 'eu-north-1').trim();
const AWS_API_KEY = (import.meta.env.VITE_AWS_LOCATION_API_KEY || '').trim();
const PLACES_BASE = `https://places.geo.${AWS_REGION}.amazonaws.com`;
const DEFAULT_BIAS_POSITION: [number, number] = [19.0402, 47.4979]; // Budapest [lon, lat]

function buildAwsUrl(path: string) {
  return `${PLACES_BASE}${path}?key=${encodeURIComponent(AWS_API_KEY)}`;
}

function assertAwsConfigured() {
  if (!AWS_API_KEY) {
    throw new Error('AWS Location API key is missing. Set VITE_AWS_LOCATION_API_KEY.');
  }
}

async function parseJsonResponse<T>(res: Response, errorLabel: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${errorLabel}: ${res.status}${body ? ` - ${body}` : ''}`);
  }

  return res.json() as Promise<T>;
}

export interface AwsSuggestResult {
  suggestId: string;
  text: string;
  placeId?: string;
  place?: {
    label?: string;
    country?: string;
    region?: string;
    subRegion?: string;
    locality?: string;
    district?: string;
    street?: string;
    addressNumber?: string;
    postalCode?: string;
    position?: [number, number]; // [lon, lat]
  };
}

export interface AwsGetPlaceResult {
  label?: string;
  country?: string;
  region?: string;
  subRegion?: string;
  locality?: string;
  district?: string;
  street?: string;
  addressNumber?: string;
  postalCode?: string;
  position?: [number, number]; // [lon, lat]
}

export function isAwsLocationConfigured() {
  return Boolean(AWS_API_KEY);
}

function mapPlace(place: any) {
  if (!place) return undefined;

  return {
    label: place.Label,
    country: place.Country,
    region: place.Region,
    subRegion: place.SubRegion,
    locality: place.Locality,
    district: place.District,
    street: place.Street,
    addressNumber: place.AddressNumber,
    postalCode: place.PostalCode,
    position: place.Position,
  };
}

/**
 * AWS Places Autocomplete — partial address inputhoz EZ a jó endpoint.
 */
export async function autocompletePlaces(
  query: string,
  signal?: AbortSignal,
): Promise<AwsSuggestResult[]> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/autocomplete'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 6,
      Language: 'hu',
      BiasPosition: DEFAULT_BIAS_POSITION,
      Filter: {
        IncludeCountries: ['HUN'],
      },
    }),
  });

  const data = await parseJsonResponse<{ Results?: any[] }>(res, 'AWS autocomplete failed');

  return (data.Results || []).map((r: any, index: number) => ({
    suggestId: `autocomplete-${index}-${r.Place?.PlaceId || r.PlaceId || r.Text || ''}`,
    text: r.Place?.Label || r.Text || '',
    placeId: r.Place?.PlaceId || r.PlaceId,
    place: mapPlace(r.Place),
  }));
}

/**
 * AWS Geocode — teljes cím / szabad szöveges cím feloldás.
 */
export async function geocodePlaces(
  query: string,
  signal?: AbortSignal,
): Promise<AwsSuggestResult[]> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/geocode'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 6,
      Language: 'hu',
      BiasPosition: DEFAULT_BIAS_POSITION,
      Filter: {
        IncludeCountries: ['HUN'],
      },
    }),
  });

  const data = await parseJsonResponse<{ Results?: any[] }>(res, 'AWS geocode failed');

  return (data.Results || []).map((r: any, index: number) => ({
    suggestId: `geocode-${index}-${r.Place?.PlaceId || r.PlaceId || r.Text || ''}`,
    text: r.Place?.Label || r.Text || '',
    placeId: r.Place?.PlaceId || r.PlaceId,
    place: mapPlace(r.Place),
  }));
}

export async function getPlace(placeId: string): Promise<AwsGetPlaceResult | null> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/v2/get-place'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      PlaceId: placeId,
      Language: 'hu',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();

  return {
    label: data.Label,
    country: data.Country,
    region: data.Region,
    subRegion: data.SubRegion,
    locality: data.Locality,
    district: data.District,
    street: data.Street,
    addressNumber: data.AddressNumber,
    postalCode: data.PostalCode,
    position: data.Position,
  };
}

/**
 * Egyetlen koordináta kell distance filterhez.
 */
export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lon: number } | null> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/geocode'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 1,
      Language: 'hu',
      BiasPosition: DEFAULT_BIAS_POSITION,
      Filter: {
        IncludeCountries: ['HUN'],
      },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const hit = data.Results?.[0]?.Place;
  if (!hit?.Position) return null;

  return {
    lon: hit.Position[0],
    lat: hit.Position[1],
  };
}
