import type { NormalizedPlaceSummary } from './types';

function textQuality(name: string, query: string) {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 1;
  if (n.startsWith(q)) return 0.92;
  if (n.includes(q)) return 0.78;
  return 0.45;
}

export function rankPlaces(items: NormalizedPlaceSummary[], query: string) {
  return [...items].sort((a, b) => {
    const score = (item: NormalizedPlaceSummary) => {
      const distanceScore = typeof item.distanceM === 'number' ? Math.max(0, 1 - item.distanceM / 20000) : 0.4;
      const categoryScore = item.categoryConfidence || 0.3;
      const mergeScore = item.source === 'merged' ? 0.2 : item.source === 'geoapify' ? 0.1 : 0.05;
      const completeness = [item.address, item.city, item.country].filter(Boolean).length / 3;
      return textQuality(item.name, query) * 0.4 + distanceScore * 0.25 + categoryScore * 0.2 + completeness * 0.1 + mergeScore * 0.05;
    };

    return score(b) - score(a);
  });
}
