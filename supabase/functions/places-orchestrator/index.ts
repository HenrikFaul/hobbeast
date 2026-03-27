import { corsHeaders, fetchJson, isoNow, jsonResponse, supabaseAdmin } from '../shared/providerFetch.ts';

interface SearchRequest {
  query: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  featurePath?: string;
  preferDetails?: boolean;
  categoryHint?: string;
}

interface NormalizedPlaceSummary {
  id: string;
  source: 'geoapify' | 'tomtom' | 'merged';
  sourceIds: { geoapify?: string; tomtom?: string };
  name: string;
  categories: string[];
  providerCategories?: string[];
  categoryConfidence?: number;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lon: number;
  distanceM?: number;
  diagnostics?: Record<string, unknown>;
}

const GEOAPIFY_KEY = Deno.env.get('GEOAPIFY_API_KEY') || '';
const TOMTOM_KEY = Deno.env.get('TOMTOM_API_KEY') || '';
const GEOAPIFY_ENABLED = (Deno.env.get('GEOAPIFY_PRIMARY_ENABLED') || 'true') !== 'false';
const TOMTOM_ENRICHMENT_ENABLED = (Deno.env.get('TOMTOM_ENRICHMENT_ENABLED') || 'true') !== 'false';
const TOMTOM_FALLBACK_ENABLED = (Deno.env.get('TOMTOM_FALLBACK_ENABLED') || 'true') !== 'false';
const PREMIUM_POI_FOR_DETAILS_ENABLED = (Deno.env.get('PREMIUM_POI_FOR_DETAILS_ENABLED') || 'true') !== 'false';

