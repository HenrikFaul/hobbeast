export type RecommendationSource = 'native' | 'external' | 'hub' | 'circle' | 'venue';

export type RecommendationReasonCode =
  | 'explicit_interest'
  | 'nearby'
  | 'beginner_friendly'
  | 'attended_similar'
  | 'fits_availability'
  | 'trusted_host'
  | 'fresh'
  | 'discovery_pick';

export interface RecommendationCandidate {
  id: string;
  canonicalIdentity: string;
  source: RecommendationSource;
  title: string;
  category: string;
  activity?: string | null;
  city?: string | null;
  startsAt?: string | null;
  distanceKm?: number | null;
  beginnerFriendly?: boolean;
  hostReliability?: number | null;
  freshness?: number | null;
  marketplaceExposure?: number | null;
  attendedSimilar?: boolean;
  availabilityMatch?: boolean;
  serverRankingScore?: number | null;
  serverReasonCodes?: RecommendationReasonCode[];
  isBlockedContext?: boolean;
}

export interface RecommendationContext {
  explicitInterests: string[];
  attendedCategories?: string[];
  preferredCity?: string | null;
  maxDistanceKm?: number | null;
  now?: Date;
  coldStart?: boolean;
}

export interface RecommendationWeights {
  explicitInterest: number;
  attendedSimilar: number;
  availability: number;
  proximity: number;
  time: number;
  beginnerFriendly: number;
  hostReliability: number;
  freshness: number;
  marketplaceHealth: number;
}

export interface RankedRecommendation {
  candidate: RecommendationCandidate;
  score: number;
  reasons: RecommendationReasonCode[];
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  explicitInterest: 32,
  attendedSimilar: 12,
  availability: 6,
  proximity: 16,
  time: 8,
  beginnerFriendly: 8,
  hostReliability: 10,
  freshness: 8,
  marketplaceHealth: 6,
};

const SOURCE_PRIORITY: Record<RecommendationSource, number> = {
  native: 5,
  circle: 4,
  hub: 3,
  external: 2,
  venue: 1,
};

export const RECOMMENDATION_REASON_LABELS: Record<RecommendationReasonCode, string> = {
  explicit_interest: 'A kiválasztott érdeklődésed alapján',
  nearby: 'A közeledben',
  beginner_friendly: 'Kezdőbarát',
  attended_similar: 'Hasonló programon vettél részt',
  fits_availability: 'Illeszkedik a megadott időablakodhoz',
  trusted_host: 'Megbízható szervező',
  fresh: 'Friss program',
  discovery_pick: 'Felfedezésre ajánljuk',
};

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function clamp01(value: number | null | undefined, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Number(value)));
}

function interestMatches(candidate: RecommendationCandidate, values: string[]) {
  const haystack = normalize(`${candidate.category} ${candidate.activity ?? ''} ${candidate.title}`);
  return values.some((value) => {
    const needle = normalize(value);
    return needle.length >= 2 && haystack.includes(needle);
  });
}

export function buildCanonicalEventIdentity(input: {
  provider?: string | null;
  externalId?: string | null;
  title: string;
  startsAt?: string | null;
  city?: string | null;
}) {
  const provider = normalize(input.provider);
  const externalId = normalize(input.externalId);
  if (provider && externalId) return `${provider}:${externalId}`;
  return [normalize(input.title), input.startsAt?.slice(0, 16) ?? '', normalize(input.city)].join('|');
}

export function dedupeRecommendationCandidates(candidates: RecommendationCandidate[]) {
  const winners = new Map<string, RecommendationCandidate>();
  for (const candidate of candidates) {
    const current = winners.get(candidate.canonicalIdentity);
    if (!current || SOURCE_PRIORITY[candidate.source] > SOURCE_PRIORITY[current.source]) {
      winners.set(candidate.canonicalIdentity, candidate);
    }
  }
  return [...winners.values()];
}

export function scoreRecommendation(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
  weights: RecommendationWeights = DEFAULT_RECOMMENDATION_WEIGHTS,
): RankedRecommendation | null {
  if (candidate.isBlockedContext) return null;
  const reasons: RecommendationReasonCode[] = [];
  let score = 0;

  if (interestMatches(candidate, context.explicitInterests)) {
    score += weights.explicitInterest;
    reasons.push('explicit_interest');
  }
  if (candidate.attendedSimilar || interestMatches(candidate, context.attendedCategories ?? [])) {
    score += weights.attendedSimilar;
    reasons.push('attended_similar');
  }
  if (candidate.availabilityMatch) {
    score += weights.availability;
    reasons.push('fits_availability');
  }

  const distance = candidate.distanceKm;
  const maxDistance = context.maxDistanceKm;
  const sameCity = normalize(candidate.city) && normalize(candidate.city) === normalize(context.preferredCity);
  if (typeof distance === 'number' && typeof maxDistance === 'number' && maxDistance > 0 && distance <= maxDistance) {
    score += weights.proximity * (1 - Math.min(distance / maxDistance, 1) * 0.6);
    reasons.push('nearby');
  } else if (sameCity) {
    score += weights.proximity * 0.65;
    reasons.push('nearby');
  }

  if (candidate.beginnerFriendly) {
    score += weights.beginnerFriendly;
    reasons.push('beginner_friendly');
  }
  const reliability = clamp01(candidate.hostReliability, 0.5);
  score += weights.hostReliability * reliability;
  if (reliability >= 0.75) reasons.push('trusted_host');

  const freshness = clamp01(candidate.freshness, 0.5);
  score += weights.freshness * freshness;
  if (freshness >= 0.75) reasons.push('fresh');

  const exposureNeed = 1 - clamp01(candidate.marketplaceExposure, 0.5);
  score += weights.marketplaceHealth * exposureNeed;

  if (candidate.startsAt) {
    const start = new Date(candidate.startsAt).getTime();
    const now = (context.now ?? new Date()).getTime();
    if (Number.isFinite(start) && start >= now) {
      const days = (start - now) / 86_400_000;
      score += weights.time * Math.max(0, 1 - Math.min(days, 30) / 30);
    }
  }

  if (candidate.serverReasonCodes?.length) reasons.push(...candidate.serverReasonCodes);
  if (reasons.length === 0 || context.coldStart) reasons.push('discovery_pick');
  const authoritativeScore = Number.isFinite(candidate.serverRankingScore)
    ? Math.min(200, Math.max(0, Number(candidate.serverRankingScore)))
    : score;
  return { candidate, score: Number(authoritativeScore.toFixed(4)), reasons: [...new Set(reasons)] };
}

