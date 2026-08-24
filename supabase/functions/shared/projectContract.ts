export const TARGET_SUPABASE_PROJECT_REF = 'bqdvqmpwccsxumzijspj' as const;

export type ProjectContractErrorCode =
  | 'SUPABASE_PROJECT_URL_MISSING'
  | 'SUPABASE_PROJECT_URL_INVALID'
  | 'SUPABASE_PROJECT_ROLE_MISMATCH'
  | 'SUPABASE_PROJECT_ORIGIN_MISMATCH'
  | 'EXTERNAL_SUPABASE_CONFIG_INCOMPLETE'
  | 'EXTERNAL_SUPABASE_EXPECTED_REF_MISSING';

export class ProjectContractError extends Error {
  constructor(readonly code: ProjectContractErrorCode) {
    super(code);
    this.name = 'ProjectContractError';
  }
}

export function normalizeProjectUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function extractSupabaseProjectRef(value?: string | null): string | null {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) return null;
  try {
    const hostname = new URL(normalized).hostname;
    return hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function isLoopbackAddress(hostname: string) {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname === 'kong' || hostname === 'host.docker.internal' || /^supabase[-_]kong(?:[-_].+)?$/i.test(hostname);
}

export function isTrustedLocalSupabaseUrl(value?: string | null) {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' && isLoopbackAddress(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function assertProjectRole(
  value: string | null | undefined,
  expectedRef: string = TARGET_SUPABASE_PROJECT_REF,
  options: { allowLocal?: boolean } = {},
) {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) throw new ProjectContractError('SUPABASE_PROJECT_URL_MISSING');
  if (options.allowLocal && isTrustedLocalSupabaseUrl(normalized)) return normalized;
  const ref = extractSupabaseProjectRef(normalized);
  if (!ref) throw new ProjectContractError('SUPABASE_PROJECT_URL_INVALID');
  if (ref !== expectedRef.toLowerCase()) throw new ProjectContractError('SUPABASE_PROJECT_ROLE_MISMATCH');
  return normalized;
}

/**
 * Resolve the app database without allowing an incoming request origin to
 * override a configured project. Hosted origins are only a cross-check/fallback.
 * Errors contain codes only: no URL, ref, token or secret is echoed.
 */
export function resolveVerifiedInternalProjectUrl(input: {
  envUrl?: string | null;
  requestUrl?: string | null;
  expectedRef?: string;
}) {
  const expectedRef = (input.expectedRef || TARGET_SUPABASE_PROJECT_REF).toLowerCase();
  const envUrl = normalizeProjectUrl(input.envUrl);
  const requestOrigin = (() => {
    if (!input.requestUrl) return '';
    try { return new URL(input.requestUrl).origin; } catch { return ''; }
  })();

  if (envUrl) {
    const verifiedEnv = assertProjectRole(envUrl, expectedRef, { allowLocal: true });
    const requestRef = extractSupabaseProjectRef(requestOrigin);
    if (requestRef && requestRef !== expectedRef) {
      throw new ProjectContractError('SUPABASE_PROJECT_ORIGIN_MISMATCH');
    }
    if (isTrustedLocalSupabaseUrl(verifiedEnv) && requestOrigin && !isTrustedLocalSupabaseUrl(requestOrigin)) {
      throw new ProjectContractError('SUPABASE_PROJECT_ORIGIN_MISMATCH');
    }
    return verifiedEnv;
  }

  return assertProjectRole(requestOrigin, expectedRef, { allowLocal: true });
}

export function resolveVerifiedExternalProjectConfig(input: {
  url?: string | null;
  serviceRoleKey?: string | null;
  expectedRef?: string | null;
}) {
  const url = normalizeProjectUrl(input.url);
  const serviceRoleKey = String(input.serviceRoleKey || '').trim();
  if (!url && !serviceRoleKey) return null;
  if (!url || !serviceRoleKey) throw new ProjectContractError('EXTERNAL_SUPABASE_CONFIG_INCOMPLETE');
  const expectedRef = String(input.expectedRef || '').trim().toLowerCase();
  if (!expectedRef) throw new ProjectContractError('EXTERNAL_SUPABASE_EXPECTED_REF_MISSING');
  return {
    url: assertProjectRole(url, expectedRef, { allowLocal: true }),
    serviceRoleKey,
  };
}
