// Hobbeast public B2B API.
//
// Built to conform to the APIMaster / SwaggerMaster conventions
// (C:\Work\api-workbench-pro): OpenAPI 3.1 with x-api-key header auth, a stable
// GET /openapi.json spec and a GET /openapi-index.json discovery document for
// bulk Workbench import, and the canonical error envelope
//   { error: { code, httpStatus, category, message, retryable, retryAfterSec?, traceId } }
// with category in (business|technical|validation|auth|rate_limit|dependency).
//
// Every request authenticates with the x-api-key header; the key resolves to an
// organization, and every data call is scoped to that org so a key can only
// touch its own data. verify_jwt is off for this function (config.toml) — the
// x-api-key is the credential, not a Supabase JWT. The OpenAPI document and the
// error envelope are built by the pure ./openapi.ts module, which the test suite
// imports and validates.

import { getSupabaseAdmin } from '../shared/providerFetch.ts';
import { type ErrorCategory, errorBody, openapiDocument } from './openapi.ts';

const BASE = 'https://bqdvqmpwccsxumzijspj.supabase.co/functions/v1/api-b2b';

function errorResponse(code: string, httpStatus: number, category: ErrorCategory, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(errorBody(code, httpStatus, category, message, crypto.randomUUID(), extra)),
    { status: httpStatus, headers: { 'content-type': 'application/json' } });
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // The path after /functions/v1/api-b2b
  const path = url.pathname.replace(/^.*\/api-b2b/, '') || '/';

  // Discovery documents are public — no key needed, so the Workbench can import.
  if (req.method === 'GET' && (path === '/openapi.json' || path === '/')) {
    return ok(openapiDocument(BASE));
  }
  if (req.method === 'GET' && path === '/openapi-index.json') {
    return ok({ hobbeast: `${BASE}/openapi.json` });
  }

  const admin = getSupabaseAdmin(req);

  // Authenticate the x-api-key.
  const apiKey = req.headers.get('x-api-key') ?? '';
  if (!apiKey) return errorResponse('API_KEY_REQUIRED', 401, 'auth', 'Provide your organization API key in the x-api-key header.');
  const { data: resolved, error: resolveErr } = await admin.rpc('resolve_api_key', { p_key: apiKey });
  if (resolveErr || !resolved) return errorResponse('API_KEY_INVALID', 401, 'auth', 'That API key is not recognised or has been revoked.');
  const orgId = (resolved as { organization_id: string }).organization_id;
  const scopes = (resolved as { scopes: string[] }).scopes ?? [];

  try {
    // GET /v1/organization
    if (req.method === 'GET' && path === '/v1/organization') {
      const { data } = await admin.from('organizations')
        .select('id, name, slug, verification_status, follower_count').eq('id', orgId).single();
      return ok(data);
    }

    // GET /v1/events
    if (req.method === 'GET' && path === '/v1/events') {
      const limit = Number(url.searchParams.get('limit')) || 50;
      const from = url.searchParams.get('from');
      const { data } = await admin.rpc('api_list_org_events', { p_org_id: orgId, p_limit: limit, p_from: from });
      return ok({ data });
    }

    // GET /v1/events/{id}
    const eventMatch = path.match(/^\/v1\/events\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && eventMatch) {
      const { data } = await admin.rpc('api_get_org_event', { p_org_id: orgId, p_event_id: eventMatch[1] });
      if (!data) return errorResponse('EVENT_NOT_FOUND', 404, 'business', 'No such event under this organization.');
      return ok(data);
    }

    // POST /v1/events
    if (req.method === 'POST' && path === '/v1/events') {
      if (!scopes.includes('events:write')) {
        return errorResponse('SCOPE_REQUIRED', 403, 'auth', 'This key may not create events. Mint a key with the events:write scope.');
      }
      const body = await req.json().catch(() => ({}));
      const idem = req.headers.get('idempotency-key') ?? null;
      const { data, error } = await admin.rpc('api_create_org_event', { p_org_id: orgId, p_event: body, p_idempotency_key: idem });
      if (error) {
        const code = /INVALID_TITLE/.test(error.message) ? 'INVALID_TITLE'
          : /INVALID_DATE/.test(error.message) ? 'INVALID_DATE' : 'CREATE_FAILED';
        const msg = code === 'INVALID_TITLE' ? 'The title must be at least 3 characters.'
          : code === 'INVALID_DATE' ? 'The event date must be today or later.' : 'The event could not be created.';
        return errorResponse(code, 422, 'validation', msg);
      }
      return ok(data, 201);
    }

    return errorResponse('NOT_FOUND', 404, 'business', 'No such endpoint. See /openapi.json for the available operations.');
  } catch (e) {
    return errorResponse('INTERNAL', 500, 'technical', (e as Error).message.slice(0, 200));
  }
});
