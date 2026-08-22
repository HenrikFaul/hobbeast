export type DemandQualificationStatus = 'qualified' | 'excluded';

export interface DemandSignal {
  hubId: string;
  category: string;
  subcategory?: string | null;
  activity: string;
  city: string | null;
  realMemberCount: number;
  recentActiveMemberCount: number;
  explicitInterestCount: number;
  availabilityOverlapCount?: number | null;
  upcomingOverlappingEventCount: number;
  cooldownUntil?: string | null;
  organizerCapacityAvailable?: boolean | null;
}

export interface DemandQualificationConfig {
  minRealMembers: number;
  minRecentActiveMembers: number;
  minExplicitInterestMembers: number;
  kAnonymityThreshold: number;
  maxUpcomingOverlappingEvents: number;
  nowIso: string;
}

export interface DemandQualification {
  status: DemandQualificationStatus;
  reasons: string[];
  confidence: number;
  privacySafeSnapshot: PrivacySafeDemandSnapshot;
}

export interface PrivacySafeDemandSnapshot {
  hub_id: string;
  category: string;
  subcategory: string | null;
  activity: string;
  coarse_city: string;
  real_member_count: number;
  recent_active_member_count: number;
  explicit_interest_count: number;
  availability_overlap_count: number | null;
  upcoming_overlap_count: number;
  organizer_capacity: 'available' | 'unavailable' | 'unverified';
}

export interface AiEventProposalCandidate {
  hub_id: string;
  title: string;
  description: string;
  activity: string;
  suggested_start: string;
  suggested_end: string;
  coarse_city: string;
  area_hint: string;
  venue_category: string;
  target_capacity: number;
  demand_reason: string;
  confidence: number;
  language: string;
}

export type AiProposalStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published' | 'cancelled';

export interface ProposalPublishReadiness {
  status: AiProposalStatus;
  organizerId?: string | null;
  venueValidationStatus: 'unverified' | 'verified' | 'rejected';
  moderationStatus: 'pending' | 'passed' | 'failed';
  hostResponsibilityAcceptedAt?: string | null;
  suggestedStart: string;
  targetCapacity: number;
  nowIso: string;
}

