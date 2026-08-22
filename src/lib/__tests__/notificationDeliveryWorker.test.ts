import { describe, expect, it } from 'vitest';
import {
  classifyDeliveryStatus,
  constantTimeEqual,
  safeInternalDeepLink,
} from '../../../supabase/functions/shared/notificationDelivery';

describe('notification delivery worker contract', () => {
  it('retries only timeout, rate-limit and provider outages', () => {
    expect(classifyDeliveryStatus(429)).toEqual({ retryable: true, errorCode: 'PROVIDER_RATE_LIMIT' });
    expect(classifyDeliveryStatus(503)).toEqual({ retryable: true, errorCode: 'PROVIDER_UNAVAILABLE' });
    expect(classifyDeliveryStatus(400)).toEqual({ retryable: false, errorCode: 'PROVIDER_HTTP_400' });
  });

  it('accepts only same-origin relative notification paths', () => {
    expect(safeInternalDeepLink('/events/fixture?source=push')).toBe('/events/fixture?source=push');
    expect(safeInternalDeepLink('//evil.example')).toBeNull();
    expect(safeInternalDeepLink('https://evil.example')).toBeNull();
  });

  it('compares service credentials without early value mismatch', () => {
    expect(constantTimeEqual('fixture-secret', 'fixture-secret')).toBe(true);
    expect(constantTimeEqual('fixture-secret', 'fixture-secrex')).toBe(false);
    expect(constantTimeEqual('fixture-secret', 'fixture-secret-longer')).toBe(false);
  });
});
