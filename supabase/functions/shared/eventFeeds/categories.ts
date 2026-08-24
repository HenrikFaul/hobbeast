import type { HobbeastCategoryId } from './types.ts';
import { EVENT_FEED_LIMITS } from './types.ts';
import { normalizeSearchText } from './text.ts';

interface CategoryRule {
  id: HobbeastCategoryId;
  keywords: string[];
}

// These IDs intentionally mirror the 17 top-level entries in HOBBY_CATALOG.
const CATEGORY_RULES: CategoryRule[] = [
  { id: 'sport', keywords: ['sport', 'foci', 'futball', 'football', 'kosarlabda', 'kezilabda', 'roplabda', 'tenisz', 'tollaslabda', 'futas', 'joga', 'fitness', 'uszas', 'kerekpar', 'bicikli'] },
  { id: 'extreme', keywords: ['extrem', 'extreme', 'sziklamaszas', 'falmaszas', 'climbing', 'parkour', 'bungee', 'rafting', 'sikloernyo', 'adrenalin'] },
  { id: 'nature', keywords: ['tura', 'turazas', 'hiking', 'kirandulas', 'termeszet', 'nature', 'erdo', 'hegy', 'outdoor', 'kerteszkedes', 'madarles'] },
  { id: 'creative', keywords: ['kezmuves', 'alkotas', 'art', 'craft', 'festes', 'painting', 'rajz', 'keramia', 'workshop', 'barkacs', 'diy', 'horgolas', 'varras'] },
  { id: 'music', keywords: ['zene', 'music', 'koncert', 'concert', 'festival', 'zenekar', 'band', 'dj', 'jazz', 'rock', 'komolyzene', 'hangszer', 'enek'] },
  { id: 'dance', keywords: ['tanc', 'dance', 'salsa', 'bachata', 'tango', 'balett', 'hip hop', 'neptanc'] },
  { id: 'board-games', keywords: ['tarsasjatek', 'board game', 'sakk', 'kartya', 'quiz', 'kviz', 'puzzle', 'szerepjatek'] },
  { id: 'gaming', keywords: ['gaming', 'videojatek', 'e sport', 'esport', 'playstation', 'xbox', 'nintendo', 'lan party'] },
  { id: 'gastronomy', keywords: ['gasztro', 'gastronomy', 'fozes', 'cooking', 'sutes', 'kostolo', 'tasting', 'etterem', 'food', 'bor', 'wine', 'sor', 'kave', 'street food', 'kulinaris'] },
  { id: 'photo-film', keywords: ['foto', 'photo', 'photography', 'fenykepezes', 'film', 'mozi', 'movie', 'video', 'cinema', 'dokumentumfilm'] },
  { id: 'tech', keywords: ['technologia', 'programozas', 'informatika', 'robotika', 'maker', 'mernok', 'startup', 'ai', 'mesterséges intelligencia'] },
  { id: 'learning', keywords: ['tanulas', 'learning', 'oktatas', 'education', 'eloadas', 'lecture', 'kurzus', 'course', 'nyelv', 'language', 'konyv', 'book', 'irodalom', 'tudomany', 'science', 'ismeretterjeszto'] },
  { id: 'animals', keywords: ['allat', 'animal', 'kutya', 'kutyas', 'dog', 'macska', 'cat', 'lovaglas', 'menhely', 'kisallat'] },
  { id: 'travel', keywords: ['utazas', 'travel', 'varosnezes', 'sightseeing', 'kiruccanas', 'idegenvezetes', 'seta', 'vilagjaro'] },
  { id: 'fashion', keywords: ['divat', 'fashion', 'stilus', 'ruha', 'smink', 'szepseg'] },
  { id: 'volunteering', keywords: ['onkentes', 'volunteer', 'kozosseg', 'community', 'adomany', 'charity', 'jotekonysag', 'segitseg', 'szemetszedes', 'civil'] },
  { id: 'performing-arts', keywords: ['szinhaz', 'theater', 'theatre', 'eloadas', 'show', 'performance', 'stand up', 'comedy', 'improvizacio', 'opera', 'cirkusz', 'circus', 'musical'] },
];

export interface CategoryMatch {
  category: HobbeastCategoryId | null;
  tags: string[];
}

export function classifyEventCategory(parts: Array<string | null | undefined>): CategoryMatch {
  const haystack = ` ${normalizeSearchText(parts.filter(Boolean).join(' '))} `;
  if (!haystack.trim()) return { category: null, tags: [] };
  const tokens = haystack.trim().split(' ');

  let best: { id: HobbeastCategoryId; score: number; order: number } | null = null;
  const matches: string[] = [];

  for (const [order, rule] of CATEGORY_RULES.entries()) {
    let score = 0;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeSearchText(keyword);
      if (!normalizedKeyword) continue;
      const keywordTokens = normalizedKeyword.split(' ');
      const matchesKeyword = keywordTokens.length > 1
        ? haystack.includes(` ${normalizedKeyword} `)
        : tokens.some((token) => token === normalizedKeyword || (normalizedKeyword.length >= 4 && token.startsWith(normalizedKeyword)));
      if (matchesKeyword) {
        score += Math.max(1, normalizedKeyword.split(' ').length);
        matches.push(normalizedKeyword.replace(/ /g, '-'));
      }
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && order < best.order))) {
      best = { id: rule.id, score, order };
    }
  }

  return {
    category: best?.id ?? null,
    tags: [...new Set(matches)].slice(0, EVENT_FEED_LIMITS.maxTags),
  };
}
