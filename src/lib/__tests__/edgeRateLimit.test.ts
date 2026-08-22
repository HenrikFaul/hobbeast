import { describe, expect, it } from 'vitest';
import { rateLimitSubjectHash, sha256Hex } from '../../../supabase/functions/shared/rateLimit';

describe('privacy-safe Edge rate limit identity', () => {
  it('creates a deterministic non-reversible SHA-256 key', async () => {
    const digest = await sha256Hex('fixture');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(await sha256Hex('fixture'));
    expect(digest).not.toContain('fixture');
  });

  it('prefers authenticated user identity and otherwise hashes network hints', async () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'user-agent': 'fixture-agent' },
    });
    const userHash = await rateLimitSubjectHash({ request, userId: 'user-1', pepper: 'test-pepper' });
    const guestHash = await rateLimitSubjectHash({ request, pepper: 'test-pepper' });
    expect(userHash).not.toBe(guestHash);
    expect(guestHash).toBe(await rateLimitSubjectHash({ request, pepper: 'test-pepper' }));
  });

  it('fails closed without a pepper', async () => {
    await expect(rateLimitSubjectHash({ request: new Request('https://example.test'), pepper: '' }))
      .rejects.toThrow('RATE_LIMIT_PEPPER_MISSING');
  });
});
