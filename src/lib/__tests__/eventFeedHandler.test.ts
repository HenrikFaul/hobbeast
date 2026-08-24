import { describe, expect, it, vi } from 'vitest';

import { signEventFeedCronPayload } from '../../../supabase/functions/event-feed-ingest/cronAuth';
import {
  createEventFeedHandler,
  type EventFeedHandlerDependencies,
} from '../../../supabase/functions/event-feed-ingest/handler';
import { EVENT_FEED_REQUEST_MAX_BYTES } from '../../../supabase/functions/event-feed-ingest/requestContract';
import {
  createEventFeedRepository,
  EventFeedRepositoryError,
  type EventFeedRepository,
} from '../../../supabase/functions/event-feed-ingest/repository';

const ENDPOINT = 'https://example.test/functions/v1/event-feed-ingest';
const SECRET = '0123456789abcdef0123456789abcdef';
const NOW_MS = Date.UTC(2026, 7, 25, 8, 0, 0);

function postRaw(rawBody: string, headers: Record<string, string> = {}) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return postRaw(JSON.stringify(body), headers);
}

function repository(overrides: Partial<EventFeedRepository> = {}) {
  return {
    processor: {
      storeRawPayload: vi.fn(),
      commitItem: vi.fn(),
      completeRun: vi.fn(),
    },
    requireProviderManager: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ summary: { total: 0 }, sources: [], runs: [] })),
    claimDue: vi.fn(async () => []),
    claimSource: vi.fn(),
    consumeCronDispatch: vi.fn(async () => undefined),
    reviewSource: vi.fn(async () => ({ source_id: 'src_2dca3e1d' })),
    ...overrides,
  } as unknown as EventFeedRepository;
}

