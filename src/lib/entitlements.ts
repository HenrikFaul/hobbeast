export const CORE_COMMUNITY_FEATURES = [
  'safety.report',
  'safety.block',
  'privacy.export',
  'privacy.delete',
  'events.discover',
  'events.join',
] as const;

export type CoreCommunityFeature = (typeof CORE_COMMUNITY_FEATURES)[number];

export interface EntitlementGrant {
  featureKey: string;
  startsAt: string;
  endsAt: string | null;
  status: 'trial' | 'active' | 'grace' | 'cancelled' | 'refunded' | 'expired';
  limitValue: number | null;
  usedValue?: number;
}

export interface EntitlementDecision {
  allowed: boolean;
  reason: 'core_access' | 'active_grant' | 'limit_reached' | 'inactive_grant' | 'missing_grant';
  remaining: number | null;
}

export function evaluateEntitlement(
  featureKey: string,
  grants: readonly EntitlementGrant[],
  at = new Date(),
): EntitlementDecision {
  if (CORE_COMMUNITY_FEATURES.includes(featureKey as CoreCommunityFeature)) {
    return { allowed: true, reason: 'core_access', remaining: null };
  }

  const now = at.getTime();
  const grant = grants.find((candidate) => candidate.featureKey === featureKey);
  if (!grant) return { allowed: false, reason: 'missing_grant', remaining: null };

  const activeStatus = grant.status === 'trial' || grant.status === 'active' || grant.status === 'grace';
  const withinWindow = Date.parse(grant.startsAt) <= now && (!grant.endsAt || Date.parse(grant.endsAt) > now);
  if (!activeStatus || !withinWindow) {
    return { allowed: false, reason: 'inactive_grant', remaining: null };
  }

  if (grant.limitValue !== null) {
    const remaining = Math.max(0, grant.limitValue - (grant.usedValue || 0));
    if (remaining === 0) return { allowed: false, reason: 'limit_reached', remaining: 0 };
    return { allowed: true, reason: 'active_grant', remaining };
  }

  return { allowed: true, reason: 'active_grant', remaining: null };
}
