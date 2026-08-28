// Inbound-email webhook for the newsletter ingestion channel.
//
// A technical inbox subscribes to event newsletters; the mail provider (SendGrid
// Inbound Parse, Mailgun Routes, Postmark, …) POSTs each arriving mail here. This
// function is deliberately thin: verify the caller, normalise the payload across
// providers, and hand it to record_inbound_email, which dedups by Message-ID and
// matches the sender to a source. The events are read out later by the worker,
// with the same engine it runs on a web page — the heavy parsing does not belong
// in a request handler.
//
// Auth: the caller must present the shared secret as ?secret=… (or an
// x-webhook-secret header). It lives in email_ingest_config and is read only by
// the service role, so it never reaches a browser.

import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';

/** Pulls a field from a payload trying several provider spellings. */
function pick(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** "Name <a@b.hu>" or "a@b.hu" → "a@b.hu". */
function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' }, request_id: requestId }, 405);

  try {
    const admin = getSupabaseAdmin(req);

    const url = new URL(req.url);
    const presented = url.searchParams.get('secret') || req.headers.get('x-webhook-secret') || '';
    const { data: secret } = await admin.rpc('get_email_webhook_secret');
    if (!secret || presented !== secret) {
      // Same response whether the inbox is unconfigured or the secret is wrong,
      // so a prober cannot tell which.
      return jsonResponse({ error: { code: 'UNAUTHORIZED' }, request_id: requestId }, 401);
    }

    // Providers post either JSON or multipart form-data. Accept both.
    let body: Record<string, unknown> = {};
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => null);
      if (form) for (const [key, value] of form.entries()) body[key] = typeof value === 'string' ? value : '';
    }

    // Normalise across SendGrid / Mailgun / Postmark / a plain JSON body.
    const fromRaw = pick(body, ['from_address', 'from', 'From', 'sender', 'From:']);
    const email = {
      from_address: bareAddress(fromRaw),
      to_address: bareAddress(pick(body, ['to_address', 'to', 'To', 'recipient'])),
      subject: pick(body, ['subject', 'Subject']),
      html_body: pick(body, ['html_body', 'html', 'HtmlBody', 'body-html', 'stripped-html']),
      text_body: pick(body, ['text_body', 'text', 'TextBody', 'body-plain', 'stripped-text', 'plain']),
      message_id: pick(body, ['message_id', 'Message-Id', 'MessageID', 'message-id', 'Message-ID']),
    };

    if (!email.from_address || (!email.html_body && !email.text_body)) {
      return jsonResponse({ error: { code: 'INCOMPLETE_EMAIL' }, request_id: requestId }, 422);
    }

    const { data, error } = await admin.rpc('record_inbound_email', { p_email: email });
    if (error) {
      console.error(JSON.stringify({ level: 'error', code: 'RECORD_FAILED', detail: error.message, request_id: requestId }));
      return jsonResponse({ error: { code: 'RECORD_FAILED' }, request_id: requestId }, 500);
    }

    // 200 so the provider does not retry; the body says what happened.
    return jsonResponse({ received: true, ...(data as Record<string, unknown>), request_id: requestId }, 200);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', code: 'EMAIL_INBOUND_FAILED', detail: String(error), request_id: requestId }));
    return jsonResponse({ error: { code: 'EMAIL_INBOUND_FAILED' }, request_id: requestId }, 500);
  }
});
