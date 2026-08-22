import { describe, expect, it } from 'vitest';
import {
  ProjectContractError,
  extractSupabaseProjectRef,
  isTrustedLocalSupabaseUrl,
  resolveVerifiedExternalProjectConfig,
  resolveVerifiedInternalProjectUrl,
} from '../../../supabase/functions/shared/projectContract';

const TARGET_URL = 'https://dsymdijzydaehntlmfzl.supabase.co';

describe('Edge Supabase project contract', () => {
  it('accepts only the target hosted project and extracts its public ref', () => {
    expect(extractSupabaseProjectRef(TARGET_URL)).toBe('dsymdijzydaehntlmfzl');
    expect(resolveVerifiedInternalProjectUrl({ envUrl: TARGET_URL })).toBe(TARGET_URL);
  });

  it('fails closed with a redacted code for a wrong configured role', () => {
    expect(() => resolveVerifiedInternalProjectUrl({
      envUrl: 'https://olzvughcoqnfkdpvbwjy.supabase.co',
    })).toThrowError(new ProjectContractError('SUPABASE_PROJECT_ROLE_MISMATCH'));
  });

  it('does not let request origin override env and rejects a hosted mismatch', () => {
    expect(resolveVerifiedInternalProjectUrl({
      envUrl: TARGET_URL,
      requestUrl: `${TARGET_URL}/functions/v1/test`,
    })).toBe(TARGET_URL);
    expect(() => resolveVerifiedInternalProjectUrl({
      envUrl: TARGET_URL,
      requestUrl: 'https://olzvughcoqnfkdpvbwjy.supabase.co/functions/v1/test',
    })).toThrowError(new ProjectContractError('SUPABASE_PROJECT_ORIGIN_MISMATCH'));
  });

  it('supports known local Supabase endpoints but not arbitrary HTTP hosts', () => {
    expect(isTrustedLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isTrustedLocalSupabaseUrl('http://kong:8000')).toBe(true);
    expect(isTrustedLocalSupabaseUrl('http://example.test:8000')).toBe(false);
    expect(resolveVerifiedInternalProjectUrl({ envUrl: 'http://127.0.0.1:54321' })).toBe('http://127.0.0.1:54321');
  });

  it('requires a complete explicitly classified external project pair', () => {
    expect(resolveVerifiedExternalProjectConfig({})).toBeNull();
    expect(() => resolveVerifiedExternalProjectConfig({ url: TARGET_URL })).toThrowError(
      new ProjectContractError('EXTERNAL_SUPABASE_CONFIG_INCOMPLETE'),
    );
    expect(() => resolveVerifiedExternalProjectConfig({
      url: TARGET_URL,
      serviceRoleKey: 'redacted-test-key',
    })).toThrowError(new ProjectContractError('EXTERNAL_SUPABASE_EXPECTED_REF_MISSING'));
    expect(resolveVerifiedExternalProjectConfig({
      url: TARGET_URL,
      serviceRoleKey: 'redacted-test-key',
      expectedRef: 'dsymdijzydaehntlmfzl',
    })?.url).toBe(TARGET_URL);
  });
});
