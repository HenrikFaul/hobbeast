export type TripPlanningCallerType = 'ui' | 'automation' | 'ai_agent' | 'admin_tool';
export type TripPlanningAuditStatus =
  | 'success'
  | 'needs_clarification'
  | 'partial_success'
  | 'failure'
  | 'rate_limited';

export interface TripPlanningAuditRecord {
  id: string;
  requestId: string;
  callerType: TripPlanningCallerType;
  callerId?: string;
  eventId?: string;
  startedAt: string;
  finishedAt?: string;
  status: TripPlanningAuditStatus;
  routeType?: string;
  provider: 'mapy';
  requestSummary: {
    hasWaypoints: boolean;
    waypointCount: number;
    hasConstraints: boolean;
  };
  chosenAlternativeId?: string;
  warnings?: string[];
  errorCode?: string;
  correlationId?: string;
}

export interface TripPlanningQuotaPolicy {
  callerType: Exclude<TripPlanningCallerType, 'ui'>;
  maxCallsPerMinute?: number;
  maxCallsPerDay?: number;
  maxElevationCallsPerDay?: number;
  maxRetriesPerRequest?: number;
}

export interface TripPlanningQuotaSnapshot {
  minuteCount: number;
  dayCount: number;
  elevationCount?: number;
}

export interface QuotaDecision {
  allowed: boolean;
  reason?: 'MINUTE_LIMIT' | 'DAY_LIMIT' | 'ELEVATION_LIMIT';
}

export function createTripPlanningAuditRecord(input: Omit<TripPlanningAuditRecord, 'id'>): TripPlanningAuditRecord {
  return { id: crypto.randomUUID(), ...input };
}

export function evaluateQuotaPolicy(policy: TripPlanningQuotaPolicy, snapshot: TripPlanningQuotaSnapshot): QuotaDecision {
  if (typeof policy.maxCallsPerMinute === 'number' && snapshot.minuteCount >= policy.maxCallsPerMinute) {
    return { allowed: false, reason: 'MINUTE_LIMIT' };
  }
  if (typeof policy.maxCallsPerDay === 'number' && snapshot.dayCount >= policy.maxCallsPerDay) {
    return { allowed: false, reason: 'DAY_LIMIT' };
  }
  if (typeof policy.maxElevationCallsPerDay === 'number' && (snapshot.elevationCount ?? 0) >= policy.maxElevationCallsPerDay) {
    return { allowed: false, reason: 'ELEVATION_LIMIT' };
  }
  return { allowed: true };
}
