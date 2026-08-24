import { verifyEventFeedCronRequest } from './cronAuth.ts';
import { parseEventFeedRequest, EventFeedRequestError } from './requestContract.ts';
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
  requireAdminUser: (request: Request) => Promise<{ id: string }>;
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
}

async function processClaims(
  claims: EventFeedClaim[],
  dependencies: EventFeedHandlerDependencies,
) {
  const processClaim = dependencies.processClaim ?? processEventFeedClaim;
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < claims.length; index += 2) {
    const batch = claims.slice(index, index + 2);
    const settled = await Promise.allSettled(batch.map((claim) => processClaim(
      claim, dependencies.repository.processor, { resolveHost: dependencies.resolveHost },
    )));
    settled.forEach((result, resultIndex) => {
      const claim = batch[resultIndex];
      if (result.status === 'fulfilled') results.push(result.value);
      else results.push({ source_id: claim.source_id, status: 'failed' });
    });
  }
  return results;
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
      const rawBody = await request.clone().text();
      const body = await parseEventFeedRequest(request);
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
        const claims = await dependencies.repository.claimDue(body.limit, `cron:${body.nonce}`);
        const results = await processClaims(claims, dependencies);
        const failures = results.filter((result) => result.status === 'failed').length;
        dependencies.logEvent(failures ? 'warn' : 'info', 'event_feed_sync_due', correlationId, {
          claimed_count: claims.length, failure_count: failures,
          duration_ms: Math.round(nowMs() - startedAt),
        });
        return json({ ok: failures === 0, results }, failures ? 207 : 200, correlationId);
      }

      const actor = await dependencies.requireAdminUser(request);
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
