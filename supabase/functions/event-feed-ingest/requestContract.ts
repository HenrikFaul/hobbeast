export const EVENT_FEED_REQUEST_MAX_BYTES = 16 * 1024;

export type EventFeedAction = 'status' | 'probe_source' | 'sync_source' | 'review_source' | 'sync_due';
export type EventFeedReviewDecision = 'approved' | 'disabled' | 'rejected';

export interface EventFeedRequest {
  action: EventFeedAction;
  source_id?: string;
  decision?: EventFeedReviewDecision;
  reason?: string;
  request_id?: string;
  idempotency_key?: string;
  query?: string;
  page: number;
  limit: number;
  issued_at?: number;
  nonce?: string;
  enable?: boolean;
  fetch_hosts?: string[];
  legal_review_status?: 'approved';
  robots_allowed?: true;
  poll_interval_minutes?: number;
  min_publish_quality?: number;
}

export class EventFeedRequestError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'EventFeedRequestError';
  }
}

const ACTIONS = new Set<EventFeedAction>(['status', 'probe_source', 'sync_source', 'review_source', 'sync_due']);
const DECISIONS = new Set<EventFeedReviewDecision>(['approved', 'disabled', 'rejected']);
const ALLOWED_FIELDS = new Set([
  'action', 'source_id', 'decision', 'reason', 'request_id', 'idempotency_key', 'query', 'page', 'limit',
  'issued_at', 'nonce',
  'enable', 'fetch_hosts', 'legal_review_status', 'robots_allowed',
  'poll_interval_minutes', 'min_publish_quality',
]);

function boundedString(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function parseEventFeedRequest(request: Request): Promise<EventFeedRequest> {
  if (request.method !== 'POST') throw new EventFeedRequestError('METHOD_NOT_ALLOWED', 405);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > EVENT_FEED_REQUEST_MAX_BYTES) throw new EventFeedRequestError('REQUEST_TOO_LARGE', 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > EVENT_FEED_REQUEST_MAX_BYTES) {
    throw new EventFeedRequestError('REQUEST_TOO_LARGE', 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    throw new EventFeedRequestError('INVALID_JSON');
  }

  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new EventFeedRequestError('INVALID_REQUEST_FIELD');
  }

  const action = boundedString(body.action, 40) as EventFeedAction;
  if (!ACTIONS.has(action)) throw new EventFeedRequestError('UNKNOWN_ACTION');
  const sourceId = boundedString(body.source_id, 64);
  if (['probe_source', 'sync_source', 'review_source'].includes(action) && !/^src_[a-f0-9]{8}$/.test(sourceId)) {
    throw new EventFeedRequestError('INVALID_SOURCE_ID');
  }

  const decision = boundedString(body.decision, 32) as EventFeedReviewDecision;
  const reason = boundedString(body.reason, 500);
  const requestId = boundedString(body.request_id, 100);
  const idempotencyKey = boundedString(body.idempotency_key, 100);
  if (action === 'review_source') {
    if (!DECISIONS.has(decision)) throw new EventFeedRequestError('INVALID_REVIEW_DECISION');
    if (reason.length < 8) throw new EventFeedRequestError('REVIEW_REASON_REQUIRED');
    if (requestId.length < 8 || idempotencyKey.length < 8) throw new EventFeedRequestError('REVIEW_AUDIT_KEYS_REQUIRED');
    if (decision === 'approved') {
      const hosts = Array.isArray(body.fetch_hosts)
        ? body.fetch_hosts.filter((value): value is string => typeof value === 'string')
          .map((host) => host.trim().toLowerCase()).filter(Boolean).slice(0, 5)
        : [];
      if (
        hosts.length === 0
        || hosts.some((host) => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))
        || body.legal_review_status !== 'approved'
        || body.robots_allowed !== true
      ) {
        throw new EventFeedRequestError('APPROVAL_EVIDENCE_REQUIRED');
      }
    }
  }
  const issuedAt = Math.trunc(Number(body.issued_at) || 0);
  const nonce = boundedString(body.nonce, 64);
  if (action === 'sync_due' && (
    issuedAt < 1_000_000_000
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(nonce)
  )) {
    throw new EventFeedRequestError('INVALID_CRON_ENVELOPE');
  }

  return {
    action,
    source_id: sourceId || undefined,
    decision: decision || undefined,
    reason: reason || undefined,
    request_id: requestId || undefined,
    idempotency_key: idempotencyKey || undefined,
    query: boundedString(body.query, 100) || undefined,
    page: Math.max(1, Math.min(100, Math.trunc(Number(body.page) || 1))),
    limit: Math.max(1, Math.min(20, Math.trunc(Number(body.limit) || 10))),
    issued_at: issuedAt || undefined,
    nonce: nonce || undefined,
    enable: body.enable === true,
    fetch_hosts: Array.isArray(body.fetch_hosts)
      ? body.fetch_hosts.filter((value): value is string => typeof value === 'string')
        .map((host) => host.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : undefined,
    legal_review_status: body.legal_review_status === 'approved' ? 'approved' : undefined,
    robots_allowed: body.robots_allowed === true ? true : undefined,
    poll_interval_minutes: body.poll_interval_minutes === undefined
      ? undefined
      : Math.max(15, Math.min(10_080, Math.trunc(Number(body.poll_interval_minutes) || 0))),
    min_publish_quality: body.min_publish_quality === undefined
      ? undefined
      : Math.max(50, Math.min(100, Number(body.min_publish_quality) || 0)),
  };
}