export function diversityRerank(
  ranked: RankedRecommendation[],
  options: { maxConsecutiveCategory?: number; maxConsecutiveSource?: number } = {},
) {
  const remaining = [...ranked].sort((a, b) => b.score - a.score || a.candidate.canonicalIdentity.localeCompare(b.candidate.canonicalIdentity));
  const result: RankedRecommendation[] = [];
  const maxCategory = options.maxConsecutiveCategory ?? 2;
  const maxSource = options.maxConsecutiveSource ?? 2;

  while (remaining.length) {
    const recentCategories = result.slice(-maxCategory).map((item) => normalize(item.candidate.category));
    const recentSources = result.slice(-maxSource).map((item) => item.candidate.source);
    let index = remaining.findIndex((item) =>
      !(recentCategories.length === maxCategory && recentCategories.every((value) => value === normalize(item.candidate.category))) &&
      !(recentSources.length === maxSource && recentSources.every((value) => value === item.candidate.source)),
    );
    if (index < 0) index = 0;
    result.push(remaining.splice(index, 1)[0]);
  }
  return result;
}

export function rankRecommendations(
  candidates: RecommendationCandidate[],
  context: RecommendationContext,
  weights = DEFAULT_RECOMMENDATION_WEIGHTS,
) {
  const scored = dedupeRecommendationCandidates(candidates)
    .map((candidate) => scoreRecommendation(candidate, context, weights))
    .filter((item): item is RankedRecommendation => item !== null);
  return diversityRerank(scored);
}

export interface RecommendationReplayCase {
  candidates: RecommendationCandidate[];
  context: RecommendationContext;
  positiveCanonicalIdentities?: string[];
}

export interface RecommendationReplayMetrics {
  cases: number;
  labeledCases: number;
  hitRateAtK: number | null;
  meanUniqueSourcesAtK: number;
  lowExposureShareAtK: number;
  sourceExposureAtK: Record<RecommendationSource, number>;
}

/**
 * Reproducible, privacy-safe offline gate for weight/rule changes. Inputs are
 * already normalized candidates and explicit outcome labels; no sensitive
 * user attributes or inferred states are accepted by the contract.
 */
export function evaluateRecommendationReplay(cases: RecommendationReplayCase[], topK = 10): RecommendationReplayMetrics {
  const safeTopK = Math.max(1, Math.min(100, Math.trunc(topK) || 10));
  const sourceCounts: Record<RecommendationSource, number> = { native: 0, external: 0, hub: 0, circle: 0, venue: 0 };
  let labeledCases = 0;
  let hits = 0;
  let uniqueSourceTotal = 0;
  let lowExposure = 0;
  let totalExposure = 0;

  for (const replayCase of cases) {
    const ranked = rankRecommendations(replayCase.candidates, replayCase.context).slice(0, safeTopK);
    const identities = new Set(ranked.map((item) => item.candidate.canonicalIdentity));
    const labels = replayCase.positiveCanonicalIdentities ?? [];
    if (labels.length > 0) {
      labeledCases += 1;
      if (labels.some((identity) => identities.has(identity))) hits += 1;
    }
    uniqueSourceTotal += new Set(ranked.map((item) => item.candidate.source)).size;
    for (const item of ranked) {
      sourceCounts[item.candidate.source] += 1;
      totalExposure += 1;
      if ((item.candidate.marketplaceExposure ?? 0.5) <= 0.25) lowExposure += 1;
    }
  }

  return {
    cases: cases.length,
    labeledCases,
    hitRateAtK: labeledCases > 0 ? Number((hits / labeledCases).toFixed(4)) : null,
    meanUniqueSourcesAtK: cases.length > 0 ? Number((uniqueSourceTotal / cases.length).toFixed(4)) : 0,
    lowExposureShareAtK: totalExposure > 0 ? Number((lowExposure / totalExposure).toFixed(4)) : 0,
    sourceExposureAtK: sourceCounts,
  };
}

export interface DiscoveryFeedback {
  candidateIdentity: string;
  preference: 'less_like_this' | 'neutral';
}

export function upsertDiscoveryFeedback(current: DiscoveryFeedback[], next: DiscoveryFeedback) {
  return [...current.filter((item) => item.candidateIdentity !== next.candidateIdentity), next];
}
