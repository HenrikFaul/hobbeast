import type { NormalizedPlaceSummary } from './types';

function normalizeText(input: string | undefined) {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string) {
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

export function scorePlaceDuplicate(a: NormalizedPlaceSummary, b: NormalizedPlaceSummary) {
  const nameScore = tokenSimilarity(a.name, b.name);
  const addressScore = tokenSimilarity(a.address, b.address);
  const cityScore = tokenSimilarity(a.city, b.city);
  const categoryOverlap = a.categories.some((category) => b.categories.includes(category)) ? 1 : 0;
  const distanceM = haversineM(a.lat, a.lon, b.lat, b.lon);
  const proximityScore = distanceM <= 50 ? 1 : distanceM <= 120 ? 0.7 : distanceM <= 250 ? 0.3 : 0;
  const score = nameScore * 0.45 + proximityScore * 0.3 + addressScore * 0.15 + cityScore * 0.05 + categoryOverlap * 0.05;
  return { score, distanceM, reasons: { nameScore, proximityScore, addressScore, cityScore, categoryOverlap } };
}

export function mergeGeoapifyWithTomTom(primary: NormalizedPlaceSummary, enrichment: NormalizedPlaceSummary, duplicateScore: number): NormalizedPlaceSummary {
  const mergedCategories = Array.from(new Set([...primary.categories, ...enrichment.categories]));
  return {
    ...primary,
    source: 'merged',
    sourceIds: {
      geoapify: primary.sourceIds.geoapify,
      tomtom: enrichment.sourceIds.tomtom,
    },
    categories: mergedCategories,
    providerCategories: Array.from(new Set([...(primary.providerCategories || []), ...(enrichment.providerCategories || [])])),
    categoryConfidence: Math.max(primary.categoryConfidence || 0, enrichment.categoryConfidence || 0),
    address: enrichment.address || primary.address,
    city: enrichment.city || primary.city,
    postcode: enrichment.postcode || primary.postcode,
    country: enrichment.country || primary.country,
    distanceM: primary.distanceM ?? enrichment.distanceM,
    diagnostics: {
      ...(primary.diagnostics || {}),
      primaryProviderUsed: 'geoapify',
      enrichedByTomTom: true,
      mergeOutcome: 'merged_with_geoapify_primary',
      mergeScore: Number(duplicateScore.toFixed(3)),
    },
  };
}
