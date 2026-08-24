import { verifyEventFeedCronRequest } from './cronAuth.ts';
import {
  EventFeedRequestError,
  parseEventFeedRawBody,
  readEventFeedRequestBody,
} from './requestContract.ts';
import { EventFeedRepositoryError, type EventFeedRepository } from './repository.ts';
import { processEventFeedClaim, type EventFeedClaim } from './processor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hobbeast-timestamp, x-hobbeast-nonce, x-hobbeast-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200, correlationId?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type UserClient = Parameters<EventFeedRepository['reviewSource']>[0];

export interface EventFeedHandlerDependencies {
  requireAuthenticatedUser: (request: Request) => Promise<{ id: string }>;
  createUserClient: (request: Request) => UserClient;
  repository: EventFeedRepository;
  processClaim?: typeof processEventFeedClaim;
  resolveHost?: (hostname: string) => Promise<string[]>;
  cronSecret: () => string;
  correlationIdFromRequest: (request: Request) => string;
  logEvent: (
    level: 'info' | 'warn' | 'error',
    event: string,
    correlationId: string,
    details: Record<string, unknown>,
  ) => void;
  nowMs?: () => number;
  syncDueBudgetMs?: number;
}

const SYNC_DUE_MAX_BATCHES = 15;
const SYNC_DUE_MAX_CLAIMS = 30;
const SYNC_DUE_CLAIM_UNIT = 2;
const SYNC_DUE_DEFAULT_BUDGET_MS = 60_000;
const SYNC_DUE_BATCH_START_HEADROOM_MS = 15_000;
const SYNC_DUE_FINALIZATION_HEADROOM_MS = 5_000;

async function processClaims(
  claims: EventFeedClaim[],
  dependencies: EventFeedHandlerDependencies,
  deadlineAt?: number,
) {
  const processClaim = dependencies.processClaim ?? processEventFeedClaim;
  const nowMs = dependencies.nowMs ?? Date.now;
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < claims.length; index += 2) {
    const batch = claims.slice(index, index + 2);
    const settled = await Promise.allSettled(batch.map(async (claim) => {
      const controller = deadlineAt === undefined ? null : new AbortController();
      const remaining = deadlineAt === undefined
        ? 0
        : Math.max(1, deadlineAt - nowMs() - SYNC_DUE_FINALIZATION_HEADROOM_MS);
      const timeout = controller ? setTimeout(() => controller.abort(), remaining) : null;
      try {
        return await processClaim(
          claim,
          dependencies.repository.processor,
          {
            resolveHost: dependencies.resolveHost,
            ...(controller ? { signal: controller.signal } : {}),
          },
        );
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    }));
    settled.forEach((result, resultIndex) => {
      const claim = batch[resultIndex];
      if (result.status === 'fulfilled') results.push(result.value);
      else results.push({ source_id: claim.source_id, status: 'failed' });
    });
  }
  return results;
}

async function drainDueClaims(
  batchSize: number,
  nonce: string,
  startedAt: number,
  dependencies: EventFeedHandlerDependencies,
) {
  const nowMs = dependencies.nowMs ?? Date.now;
  const budgetMs = Math.max(1, Math.min(
    dependencies.syncDueBudgetMs ?? SYNC_DUE_DEFAULT_BUDGET_MS,
    SYNC_DUE_DEFAULT_BUDGET_MS,
  ));
  const results: Array<Record<string, unknown>> = [];
  let batchCount = 0;
  let claimedCount = 0;
  let exhausted = false;
  let stopReason: 'exhausted' | 'batch_limit' | 'claim_limit' | 'time_budget' = 'exhausted';

  while (batchCount < SYNC_DUE_MAX_BATCHES && claimedCount < SYNC_DUE_MAX_CLAIMS) {
    if (
      batchCount > 0
      && nowMs() - startedAt >= Math.max(0, budgetMs - SYNC_DUE_BATCH_START_HEADROOM_MS)
    ) {
      stopReason = 'time_budget';
      break;
    }

    const remaining = SYNC_DUE_MAX_CLAIMS - claimedCount;
    // Claim only one concurrency unit at a time. This avoids leasing ten
    // sources that cannot all reach their bounded network work before the
    // invocation deadline; fast feeds can still drain up to 30 per call.
    const claimLimit = Math.min(batchSize, remaining, SYNC_DUE_CLAIM_UNIT);
    const batchNumber = batchCount + 1;
    const claims = await dependencies.repository.claimDue(
      claimLimit,
      `cron:${nonce}:batch-${batchNumber}`,
    );
    batchCount = batchNumber;
    claimedCount += claims.length;

    if (claims.length === 0) {
      exhausted = true;
      stopReason = 'exhausted';
      break;
    }

    results.push(...await processClaims(claims, dependencies, startedAt + budgetMs));
    if (claims.length < claimLimit) {
      exhausted = true;
      stopReason = 'exhausted';
      break;
    }
  }

  if (!exhausted && stopReason !== 'time_budget') {
    stopReason = claimedCount >= SYNC_DUE_MAX_CLAIMS ? 'claim_limit' : 'batch_limit';
  }
  const failures = results.filter((result) => result.status === 'failed').length;
  const continuationRequired = !exhausted;
  return {
    results,
    failures,
    drain: {
      batch_size: batchSize,
      claim_unit: Math.min(batchSize, SYNC_DUE_CLAIM_UNIT),
      batch_count: batchCount,
      claimed_count: claimedCount,
      processed_count: results.length,
      failure_count: failures,
      exhausted,
      continuation_required: continuationRequired,
      stop_reason: stopReason,
      continuation: continuationRequired
        ? {
          action: 'sync_due' as const,
          limit: batchSize,
          requires_fresh_signed_dispatch: true,
        }
        : null,
    },
  };
}

