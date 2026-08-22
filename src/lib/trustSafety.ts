export const SAFETY_TARGET_TYPES = [
  'user',
  'event',
  'organizer',
  'circle',
  'hub',
  'message',
  'content',
] as const;

export type SafetyTargetType = (typeof SAFETY_TARGET_TYPES)[number];

export const SAFETY_REASON_CODES = [
  'harassment',
  'hate',
  'sexual_misconduct',
  'fraud_scam',
  'unsafe_event',
  'impersonation',
  'underage_concern',
  'privacy_exposure',
  'spam',
  'prohibited_commercial_behavior',
  'self_harm_emergency_routing',
  'other',
] as const;

export type SafetyReasonCode = (typeof SAFETY_REASON_CODES)[number];
export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';
export type ModerationCaseStatus =
  | 'received'
  | 'triaged'
  | 'investigating'
  | 'actioned'
  | 'appealed'
  | 'closed';

export type EnforcementAction =
  | 'warning'
  | 'education'
  | 'feature_restriction'
  | 'temporary_suspension'
  | 'permanent_ban'
  | 'organizer_restriction'
  | 'content_takedown'
  | 'event_takedown';

export const SAFETY_REASON_LABELS: Record<SafetyReasonCode, string> = {
  harassment: 'Zaklatás vagy megfélemlítés',
  hate: 'Gyűlöletkeltő viselkedés',
  sexual_misconduct: 'Szexuális visszaélés vagy nem kívánt viselkedés',
  fraud_scam: 'Csalás vagy megtévesztés',
  unsafe_event: 'Nem biztonságos esemény vagy helyszín',
  impersonation: 'Megszemélyesítés',
  underage_concern: 'Kiskorú biztonságával kapcsolatos aggály',
  privacy_exposure: 'Személyes adat vagy privát helyzet felfedése',
  spam: 'Spam vagy kéretlen tartalom',
  prohibited_commercial_behavior: 'Tiltott kereskedelmi viselkedés',
  self_harm_emergency_routing: 'Azonnali veszélyre utaló jelzés',
  other: 'Egyéb szabálysértés',
};

const SEVERITY_BY_REASON: Record<SafetyReasonCode, SafetySeverity> = {
  harassment: 'medium',
  hate: 'high',
  sexual_misconduct: 'critical',
  fraud_scam: 'high',
  unsafe_event: 'high',
  impersonation: 'medium',
  underage_concern: 'critical',
  privacy_exposure: 'high',
  spam: 'low',
  prohibited_commercial_behavior: 'medium',
  self_harm_emergency_routing: 'critical',
  other: 'medium',
};

const CASE_TRANSITIONS: Record<ModerationCaseStatus, readonly ModerationCaseStatus[]> = {
  received: ['triaged', 'closed'],
  triaged: ['investigating', 'actioned', 'closed'],
  investigating: ['actioned', 'closed'],
  actioned: ['appealed', 'closed'],
  appealed: ['investigating', 'actioned', 'closed'],
  closed: [],
};

export interface SafetyReportDraft {
  targetType: SafetyTargetType;
  targetRef: string;
  reasonCode: SafetyReasonCode;
  details?: string;
}

export type SafetyReportValidation =
  | { ok: true; value: SafetyReportDraft & { details: string } }
  | { ok: false; error: string };

export function inferSafetySeverity(reasonCode: SafetyReasonCode): SafetySeverity {
  return SEVERITY_BY_REASON[reasonCode];
}

export function canTransitionModerationCase(
  current: ModerationCaseStatus,
  next: ModerationCaseStatus,
): boolean {
  return CASE_TRANSITIONS[current].includes(next);
}

export function validateSafetyReportDraft(input: unknown): SafetyReportValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'A bejelentés adatai hiányoznak.' };
  }

  const record = input as Record<string, unknown>;
  const targetType = String(record.targetType || '') as SafetyTargetType;
  const targetRef = String(record.targetRef || '').trim();
  const reasonCode = String(record.reasonCode || '') as SafetyReasonCode;
  const details = String(record.details || '').trim();

  if (!SAFETY_TARGET_TYPES.includes(targetType)) {
    return { ok: false, error: 'Nem támogatott bejelentési cél.' };
  }
  if (!targetRef || targetRef.length > 200) {
    return { ok: false, error: 'A bejelentett elem azonosítója érvénytelen.' };
  }
  if (!SAFETY_REASON_CODES.includes(reasonCode)) {
    return { ok: false, error: 'Válassz bejelentési okot.' };
  }
  if (details.length > 1000) {
    return { ok: false, error: 'A leírás legfeljebb 1000 karakter lehet.' };
  }

  return { ok: true, value: { targetType, targetRef, reasonCode, details } };
}

export function requiresEmergencyGuidance(reasonCode: SafetyReasonCode): boolean {
  return reasonCode === 'self_harm_emergency_routing' || reasonCode === 'underage_concern';
}

export function canModeratorApplyAction(action: EnforcementAction, isAdmin: boolean): boolean {
  return action !== 'permanent_ban' || isAdmin;
}
