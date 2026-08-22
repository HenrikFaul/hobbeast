import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse } from '../shared/providerFetch.ts';
import { requireAuthenticatedUser } from '../shared/userAuth.ts';

const MAX_BODY_BYTES = 32 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(req: Request) {
  const text = await req.text();
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES
    || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed)) throw new Error('INVALID_BODY');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_BODY') throw error;
    throw new Error('INVALID_JSON');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405);
  const requestId = crypto.randomUUID();
  try {
    const body = await readBody(req);
    const { client, user } = await requireAuthenticatedUser(req);
    const action = typeof body.action === 'string' ? body.action : 'list';
    if (action === 'list') {
      const { data, error } = await client.from('ai_event_proposals').select([
        'id', 'status', 'title', 'description', 'activity', 'suggested_start', 'suggested_end',
        'city', 'area_hint', 'venue_category', 'target_capacity', 'demand_reason', 'confidence',
        'venue_name', 'venue_address', 'host_responsibility_accepted_at', 'created_at',
      ].join(',')).eq('organizer_id', user.id).in('status', ['review', 'approved']).order('suggested_start');
      if (error) throw new Error('PROPOSAL_LIST_FAILED');
      return jsonResponse({ proposals: data || [], request_id: requestId });
    }
    if (action === 'decision') {
      if (typeof body.proposal_id !== 'string' || typeof body.accepted !== 'boolean') {
        return jsonResponse({ error: 'Invalid decision.', code: 'INVALID_DECISION', request_id: requestId }, 400);
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!body.accepted && reason.length < 3) {
        return jsonResponse({ error: 'Decline reason required.', code: 'REASON_REQUIRED', request_id: requestId }, 400);
      }
      const { data, error } = await client.rpc('organizer_accept_ai_event_proposal', {
        _proposal_id: body.proposal_id, _accepted: body.accepted, _reason: reason || null,
      });
      if (error) return jsonResponse({ error: 'Decision rejected.', code: 'DECISION_REJECTED', request_id: requestId }, 409);
      return jsonResponse({ result: data, request_id: requestId });
    }
    return jsonResponse({ error: 'Unknown action.', code: 'INVALID_ACTION', request_id: requestId }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'AUTH_MISSING' || code === 'AUTH_INVALID' ? 401
      : ['BODY_TOO_LARGE', 'INVALID_BODY', 'INVALID_JSON'].includes(code) ? 400 : 500;
    if (status >= 500) console.error('organizer-ai-proposals failed', { request_id: requestId, code });
    return jsonResponse({ error: status >= 500 ? 'Organizer proposal operation failed.' : 'Request rejected.', code, request_id: requestId }, status);
  }
});
