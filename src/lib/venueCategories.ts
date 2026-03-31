/**
 * Maps hobby activity/subcategory IDs to TomTom and Geoapify POI category codes.
 * Used by the place-search edge function for activity-aware venue search.
 */

// TomTom category IDs (from TomTom Search API v2 POI categories)
// 7314: Health Club, 7315: Café, 7317: Community Center, 7320: Sports Center, 7321: Restaurant, 7326: Tennis Court, 7338: Swimming Pool, 7342: Nightlife, 9361: Winery, 9362: Park, 9376: Entertainment, 9927: Nature Reserve
// Geoapify category strings
// catering, catering.cafe, catering.restaurant, catering.pub, entertainment, entertainment.culture, leisure, leisure.park, sport, sport.stadium, sport.pitch, sport.tennis, sport.swimming_pool, sport.fitness, sport.climbing, education, service, tourism, natural

export interface VenueCategoryMapping {
  /** Human-readable label for this mapping */
  label: string;
  /** TomTom POI category IDs to search */
  tomtomCategories: number[];
  /** Geoapify category filters */
  geoapifyCategories: string[];
  /** Additional free-text terms to boost relevance */
  searchTerms: string[];
}

const VENUE_MAP: Record<string, VenueCategoryMapping> = {
  // Board games / tabletop
  'board-games': {
    label: 'Társasjáték helyek',
    tomtomCategories: [9376, 7315, 9362],
    geoapifyCategories: ['entertainment', 'catering.cafe', 'leisure'],
    searchTerms: ['társasjáték', 'board game', 'café', 'kávézó', 'játékbolt'],
  },
  // Ball sports
  'ball-sports': {
    label: 'Sportpályák',
    tomtomCategories: [7320, 7374],
    geoapifyCategories: ['sport', 'sport.stadium', 'sport.pitch'],
    searchTerms: ['sportpálya', 'sportcentrum', 'stadion'],
  },
  // Racket sports
  'racket-sports': {
    label: 'Ütős sport helyek',
    tomtomCategories: [7320, 7326],
    geoapifyCategories: ['sport', 'sport.tennis'],
    searchTerms: ['teniszpálya', 'squash', 'sportcentrum'],
  },
  // Running
  'running-athletics': {
    label: 'Futópályák / parkok',
    tomtomCategories: [7320, 9362, 9927],
    geoapifyCategories: ['sport', 'leisure.park'],
    searchTerms: ['futópálya', 'park', 'atlétika'],
  },
  // Cycling
  'cycling': {
    label: 'Kerékpáros helyek',
    tomtomCategories: [7320, 9927],
    geoapifyCategories: ['sport', 'leisure.park', 'rental.bicycle'],
    searchTerms: ['kerékpár', 'bicikli', 'bike'],
  },
  // Water sports
  'water-sports': {
    label: 'Vízi sport helyek',
    tomtomCategories: [7320, 7338],
    geoapifyCategories: ['sport', 'sport.swimming_pool', 'beach'],
    searchTerms: ['uszoda', 'strand', 'vízi sport'],
  },
  // Fitness / wellness
  'fitness-wellness': {
    label: 'Fitnesz / Wellness',
    tomtomCategories: [7320, 7314],
    geoapifyCategories: ['sport', 'sport.fitness', 'healthcare.spa'],
    searchTerms: ['edzőterem', 'fitnesz', 'jóga', 'wellness'],
  },
  // Climbing
  'climbing': {
    label: 'Mászófalak',
    tomtomCategories: [7320],
    geoapifyCategories: ['sport', 'sport.climbing'],
    searchTerms: ['mászófal', 'boulder', 'climbing'],
  },
  // Martial arts
  'martial-arts': {
    label: 'Küzdősport termek',
    tomtomCategories: [7320],
    geoapifyCategories: ['sport'],
    searchTerms: ['dojo', 'küzdősport', 'box', 'edzőterem'],
  },
  // Creative / workshop
  'visual-arts': {
    label: 'Műhelyek / műtermek',
    tomtomCategories: [7317, 9376],
    geoapifyCategories: ['entertainment', 'education'],
    searchTerms: ['műhely', 'műterem', 'workshop', 'alkotóház'],
  },
  'crafts-diy': {
    label: 'Kézműves helyek',
    tomtomCategories: [7317, 9376],
    geoapifyCategories: ['entertainment', 'education'],
    searchTerms: ['kézműves', 'workshop', 'alkotóház'],
  },
  // Music
  'music': {
    label: 'Zenei helyszínek',
    tomtomCategories: [7342, 9376],
    geoapifyCategories: ['entertainment', 'entertainment.culture'],
    searchTerms: ['zeneterem', 'koncertterem', 'próbaterem', 'zeneiskola'],
  },
  // Dance
  'dance': {
    label: 'Tánctermek',
    tomtomCategories: [7342, 7320],
    geoapifyCategories: ['entertainment', 'sport'],
    searchTerms: ['táncterem', 'tánciskola', 'dance studio'],
  },
  // Gaming / esport
  'video-games': {
    label: 'Gaming helyek',
    tomtomCategories: [9376],
    geoapifyCategories: ['entertainment'],
    searchTerms: ['gaming', 'esport', 'internet kávézó'],
  },
  // Gastronomy
  'cooking': {
    label: 'Főzőhelyek',
    tomtomCategories: [7315, 7321],
    geoapifyCategories: ['catering', 'catering.restaurant'],
    searchTerms: ['főzőiskola', 'konyha', 'restaurant', 'étterem'],
  },
  'wine-beer': {
    label: 'Kóstolóhelyek',
    tomtomCategories: [7315, 9361],
    geoapifyCategories: ['catering', 'catering.pub'],
    searchTerms: ['borászat', 'sörfőzde', 'borkóstoló', 'kocsma'],
  },
  // Photography
  'photography': {
    label: 'Fotóstúdiók',
    tomtomCategories: [9376],
    geoapifyCategories: ['service'],
    searchTerms: ['fotóstúdió', 'műterem', 'photo studio'],
  },
  // Social
  'community-events': {
    label: 'Közösségi helyek',
    tomtomCategories: [7317, 7315],
    geoapifyCategories: ['entertainment', 'catering.cafe'],
    searchTerms: ['közösségi tér', 'kávézó', 'co-working'],
  },
  // Hiking / outdoor
  'hiking-trekking': {
    label: 'Túra kiindulópontok',
    tomtomCategories: [9927, 9362],
    geoapifyCategories: ['leisure.park', 'natural', 'tourism'],
    searchTerms: ['túra', 'erdő', 'park', 'természetvédelmi'],
  },
};

/**
 * Get venue category mapping for a given subcategory ID.
 * Falls back to a generic mapping if no specific one exists.
 */
export function getVenueCategoryMapping(subcategoryId: string): VenueCategoryMapping | null {
  return VENUE_MAP[subcategoryId] || null;
}

/**
 * Build a search query string combining the user's text query with activity context.
 */
export function buildActivityAwareQuery(userQuery: string, activityName?: string, subcategoryId?: string): string {
  const mapping = subcategoryId ? getVenueCategoryMapping(subcategoryId) : null;

  // If user typed something, use it as primary
  if (userQuery.trim().length > 0) return userQuery.trim();

  // Otherwise use activity name + mapping search terms
  const parts: string[] = [];
  if (activityName) parts.push(activityName);
  if (mapping?.searchTerms?.[0]) parts.push(mapping.searchTerms[0]);

  return parts.join(' ') || userQuery;
}
