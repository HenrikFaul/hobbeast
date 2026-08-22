export type VirtualHubUserOrigin = 'real' | 'generated' | null | undefined;

export interface VirtualHubRow {
  id: string;
  hobby_category: string;
  hobby_subcategory?: string | null;
  hobby_activity?: string | null;
  city: string | null;
  member_count?: number | null;
}

export interface VirtualHubMembershipRow {
  hub_id: string;
  user_id: string;
}

export interface VirtualHubProfileRow {
  user_id: string | null;
  hobbies?: string[] | null;
  city?: string | null;
  user_origin?: VirtualHubUserOrigin;
}

export interface VirtualHubDemandCounts {
  real_member_count: number;
  simulated_member_count: number;
  unknown_origin_member_count: number;
  total_member_count: number;
}

export interface QualifiedVirtualHub extends VirtualHubRow, VirtualHubDemandCounts {
  identity_key: string;
  demand_member_count: number;
  qualification_status: 'qualified' | 'below_threshold';
  qualification_reasons: string[];
}

export interface HubMembershipReconciliationPlan extends VirtualHubDemandCounts {
  add_user_ids: string[];
  keep_user_ids: string[];
  remove_user_ids: string[];
}

const EMPTY_COUNTS: VirtualHubDemandCounts = {
  real_member_count: 0,
  simulated_member_count: 0,
  unknown_origin_member_count: 0,
  total_member_count: 0,
};

export function normalizeVirtualHubSegment(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU');
}

export function buildVirtualHubIdentityKey(input: {
  canonical_activity_id?: string | null;
  hobby_category: string;
  hobby_subcategory?: string | null;
  hobby_activity?: string | null;
  city?: string | null;
}): string {
  const category = normalizeVirtualHubSegment(input.hobby_category) || '__missing_category__';
  const subcategory = normalizeVirtualHubSegment(input.hobby_subcategory) || '__no_subcategory__';
  const activity = normalizeVirtualHubSegment(input.canonical_activity_id)
    || normalizeVirtualHubSegment(input.hobby_activity)
    || '__no_activity__';
  const city = normalizeVirtualHubSegment(input.city) || '__no_city__';
  return [category, subcategory, activity, city].map(encodeURIComponent).join('::');
}

function classifyOrigin(origin: VirtualHubUserOrigin): keyof Omit<VirtualHubDemandCounts, 'total_member_count'> {
  if (origin === 'real') return 'real_member_count';
  if (origin === 'generated') return 'simulated_member_count';
  return 'unknown_origin_member_count';
}

function withTotal(counts: Omit<VirtualHubDemandCounts, 'total_member_count'>): VirtualHubDemandCounts {
  return {
    ...counts,
    total_member_count:
      counts.real_member_count
      + counts.simulated_member_count
      + counts.unknown_origin_member_count,
  };
}

export function calculateVirtualHubDemandCounts(
  memberships: VirtualHubMembershipRow[],
  profiles: VirtualHubProfileRow[],
): Map<string, VirtualHubDemandCounts> {
  const profileByUserId = new Map(
    profiles
      .filter((profile): profile is VirtualHubProfileRow & { user_id: string } => Boolean(profile.user_id))
      .map((profile) => [profile.user_id, profile]),
  );
  const seenMemberships = new Set<string>();
  const mutableCounts = new Map<string, Omit<VirtualHubDemandCounts, 'total_member_count'>>();

  for (const membership of memberships) {
    if (!membership.hub_id || !membership.user_id) continue;
    const membershipKey = `${membership.hub_id}:${membership.user_id}`;
    if (seenMemberships.has(membershipKey)) continue;
    seenMemberships.add(membershipKey);

    const counts = mutableCounts.get(membership.hub_id) || {
      real_member_count: 0,
      simulated_member_count: 0,
      unknown_origin_member_count: 0,
    };
    const bucket = classifyOrigin(profileByUserId.get(membership.user_id)?.user_origin);
    counts[bucket] += 1;
    mutableCounts.set(membership.hub_id, counts);
  }

  return new Map(
    [...mutableCounts.entries()].map(([hubId, counts]) => [hubId, withTotal(counts)]),
  );
}

