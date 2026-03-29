import type { CanonicalPlaceCategory } from './types';

const CATEGORY_RULES: Array<{ canonical: CanonicalPlaceCategory; matchers: RegExp[] }> = [
  { canonical: 'restaurant_food', matchers: [/restaurant/i, /food/i, /cafe/i, /coffee/i, /bakery/i, /barbecue/i, /pizza/i] },
  { canonical: 'bar_nightlife', matchers: [/bar/i, /pub/i, /nightlife/i, /club/i, /beer/i, /cocktail/i] },
  { canonical: 'entertainment', matchers: [/cinema/i, /movie/i, /theatre/i, /theater/i, /music/i, /concert/i, /entertainment/i, /museum/i, /gallery/i] },
  { canonical: 'hobby_games', matchers: [/board.?game/i, /games?/i, /hobby/i, /comics?/i, /cards?/i, /toy/i, /escape/i] },
  { canonical: 'generic_poi', matchers: [/poi/i, /landmark/i, /attraction/i, /park/i, /viewpoint/i, /sports?/i, /stadium/i, /arena/i] },
];

export function mapProviderCategoriesToCanonical(input: string[] | undefined | null): {
  categories: CanonicalPlaceCategory[];
  confidence: number;
} {
  const raw = (input || []).filter(Boolean);
  const found = new Set<CanonicalPlaceCategory>();

  for (const category of raw) {
    for (const rule of CATEGORY_RULES) {
      if (rule.matchers.some((matcher) => matcher.test(category))) {
        found.add(rule.canonical);
      }
    }
  }

  if (found.size === 0) {
    return { categories: ['unknown'], confidence: 0.2 };
  }

  return { categories: Array.from(found), confidence: raw.length > 0 ? 0.9 : 0.6 };
}