function normalizeText(input: string | undefined) {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string | undefined, b: string | undefined) {
  const aTokens = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

function mapCategories(providerCategories: string[]) {
  const joined = providerCategories.join(' ');
  const categories = new Set<string>();
  if (/restaurant|food|cafe|coffee|bakery|pizza/i.test(joined)) categories.add('restaurant_food');
  if (/bar|pub|nightlife|club|beer|cocktail/i.test(joined)) categories.add('bar_nightlife');
  if (/entertainment|cinema|theatre|theater|music|concert|museum|gallery/i.test(joined)) categories.add('entertainment');
  if (/game|board|hobby|cards|comics|toy|escape/i.test(joined)) categories.add('hobby_games');
  if (/poi|park|landmark|attraction|viewpoint|sports|stadium|arena/i.test(joined)) categories.add('generic_poi');
  return {
    categories: categories.size > 0 ? Array.from(categories) : ['unknown'],
    confidence: categories.size > 0 ? 0.9 : 0.2,
  };
}

function rankPlaces(items: NormalizedPlaceSummary[], query: string) {
  const textQuality = (name: string) => {
    const n = name.toLowerCase();
    const q = query.toLowerCase();
    if (n === q) return 1;
    if (n.startsWith(q)) return 0.92;
    if (n.includes(q)) return 0.78;
    return 0.45;
  };
  return [...items].sort((a, b) => {
    const score = (item: NormalizedPlaceSummary) => {
      const distanceScore = typeof item.distanceM === 'number' ? Math.max(0, 1 - item.distanceM / 20000) : 0.4;
      const categoryScore = item.categoryConfidence || 0.3;
      const mergeScore = item.source === 'merged' ? 0.2 : item.source === 'geoapify' ? 0.1 : 0.05;
      const completeness = [item.address, item.city, item.country].filter(Boolean).length / 3;
      return textQuality(item.name) * 0.4 + distanceScore * 0.25 + categoryScore * 0.2 + completeness * 0.1 + mergeScore * 0.05;
    };
    return score(b) - score(a);
  });
}

async function loadCache(query: string) {
  const cacheKey = normalizeText(query);
  const { data } = await supabaseAdmin.from('places_cache').select('*').eq('cache_key', cacheKey).gte('expires_at', isoNow()).maybeSingle();
  return data;
}

async function writeCache(query: string, response: unknown) {
  const cacheKey = normalizeText(query);
  await supabaseAdmin.from('places_cache').upsert({
    cache_key: cacheKey,
    query_text: query,
    response_payload: response,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    updated_at: isoNow(),
  }, { onConflict: 'cache_key' });
}

async function searchGeoapify(request: SearchRequest): Promise<NormalizedPlaceSummary[]> {
  if (!GEOAPIFY_ENABLED || !GEOAPIFY_KEY) return [];
  const params = new URLSearchParams({
    text: request.query,
    lang: 'en',
    limit: '8',
    apiKey: GEOAPIFY_KEY,
    format: 'json',
  });
  if (typeof request.latitude === 'number' && typeof request.longitude === 'number') {
    params.set('bias', `proximity:${request.longitude},${request.latitude}`);
  }
  const url = `https://api.geoapify.com/v1/geocode/search?${params.toString()}`;
  const payload = await fetchJson<{ features?: Array<Record<string, unknown>> }>(url, { method: 'GET' }, 'Geoapify search failed');
  return (payload.features || []).map((feature, index) => {
    const properties = (feature.properties || {}) as Record<string, unknown>;
    const geometry = (feature.geometry || {}) as { coordinates?: [number, number] };
    const providerCategories = [
      ...(Array.isArray(properties.categories) ? properties.categories as string[] : []),
      typeof properties.result_type === 'string' ? properties.result_type : '',
    ].filter(Boolean) as string[];
    const mapped = mapCategories(providerCategories);
    return {
      id: `geoapify-${properties.place_id || index}`,
      source: 'geoapify',
      sourceIds: { geoapify: String(properties.place_id || (properties.datasource as Record<string, unknown>)?.raw || index) },
      name: String(properties.name || properties.formatted || request.query),
      categories: mapped.categories,
      providerCategories,
      categoryConfidence: mapped.confidence,
      address: typeof properties.address_line1 === 'string' ? properties.address_line1 : typeof properties.formatted === 'string' ? properties.formatted : undefined,
      city: typeof properties.city === 'string' ? properties.city : typeof properties.county === 'string' ? properties.county : undefined,
      postcode: typeof properties.postcode === 'string' ? properties.postcode : undefined,
      country: typeof properties.country === 'string' ? properties.country : undefined,
      lat: typeof properties.lat === 'number' ? properties.lat : geometry.coordinates?.[1] || 0,
      lon: typeof properties.lon === 'number' ? properties.lon : geometry.coordinates?.[0] || 0,
      distanceM: typeof properties.distance === 'number' ? properties.distance : undefined,
      diagnostics: { primaryProviderUsed: 'geoapify' },
    } satisfies NormalizedPlaceSummary;
  }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

async function searchTomTom(request: SearchRequest): Promise<NormalizedPlaceSummary[]> {
  if (!TOMTOM_KEY) return [];
  const params = new URLSearchParams({
    key: TOMTOM_KEY,
    limit: '8',
    language: 'en-US',
  });
  if (typeof request.latitude === 'number' && typeof request.longitude === 'number') {
    params.set('lat', String(request.latitude));
    params.set('lon', String(request.longitude));
  }
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(request.query)}.json?${params.toString()}`;
  const payload = await fetchJson<{ results?: Array<Record<string, unknown>> }>(url, { method: 'GET' }, 'TomTom search failed');
  return (payload.results || []).map((result, index) => {
    const address = (result.address || {}) as Record<string, unknown>;
    const poi = (result.poi || {}) as Record<string, unknown>;
    const position = (result.position || {}) as Record<string, unknown>;
    const providerCategories = [
      ...(Array.isArray(poi.categories) ? poi.categories as string[] : []),
      typeof poi.categorySet === 'string' ? poi.categorySet : '',
      typeof poi.classifications === 'string' ? poi.classifications : '',
    ].filter(Boolean) as string[];
    const mapped = mapCategories(providerCategories);
    return {
      id: `tomtom-${result.id || index}`,
      source: 'tomtom',
      sourceIds: { tomtom: String(result.id || index) },
      name: String(poi.name || address.freeformAddress || request.query),
      categories: mapped.categories,
      providerCategories,
      categoryConfidence: mapped.confidence,
      address: typeof address.streetName === 'string' ? [address.streetNumber, address.streetName].filter(Boolean).join(' ') : typeof address.freeformAddress === 'string' ? address.freeformAddress : undefined,
      city: typeof address.municipality === 'string' ? address.municipality : undefined,
      postcode: typeof address.postalCode === 'string' ? address.postalCode : undefined,
      country: typeof address.country === 'string' ? address.country : undefined,
      lat: Number(position.lat || 0),
      lon: Number(position.lon || 0),
      distanceM: typeof result.dist === 'number' ? result.dist : undefined,
      diagnostics: { primaryProviderUsed: 'tomtom' },
    } satisfies NormalizedPlaceSummary;
  }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

function scoreDuplicate(a: NormalizedPlaceSummary, b: NormalizedPlaceSummary) {
  const nameScore = tokenSimilarity(a.name, b.name);
  const addressScore = tokenSimilarity(a.address, b.address);
  const cityScore = tokenSimilarity(a.city, b.city);
  const categoryOverlap = a.categories.some((category) => b.categories.includes(category)) ? 1 : 0;
  const distanceM = haversineM(a.lat, a.lon, b.lat, b.lon);
  const proximityScore = distanceM <= 50 ? 1 : distanceM <= 120 ? 0.7 : distanceM <= 250 ? 0.3 : 0;
  const score = nameScore * 0.45 + proximityScore * 0.3 + addressScore * 0.15 + cityScore * 0.05 + categoryOverlap * 0.05;
  return { score, distanceM };
}

function mergeResults(primary: NormalizedPlaceSummary[], enrichment: NormalizedPlaceSummary[]) {
  const merged: NormalizedPlaceSummary[] = [];
  const usedTomTom = new Set<string>();
  for (const geo of primary) {
    let bestMatch: { item: NormalizedPlaceSummary; score: number } | null = null;
    for (const tom of enrichment) {
      const duplicate = scoreDuplicate(geo, tom);
      if (duplicate.score >= 0.62 && (!bestMatch || duplicate.score > bestMatch.score)) {
        bestMatch = { item: tom, score: duplicate.score };
      }
    }
    if (bestMatch) {
      usedTomTom.add(bestMatch.item.id);
      merged.push({
        ...geo,
        source: 'merged',
        sourceIds: { geoapify: geo.sourceIds.geoapify, tomtom: bestMatch.item.sourceIds.tomtom },
        categories: Array.from(new Set([...geo.categories, ...bestMatch.item.categories])),
        providerCategories: Array.from(new Set([...(geo.providerCategories || []), ...(bestMatch.item.providerCategories || [])])),
        categoryConfidence: Math.max(geo.categoryConfidence || 0, bestMatch.item.categoryConfidence || 0),
        address: bestMatch.item.address || geo.address,
        city: bestMatch.item.city || geo.city,
        postcode: bestMatch.item.postcode || geo.postcode,
        country: bestMatch.item.country || geo.country,
        diagnostics: {
          ...(geo.diagnostics || {}),
          enrichedByTomTom: true,
          primaryProviderUsed: 'geoapify',
          mergeOutcome: 'merged_with_geoapify_primary',
          mergeScore: Number(bestMatch.score.toFixed(3)),
        },
      });
    } else {
      merged.push({
        ...geo,
        diagnostics: { ...(geo.diagnostics || {}), mergeOutcome: 'geoapify_only' },
      });
    }
  }

  for (const tom of enrichment) {
    if (!usedTomTom.has(tom.id)) {
      merged.push({
        ...tom,
        diagnostics: { ...(tom.diagnostics || {}), fallbackUsed: true, mergeOutcome: 'tomtom_only', fallbackReason: 'NO_RESULT' },
      });
    }
  }

  return merged;
}

async function handleSearch(request: SearchRequest) {
  const cached = await loadCache(request.query);
  if (cached?.response_payload) {
    const payload = cached.response_payload as { items: NormalizedPlaceSummary[]; diagnostics: Record<string, unknown> };
    payload.diagnostics = { ...(payload.diagnostics || {}), cacheUsed: true, cacheFreshnessState: 'fresh' };
    return payload;
  }

  let geoResults: NormalizedPlaceSummary[] = [];
  let tomResults: NormalizedPlaceSummary[] = [];
  if (GEOAPIFY_ENABLED) {
    geoResults = await searchGeoapify(request).catch(() => []);
  }
  if ((geoResults.length === 0 && TOMTOM_FALLBACK_ENABLED) || TOMTOM_ENRICHMENT_ENABLED) {
    tomResults = await searchTomTom(request).catch(() => []);
  }

  let items = geoResults;
  const diagnostics: Record<string, unknown> = {
    primaryProviderUsed: 'geoapify',
    resultCount: 0,
    cacheUsed: false,
    cacheFreshnessState: 'miss',
    enrichedByTomTom: false,
    fallbackUsed: false,
  };

  if (geoResults.length > 0 && tomResults.length > 0 && TOMTOM_ENRICHMENT_ENABLED) {
    items = mergeResults(geoResults, tomResults);
    diagnostics.enrichedByTomTom = items.some((item) => item.source === 'merged');
  } else if (geoResults.length === 0 && tomResults.length > 0) {
    items = tomResults.map((item) => ({
      ...item,
      diagnostics: { ...(item.diagnostics || {}), fallbackUsed: true, fallbackReason: 'NO_RESULT' },
    }));
    diagnostics.fallbackUsed = true;
    diagnostics.primaryProviderUsed = 'geoapify';
  }

  items = rankPlaces(items, request.query);
  diagnostics.resultCount = items.length;
  diagnostics.noResult = items.length === 0;

  const response = { items, diagnostics };
  await writeCache(request.query, response).catch(() => null);
  return response;
}

async function handleDetails(request: { summary: NormalizedPlaceSummary }) {
  const summary = request.summary;
  if (!summary) return { item: null, diagnostics: { noResult: true } };
  const item = {
    ...summary,
    detailsCompleteness: summary.source === 'merged' ? 'enriched' : 'base',
  };
  if (!PREMIUM_POI_FOR_DETAILS_ENABLED) {
    return { item, diagnostics: { premiumPoiForDetailsEnabled: false } };
  }
  return {
    item: {
      ...item,
      diagnostics: {
        ...(summary.diagnostics || {}),
        fallbackUsed: Boolean(summary.diagnostics?.fallbackUsed),
        enrichedByTomTom: summary.source === 'merged' || Boolean(summary.sourceIds.tomtom),
      },
    },
    diagnostics: { enrichedByTomTom: summary.source === 'merged' || Boolean(summary.sourceIds.tomtom) },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const request = body?.request;

    if (action === 'search') {
      return jsonResponse(await handleSearch(request as SearchRequest));
    }
    if (action === 'details') {
      return jsonResponse(await handleDetails(request as { summary: NormalizedPlaceSummary }));
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.error('places-orchestrator error', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
