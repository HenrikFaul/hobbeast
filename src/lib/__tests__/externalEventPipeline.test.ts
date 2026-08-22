import { describe, expect, it } from 'vitest';
import {
  buildExternalProvenance,
  classifyProviderFailure,
  externalEventFingerprint,
  geoPrecisionForPurpose,
  nextProviderCircuitState,
  providerRetryDelayMs,
  resolveFreshness,
  shouldAutoLinkDuplicate,
} from '@/lib/externalEventPipeline';

describe('external event supply contracts', () => {
  it('normalizes diacritics into a deterministic reversible-link fingerprint', () => {
    expect(externalEventFingerprint({ title: 'Árvíztűrő koncert', eventDate: '2026-08-25', city: 'Győr' })).toBe('arvizturo koncert|2026-08-25|gyor');
  });

  it('classifies freshness without claiming unknown data is current', () => {
    const now = new Date('2026-08-22T12:00:00Z');
    expect(resolveFreshness(null, now)).toBe('unknown');
    expect(resolveFreshness('2026-08-22T00:00:00Z', now)).toBe('fresh');
    expect(resolveFreshness('2026-08-20T12:00:00Z', now)).toBe('aging');
    expect(resolveFreshness('2026-08-18T12:00:00Z', now)).toBe('stale');
  });

  it('moves active stale records to a visible stale import state', () => {
    const result = buildExternalProvenance({
      provider: 'Ticketmaster', externalId: '1', title: 'Event', lastVerifiedAt: '2026-08-18T12:00:00Z', importState: 'active',
    }, new Date('2026-08-22T12:00:00Z'));
    expect(result.provider).toBe('ticketmaster');
    expect(result.importState).toBe('stale');
  });

  it('never auto-links uncertain dedupe candidates', () => {
    expect(shouldAutoLinkDuplicate(0.97)).toBe(false);
    expect(shouldAutoLinkDuplicate(0.99)).toBe(true);
  });

  it('separates quota, outage, timeout, schema and geocode failures', () => {
    expect(classifyProviderFailure({ status: 429 })).toBe('quota');
    expect(classifyProviderFailure({ status: 503 })).toBe('outage');
    expect(classifyProviderFailure({ timedOut: true })).toBe('timeout');
    expect(classifyProviderFailure({ malformedPayload: true })).toBe('malformed_payload');
    expect(classifyProviderFailure({ geocodeFailed: true })).toBe('geocode_failure');
  });

  it('opens and resets a deterministic circuit breaker', () => {
    let state = { consecutiveFailures: 0, openUntil: null as number | null };
    state = nextProviderCircuitState(state, 'failure', 1000, { threshold: 2, cooldownMs: 5000 });
    expect(state.openUntil).toBeNull();
    state = nextProviderCircuitState(state, 'failure', 2000, { threshold: 2, cooldownMs: 5000 });
    expect(state.openUntil).toBe(7000);
    expect(nextProviderCircuitState(state, 'success', 3000)).toEqual({ consecutiveFailures: 0, openUntil: null });
  });

  it('caps exponential and Retry-After backoff', () => {
    expect(providerRetryDelayMs(0)).toBe(500);
    expect(providerRetryDelayMs(10)).toBe(8000);
    expect(providerRetryDelayMs(0, 90)).toBe(30000);
  });

  it('enforces privacy-specific geo precision', () => {
    expect(geoPrecisionForPurpose('discovery')).toBe('approximate_radius');
    expect(geoPrecisionForPurpose('private_event')).toBe('restricted_exact');
    expect(geoPrecisionForPurpose('analytics')).toBe('aggregate_grid');
    expect(geoPrecisionForPurpose('export')).toBe('explicit_permission_required');
  });
});