export function decorateVirtualHubsWithDemand(
  hubs: VirtualHubRow[],
  memberships: VirtualHubMembershipRow[],
  profiles: VirtualHubProfileRow[],
  minimumRealMembers: number,
): QualifiedVirtualHub[] {
  const threshold = Math.max(1, Math.trunc(Number(minimumRealMembers) || 1));
  const countsByHub = calculateVirtualHubDemandCounts(memberships, profiles);

  return hubs.map((hub) => {
    const counts = countsByHub.get(hub.id) || EMPTY_COUNTS;
    const hasNamedCity = Boolean(normalizeVirtualHubSegment(hub.city));
    const qualified = counts.real_member_count >= threshold && hasNamedCity;
    const qualificationReasons = [
      counts.real_member_count >= threshold
        ? `${counts.real_member_count} real members meet the ${threshold}-member threshold.`
        : `${counts.real_member_count} real members are below the ${threshold}-member threshold.`,
    ];

    if (!hasNamedCity) {
      qualificationReasons.push('A named city is required before production event demand can qualify.');
    }

    if (counts.simulated_member_count > 0) {
      qualificationReasons.push(
        `${counts.simulated_member_count} simulated members are excluded from production demand.`,
      );
    }
    if (counts.unknown_origin_member_count > 0) {
      qualificationReasons.push(
        `${counts.unknown_origin_member_count} members with unknown origin are excluded from production demand.`,
      );
    }

    return {
      ...hub,
      ...counts,
      identity_key: buildVirtualHubIdentityKey(hub),
      demand_member_count: counts.real_member_count,
      qualification_status: qualified ? 'qualified' : 'below_threshold',
      qualification_reasons: qualificationReasons,
    };
  });
}

export function profileMatchesVirtualHub(profile: VirtualHubProfileRow, hub: VirtualHubRow): boolean {
  if (!profile.user_id) return false;
  const hubHobby = normalizeVirtualHubSegment(hub.hobby_activity)
    || normalizeVirtualHubSegment(hub.hobby_subcategory)
    || normalizeVirtualHubSegment(hub.hobby_category);
  if (!hubHobby) return false;

  const sameCity = normalizeVirtualHubSegment(profile.city) === normalizeVirtualHubSegment(hub.city);
  const hasHobby = (profile.hobbies || []).some(
    (hobby) => normalizeVirtualHubSegment(hobby) === hubHobby,
  );
  return sameCity && hasHobby;
}

export function planVirtualHubMembershipReconciliation(
  hub: VirtualHubRow,
  profiles: VirtualHubProfileRow[],
  currentUserIds: string[],
): HubMembershipReconciliationPlan {
  const eligibleProfiles = profiles.filter((profile) => profileMatchesVirtualHub(profile, hub));
  const desiredUserIds = new Set(
    eligibleProfiles
      .map((profile) => profile.user_id)
      .filter((userId): userId is string => Boolean(userId)),
  );
  const current = new Set(currentUserIds.filter(Boolean));

  const addUserIds = [...desiredUserIds].filter((userId) => !current.has(userId)).sort();
  const keepUserIds = [...desiredUserIds].filter((userId) => current.has(userId)).sort();
  const removeUserIds = [...current].filter((userId) => !desiredUserIds.has(userId)).sort();

  const counts = eligibleProfiles.reduce<Omit<VirtualHubDemandCounts, 'total_member_count'>>(
    (accumulator, profile) => {
      accumulator[classifyOrigin(profile.user_origin)] += 1;
      return accumulator;
    },
    {
      real_member_count: 0,
      simulated_member_count: 0,
      unknown_origin_member_count: 0,
    },
  );

  return {
    add_user_ids: addUserIds,
    keep_user_ids: keepUserIds,
    remove_user_ids: removeUserIds,
    ...withTotal(counts),
  };
}
