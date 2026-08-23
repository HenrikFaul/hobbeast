import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { requireEnv } from './env.ts';
import { resolveVerifiedInternalProjectUrl } from './projectContract.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function resolveInternalSupabaseUrl(req?: Request) {
  return resolveVerifiedInternalProjectUrl({
    envUrl: Deno.env.get('SUPABASE_URL'),
    requestUrl: req?.url,
  });
}

function resolveServiceRoleKey() {
  // Uses the shared env helper so misconfigured deploys surface as a
  // MissingEnvError with a redacted name-only log line (see shared/env.ts).
  const { SUPABASE_SERVICE_ROLE_KEY } = requireEnv(['SUPABASE_SERVICE_ROLE_KEY'] as const);
  return SUPABASE_SERVICE_ROLE_KEY;
}

export function getSupabaseAdmin(req?: Request) {
  const supabaseUrl = resolveInternalSupabaseUrl(req);
  const serviceRoleKey = resolveServiceRoleKey();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ProviderFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export class ProviderFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: 'timeout' | 'quota' | 'outage' | 'malformed_payload' | 'unknown',
  ) {
    super(message);
    this.name = 'ProviderFetchError';
  }
}

function retryDelay(attempt: number, retryAfter: string | null, baseMs: number) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  return Math.min(baseMs * (2 ** attempt), 8_000);
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  errorLabel: string,
  options: ProviderFetchOptions = {},
): Promise<T> {
  const retries = Math.max(0, Math.min(options.retries ?? 2, 3));
  const timeoutMs = Math.max(50, Math.min(options.timeoutMs ?? 12_000, 30_000));
  const retryBaseMs = Math.max(100, options.retryBaseMs ?? 500);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries) {
          await res.body?.cancel().catch(() => undefined);
          await sleep(retryDelay(attempt, res.headers.get('retry-after'), retryBaseMs));
          continue;
        }
        const kind = res.status === 429 ? 'quota' : res.status >= 500 ? 'outage' : 'unknown';
        throw new ProviderFetchError(`${errorLabel}: provider returned ${res.status}`, res.status, kind);
      }
      try {
        return await res.json() as T;
      } catch {
        throw new ProviderFetchError(`${errorLabel}: malformed JSON payload`, res.status, 'malformed_payload');
      }
    } catch (error) {
      if (error instanceof ProviderFetchError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (attempt < retries) continue;
        throw new ProviderFetchError(`${errorLabel}: timed out`, null, 'timeout');
      }
      if (attempt >= retries) throw new ProviderFetchError(`${errorLabel}: network failure`, null, 'unknown');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ProviderFetchError(`${errorLabel}: retry budget exhausted`, null, 'unknown');
}

export function isoNow() {
  return new Date().toISOString();
}
