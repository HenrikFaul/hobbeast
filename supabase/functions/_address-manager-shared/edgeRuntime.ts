// deno-lint-ignore-file no-explicit-any
// Self-contained edge runtime helpers for the Address Manager pipeline.
// Intentionally has NO module-level side effects (no eager createClient call)
// so that a missing env var only surfaces inside the request handler — never
// at module-load time, which would otherwise turn into a Supabase 503.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { resolveVerifiedInternalProjectUrl } from '../shared/projectContract.ts';
import { logEdgeEvent } from '../shared/edgeObservability.ts';
import {
  AddressManagerError,
  correlationIdFromRequest,
} from './requestContract.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'x-correlation-id',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(body: unknown, status = 200, correlationId?: string) {
  const payload = correlationId && body && typeof body === 'object' && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>), correlation_id: correlationId }
    : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    },
  });
}

export function resolveInternalSupabaseUrl(req?: Request) {
  return resolveVerifiedInternalProjectUrl({
    envUrl: Deno.env.get('SUPABASE_URL'),
    requestUrl: req?.url,
  });
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

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type AddressManagerRequestContext = {
  correlationId: string;
};

// Wrap a Deno serve handler so any unexpected throw turns into a JSON 500
// rather than a runtime 503. Also handles CORS preflight uniformly.
export function safeServe(
  handler: (req: Request, context: AddressManagerRequestContext) => Promise<Response>,
  functionName = 'address-manager',
) {
  return async (req: Request): Promise<Response> => {
    const correlationId = correlationIdFromRequest(req);
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...corsHeaders, 'x-correlation-id': correlationId } });
    }
    try {
      const response = await handler(req, { correlationId });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    } catch (error) {
      const safeError = error instanceof AddressManagerError
        ? error
        : new AddressManagerError('INTERNAL_ERROR', 500);
      logEdgeEvent('error', 'address_manager_request_failed', correlationId, {
        function_name: functionName,
        error_code: safeError.code,
        error_type: error instanceof Error ? error.name : 'unknown',
      });
      return jsonResponse({ ok: false, code: safeError.code }, safeError.status, correlationId);
    }
  };
}
