import type { NormalizedPlaceDetails, NormalizedPlaceSummary, PlaceDiagnostics } from './types';

function normalizeText(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(/\s+/).filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection++;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function coordinateDistanceMeters(a: NormalizedPlaceSummary, b: NormalizedPlaceSummary) {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function scoreDuplicateCandidate(primary: NormalizedPlaceSummary, candidate: NormalizedPlaceSummary) {
  const nameScore = tokenSimilarity(primary.name, candidate.name);
  const addressScore = tokenSimilarity(primary.formattedAddress ?? primary.address, candidate.formattedAddress ?? candidate.address);
  const cityScore = normalizeText(primary.city) && normalizeText(primary.city) === normalizeText(candidate.city) ? 1 : 0;
  const distanceMeters = coordinateDistanceMeters(primary, candidate);
  const proximityScore = distanceMeters <= 50 ? 1 : distanceMeters <= 150 ? 0.7 : distanceMeters <= 300 ? 0.35 : 0;
  const categoryOverlap = primary.categories.some((category) => candidate.categories.includes(category)) ? 1 : 0;

  return {
    distanceMeters,
    score: nameScore * 0.45 + addressScore * 0.2 + cityScore * 0.1 + proximityScore * 0.2 + categoryOverlap * 0.05,
  };
}

function mergeDiagnostics(primary: PlaceDiagnostics | undefined, secondary: PlaceDiagnostics | undefined, mergeScore: number): PlaceDiagnostics {
  return {
    ...(primary ?? {}),
    ...(secondary ?? {}),
    enrichedByTomTom: true,
    enrichmentUsed: true,
    mergeScore,
  };
}

export function mergePlaces(primary: NormalizedPlaceSummary, enrichment: NormalizedPlaceSummary): NormalizedPlaceSummary {
  const categories = [...new Set([...primary.categories, ...enrichment.categories])];
  const rawCategories = [...new Set([...(primary.rawCategories ?? []), ...(enrichment.rawCategories ?? [])])];
  const { score } = scoreDuplicateCandidate(primary, enrichment);

  return {
    ...primary,
    source: 'merged',
    sourceIds: {
      ...primary.sourceIds,
      ...enrichment.sourceIds,
    },
    categories,
    rawCategories,
    address: primary.address ?? enrichment.address,
    city: primary.city ?? enrichment.city,
    district: primary.district ?? enrichment.district,
    postcode: primary.postcode ?? enrichment.postcode,
    country: primary.country ?? enrichment.country,
    formattedAddress: primary.formattedAddress ?? enrichment.formattedAddress,
    diagnostics: mergeDiagnostics(primary.diagnostics, enrichment.diagnostics, score),
  };
}

export function mergePlaceDetails(primary: NormalizedPlaceDetails, enrichment: NormalizedPlaceDetails): NormalizedPlaceDetails {
  const merged = mergePlaces(primary, enrichment);
  return {
    ...merged,
    website: primary.website ?? enrichment.website,
    phone: primary.phone ?? enrichment.phone,
    openingHours: primary.openingHours?.length ? primary.openingHours : enrichment.openingHours,
    diagnostics: {
      ...(merged.diagnostics ?? {}),
      detailsEnrichedByTomTom: true,
    },
  };
}

export function dedupeAndMergePlaces(primaryResults: NormalizedPlaceSummary[], enrichmentResults: NormalizedPlaceSummary[]) {
  const merged: NormalizedPlaceSummary[] = [...primaryResults];
  const unmatched: NormalizedPlaceSummary[] = [];

  for (const candidate of enrichmentResults) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < merged.length; i++) {
      const { score } = scoreDuplicateCandidate(merged[i], candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore >= 0.62) {
      merged[bestIndex] = mergePlaces(merged[bestIndex], candidate);
    } else {
      unmatched.push(candidate);
    }
  }

  return [...merged, ...unmatched];
}
