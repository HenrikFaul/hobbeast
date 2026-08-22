import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import {
  constantTimeEqual, deliverProviderJson, safeInternalDeepLink,
  type DeliveryPayload,
} from '../shared/notificationDelivery.ts';

const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Claim {
  notification_id: string;
  user_id: string;
  channel: 'email' | 'push';
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  claim_token: string;
}

function serviceAuthorized(req: Request) {
  const expected = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const actual = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return expected.length >= 20 && constantTimeEqual(actual, expected);
}

async function complete(admin: ReturnType<typeof getSupabaseAdmin>, claim: Claim, result: {
  ok: boolean; providerMessageId: string | null; responseCode: string; errorCode: string | null; retryable: boolean;
}, provider: string) {
  const { error } = await admin.rpc('complete_external_notification_claim', {
    p_notification_id: claim.notification_id,
    p_claim_token: claim.claim_token,
    p_status: result.ok ? 'delivered' : 'failed',
    p_provider: provider,
    p_provider_message_id: result.providerMessageId,
    p_response_code: result.responseCode,
    p_error_code: result.errorCode,
    p_retryable: result.retryable,
    p_safe_metadata: { worker: 'notification-delivery-v1', channel: claim.channel },
  });
  if (error) throw new Error('CLAIM_COMPLETION_FAILED');
}

async function suppress(admin: ReturnType<typeof getSupabaseAdmin>, claim: Claim, reason: string) {
  const { error } = await admin.rpc('suppress_external_notification_claim', {
    p_notification_id: claim.notification_id, p_claim_token: claim.claim_token, p_reason: reason,
  });
  if (error) throw new Error('CLAIM_SUPPRESSION_FAILED');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!serviceAuthorized(req)) return jsonResponse({ ok: false, code: 'SERVICE_ROLE_REQUIRED' }, 401);
  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) return jsonResponse({ ok: false, code: 'BODY_TOO_LARGE' }, 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ ok: false, code: 'BODY_TOO_LARGE' }, 413);
    const body = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
    const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(100, Number(body.limit))) : 25;
    const admin = getSupabaseAdmin(req);
    const [digest, inApp, messages] = await Promise.all([
      admin.rpc('materialize_due_notification_digests', { p_limit: limit * 2 }),
      admin.rpc('release_due_in_app_notifications', { p_limit: limit * 5 }),
      admin.rpc('release_due_organizer_messages', { p_limit: limit * 5 }),
    ]);
    if (digest.error || inApp.error || messages.error) throw new Error('QUEUE_RELEASE_FAILED');
    const workerId = `edge-${crypto.randomUUID()}`;
    const { data, error } = await admin.rpc('claim_due_external_notifications', {
      p_worker_id: workerId, p_limit: limit, p_lease_seconds: 90,
    });
    if (error) throw new Error('QUEUE_CLAIM_FAILED');
    const claims = (Array.isArray(data) ? data : []) as Claim[];
    const summary = { claimed: claims.length, delivered: 0, failed: 0, suppressed: 0 };

    for (const claim of claims) {
      if (!UUID.test(claim.notification_id) || !UUID.test(claim.user_id) || !UUID.test(claim.claim_token)) continue;
      const notification: DeliveryPayload = {
        notificationId: claim.notification_id,
        title: String(claim.title || '').slice(0, 240),
        body: String(claim.body || '').slice(0, 4000),
        deepLink: safeInternalDeepLink(claim.data?.deep_link),
        category: String(claim.notification_type || '').slice(0, 80),
      };
      if (claim.channel === 'email') {
        const url = String(Deno.env.get('EMAIL_DELIVERY_URL') || '').trim();
        const token = String(Deno.env.get('EMAIL_DELIVERY_TOKEN') || '').trim();
        if (!url || !token) { await suppress(admin, claim, 'provider_not_configured'); summary.suppressed += 1; continue; }
        const { data: authData, error: authError } = await admin.auth.admin.getUserById(claim.user_id);
        const email = authData.user?.email;
        if (authError || !email) { await suppress(admin, claim, 'recipient_unavailable'); summary.suppressed += 1; continue; }
        const result = await deliverProviderJson({ url, token, payload: { to: email, notification } });
        await complete(admin, claim, result, 'http-email-adapter-v1');
        summary[result.ok ? 'delivered' : 'failed'] += 1;
        continue;
      }

      const url = String(Deno.env.get('WEB_PUSH_DELIVERY_URL') || '').trim();
      const token = String(Deno.env.get('WEB_PUSH_DELIVERY_TOKEN') || '').trim();
      if (!url || !token) { await suppress(admin, claim, 'provider_not_configured'); summary.suppressed += 1; continue; }
      const { data: subscriptions, error: subscriptionError } = await admin.from('user_push_subscriptions')
        .select('endpoint,p256dh,auth_secret,expiration_time').eq('user_id', claim.user_id)
        .is('revoked_at', null).order('last_seen_at', { ascending: false }).limit(5);
      if (subscriptionError || !subscriptions?.length) { await suppress(admin, claim, 'subscription_missing'); summary.suppressed += 1; continue; }
      const result = await deliverProviderJson({ url, token, payload: {
        subscriptions: subscriptions.map((entry) => ({
          endpoint: entry.endpoint,
          expirationTime: entry.expiration_time ? Date.parse(entry.expiration_time) : null,
          keys: { p256dh: entry.p256dh, auth: entry.auth_secret },
        })),
        notification,
      } });
      await complete(admin, claim, result, 'http-web-push-adapter-v1');
      summary[result.ok ? 'delivered' : 'failed'] += 1;
    }
    return jsonResponse({ ok: true, summary, released: { digest: digest.data, in_app: inApp.data, organizer_messages: messages.data } });
  } catch (error) {
    const code = error instanceof SyntaxError ? 'INVALID_JSON' : error instanceof Error ? error.message : 'WORKER_FAILED';
    console.error('notification delivery worker failed', { code });
    return jsonResponse({ ok: false, code }, code === 'INVALID_JSON' ? 400 : 500);
  }
});