function dependencies(repositoryValue = repository()) {
  const userClient = { rpc: vi.fn() };
  return {
    requireAuthenticatedUser: vi.fn(async () => ({ id: 'admin-user-1' })),
    createUserClient: vi.fn(() => userClient as never),
    repository: repositoryValue,
    processClaim: vi.fn(),
    resolveHost: vi.fn(async () => ['93.184.216.34']),
    cronSecret: vi.fn(() => SECRET),
    correlationIdFromRequest: vi.fn(() => 'correlation-123'),
    logEvent: vi.fn(),
    nowMs: vi.fn(() => NOW_MS),
  } satisfies EventFeedHandlerDependencies;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedCronRequest(rawBody: string, nonce: string) {
  const timestamp = String(Math.trunc(NOW_MS / 1000));
  const signature = await signEventFeedCronPayload(SECRET, timestamp, rawBody);
  return postRaw(rawBody, {
    'x-hobbeast-timestamp': timestamp,
    'x-hobbeast-nonce': nonce,
    'x-hobbeast-signature': signature,
  });
}

describe('event feed handler boundary', () => {
  it('answers OPTIONS without invoking authentication or repository operations', async () => {
    const deps = dependencies();
    const response = await createEventFeedHandler(deps)(new Request(ENDPOINT, { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(deps.requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(deps.repository.status).not.toHaveBeenCalled();
  });

  it('rejects an oversized undeclared body before auth, HMAC or repository work', async () => {
    const repo = repository();
    const deps = dependencies(repo);
    const request = postRaw('x'.repeat(EVENT_FEED_REQUEST_MAX_BYTES + 1));
    expect(request.headers.has('content-length')).toBe(false);

    const response = await createEventFeedHandler(deps)(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'REQUEST_TOO_LARGE' });
    expect(deps.requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(deps.cronSecret).not.toHaveBeenCalled();
    expect(repo.status).not.toHaveBeenCalled();
    expect(repo.claimDue).not.toHaveBeenCalled();
  });

  it('requires authentication before returning source status', async () => {
    const repo = repository();
    const deps = dependencies(repo);
    deps.requireAuthenticatedUser.mockRejectedValueOnce(new Error('Missing authorization token.'));

    const unauthorized = await createEventFeedHandler(deps)(post({ action: 'status' }));
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: 'AUTHORIZATION_FAILED' });
    expect(repo.status).not.toHaveBeenCalled();

    deps.requireAuthenticatedUser.mockResolvedValueOnce({ id: 'admin-user-1' });
    const authorized = await createEventFeedHandler(deps)(post({ action: 'status', page: 2, limit: 7 }));
    expect(authorized.status).toBe(200);
    expect(repo.requireProviderManager).toHaveBeenCalledWith('admin-user-1');
    expect(repo.status).toHaveBeenCalledWith({ query: undefined, page: 2, limit: 7 });
  });

  it('passes complete approval evidence only through the user-scoped review RPC client', async () => {
    const repo = repository();
    const deps = dependencies(repo);
    const request = post({
      action: 'review_source',
      source_id: 'src_2dca3e1d',
      decision: 'approved',
      reason: 'Official publisher feed and robots evidence reviewed.',
      request_id: 'request-feed-review-001',
      idempotency_key: 'idempotency-feed-review-001',
      enable: true,
      fetch_hosts: ['EVENTS.EXAMPLE.HU'],
      legal_review_status: 'approved',
      robots_allowed: true,
      poll_interval_minutes: 180,
      min_publish_quality: 90,
    }, { authorization: 'Bearer user-jwt' });

    const response = await createEventFeedHandler(deps)(request);

    expect(response.status).toBe(200);
    expect(deps.createUserClient).toHaveBeenCalledWith(request);
    const userClient = deps.createUserClient.mock.results[0].value;
    expect(repo.reviewSource).toHaveBeenCalledWith(userClient, {
      sourceId: 'src_2dca3e1d',
      decision: 'approved',
      reason: 'Official publisher feed and robots evidence reviewed.',
      requestId: 'request-feed-review-001',
      idempotencyKey: 'idempotency-feed-review-001',
      enable: true,
      fetchHosts: ['events.example.hu'],
      legalReviewStatus: 'approved',
      robotsAllowed: true,
      pollIntervalMinutes: 180,
      minPublishQuality: 90,
    });
  });

  it('rejects an approval before auth/RPC when legal or robots evidence is absent', async () => {
    const repo = repository();
    const deps = dependencies(repo);
    const response = await createEventFeedHandler(deps)(post({
      action: 'review_source',
      source_id: 'src_2dca3e1d',
      decision: 'approved',
      reason: 'Attempted approval without full evidence.',
      request_id: 'request-feed-review-002',
      idempotency_key: 'idempotency-feed-review-002',
      fetch_hosts: ['events.example.hu'],
      legal_review_status: 'approved',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'APPROVAL_EVIDENCE_REQUIRED' });
    expect(deps.requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(repo.reviewSource).not.toHaveBeenCalled();
  });

  it('accepts a fresh raw-body HMAC, consumes its digest once and bypasses admin auth', async () => {
    const nonce = '11111111-1111-4111-8111-111111111111';
    const rawBody = JSON.stringify({
      action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce, limit: 4,
    });
    const repo = repository();
    const deps = dependencies(repo);
    const response = await createEventFeedHandler(deps)(await signedCronRequest(rawBody, nonce));

    expect(response.status).toBe(200);
    expect(deps.requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(repo.consumeCronDispatch).toHaveBeenCalledWith({
      nonce,
      issuedAt: Math.trunc(NOW_MS / 1000),
      bodySha256: await sha256(rawBody),
    });
    expect(repo.claimDue).toHaveBeenCalledWith(2, `cron:${nonce}:batch-1`);
  });

  it('drains more than one due batch while keeping claims bounded and fully processed', async () => {
    const nonce = '55555555-5555-4555-8555-555555555555';
    const rawBody = JSON.stringify({
      action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce, limit: 10,
    });
    const due = Array.from({ length: 25 }, (_, index) => ({
      source_id: `src_${index.toString(16).padStart(8, '0')}`,
    }));
    let offset = 0;
    const claimDue = vi.fn(async (limit: number) => {
      const batch = due.slice(offset, offset + limit);
      offset += batch.length;
      return batch;
    });
    const repo = repository({ claimDue });
    const deps = dependencies(repo);
    deps.processClaim.mockImplementation(async (claim) => ({
      source_id: claim.source_id, status: 'succeeded', discovered: 1,
    }));

    const response = await createEventFeedHandler(deps)(await signedCronRequest(rawBody, nonce));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(claimDue).toHaveBeenCalledTimes(13);
    expect(claimDue.mock.calls.map((call) => call[0])).toEqual([
      2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    ]);
    expect(claimDue.mock.calls.map((call) => call[1])).toEqual(
      Array.from({ length: 13 }, (_, index) => `cron:${nonce}:batch-${index + 1}`),
    );
    expect(deps.processClaim).toHaveBeenCalledTimes(25);
    expect(body).toMatchObject({
      ok: true,
      drain: {
        batch_size: 10, claim_unit: 2, batch_count: 13, claimed_count: 25, processed_count: 25,
        exhausted: true, continuation_required: false, stop_reason: 'exhausted',
      },
    });
    expect(body.results).toHaveLength(25);
  });

  it('stops between completed batches at the soft deadline and requires a fresh signed continuation', async () => {
    const nonce = '66666666-6666-4666-8666-666666666666';
    const rawBody = JSON.stringify({
      action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce, limit: 10,
    });
    let clock = NOW_MS;
    const claimDue = vi.fn(async (limit: number) => Array.from({ length: limit }, (_, index) => ({
      source_id: `src_${index.toString(16).padStart(8, '0')}`,
    })));
    const repo = repository({ claimDue });
    const deps = dependencies(repo);
    deps.nowMs.mockImplementation(() => clock);
    deps.processClaim.mockImplementation(async (claim) => {
      clock += 2_000;
      return { source_id: claim.source_id, status: 'succeeded' };
    });
    const boundedDeps = { ...deps, syncDueBudgetMs: 10_000 } satisfies EventFeedHandlerDependencies;

    const response = await createEventFeedHandler(boundedDeps)(await signedCronRequest(rawBody, nonce));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(claimDue).toHaveBeenCalledTimes(1);
    expect(deps.processClaim).toHaveBeenCalledTimes(2);
    expect(body.drain).toMatchObject({
      exhausted: false,
      continuation_required: true,
      stop_reason: 'time_budget',
      continuation: {
        action: 'sync_due', limit: 10, requires_fresh_signed_dispatch: true,
      },
    });
  });

  it('aborts in-flight scheduled fetch work before the invocation deadline', async () => {
    const nonce = '77777777-7777-4777-8777-777777777777';
    const rawBody = JSON.stringify({
      action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce, limit: 10,
    });
    const repo = repository({
      claimDue: vi.fn(async () => [{ source_id: 'src_00000001' }]),
    });
    const deps = dependencies(repo);
    deps.processClaim.mockImplementation(async (_claim, _repository, options) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const boundedDeps = { ...deps, syncDueBudgetMs: 20 } satisfies EventFeedHandlerDependencies;

    const response = await createEventFeedHandler(boundedDeps)(await signedCronRequest(rawBody, nonce));
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body).toMatchObject({
      ok: false,
      drain: { processed_count: 1, failure_count: 1, claim_unit: 2 },
    });
  });

  it('rejects body tampering and a nonce-header mismatch before replay consumption', async () => {
    const nonce = '22222222-2222-4222-8222-222222222222';
    const rawBody = JSON.stringify({ action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce });
    const timestamp = String(Math.trunc(NOW_MS / 1000));
    const signature = await signEventFeedCronPayload(SECRET, timestamp, rawBody);
    const repo = repository();
    const deps = dependencies(repo);
    const tampered = postRaw(`${rawBody} `, {
      'x-hobbeast-timestamp': timestamp,
      'x-hobbeast-nonce': nonce,
      'x-hobbeast-signature': signature,
    });
    const tamperedResponse = await createEventFeedHandler(deps)(tampered);
    expect(tamperedResponse.status).toBe(401);

    const mismatchedNonce = await signedCronRequest(rawBody, '33333333-3333-4333-8333-333333333333');
    const mismatchResponse = await createEventFeedHandler(deps)(mismatchedNonce);
    expect(mismatchResponse.status).toBe(401);
    expect(repo.consumeCronDispatch).not.toHaveBeenCalled();
  });

  it('maps one-time dispatch replay rejection to a closed 401 and never claims work', async () => {
    const nonce = '44444444-4444-4444-8444-444444444444';
    const rawBody = JSON.stringify({ action: 'sync_due', issued_at: Math.trunc(NOW_MS / 1000), nonce });
    const repo = repository({
      consumeCronDispatch: vi.fn(async () => {
        throw new EventFeedRepositoryError('EVENT_FEED_CRON_REPLAY_CHECK_FAILED', 'replay_rejected');
      }),
    });
    const deps = dependencies(repo);
    const response = await createEventFeedHandler(deps)(await signedCronRequest(rawBody, nonce));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'AUTHORIZATION_FAILED' });
    expect(repo.claimDue).not.toHaveBeenCalled();
  });
});

describe('event feed repository trust boundary', () => {
  it('executes source review through the supplied user client, never the service client', async () => {
    const adminRpc = vi.fn();
    const userRpc = vi.fn(async () => ({ data: { source_id: 'src_2dca3e1d' }, error: null }));
    const repo = createEventFeedRepository({ rpc: adminRpc } as never);
    const input = {
      sourceId: 'src_2dca3e1d',
      decision: 'approved' as const,
      reason: 'Reviewed official publisher evidence.',
      requestId: 'request-review-003',
      idempotencyKey: 'idempotency-review-003',
      enable: true,
      fetchHosts: ['events.example.hu'],
      legalReviewStatus: 'approved' as const,
      robotsAllowed: true,
      pollIntervalMinutes: 360,
      minPublishQuality: 85,
    };

    await expect(repo.reviewSource({ rpc: userRpc } as never, input)).resolves.toEqual({
      source_id: 'src_2dca3e1d',
    });
    expect(adminRpc).not.toHaveBeenCalled();
    expect(userRpc).toHaveBeenCalledWith('admin_review_external_event_feed_source', expect.objectContaining({
      p_source_id: 'src_2dca3e1d',
      p_fetch_hosts: ['events.example.hu'],
      p_legal_review_status: 'approved',
      p_robots_allowed: true,
    }));
  });

  it('passes an explicit snapshot-completeness flag to the completion RPC', async () => {
    const adminRpc = vi.fn(async () => ({ data: true, error: null }));
    const repo = createEventFeedRepository({ rpc: adminRpc } as never);
    await repo.processor.completeRun({
      claim: {
        run_id: '11111111-1111-4111-8111-111111111111',
        source_id: 'src_2dca3e1d', endpoint_url: 'https://events.example.hu/feed.xml',
        publisher_name: 'Events', review_state: 'approved', enabled: true,
        legal_review_status: 'approved', robots_allowed: true, min_publish_quality: 80,
        fetch_hosts: ['events.example.hu'], poll_interval_minutes: 60,
        max_response_bytes: 2_097_152,
        lease_token: '22222222-2222-4222-8222-222222222222',
        lease_expires_at: '2026-08-25T09:00:00Z', run_action: 'sync',
      },
      status: 'succeeded',
      snapshotComplete: true,
    });

    expect(adminRpc).toHaveBeenCalledWith('complete_external_event_feed_run', expect.objectContaining({
      p_snapshot_complete: true,
    }));
  });

  it('retains only allowlisted database failure semantics', async () => {
    const userRpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'CAPABILITY_REQUIRED: internal sensitive detail' },
    }));
    const repo = createEventFeedRepository({ rpc: vi.fn() } as never);

    await expect(repo.reviewSource({ rpc: userRpc } as never, {
      sourceId: 'src_2dca3e1d', decision: 'disabled', reason: 'Pause for a new legal review.',
      requestId: 'request-review-004', idempotencyKey: 'idempotency-review-004', enable: false,
      fetchHosts: [], legalReviewStatus: 'pending', robotsAllowed: null,
    })).rejects.toMatchObject({
      name: 'EventFeedRepositoryError',
      failure: 'capability_required',
      message: 'EVENT_FEED_SOURCE_REVIEW_FAILED:capability_required',
    });
  });
});
