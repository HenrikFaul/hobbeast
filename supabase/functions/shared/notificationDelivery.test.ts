import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { classifyDeliveryStatus, constantTimeEqual, safeInternalDeepLink } from './notificationDelivery.ts';

Deno.test('notification delivery classifies retryable provider failures', () => {
  assertEquals(classifyDeliveryStatus(429), { retryable: true, errorCode: 'PROVIDER_RATE_LIMIT' });
  assertEquals(classifyDeliveryStatus(503), { retryable: true, errorCode: 'PROVIDER_UNAVAILABLE' });
  assertEquals(classifyDeliveryStatus(400), { retryable: false, errorCode: 'PROVIDER_HTTP_400' });
});

Deno.test('notification delivery accepts only same-origin relative deep links', () => {
  assertEquals(safeInternalDeepLink('/events/123?source=push'), '/events/123?source=push');
  assertEquals(safeInternalDeepLink('//evil.example'), null);
  assertEquals(safeInternalDeepLink('https://evil.example'), null);
});

Deno.test('service token comparison is value and length aware', () => {
  assertEquals(constantTimeEqual('alpha', 'alpha'), true);
  assertEquals(constantTimeEqual('alpha', 'alphb'), false);
  assertEquals(constantTimeEqual('alpha', 'alpha0'), false);
});
