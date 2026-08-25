export const researchClaimPlacements = [
  'research_feature',
  'home_connection',
  'about_mission',
  'explore_context',
] as const;

export type ResearchClaimPlacement = (typeof researchClaimPlacements)[number];

export interface CommunityResearchClaim {
  id: string;
  locale: string;
  statement: string;
  sourceTitle: string;
  sourceContainer: string | null;
  authors: string;
  publicationYear: number;
  sourceUrl: string | null;
  doi: string | null;
  isSaved: boolean;
}

export interface RandomResearchClaimRequest {
  locale: string;
  placement: ResearchClaimPlacement;
  randomCursor: number;
}

const localePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;

export function resolveResearchLocale(
  documentLanguage?: string | null,
  browserLanguage?: string | null,
): string {
  const candidate = (documentLanguage || browserLanguage || 'hu-HU').trim().replaceAll('_', '-');
  return candidate.length <= 35 && localePattern.test(candidate) ? candidate : 'hu-HU';
}

interface RandomValuesSource {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

export function createResearchRandomCursor(source?: RandomValuesSource | null): number {
  const cryptoSource = source ?? (typeof globalThis.crypto === 'undefined' ? null : globalThis.crypto);
  if (cryptoSource?.getRandomValues) {
    const value = new Uint32Array(1);
    cryptoSource.getRandomValues(value);
    return value[0] / 4_294_967_296;
  }
  return Math.random();
}
