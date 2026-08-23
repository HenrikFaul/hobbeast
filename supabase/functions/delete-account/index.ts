import { corsHeaders } from '../shared/providerFetch.ts';
import { correlationIdFromRequest, logEdgeEvent, observeEdgeOperation } from '../shared/edgeObservability.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';

const MAX_BODY_BYTES = 4_096;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{8,200}$/;
const SAFE_ERROR_CODES = new Set([
  'REQUEST_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_BODY',
  'INVALID_IDEMPOTENCY_KEY',
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'EDGE_AUTH_CONFIGURATION_MISSING',
  'DELETION_REQUEST_FAILED',
]);
const edgeCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, idempotency-key, x-correlation-id`,
};

function respond(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...edgeCorsHeaders,
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
      'Cache-Control': 'no-store',
    },
  });
}

async function readLegacyBody(req: Request) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'reason')) throw new Error('INVALID_BODY');
    if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length > 500)) {
      throw new Error('INVALID_BODY');
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_BODY') throw error;
    throw new Error('INVALID_JSON');
  }
}

function requestKey(req: Request, userId: string) {
  const supplied = String(req.headers.get('idempotency-key') || '').trim();
  if (supplied && !IDEMPOTENCY_PATTERN.test(supplied)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return supplied || `account-deletion:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

Deno.serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: edgeCorsHeaders });
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', correlationId }, 405, correlationId);
  }

  try {
    await readLegacyBody(req);
    const { client, user } = await requireAuthenticatedUserClient(req);
    const idempotencyKey = requestKey(req, user.id);
    const { data, error } = await observeEdgeOperation(
      'privacy.request_account_deletion',
      correlationId,
      () => client.rpc('request_my_data_subject_action_v2', {
        _request_type: 'deletion',
        _export_scope: [],
        _idempotency_key: idempotencyKey,
      }),
      { subject: 'authenticated_user' },
    );
    if (error || !data) throw new Error('DELETION_REQUEST_FAILED');

    const result = data as Record<string, unknown>;
    logEdgeEvent('info', 'account_deletion_scheduled', correlationId, {
      status: String(result.status || 'requested'),
      idempotent_replay: result.idempotent_replay === true,
    });
    return respond({
      success: true,
      scheduled: true,
      request_id: result.request_id,
      status: result.status,
      grace_period_ends_at: result.grace_period_ends_at,
      idempotent_replay: result.idempotent_replay === true,
      correlationId,
    }, 202, correlationId);
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const code = SAFE_ERROR_CODES.has(rawCode) ? rawCode : 'INTERNAL_ERROR';
    const status = code === 'REQUEST_TOO_LARGE' ? 413
      : code === 'INVALID_JSON' || code === 'INVALID_BODY' || code === 'INVALID_IDEMPOTENCY_KEY' ? 400
        : code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID' ? 401
          : code === 'DELETION_REQUEST_FAILED' ? 503
            : 500;
    logEdgeEvent(status >= 500 ? 'error' : 'warn', 'account_deletion_request_failed', correlationId, {
      code,
      status,
    });
    const userMessage = status === 401 ? 'Authentication required.'
      : status === 400 ? 'Invalid request.'
        : status === 413 ? 'Request too large.'
          : 'The account deletion request could not be scheduled.';
    return respond({ error: userMessage, code, correlationId }, status, correlationId);
  }
});
