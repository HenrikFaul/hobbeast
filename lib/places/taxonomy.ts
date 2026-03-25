import type { CanonicalPlaceCategory } from './types';

const categoryMap: Array<{ match: (value: string) => boolean; category: CanonicalPlaceCategory }> = [
  { match: (v) => /restaurant|food court|fast food|food|eatery|catering/.test(v), category: 'food_restaurant' },
  { match: (v) => /cafe|coffee|tea/.test(v), category: 'cafe' },
  { match: (v) => /bar|pub|night|club|beer|wine/.test(v), category: 'bar_nightlife' },
  { match: (v) => /museum|cinema|theater|theatre|music|concert|comedy|jazz|entertainment/.test(v), category: 'entertainment' },
  { match: (v) => /board game|games|toy|hobby|escape/.test(v), category: 'hobby_games' },
  { match: (v) => /culture|gallery|library|art/.test(v), category: 'culture' },
  { match: (v) => /sport|fitness|gym|stadium|swim|climb/.test(v), category: 'sports' },
  { match: (v) => /park|garden|outdoor|trail|hiking|nature/.test(v), category: 'park_outdoor' },
  { match: (v) => /shop|mall|retail|market/.test(v), category: 'shopping' },
  { match: (v) => /tourism|tourist|attraction|viewpoint|monument/.test(v), category: 'tourism' },
  { match: (v) => /poi|amenity|place|establishment/.test(v), category: 'generic_poi' },
];

export function mapProviderCategoriesToCanonical(rawCategories: string[] | undefined): CanonicalPlaceCategory[] {
  if (!rawCategories?.length) return ['unknown'];

  const canonical = new Set<CanonicalPlaceCategory>();

  for (const rawCategory of rawCategories) {
    const normalized = rawCategory.toLowerCase();
    const hit = categoryMap.find((entry) => entry.match(normalized));
    if (hit) canonical.add(hit.category);
  }

  if (!canonical.size) canonical.add('unknown');
  return [...canonical];
}
