export interface OrganicDiscoveryItem {
  eventId: string;
}

export interface PromotedExperienceCandidate<T extends OrganicDiscoveryItem> {
  item: T;
  disclosureLabel: string;
  policyStatus: 'pending' | 'approved' | 'rejected' | 'suspended';
  qualityScore: number;
  relevanceScore: number;
  startsAt: string;
  endsAt: string;
}

export type RankedDiscoveryItem<T extends OrganicDiscoveryItem> =
  | { item: T; isPromoted: false; disclosureLabel: null }
  | { item: T; isPromoted: true; disclosureLabel: 'Promoted' };

interface PromotedRankingOptions {
  now?: Date;
  maxPromoted?: number;
  organicBeforeFirst?: number;
  minimumOrganicBetween?: number;
}

function isEligiblePromotion<T extends OrganicDiscoveryItem>(
  candidate: PromotedExperienceCandidate<T>,
  now: Date,
) {
  const start = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt);
  return candidate.disclosureLabel === 'Promoted'
    && candidate.policyStatus === 'approved'
    && Number.isFinite(start)
    && Number.isFinite(end)
    && start <= now.getTime()
    && end > now.getTime()
    && candidate.qualityScore >= 0.5
    && candidate.qualityScore <= 1
    && candidate.relevanceScore >= 0.5
    && candidate.relevanceScore <= 1;
}

export function interleavePromotedContent<T extends OrganicDiscoveryItem>(
  organicItems: readonly T[],
  promotedCandidates: readonly PromotedExperienceCandidate<T>[],
  options: PromotedRankingOptions = {},
): RankedDiscoveryItem<T>[] {
  const now = options.now || new Date();
  const maxPromoted = Math.max(0, Math.min(3, Math.floor(options.maxPromoted ?? 1)));
  const organicBeforeFirst = Math.max(1, Math.floor(options.organicBeforeFirst ?? 3));
  const minimumOrganicBetween = Math.max(1, Math.floor(options.minimumOrganicBetween ?? 4));
  const organicIds = new Set(organicItems.map((item) => item.eventId));
  const seenPromotedIds = new Set<string>();
  const eligibleByPolicy = promotedCandidates
    .filter((candidate) => isEligiblePromotion(candidate, now))
    .filter((candidate) => {
      if (seenPromotedIds.has(candidate.item.eventId)) return false;
      seenPromotedIds.add(candidate.item.eventId);
      return true;
    })
    .sort((left, right) => (
      right.relevanceScore - left.relevanceScore
      || right.qualityScore - left.qualityScore
      || left.item.eventId.localeCompare(right.item.eventId)
    ));

  // A promoted candidate can already exist in the organic result set. Move it
  // exactly once only when enough organic items remain to satisfy the spacing
  // policy; otherwise leave it in its original organic position. This prevents
  // both duplicate cards and short-result suppression.
  const eligible: PromotedExperienceCandidate<T>[] = [];
  let movedOrganicCount = 0;
  for (const candidate of eligibleByPolicy) {
    if (eligible.length >= maxPromoted) break;
    const movesOrganicItem = organicIds.has(candidate.item.eventId);
    const nextMovedCount = movedOrganicCount + (movesOrganicItem ? 1 : 0);
    const requiredOrganic = organicBeforeFirst + eligible.length * minimumOrganicBetween;
    if (organicItems.length - nextMovedCount < requiredOrganic) continue;
    eligible.push(candidate);
    movedOrganicCount = nextMovedCount;
  }

  const promotedIds = new Set(eligible.map((candidate) => candidate.item.eventId));
  const organicQueue = organicItems.filter((item) => !promotedIds.has(item.eventId));

  const result: RankedDiscoveryItem<T>[] = [];
  let promotionIndex = 0;
  let organicSincePromotion = 0;
  for (let index = 0; index < organicQueue.length; index += 1) {
    result.push({ item: organicQueue[index], isPromoted: false, disclosureLabel: null });
    organicSincePromotion += 1;
    const requiredOrganic = promotionIndex === 0 ? organicBeforeFirst : minimumOrganicBetween;
    if (promotionIndex < eligible.length && organicSincePromotion >= requiredOrganic) {
      result.push({
        item: eligible[promotionIndex].item,
        isPromoted: true,
        disclosureLabel: 'Promoted',
      });
      promotionIndex += 1;
      organicSincePromotion = 0;
    }
  }
  return result;
}
