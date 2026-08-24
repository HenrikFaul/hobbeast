import { describe, expect, it } from 'vitest';
import {
  EVENT_FEED_REQUEST_MAX_BYTES,
  EventFeedRequestError,
  parseEventFeedRequest,
} from '../../../supabase/functions/event-feed-ingest/requestContract';
import {
  signEventFeedCronPayload,
  verifyEventFeedCronRequest,
} from '../../../supabase/functions/event-feed-ingest/cronAuth';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.test/functions/v1/event-feed-ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('event feed request boundary', () => {
  it('parses bounded admin and worker actions', async () => {
    await expect(parseEventFeedRequest(post({ action: 'status', page: 2, limit: 200 }))).resolves.toMatchObject({
      action: 'status', page: 2, limit: 20,
    });
    await expect(parseEventFeedRequest(post({ action: 'sync_source', source_id: 'src_2dca3e1d' }))).resolves.toMatchObject({
      action: 'sync_source', source_id: 'src_2dca3e1d',
    });
    await expect(parseEventFeedRequest(post({
      action: 'sync_due', issued_at: 1_787_644_800,
      nonce: '11111111-1111-4111-8111-111111111111', limit: 500,
    }))).resolves.toMatchObject({ action: 'sync_due', limit: 50 });
  });

  it('rejects unnamespaced sources, unknown fields and unaudited reviews', async () => {
    await expect(parseEventFeedRequest(post({ action: 'sync_source', source_id: 'rss-any-url' })))
      .rejects.toMatchObject<EventFeedRequestError>({ code: 'INVALID_SOURCE_ID' });
    await expect(parseEventFeedRequest(post({ action: 'status', endpoint_url: 'https://internal.test' })))
      .rejects.toMatchObject<EventFeedRequestError>({ code: 'INVALID_REQUEST_FIELD' });
    await expect(parseEventFeedRequest(post({
      action: 'review_source', source_id: 'src_2dca3e1d', decision: 'approved', reason: 'short',
    }))).rejects.toMatchObject<EventFeedRequestError>({ code: 'REVIEW_REASON_REQUIRED' });
  });

  it('stops an undeclared streaming body as soon as the byte cap is crossed', async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode('x'.repeat(EVENT_FEED_REQUEST_MAX_BYTES / 2 + 1)));
        if (pulls > 3) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://example.test/functions/v1/event-feed-ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expect(parseEventFeedRequest(request)).rejects.toMatchObject<EventFeedRequestError>({
      code: 'REQUEST_TOO_LARGE', status: 413,
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });

  it('authenticates fresh HMAC scheduler requests and rejects replay/tampering', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const nowMs = Date.UTC(2026, 7, 25, 8, 0, 0);
    const timestamp = String(Math.trunc(nowMs / 1000));
    const body = JSON.stringify({ action: 'sync_due', issued_at: Number(timestamp), nonce: '11111111-1111-4111-8111-111111111111' });
    const signature = await signEventFeedCronPayload(secret, timestamp, body);
    const request = new Request('https://example.test/functions/v1/event-feed-ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hobbeast-timestamp': timestamp,
        'x-hobbeast-signature': signature,
      },
      body,
    });

    await expect(verifyEventFeedCronRequest({ request, rawBody: body, secret, nowMs })).resolves.toBe(true);
    await expect(verifyEventFeedCronRequest({ request, rawBody: `${body} `, secret, nowMs })).resolves.toBe(false);
    await expect(verifyEventFeedCronRequest({ request, rawBody: body, secret, nowMs: nowMs + 301_000 })).resolves.toBe(false);
  });
});