const UNSAFE_ACTIVITY_PATTERN = /\b(?:fegyver(?:es)?|weapon|illegális|illegal|drog|drug|önkárosítás|self[- ]?harm)\b/i;

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizePromptData(value: unknown, maximum = 160) {
  if (typeof value !== 'string') return '';
  return value
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/```/g, '')
    .replace(/\b(?:system|assistant|developer)\s*:/gi, '')
    .replace(/ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, maximum));
}

export function buildPrivacySafeDemandSnapshot(signal: DemandSignal): PrivacySafeDemandSnapshot {
  return {
    hub_id: signal.hubId,
    category: sanitizePromptData(signal.category, 120),
    subcategory: signal.subcategory ? sanitizePromptData(signal.subcategory, 120) : null,
    activity: sanitizePromptData(signal.activity, 120),
    coarse_city: sanitizePromptData(signal.city, 160),
    real_member_count: Math.max(0, Math.floor(signal.realMemberCount)),
    recent_active_member_count: Math.max(0, Math.floor(signal.recentActiveMemberCount)),
    explicit_interest_count: Math.max(0, Math.floor(signal.explicitInterestCount)),
    availability_overlap_count: signal.availabilityOverlapCount == null
      ? null
      : Math.max(0, Math.floor(signal.availabilityOverlapCount)),
    upcoming_overlap_count: Math.max(0, Math.floor(signal.upcomingOverlappingEventCount)),
    organizer_capacity: signal.organizerCapacityAvailable === true
      ? 'available'
      : signal.organizerCapacityAvailable === false
        ? 'unavailable'
        : 'unverified',
  };
}

export function qualifyDemandSignal(
  signal: DemandSignal,
  config: DemandQualificationConfig,
): DemandQualification {
  const snapshot = buildPrivacySafeDemandSnapshot(signal);
  const reasons: string[] = [];
  const exclusions: string[] = [];
  const threshold = Math.max(config.minRealMembers, config.kAnonymityThreshold);

  if (!snapshot.coarse_city) exclusions.push('missing_coarse_geo');
  if (snapshot.real_member_count < threshold) exclusions.push('below_real_demand_or_k_anonymity');
  if (snapshot.recent_active_member_count < config.minRecentActiveMembers) exclusions.push('insufficient_recent_activity');
  if (snapshot.explicit_interest_count < config.minExplicitInterestMembers) exclusions.push('insufficient_explicit_interest');
  if (snapshot.upcoming_overlap_count > config.maxUpcomingOverlappingEvents) exclusions.push('upcoming_event_overlap');
  if (signal.cooldownUntil && Date.parse(signal.cooldownUntil) > Date.parse(config.nowIso)) exclusions.push('cooldown_active');
  if (signal.organizerCapacityAvailable === false) exclusions.push('organizer_capacity_unavailable');

  if (snapshot.real_member_count >= threshold) reasons.push(`${snapshot.real_member_count} valódi érdeklődő`);
  if (snapshot.recent_active_member_count >= config.minRecentActiveMembers) {
    reasons.push(`${snapshot.recent_active_member_count} közelmúltban aktív tag`);
  }
  if (snapshot.availability_overlap_count != null) {
    reasons.push(`${snapshot.availability_overlap_count} elérhetőségi átfedés`);
  }
  if (signal.organizerCapacityAvailable == null) reasons.push('szervezői kapacitás még ellenőrizendő');

  const volumeScore = clamp(snapshot.real_member_count / Math.max(threshold * 2, 1), 0, 1);
  const activityScore = clamp(snapshot.recent_active_member_count / Math.max(snapshot.real_member_count, 1), 0, 1);
  const explicitScore = clamp(snapshot.explicit_interest_count / Math.max(snapshot.real_member_count, 1), 0, 1);
  const organizerScore = signal.organizerCapacityAvailable === true ? 1 : signal.organizerCapacityAvailable === false ? 0 : 0.5;
  const confidence = Number((volumeScore * 0.35 + activityScore * 0.25 + explicitScore * 0.25 + organizerScore * 0.15).toFixed(3));

  return {
    status: exclusions.length === 0 ? 'qualified' : 'excluded',
    reasons: exclusions.length === 0 ? reasons : exclusions,
    confidence,
    privacySafeSnapshot: snapshot,
  };
}

export function validateAiEventProposalCandidate(value: unknown): value is AiEventProposalCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<AiEventProposalCandidate>;
  if (!boundedString(candidate.hub_id, 128)
    || !boundedString(candidate.title, 120)
    || !boundedString(candidate.description, 2000)
    || !boundedString(candidate.activity, 120)
    || !boundedString(candidate.coarse_city, 160)
    || !boundedString(candidate.area_hint, 160)
    || !boundedString(candidate.venue_category, 120)
    || !boundedString(candidate.demand_reason, 500)
    || !boundedString(candidate.language, 16)
    || !boundedInteger(candidate.target_capacity, 3, 500)
    || typeof candidate.confidence !== 'number'
    || !Number.isFinite(candidate.confidence)
    || candidate.confidence < 0
    || candidate.confidence > 1) return false;

  const start = Date.parse(String(candidate.suggested_start));
  const end = Date.parse(String(candidate.suggested_end));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 60 * 60 * 1000) return false;
  return !UNSAFE_ACTIVITY_PATTERN.test([
    candidate.title,
    candidate.description,
    candidate.activity,
    candidate.venue_category,
  ].join(' '));
}

export function buildProposalIdempotencyKey(hubId: string, suggestedStart: string) {
  const date = new Date(suggestedStart);
  if (!hubId.trim() || Number.isNaN(date.getTime())) return null;
  const isoDay = date.toISOString().slice(0, 10);
  return `ai-proposal:${hubId.trim().toLocaleLowerCase('hu-HU')}:${isoDay}`;
}

export function buildFallbackProposal(
  signal: DemandSignal,
  suggestedStart: string,
  durationMinutes = 120,
): AiEventProposalCandidate | null {
  const activity = sanitizePromptData(signal.activity, 120);
  const city = sanitizePromptData(signal.city, 160);
  const start = new Date(suggestedStart);
  if (!activity || !city || Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + clamp(durationMinutes, 30, 24 * 60) * 60 * 1000);
  const candidate: AiEventProposalCandidate = {
    hub_id: signal.hubId,
    title: `${activity} közösségi alkalom – ${city}`.slice(0, 120),
    description: `Alacsony nyomású közösségi programjavaslat ${activity} iránt érdeklődőknek. A pontos helyszínt és házigazdát publikálás előtt ember ellenőrzi.`,
    activity,
    suggested_start: start.toISOString(),
    suggested_end: end.toISOString(),
    coarse_city: city,
    area_hint: city,
    venue_category: 'Az aktivitáshoz illeszkedő, ellenőrzendő helyszínkategória',
    target_capacity: clamp(Math.ceil(signal.realMemberCount * 0.7), 4, 50),
    demand_reason: `${Math.max(0, signal.realMemberCount)} aggregált valódi érdeklődő; részvétel nem garantált.`,
    confidence: 0.45,
    language: 'hu-HU',
  };
  return validateAiEventProposalCandidate(candidate) ? candidate : null;
}

const STATUS_TRANSITIONS: Record<AiProposalStatus, readonly AiProposalStatus[]> = {
  draft: ['review', 'rejected', 'cancelled'],
  review: ['draft', 'approved', 'rejected', 'cancelled'],
  approved: ['published', 'cancelled'],
  rejected: ['draft'],
  published: ['cancelled'],
  cancelled: [],
};

export function canTransitionAiProposal(from: AiProposalStatus, to: AiProposalStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function evaluateProposalPublishReadiness(input: ProposalPublishReadiness) {
  const blockers: string[] = [];
  if (input.status !== 'approved') blockers.push('proposal_not_approved');
  if (!input.organizerId) blockers.push('organizer_required');
  if (input.venueValidationStatus !== 'verified') blockers.push('venue_not_verified');
  if (input.moderationStatus !== 'passed') blockers.push('moderation_not_passed');
  if (!input.hostResponsibilityAcceptedAt) blockers.push('host_responsibility_not_accepted');
  if (!boundedInteger(input.targetCapacity, 3, 500)) blockers.push('invalid_capacity');
  if (!Number.isFinite(Date.parse(input.suggestedStart)) || Date.parse(input.suggestedStart) <= Date.parse(input.nowIso)) {
    blockers.push('start_time_not_future');
  }
  return { ready: blockers.length === 0, blockers };
}
