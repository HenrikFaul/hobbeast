import { describe, expect, it } from 'vitest';
import {
  canAccessAdminControlPlane,
  canTransitionOperation,
  highRiskConfirmationMatches,
  maskAdminSearchText,
  operationSlaState,
  redactAdminAuditValue,
  roleHasCapability,
  sanitizeAdminDeepLink,
} from '../adminControlPlane';

describe('admin capability matrix', () => {
  it('keeps support least-privileged and super admin explicit', () => {
    expect(roleHasCapability('support', 'users.search_masked')).toBe(true);
    expect(roleHasCapability('support', 'users.suspend')).toBe(false);
    expect(roleHasCapability('super_admin', 'bulk.destructive')).toBe(true);
  });

  it('derives admin entry from a capability instead of a legacy role boolean', () => {
    expect(canAccessAdminControlPlane(['health.view'])).toBe(true);
    expect(canAccessAdminControlPlane(['users.search_masked'])).toBe(false);
    expect(canAccessAdminControlPlane([])).toBe(false);
  });
});

describe('admin safety helpers', () => {
  it('allows only known internal admin destinations', () => {
    expect(sanitizeAdminDeepLink('/admin?tab=operations')).toBe('/admin?tab=operations');
    expect(sanitizeAdminDeepLink('/events')).toBeNull();
    expect(sanitizeAdminDeepLink('//evil.example/admin')).toBeNull();
    expect(sanitizeAdminDeepLink('/admin?tab=secrets')).toBeNull();
  });

  it('recursively redacts sensitive audit fields', () => {
    expect(redactAdminAuditValue({ display_name: 'Kata', profile: { email: 'kata@example.com', token: 'secret' } }))
      .toEqual({ display_name: 'Kata', profile: { email: '[REDACTED]', token: '[REDACTED]' } });
  });

  it('requires an exact high-risk confirmation phrase', () => {
    expect(highRiskConfirmationMatches('suspend', 'user-1', 'CONFIRM SUSPEND user-1')).toBe(true);
    expect(highRiskConfirmationMatches('suspend', 'user-1', 'suspend user-1')).toBe(false);
  });

  it('masks searchable PII rather than returning it verbatim', () => {
    expect(maskAdminSearchText('kata@example.com')).toBe('ka***@***.com');
    expect(maskAdminSearchText('Budapest')).toBe('Bu***t');
  });
});

describe('operations inbox state and SLA', () => {
  it('rejects skipped terminal transitions', () => {
    expect(canTransitionOperation('open', 'in_progress')).toBe(true);
    expect(canTransitionOperation('open', 'resolved')).toBe(false);
    expect(canTransitionOperation('resolved', 'open')).toBe(true);
  });

  it('distinguishes healthy, at-risk and breached SLAs', () => {
    const now = '2026-08-22T12:00:00.000Z';
    expect(operationSlaState('2026-08-22T11:00:00.000Z', now)).toBe('breached');
    expect(operationSlaState('2026-08-22T12:30:00.000Z', now)).toBe('at_risk');
    expect(operationSlaState('2026-08-23T12:00:00.000Z', now)).toBe('healthy');
  });
});
