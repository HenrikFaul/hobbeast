import { describe, expect, it } from 'vitest';
import { mapAuthError } from '../authErrors';

describe('auth error mapping', () => {
  it('maps known failures to safe Hungarian messages', () => {
    expect(mapAuthError(new Error('Invalid login credentials')).code).toBe('invalid_credentials');
    expect(mapAuthError(new Error('Email not confirmed')).code).toBe('email_unconfirmed');
    expect(mapAuthError(new Error('rate limit exceeded')).code).toBe('rate_limited');
  });

  it('does not expose unknown provider internals', () => {
    const result = mapAuthError(new Error('postgres internal relation auth.users failed'));
    expect(result.code).toBe('unknown');
    expect(result.message).not.toContain('postgres');
  });
});
