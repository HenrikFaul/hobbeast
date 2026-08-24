import type { SupabaseAdminClient } from '../shared/providerFetch.ts';
import type {
  EventFeedClaim,
  EventFeedCommitResult,
  EventFeedProcessorRepository,
} from './processor.ts';

type DatabaseClient = SupabaseAdminClient;

export type EventFeedRepositoryFailure =
  | 'not_found'
  | 'busy'
  | 'not_approved'
  | 'capability_required'
  | 'replay_rejected'
  | 'database_failure';

export class EventFeedRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly failure: EventFeedRepositoryFailure,
    readonly databaseCode: string | null = null,
  ) {
    super(`${operation}:${failure}`);
    this.name = 'EventFeedRepositoryError';
  }
}

function classifyDatabaseError(error: { code?: string; message?: string }): EventFeedRepositoryFailure {
  const message = String(error.message || '').toUpperCase();
  if (message.includes('CAPABILITY_REQUIRED')) return 'capability_required';
  if (message.includes('FEED_SOURCE_NOT_FOUND') || error.code === 'P0002') return 'not_found';
  if (message.includes('ALREADY_LEASED') || message.includes('LEASE_MISMATCH') || error.code === '55P03') return 'busy';
  if (
    message.includes('NOT_SYNCABLE')
    || message.includes('NOT_APPROVED')
    || message.includes('APPROVAL_EVIDENCE')
    || message.includes('HOST_NOT_APPROVED')
  ) return 'not_approved';
  return 'database_failure';
}

function databaseError(prefix: string, error: { code?: string; message?: string } | null) {
  if (error) throw new EventFeedRepositoryError(prefix, classifyDatabaseError(error), error.code || null);
}

function firstRow<T>(value: unknown): T {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') throw new Error('EVENT_FEED_DATABASE_RESPONSE_INVALID');
  return row as T;
}

