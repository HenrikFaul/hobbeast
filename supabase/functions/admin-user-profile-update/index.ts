import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { correlationIdFromRequest, logEdgeEvent } from '../shared/edgeObservability.ts';

const MAX_BODY_BYTES = 32 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_GENDERS = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const ALLOWED_BODY_KEYS = new Set([
  'userId', 'gender', 'isActive', 'bio', 'hobbies', 'eventIds', 'reason', 'idempotencyKey',
]);
type AdminClient = ReturnType<typeof createClient>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function response(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }
  if (!isObject(value) || Object.keys(value).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
    throw new Error('INVALID_BODY');
  }
  return value;
}

async function requireProfileManager(req: Request, supabaseUrl: string, adminClient: AdminClient) {
  const authHeader = req.headers.get('authorization');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!authHeader || !anonKey) throw new Error('UNAUTHORIZED');
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) throw new Error('UNAUTHORIZED');
  const { data, error } = await adminClient.rpc('admin_has_capability', {
    _user_id: user.id,
    _capability_key: 'users.manage_profile',
  });
  if (error) throw new Error('CAPABILITY_CHECK_FAILED');
  if (data !== true) throw new Error('CAPABILITY_REQUIRED');
  return user;
}

Deno.serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405, correlationId);

  try {
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG');
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const caller = await requireProfileManager(req, supabaseUrl, adminClient);
    const body = await readBody(req);

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const gender = body.gender === null ? null : typeof body.gender === 'string' ? body.gender.trim() : '';
    const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const hobbies = Array.isArray(body.hobbies) ? body.hobbies : null;
    const eventIds = Array.isArray(body.eventIds) ? body.eventIds : null;

    if (!UUID_PATTERN.test(userId)
      || (gender !== null && !ALLOWED_GENDERS.has(gender))
      || typeof body.isActive !== 'boolean'
      || bio.length > 500
      || reason.length < 3 || reason.length > 1000
      || idempotencyKey.length < 8 || idempotencyKey.length > 240
      || !hobbies || hobbies.length > 100
      || hobbies.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80)
      || !eventIds || eventIds.length > 500
      || eventIds.some((value) => typeof value !== 'string' || !UUID_PATTERN.test(value))) {
      throw new Error('INVALID_PROFILE_MUTATION');
    }

    const { data, error } = await adminClient.rpc('admin_update_user_profile', {
      _actor_id: caller.id,
      _target_user_id: userId,
      _gender: gender,
      _is_active: body.isActive,
      _bio: bio,
      _hobbies: [...new Set(hobbies.map((value) => String(value).trim()))],
      _event_ids: [...new Set(eventIds.map((value) => String(value)))],
      _reason: reason,
      _request_id: correlationId,
      _idempotency_key: idempotencyKey,
    });
    if (error) throw new Error('PROFILE_UPDATE_REJECTED');

    logEdgeEvent('info', 'admin_profile_updated', correlationId, {
      replayed: Boolean(data?.replayed),
    });
    return response({ ok: true, result: data }, 200, correlationId);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401
      : code === 'CAPABILITY_REQUIRED' ? 403
        : code === 'BODY_TOO_LARGE' ? 413
          : code.startsWith('INVALID_') ? 400
            : code === 'PROFILE_UPDATE_REJECTED' ? 409
              : code === 'SERVER_CONFIG' ? 503
                : 500;
    logEdgeEvent(status >= 500 ? 'error' : 'warn', 'admin_profile_update_failed', correlationId, { code, status });
    return response({ error: status >= 500 ? 'Admin profile update failed.' : 'Request rejected.', code }, status, correlationId);
  }
});
