// deno-lint-ignore-file no-explicit-any
// Self-contained edge runtime helpers for the Address Manager pipeline.
// Intentionally has NO module-level side effects (no eager createClient call)
// so that a missing env var only surfaces inside the request handler — never
// at module-load time, which would otherwise turn into a Supabase 503.

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
  return String(value || '').trim().replace(/\/+$/, '');
}

export function resolveInternalSupabaseUrl(req?: Request) {
  // Prefer SUPABASE_URL env (auto-injected). Fall back to request origin if it
  // is *.supabase.co. Never throw at module load.
  const envUrl = normalizeUrl(Deno.env.get('SUPABASE_URL'));
  if (envUrl) return envUrl;
  if (req) {
    try {
      const requestOrigin = normalizeUrl(new URL(req.url).origin);
      if (/\.supabase\.co$/i.test(new URL(requestOrigin).hostname)) {
        return requestOrigin;
      }
    } catch {
      // ignore — fall through
    }
  }
  throw new Error('Missing internal Supabase project URL (SUPABASE_URL env not set).');
}

export function getSupabaseAdmin(req?: Request) {
  const supabaseUrl = resolveInternalSupabaseUrl(req);
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Wrap a Deno serve handler so any unexpected throw turns into a JSON 500
// rather than a runtime 503. Also handles CORS preflight uniformly.
export function safeServe(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error('[edge-handler] uncaught:', message, stack);
      return jsonResponse({ ok: false, error: message, stack: stack?.split('\n').slice(0, 5) }, 500);
    }
  };
}
