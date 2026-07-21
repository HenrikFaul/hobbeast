import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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

function normalizeUrl(value?: string | null) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/\/+$/, '');
}

export function resolveInternalSupabaseUrl(req?: Request) {
  const envUrl = normalizeUrl(Deno.env.get('SUPABASE_URL'));

  if (req) {
    const requestOrigin = normalizeUrl(new URL(req.url).origin);
    if (/\.supabase\.co$/i.test(new URL(requestOrigin).hostname)) {
      return requestOrigin;
    }
  }

  if (envUrl) {
    return envUrl;
  }

  throw new Error('Missing internal Supabase project URL.');
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

export const supabaseAdmin = getSupabaseAdmin();

export async function fetchJson<T>(url: string, init: RequestInit, errorLabel: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${errorLabel}: ${res.status}${body ? ` - ${body}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export function isoNow() {
  return new Date().toISOString();
}
