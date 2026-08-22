import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import { requireAuthenticatedUser } from '../shared/userAuth.ts';

const MAX_BODY_BYTES = 32_768;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/;

interface ServerPreferences {
  friend_request: boolean;
  event_invite: boolean;
  favorite_category_event: boolean;
  organizer_enabled: boolean;
  community_enabled: boolean;
  recommendation_enabled: boolean;
  transactional_enabled: boolean;
  marketing_enabled: boolean;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  digest_mode: 'off' | 'daily' | 'weekly';
  frequency_cap_per_day: number;
}

const DEFAULTS: ServerPreferences = {
  friend_request: true,
  event_invite: true,
  favorite_category_event: true,
  organizer_enabled: true,
  community_enabled: true,
  recommendation_enabled: true,
  transactional_enabled: true,
  marketing_enabled: false,
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  quiet_hours_enabled: false,
  quiet_start: '22:00',
  quiet_end: '07:00',
  timezone: 'Europe/Budapest',
  digest_mode: 'off',
  frequency_cap_per_day: 12,
};

type PreferencePatch = Partial<ServerPreferences>;

function response(body: unknown, status: number, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
}

async function readBody(req: Request) {
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  try {
    return JSON.parse(text || '{}') as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function parsePatch(value: unknown): PreferencePatch | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(DEFAULTS));
  if (Object.keys(input).length === 0 || Object.keys(input).some((key) => !allowedKeys.has(key))) return null;

  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const expected = DEFAULTS[key as keyof typeof DEFAULTS];
    if (typeof expected === 'boolean') {
      if (typeof raw !== 'boolean') return null;
      result[key] = raw;
      continue;
    }
    if (key === 'frequency_cap_per_day') {
      if (!Number.isInteger(raw) || Number(raw) < 1 || Number(raw) > 100) return null;
      result[key] = raw;
      continue;
    }
    if (key === 'quiet_start' || key === 'quiet_end') {
      if (typeof raw !== 'string' || !TIME_PATTERN.test(raw)) return null;
      result[key] = raw;
      continue;
    }
    if (key === 'timezone') {
      if (typeof raw !== 'string' || raw.length > 64 || !TIMEZONE_PATTERN.test(raw)) return null;
      result[key] = raw;
      continue;
    }
    if (key === 'digest_mode') {
      if (raw !== 'off' && raw !== 'daily' && raw !== 'weekly') return null;
      result[key] = raw;
      continue;
    }
    return null;
  }
  return result as PreferencePatch;
}

function selectPreferences(row: Record<string, unknown> | null | undefined) {
  const selected: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) selected[key] = row?.[key] ?? fallback;
  return selected;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parsePushSubscription(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = typeof row.keys === 'object' && row.keys !== null && !Array.isArray(row.keys)
    ? row.keys as Record<string, unknown> : {};
  const endpoint = typeof row.endpoint === 'string' ? row.endpoint.trim() : '';
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const authSecret = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { return null; }
  if (parsedEndpoint.protocol !== 'https:' || endpoint.length < 20 || endpoint.length > 2048
      || p256dh.length < 16 || p256dh.length > 512 || authSecret.length < 8 || authSecret.length > 256) return null;
  const expiration = row.expirationTime;
  const expirationTime = typeof expiration === 'number' && Number.isFinite(expiration) && expiration > Date.now()
    ? new Date(expiration).toISOString() : null;
  return { endpoint, p256dh, authSecret, expirationTime };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestIdHeader = req.headers.get('x-request-id') || '';
  const requestId = /^[a-zA-Z0-9_-]{8,80}$/.test(requestIdHeader) ? requestIdHeader : crypto.randomUUID();

  try {
    if (req.method !== 'POST') return response({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405, requestId);
    const body = await readBody(req);
    const action = body.action;
    if (!['get', 'update', 'push_status', 'register_push', 'revoke_push'].includes(String(action))) {
      return response({ error: 'Unknown action.', code: 'INVALID_ACTION' }, 400, requestId);
    }

    const { user } = await requireAuthenticatedUser(req);
    const admin = getSupabaseAdmin(req);

    if (action === 'push_status') {
      const { count, error } = await admin.from('user_push_subscriptions')
        .select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('revoked_at', null);
      if (error) throw error;
      return response({ ok: true, active_count: count || 0 }, 200, requestId);
    }

    if (action === 'register_push') {
      const subscription = parsePushSubscription(body.subscription);
      if (!subscription) return response({ error: 'Invalid push subscription.', code: 'INVALID_PUSH_SUBSCRIPTION' }, 400, requestId);
      const endpointHash = await sha256Hex(subscription.endpoint);
      const userAgentFamily = typeof body.user_agent_family === 'string'
        ? body.user_agent_family.trim().slice(0, 120) || null : null;
      const { error } = await admin.from('user_push_subscriptions').upsert({
        user_id: user.id,
        endpoint_hash: endpointHash,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth_secret: subscription.authSecret,
        expiration_time: subscription.expirationTime,
        user_agent_family: userAgentFamily,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint_hash' });
      if (error) throw error;
      await admin.from('notification_preferences').upsert({ user_id: user.id, push_enabled: true }, { onConflict: 'user_id' });
      const { count } = await admin.from('user_push_subscriptions')
        .select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('revoked_at', null);
      return response({ ok: true, active_count: count || 1 }, 201, requestId);
    }

    if (action === 'revoke_push') {
      const { error } = await admin.from('user_push_subscriptions')
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id).is('revoked_at', null);
      if (error) throw error;
      await admin.from('notification_preferences').upsert({ user_id: user.id, push_enabled: false }, { onConflict: 'user_id' });
      return response({ ok: true, active_count: 0 }, 200, requestId);
    }

    if (action === 'get') {
      const { data, error } = await admin
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return response({ ok: true, preferences: selectPreferences(data as Record<string, unknown> | null) }, 200, requestId);
    }

    const patch = parsePatch(body.preferences);
    if (!patch) {
      return response({ error: 'Invalid notification preference patch.', code: 'INVALID_PREFERENCES' }, 400, requestId);
    }
    const { data, error } = await admin
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
      .select('*')
      .single();
    if (error) throw error;
    return response({ ok: true, preferences: selectPreferences(data as Record<string, unknown>) }, 200, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const unauthorized = message === 'Missing authorization token.' || message.startsWith('Unauthorized request:');
    const tooLarge = message === 'REQUEST_TOO_LARGE';
    const invalidJson = message === 'INVALID_JSON';
    const schemaMissing = /notification_preferences|column|schema cache/i.test(message);
    const status = unauthorized ? 401 : tooLarge ? 413 : invalidJson ? 400 : schemaMissing ? 409 : 500;
    const code = unauthorized
      ? 'UNAUTHORIZED'
      : tooLarge
        ? 'REQUEST_TOO_LARGE'
        : invalidJson
          ? 'INVALID_JSON'
          : schemaMissing
            ? 'NOTIFICATION_SCHEMA_REQUIRED'
            : 'INTERNAL_ERROR';
    if (status >= 500) console.error('notification-preferences failed', { requestId, error });
    return response({ error: status >= 500 ? 'Notification preferences are temporarily unavailable.' : message, code }, status, requestId);
  }
});
