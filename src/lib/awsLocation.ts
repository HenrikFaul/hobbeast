// AWS Location Service configuration and helpers

const AWS_REGION = (import.meta.env.VITE_AWS_LOCATION_REGION || 'eu-north-1').trim();
const AWS_API_KEY = (import.meta.env.VITE_AWS_LOCATION_API_KEY || '').trim();
const PLACES_BASE = `https://places.geo.${AWS_REGION}.amazonaws.com`;
const DEFAULT_BIAS_POSITION: [number, number] = [19.0402, 47.4979]; // Budapest [lon, lat]

interface AwsAddressObject {
  Label?: string;
  Country?: { Name?: string };
  Region?: { Name?: string };
  SubRegion?: { Name?: string };
  Locality?: string;
  District?: string;
  Street?: string;
  AddressNumber?: string;
  PostalCode?: string;
}

interface AwsResultItem {
  PlaceId?: string;
  Title?: string;
  Address?: AwsAddressObject;
  Position?: [number, number];
}

function buildAwsUrl(path: string, queryParams?: URLSearchParams) {
  const params = queryParams ?? new URLSearchParams();
  params.set('key', AWS_API_KEY);
  return `${PLACES_BASE}${path}?${params.toString()}`;
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

function mapPlace(item: AwsResultItem | null | undefined) {
  if (!item) return undefined;

  return {
    label: item.Address?.Label || item.Title,
    country: item.Address?.Country?.Name,
    region: item.Address?.Region?.Name,
    subRegion: item.Address?.SubRegion?.Name,
    locality: item.Address?.Locality,
    district: item.Address?.District,
    street: item.Address?.Street,
    addressNumber: item.Address?.AddressNumber,
    postalCode: item.Address?.PostalCode,
    position: item.Position,
  };
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
    position?: [number, number];
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
  position?: [number, number];
}

export function isAwsLocationConfigured() {
  return Boolean(AWS_API_KEY);
}

export async function suggestPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<AwsSuggestResult[]> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/v2/autocomplete'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 6,
      Language: 'hu',
      Filter: { IncludeCountries: ['HUN'] },
      AdditionalFeatures: ['Core'],
    }),
  });

  const data = await parseJsonResponse<{ ResultItems?: AwsResultItem[] }>(res, 'AWS autocomplete failed');

  return (data.ResultItems || []).map((item, index) => ({
    suggestId: item.PlaceId || `autocomplete-${index}`,
    text: item.Address?.Label || item.Title || '',
    placeId: item.PlaceId,
    place: mapPlace(item),
  }));
}

export async function searchTextPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<AwsSuggestResult[]> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/v2/search-text'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 6,
      Language: 'hu',
      BiasPosition: DEFAULT_BIAS_POSITION,
      Filter: { IncludeCountries: ['HUN'] },
    }),
  });

  const data = await parseJsonResponse<{ ResultItems?: AwsResultItem[] }>(res, 'AWS search-text failed');

  return (data.ResultItems || []).map((item, index) => ({
    suggestId: item.PlaceId || `search-${index}`,
    text: item.Address?.Label || item.Title || '',
    placeId: item.PlaceId,
    place: mapPlace(item),
  }));
}

export async function getPlace(placeId: string): Promise<AwsGetPlaceResult | null> {
  assertAwsConfigured();

  const params = new URLSearchParams({ language: 'hu' });
  const res = await fetch(buildAwsUrl(`/v2/place/${encodeURIComponent(placeId)}`, params), {
    method: 'GET',
  });

  if (!res.ok) return null;
  const data = (await res.json()) as AwsResultItem;
  return mapPlace(data) || null;
}

export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lon: number } | null> {
  assertAwsConfigured();

  const res = await fetch(buildAwsUrl('/v2/search-text'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      QueryText: query,
      MaxResults: 1,
      Language: 'hu',
      BiasPosition: DEFAULT_BIAS_POSITION,
      Filter: { IncludeCountries: ['HUN'] },
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { ResultItems?: AwsResultItem[] };
  const hit = data.ResultItems?.[0];
  if (!hit?.Position) return null;

  return { lon: hit.Position[0], lat: hit.Position[1] };
}