function publicError(error: unknown) {
  if (error instanceof EventFeedRequestError) return { status: error.status, code: error.code };
  if (error instanceof EventFeedRepositoryError) {
    if (error.failure === 'not_found') return { status: 404, code: 'FEED_SOURCE_NOT_FOUND' };
    if (error.failure === 'busy') return { status: 409, code: 'FEED_SOURCE_BUSY' };
    if (error.failure === 'not_approved') return { status: 422, code: 'FEED_SOURCE_NOT_APPROVED' };
    if (error.failure === 'capability_required') return { status: 403, code: 'AUTHORIZATION_FAILED' };
    if (error.failure === 'replay_rejected') return { status: 401, code: 'AUTHORIZATION_FAILED' };
    return { status: 503, code: 'EVENT_FEED_OPERATION_FAILED' };
  }
  const message = error instanceof Error ? error.message : '';
  if (message === 'CRON_AUTH_FAILED' || message.includes('authorization') || message.includes('Unauthorized')) {
    return { status: 401, code: 'AUTHORIZATION_FAILED' };
  }
  if (message.includes('Admin access') || message.includes('CAPABILITY_REQUIRED')) {
    return { status: 403, code: 'AUTHORIZATION_FAILED' };
  }
  if (message.includes('NOT_FOUND')) return { status: 404, code: 'FEED_SOURCE_NOT_FOUND' };
  if (message.includes('ALREADY_LEASED') || message.includes('LEASE')) {
    return { status: 409, code: 'FEED_SOURCE_BUSY' };
  }
  if (message.includes('APPROVAL') || message.includes('NOT_SYNCABLE') || message.includes('NOT_APPROVED')) {
    return { status: 422, code: 'FEED_SOURCE_NOT_APPROVED' };
  }
  return { status: 503, code: 'EVENT_FEED_OPERATION_FAILED' };
}

export function createEventFeedHandler(dependencies: EventFeedHandlerDependencies) {
  const nowMs = dependencies.nowMs ?? Date.now;
  return async (request: Request) => {
    const correlationId = dependencies.correlationIdFromRequest(request);
    const startedAt = nowMs();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    let action = 'unknown';
    try {
      const rawBody = await readEventFeedRequestBody(request);
      const body = parseEventFeedRawBody(rawBody);
      action = body.action;

      if (body.action === 'sync_due') {
        const timestampHeader = request.headers.get('x-hobbeast-timestamp') || '';
        const nonceHeader = request.headers.get('x-hobbeast-nonce') || '';
        const signatureValid = body.issued_at === Number(timestampHeader)
          && body.nonce === nonceHeader
          && await verifyEventFeedCronRequest({
            request,
            rawBody,
            secret: dependencies.cronSecret(),
            nowMs: nowMs(),
          });
        if (!signatureValid || !body.nonce || !body.issued_at) throw new Error('CRON_AUTH_FAILED');
        await dependencies.repository.consumeCronDispatch({
          nonce: body.nonce,
          issuedAt: body.issued_at,
          bodySha256: await sha256(rawBody),
        });
        const { results, failures, drain } = await drainDueClaims(
          body.limit,
          body.nonce,
          startedAt,
          dependencies,
        );
        dependencies.logEvent(failures || drain.continuation_required ? 'warn' : 'info', 'event_feed_sync_due', correlationId, {
          batch_count: drain.batch_count,
          claimed_count: drain.claimed_count,
          processed_count: drain.processed_count,
          failure_count: failures,
          exhausted: drain.exhausted,
          continuation_required: drain.continuation_required,
          stop_reason: drain.stop_reason,
          duration_ms: Math.round(nowMs() - startedAt),
        });
        const status = failures ? 207 : drain.continuation_required ? 202 : 200;
        return json({ ok: failures === 0, results, drain }, status, correlationId);
      }

      const actor = await dependencies.requireAuthenticatedUser(request);
      await dependencies.repository.requireProviderManager(actor.id);
      if (body.action === 'status') {
        const result = await dependencies.repository.status({ query: body.query, page: body.page, limit: body.limit });
        return json(result, 200, correlationId);
      }

      if (body.action === 'review_source') {
        const source = await dependencies.repository.reviewSource(dependencies.createUserClient(request), {
          sourceId: body.source_id!,
          decision: body.decision!,
          reason: body.reason!,
          requestId: body.request_id!,
          idempotencyKey: body.idempotency_key!,
          enable: body.enable === true,
          fetchHosts: body.fetch_hosts || [],
          legalReviewStatus: body.legal_review_status || 'pending',
          robotsAllowed: body.robots_allowed ?? null,
          pollIntervalMinutes: body.poll_interval_minutes,
          minPublishQuality: body.min_publish_quality,
        });
        return json({ ok: true, source }, 200, correlationId);
      }

      const probe = body.action === 'probe_source';
      const claim = await dependencies.repository.claimSource(
        body.source_id!, `admin:${actor.id}`, probe,
      );
      const results = await processClaims([claim], dependencies);
      const failed = results[0]?.status === 'failed';
      return json({ ok: !failed, results }, failed ? 502 : 200, correlationId);
    } catch (error) {
      const normalized = publicError(error);
      dependencies.logEvent(normalized.status >= 500 ? 'error' : 'warn', 'event_feed_request', correlationId, {
        action, status: normalized.status, code: normalized.code,
        duration_ms: Math.round(nowMs() - startedAt),
      });
      return json({ error: normalized.code }, normalized.status, correlationId);
    }
  };
}