export function createEventFeedRepository(admin: DatabaseClient) {
  const processorRepository: EventFeedProcessorRepository = {
    async storeRawPayload(input) {
      const { data, error } = await admin.rpc('store_external_event_feed_raw_payload', {
        p_source_id: input.claim.source_id,
        p_run_id: input.claim.run_id,
        p_lease_token: input.claim.lease_token,
        p_content_type: input.contentType,
        p_raw_body: input.rawBody,
        p_payload_sha256: input.payloadSha256,
      });
      databaseError('EVENT_FEED_RAW_STORE_FAILED', error);
      if (typeof data !== 'string') throw new Error('EVENT_FEED_RAW_STORE_RESPONSE_INVALID');
      return data;
    },

    async commitItem(input) {
      const { data, error } = await admin.rpc('commit_external_event_feed_item', {
        p_source_id: input.claim.source_id,
        p_run_id: input.claim.run_id,
        p_lease_token: input.claim.lease_token,
        p_source_item_id: input.sourceItemId,
        p_item: input.item,
        p_quality_score: input.qualityScore,
        p_quality_reasons: input.qualityReasons,
        p_raw_payload_id: input.rawPayloadId,
      });
      databaseError('EVENT_FEED_ITEM_COMMIT_FAILED', error);
      return firstRow<EventFeedCommitResult>(data);
    },

    async completeRun(input) {
      const { data, error } = await admin.rpc('complete_external_event_feed_run', {
        p_source_id: input.claim.source_id,
        p_run_id: input.claim.run_id,
        p_lease_token: input.claim.lease_token,
        p_status: input.status,
        p_http_status: input.httpStatus ?? null,
        p_etag: input.etag ?? null,
        p_last_modified: input.lastModified ?? null,
        p_discovered_count: input.discoveredCount ?? 0,
        p_quarantined_count: input.quarantinedCount ?? 0,
        p_published_count: input.publishedCount ?? 0,
        p_duplicate_count: input.duplicateCount ?? 0,
        p_error_kind: input.errorKind ?? null,
        p_error_code: input.errorCode ?? null,
        p_failure_sample_redacted: input.failureSampleRedacted ?? null,
      });
      databaseError('EVENT_FEED_RUN_COMPLETE_FAILED', error);
      return data;
    },
  };

  return {
    processor: processorRepository,

    async status(input: { query?: string; page: number; limit: number }) {
      const from = (input.page - 1) * input.limit;
      const to = from + input.limit - 1;
      let sourceQuery = admin
        .from('external_event_feed_sources')
        .select(
          'source_id,publisher_name,publisher_type,city,country_code,endpoint_url,original_endpoint_url,format,categories,review_state,legal_review_status,robots_allowed,enabled,health_status,last_checked_at,last_successful_parse_at,next_poll_at,poll_interval_minutes,min_publish_quality,consecutive_failures,last_error_code,fetch_hosts',
          { count: 'exact' },
        )
        .order('publisher_name')
        .range(from, to);
      if (input.query) sourceQuery = sourceQuery.ilike('publisher_name', `%${input.query.replace(/[%_]/g, '\\$&')}%`);

      const [sourcesResult, stateResult, runsResult, quarantineResult] = await Promise.all([
        sourceQuery,
        admin.from('external_event_feed_sources').select('source_id,review_state,enabled,health_status').limit(1000),
        admin.from('external_event_feed_runs')
          .select('id,source_id,action,status,http_status,discovered_count,quarantined_count,published_count,duplicate_count,error_code,started_at,finished_at')
          .order('started_at', { ascending: false }).limit(25),
        admin.from('external_event_feed_items').select('id', { count: 'exact', head: true }).eq('item_state', 'quarantined'),
      ]);
      databaseError('EVENT_FEED_SOURCE_LIST_FAILED', sourcesResult.error);
      databaseError('EVENT_FEED_SOURCE_SUMMARY_FAILED', stateResult.error);
      databaseError('EVENT_FEED_RUN_LIST_FAILED', runsResult.error);
      databaseError('EVENT_FEED_QUARANTINE_COUNT_FAILED', quarantineResult.error);
      const states = stateResult.data || [];
      return {
        summary: {
          total: states.length,
          pending_review: states.filter((source) => source.review_state === 'pending_review').length,
          approved: states.filter((source) => source.review_state === 'approved').length,
          enabled: states.filter((source) => source.enabled === true).length,
          healthy: states.filter((source) => source.health_status === 'healthy').length,
          quarantined_items: quarantineResult.count || 0,
        },
        sources: sourcesResult.data || [],
        runs: runsResult.data || [],
        pagination: { page: input.page, limit: input.limit, total: sourcesResult.count || 0 },
      };
    },

    async claimDue(limit: number, workerId: string) {
      const { data, error } = await admin.rpc('claim_external_event_feed_sources', {
        p_limit: limit, p_worker_id: workerId, p_lease_seconds: 600,
      });
      databaseError('EVENT_FEED_CLAIM_DUE_FAILED', error);
      return (Array.isArray(data) ? data : []) as EventFeedClaim[];
    },

    async claimSource(sourceId: string, workerId: string, probe: boolean) {
      const { data, error } = await admin.rpc('claim_external_event_feed_source', {
        p_source_id: sourceId, p_worker_id: workerId, p_lease_seconds: 600, p_probe: probe,
      });
      databaseError('EVENT_FEED_CLAIM_SOURCE_FAILED', error);
      return firstRow<EventFeedClaim>(data);
    },

    async consumeCronDispatch(input: { nonce: string; issuedAt: number; bodySha256: string }) {
      const { data, error } = await admin.rpc('consume_external_event_feed_cron_dispatch', {
        p_nonce: input.nonce, p_issued_at: input.issuedAt, p_body_sha256: input.bodySha256,
      });
      databaseError('EVENT_FEED_CRON_REPLAY_CHECK_FAILED', error);
      if (data !== true) throw new EventFeedRepositoryError(
        'EVENT_FEED_CRON_REPLAY_CHECK_FAILED', 'replay_rejected', null,
      );
    },

    async reviewSource(userClient: DatabaseClient, input: {
      sourceId: string;
      decision: 'approved' | 'disabled' | 'rejected';
      reason: string;
      requestId: string;
      idempotencyKey: string;
      enable: boolean;
      fetchHosts: string[];
      legalReviewStatus: 'approved' | 'pending';
      robotsAllowed: boolean | null;
      pollIntervalMinutes?: number;
      minPublishQuality?: number;
    }) {
      const decision = input.decision === 'approved' ? 'approve' : input.decision === 'rejected' ? 'reject' : 'pause';
      const { data, error } = await userClient.rpc('admin_review_external_event_feed_source', {
        p_source_id: input.sourceId,
        p_decision: decision,
        p_reason: input.reason,
        p_request_id: input.requestId,
        p_idempotency_key: input.idempotencyKey,
        p_enable: input.enable,
        p_fetch_hosts: input.fetchHosts,
        p_legal_review_status: input.legalReviewStatus,
        p_robots_allowed: input.robotsAllowed,
        p_poll_interval_minutes: input.pollIntervalMinutes ?? null,
        p_min_publish_quality: input.minPublishQuality ?? null,
      });
      databaseError('EVENT_FEED_SOURCE_REVIEW_FAILED', error);
      return data;
    },
  };
}

export type EventFeedRepository = ReturnType<typeof createEventFeedRepository>;
