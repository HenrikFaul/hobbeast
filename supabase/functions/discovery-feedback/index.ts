import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse } from '../shared/providerFetch.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES = new Set(['native', 'external', 'hub', 'circle', 'venue']);
const PREFERENCES = new Set(['less_like_this', 'neutral']);
const MAX_BODY_BYTES = 8192;
const ACTION_FIELDS: Record<'bootstrap' | 'set', ReadonlySet<string>> = {
  bootstrap: new Set(['action']),
  set: new Set(['action', 'canonical_identity', 'candidate_source', 'preference', 'idempotency_key']),
};

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' }, request_id: requestId }, 405);
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: { code: 'BODY_TOO_LARGE' }, request_id: requestId }, 413);
    const rawBody = new Uint8Array(await req.arrayBuffer());
    if (rawBody.byteLength > MAX_BODY_BYTES) return jsonResponse({ error: { code: 'BODY_TOO_LARGE' }, request_id: requestId }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return jsonResponse({ error: { code: 'INVALID_JSON' }, request_id: requestId }, 400);
    }
    if (!isRequestObject(parsed)) return jsonResponse({ error: { code: 'INVALID_REQUEST_BODY' }, request_id: requestId }, 400);
    const body = parsed;
    const action = body.action;
    if (action !== 'bootstrap' && action !== 'set') {
      return jsonResponse({ error: { code: 'INVALID_ACTION' }, request_id: requestId }, 400);
    }
    if (Object.keys(body).some((key) => !ACTION_FIELDS[action].has(key))) {
      return jsonResponse({ error: { code: 'INVALID_REQUEST_FIELDS' }, request_id: requestId }, 400);
    }
    const { client, user } = await requireAuthenticatedUserClient(req);

    const { data: rankerEnabledValue, error: featureFlagError } = await client.rpc('evaluate_feature_flag', {
      _flag_key: 'new_recommender',
      _subject_id: user.id,
      _cohort: null,
    });
    // Fail closed when the flag service is unavailable: the legacy feed stays
    // usable, while personalized mutation/ranking remains disabled.
    const rankerEnabled = !featureFlagError && rankerEnabledValue === true;

    if (action === 'bootstrap') {
      const { data: preferences, error } = await client
        .from('discovery_preferences')
        .select('canonical_identity,candidate_source,preference')
        .eq('active', true)
        .limit(500);
      if (error) throw new Error(error.message);
      return jsonResponse({
        preferences: preferences ?? [],
        new_recommender_enabled: rankerEnabled,
        request_id: requestId,
      });
    }

    if (!rankerEnabled) {
      return jsonResponse({ error: { code: 'FEATURE_DISABLED' }, request_id: requestId }, 409);
    }

    const identity = typeof body.canonical_identity === 'string' ? body.canonical_identity.trim() : '';
    const source = typeof body.candidate_source === 'string' ? body.candidate_source : '';
    const preference = typeof body.preference === 'string' ? body.preference : '';
    const key = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';
    if (identity.length < 3 || identity.length > 300 || !SOURCES.has(source) || !PREFERENCES.has(preference) || !UUID_PATTERN.test(key)) {
      return jsonResponse({ error: { code: 'INVALID_DISCOVERY_FEEDBACK' }, request_id: requestId }, 400);
    }
    const { data, error } = await client.rpc('set_discovery_preference', {
      p_canonical_identity: identity,
      p_candidate_source: source,
      p_preference: preference,
      p_idempotency_key: key,
    });
    if (error) throw new Error(error.message);
    return jsonResponse({ preference: data?.[0] ?? null, request_id: requestId });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message.includes('AUTH_');
    console.error(JSON.stringify({ level: 'error', code: unauthorized ? 'AUTH_REQUIRED' : 'DISCOVERY_FEEDBACK_FAILED', request_id: requestId }));
    return jsonResponse({ error: { code: unauthorized ? 'AUTH_REQUIRED' : 'DISCOVERY_FEEDBACK_FAILED' }, request_id: requestId }, unauthorized ? 401 : 500);
  }
});
