import { getCached, setCached, buildSearchCacheKey, buildDetailsCacheKey, tagCacheHit } from './cache';
import { hasGeoapify, hasTomTom, placesConfig } from './config';
import { dedupeAndMergePlaces, mergePlaceDetails, scoreDuplicateCandidate } from './merge';
import { GeoapifyPlacesProvider } from './providers/geoapify';
import { TomTomPlacesProvider } from './providers/tomtom';
import type { NormalizedPlaceDetails, NormalizedPlaceSummary, SearchPlacesOptions } from './types';

const geoapify = hasGeoapify() ? new GeoapifyPlacesProvider() : null;
const tomtom = hasTomTom() ? new TomTomPlacesProvider() : null;

function rankPlaces(places: NormalizedPlaceSummary[], query: string) {
  const q = query.trim().toLowerCase();
  return [...places].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aExact = aName.includes(q) ? 1 : 0;
    const bExact = bName.includes(q) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aDistance = a.distanceM ?? Number.MAX_SAFE_INTEGER;
    const bDistance = b.distanceM ?? Number.MAX_SAFE_INTEGER;
    if (aDistance !== bDistance) return aDistance - bDistance;
    const aEnriched = a.diagnostics?.enrichedByTomTom ? 1 : 0;
    const bEnriched = b.diagnostics?.enrichedByTomTom ? 1 : 0;
    if (aEnriched !== bEnriched) return bEnriched - aEnriched;
    return a.name.localeCompare(b.name, 'hu');
  });
}

function shouldUseTomTomFallback(geoapifyResults: NormalizedPlaceSummary[], mode: SearchPlacesOptions['mode']) {
  if (mode === 'address') return false;
  if (!placesConfig.tomtomFallbackEnabled || !tomtom) return false;
  if (!geoapifyResults.length) return true;
  return geoapifyResults.every((result) => result.categories.includes('unknown'));
}

function shouldUseTomTomDetails(place: NormalizedPlaceSummary) {
  if (!placesConfig.premiumPoiForDetailsEnabled || !tomtom) return false;
  return place.categories.includes('unknown') || !place.address || place.source === 'tomtom' || place.source === 'merged';
}

export async function searchPlaces(query: string, options: SearchPlacesOptions = {}): Promise<NormalizedPlaceSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = buildSearchCacheKey(trimmed, options.lat, options.lon);
  const cached = getCached<NormalizedPlaceSummary[]>(cacheKey);
  if (cached) {
    return cached.map((item) => tagCacheHit(item));
  }

  const context = {
    limit: options.limit ?? 6,
    lat: options.lat,
    lon: options.lon,
    radiusMeters: options.radiusMeters,
    countryCodes: options.countryCodes ?? placesConfig.defaultCountryCodes,
  };

  let geoapifyResults: NormalizedPlaceSummary[] = [];
  if (geoapify) {
    try {
      geoapifyResults = await geoapify.search(trimmed, context);
      geoapifyResults = geoapifyResults.map((item) => ({
        ...item,
        diagnostics: {
          ...(item.diagnostics ?? {}),
          primaryProviderUsed: 'geoapify',
        },
      }));
    } catch {
      geoapifyResults = [];
    }
  }

  let finalResults = geoapifyResults;

  if (shouldUseTomTomFallback(geoapifyResults, options.mode)) {
    try {
      const tomtomResults = (await tomtom!.search(trimmed, context)).map((item) => ({
        ...item,
        diagnostics: {
          ...(item.diagnostics ?? {}),
          fallbackUsed: true,
          fallbackReason: geoapifyResults.length ? 'geoapify_weak_results' : 'geoapify_no_result',
        },
      }));
      finalResults = geoapifyResults.length
        ? dedupeAndMergePlaces(geoapifyResults, tomtomResults)
        : tomtomResults;
    } catch {
      finalResults = geoapifyResults;
    }
  }

  const ranked = rankPlaces(finalResults, trimmed);
  setCached(cacheKey, ranked);
  return ranked;
}

export async function reverseGeocode(lat: number, lon: number): Promise<NormalizedPlaceSummary | null> {
  if (geoapify) {
    const primary = await geoapify.reverseGeocode(lat, lon);
    if (primary) return primary;
  }
  return tomtom ? tomtom.reverseGeocode(lat, lon) : null;
}

export async function loadPlaceDetails(place: NormalizedPlaceSummary): Promise<NormalizedPlaceDetails> {
  const cacheKey = buildDetailsCacheKey(place);
  const cached = getCached<NormalizedPlaceDetails>(cacheKey);
  if (cached) return tagCacheHit(cached);

  const baseDetails = (geoapify ? await geoapify.loadDetails(place) : null) ?? ({ ...place, openingHours: [] } satisfies NormalizedPlaceDetails);

  let details = baseDetails;
  if (shouldUseTomTomDetails(place)) {
    try {
      const tomtomDetails = await tomtom!.loadDetails(place);
      if (tomtomDetails) {
        const { score } = scoreDuplicateCandidate(details, tomtomDetails);
        if (score >= 0.45) {
          details = mergePlaceDetails(details, tomtomDetails);
        }
      }
    } catch {
      // keep base details
    }
  }

  setCached(cacheKey, details);
  return details;
}
