import { describe, expect, it } from 'vitest';
import {
  canModeratorApplyAction,
  canTransitionModerationCase,
  inferSafetySeverity,
  requiresEmergencyGuidance,
  validateSafetyReportDraft,
} from '@/lib/trustSafety';
import { buildTelemetryEvent, createCorrelationId, redactTelemetryValue } from '@/lib/observability';
import {
  buildAnalyticsEnvelope,
  isMeaningfulConnectionProxy,
  PRODUCT_ANALYTICS_EVENTS,
} from '@/lib/productAnalytics';
import { evaluateEntitlement } from '@/lib/entitlements';
import { evaluateFeatureFlag, type FeatureFlagSnapshot } from '@/lib/featureFlags';

describe('trust and safety policy contract', () => {
  it('validates a minimal report and derives severity server-side', () => {
    const report = validateSafetyReportDraft({
      targetType: 'event',
      targetRef: 'event-123',
      reasonCode: 'unsafe_event',
      details: 'A találkozási pont nem egyezik a leírással.',
    });
    expect(report.ok).toBe(true);
    expect(inferSafetySeverity('unsafe_event')).toBe('high');
  });

  it('rejects unknown taxonomy and oversized free text', () => {
    expect(validateSafetyReportDraft({ targetType: 'event', targetRef: 'x', reasonCode: 'made_up' }).ok).toBe(false);
    expect(validateSafetyReportDraft({
      targetType: 'event',
      targetRef: 'x',
      reasonCode: 'other',
      details: 'x'.repeat(1001),
    }).ok).toBe(false);
  });

  it('routes Circle, Hub and generic content reports through the same bounded taxonomy', () => {
    expect(validateSafetyReportDraft({
      targetType: 'circle',
      targetRef: 'd843ab20-5d39-4f29-918d-8ec423f85c29',
      reasonCode: 'harassment',
    }).ok).toBe(true);
    expect(validateSafetyReportDraft({
      targetType: 'hub',
      targetRef: '2bca78e6-6293-4d46-a3a6-239030a92ac2',
      reasonCode: 'spam',
    }).ok).toBe(true);
    expect(validateSafetyReportDraft({
      targetType: 'content',
      targetRef: 'community-post:d843ab20-5d39-4f29-918d-8ec423f85c29',
      reasonCode: 'privacy_exposure',
    }).ok).toBe(true);
  });

  it('keeps permanent bans admin-only and uses explicit lifecycle transitions', () => {
    expect(canModeratorApplyAction('permanent_ban', false)).toBe(false);
    expect(canModeratorApplyAction('temporary_suspension', false)).toBe(true);
    expect(canTransitionModerationCase('received', 'triaged')).toBe(true);
    expect(canTransitionModerationCase('closed', 'investigating')).toBe(false);
  });

  it('shows emergency routing without claiming a platform emergency service', () => {
    expect(requiresEmergencyGuidance('self_harm_emergency_routing')).toBe(true);
    expect(requiresEmergencyGuidance('spam')).toBe(false);
  });
});

describe('observability privacy contract', () => {
  it('accepts safe incoming correlation IDs and replaces invalid ones', () => {
    expect(createCorrelationId('request_123456')).toBe('request_123456');
    expect(createCorrelationId('bad id')).not.toBe('bad id');
  });

  it('redacts nested PII and secret-bearing values', () => {
    expect(redactTelemetryValue({
      userId: 'pseudonymous-id',
      email: 'person@example.invalid',
      nested: { authorization: 'Bearer secret', count: 2 },
    })).toEqual({
      userId: 'pseudonymous-id',
      email: '[REDACTED]',
      nested: { authorization: '[REDACTED]', count: 2 },
    });
  });

  it('produces structured, bounded telemetry', () => {
    const event = buildTelemetryEvent('warn', 'provider timeout!', {
      correlationId: 'request_123456',
      release: 'test',
      featureFlags: ['moderation'],
    }, { status: 504, body: 'must not leak' });
    expect(event.name).toBe('provider_timeout_');
    expect(event.attributes).toEqual({ status: 504, body: '[REDACTED]' });
  });
});

describe('privacy-safe product analytics', () => {
  it('keeps the production taxonomy executable through the shared envelope boundary', () => {
    for (const eventName of PRODUCT_ANALYTICS_EVENTS) {
      expect(buildAnalyticsEnvelope(eventName, {
        surface: 'contract_test',
        status: 'accepted',
      }, {
        idempotencyKey: `taxonomy:${eventName}`,
        occurredAt: '2026-08-22T10:00:00.000Z',
      }).ok).toBe(true);
    }
  });

  it('accepts allowlisted events and properties only', () => {
    const result = buildAnalyticsEnvelope('event_join', {
      event_id: 'event-1',
      source: 'native',
      status: 'going',
    }, { idempotencyKey: 'idem-1', occurredAt: '2026-08-22T10:00:00.000Z' });
    expect(result.ok).toBe(true);
  });

  it('rejects direct and disguised PII fields', () => {
    expect(buildAnalyticsEnvelope('event_join', { email: 'x@example.invalid' }).ok).toBe(false);
    expect(buildAnalyticsEnvelope('event_join', { exact_address: 'Example street' }).ok).toBe(false);
    expect(buildAnalyticsEnvelope('unknown_event', {}).ok).toBe(false);
  });

  it('defines the north-star proxy as mutual plus repeated completed encounters', () => {
    expect(isMeaningfulConnectionProxy({ mutualReconnection: true, completedEncounterCount: 2 })).toBe(true);
    expect(isMeaningfulConnectionProxy({ mutualReconnection: true, completedEncounterCount: 1 })).toBe(false);
  });
});

describe('trust-preserving entitlements and rollout', () => {
  it('never paywalls block, report, export, delete, discovery or join', () => {
    expect(evaluateEntitlement('safety.report', []).allowed).toBe(true);
    expect(evaluateEntitlement('events.join', []).allowed).toBe(true);
  });

  it('enforces active windows and usage limits for premium tools', () => {
    const at = new Date('2026-08-22T10:00:00.000Z');
    expect(evaluateEntitlement('organizer.analytics', [{
      featureKey: 'organizer.analytics',
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-09-01T00:00:00.000Z',
      status: 'active',
      limitValue: 10,
      usedValue: 10,
    }], at)).toEqual({ allowed: false, reason: 'limit_reached', remaining: 0 });
  });

  it('fails feature flags closed and respects cohort/expiry', () => {
    const flag: FeatureFlagSnapshot = {
      key: 'analytics',
      enabled: true,
      rolloutPercentage: 100,
      cohorts: ['internal'],
      expiresAt: '2026-09-01T00:00:00.000Z',
    };
    expect(evaluateFeatureFlag(flag, { subjectId: 'u1', cohort: 'internal', now: new Date('2026-08-22') })).toBe(true);
    expect(evaluateFeatureFlag(flag, { subjectId: 'u1', cohort: 'public', now: new Date('2026-08-22') })).toBe(false);
    expect(evaluateFeatureFlag({ ...flag, eligibilityRule: { unknown_rule: true } }, {
      subjectId: 'u1', cohort: 'internal', now: new Date('2026-08-22'),
    })).toBe(false);
    expect(evaluateFeatureFlag(undefined, { subjectId: 'u1' })).toBe(false);
  });
});
