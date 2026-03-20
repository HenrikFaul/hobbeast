// AWS Location Service configuration and helpers

const AWS_REGION = 'eu-north-1';
const AWS_API_KEY = 'v1.public.eyJqdGkiOiJlYTMxNmQwOS00NTU4LTQwNzAtOTljNS1hYzlmMWFkN2QyMjAifWdVyFn7_P0rt7og_jzk-OxT9nOzaUDDub_H3rK37RQ6E25Gs9HjyJsWp0LRU6FeyQiiLshawE15jVWLmCOCSJkQldWYa-dO-P8sB5gjzE92iwmicHhIUe3Ns3PQUMyZw03oEGx8q2rv_qK4f8cCP9jTW6jbMUSzuYHdcwWeH3bYsuC_Pcb8OmMj5yrKmqNFONasWivy4gk7SK70F10EW6fGm5UThnSOxxnLE3x3-LNdmdxqKRpCxeUO57RPH1xgtnpctRQMYgveRpLnVZVwm-IGVQsc9kPd5x3Oa1NNDHfFrujt9h-8pc8uZrPJUERGU4SyYskIw-uIcSyB_NHXWOU.N2IyNTQ2ODQtOWE1YS00MmI2LTkyOTItMGJlNGMxODU1Mzc2';

const PLACES_BASE = `https://places.geo.${AWS_REGION}.amazonaws.com`;

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

/**
 * Suggest addresses using AWS Location Service Places API v2
 */
export async function suggestPlaces(
  query: string,
  signal?: AbortSignal
): Promise<AwsSuggestResult[]> {
  const res = await fetch(`${PLACES_BASE}/v2/suggest?key=${AWS_API_KEY}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 6,
      Language: 'hu',
      Filter: { IncludeCountries: ['HUN'] },
    }),
  });

  if (!res.ok) throw new Error(`AWS suggest failed: ${res.status}`);
  const data = await res.json();

  return (data.Results || []).map((r: any) => ({
    suggestId: r.SuggestId || '',
    text: r.Text || '',
    placeId: r.Place?.PlaceId,
    place: r.Place
      ? {
          label: r.Place.Label,
          country: r.Place.Country,
          region: r.Place.Region,
          subRegion: r.Place.SubRegion,
          locality: r.Place.Locality,
          district: r.Place.District,
          street: r.Place.Street,
          addressNumber: r.Place.AddressNumber,
          postalCode: r.Place.PostalCode,
          position: r.Place.Position,
        }
      : undefined,
  }));
}

/**
 * Get full place details by PlaceId
 */
export async function getPlace(placeId: string): Promise<AwsGetPlaceResult | null> {
  const res = await fetch(`${PLACES_BASE}/v2/get-place?key=${AWS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PlaceId: placeId, Language: 'hu' }),
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
 * Geocode a free-text query to coordinates
 */
export async function geocode(
  query: string,
  signal?: AbortSignal
): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`${PLACES_BASE}/v2/search-text?key=${AWS_API_KEY}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 1,
      Language: 'hu',
      Filter: { IncludeCountries: ['HUN'] },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const hit = data.Results?.[0]?.Place;
  if (!hit?.Position) return null;

  return { lon: hit.Position[0], lat: hit.Position[1] };
}
