import type { User } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, getSupabaseAdmin, jsonResponse, type SupabaseAdminClient } from '../shared/providerFetch.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';
import {
  assertAllowedAdminBulkBodyKeys,
  chunkValues,
  missingRequestedIds,
  type AdminBulkMode,
} from './requestContract.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TARGETS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERROR_PATTERN = /^[A-Z0-9_]{3,120}$/;

type UserType = 'all' | 'real' | 'generated';
type HasOpenOwnedEvents = 'all' | 'yes' | 'no';
type Filters = {
  userType?: UserType;
  registeredOlderThanDays?: number | null;
  inactiveDays?: number | null;
  hasOpenOwnedEvents?: HasOpenOwnedEvents;
};
type Action = 'delete' | 'activate' | 'deactivate';

interface ProfileSelectionRow {
  id: string;
  user_id: string;
  user_origin?: string | null;
  is_active?: boolean | null;
  created_at: string;
}

interface ProfileReferenceRow {
  id: string;
  user_id: string;
  user_origin?: string | null;
  is_active?: boolean | null;
}

interface OwnedEventRow {
  id: string;
  created_by?: string | null;
  organizer_id?: string | null;
  is_active?: boolean | null;
}

interface JobSnapshot {
  job_id: string;
  status: string;
  affected: number;
  failures: number;
  target_count: number;
  rollback_supported: boolean;
  items?: Array<{ target_user_id: string; status: string; error_code?: string | null }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number, min = 0): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function requestId(req: Request) {
  const supplied = req.headers.get('x-request-id')?.trim();
  return supplied && /^[A-Za-z0-9._:-]{8,200}$/.test(supplied) ? supplied : crypto.randomUUID();
}

async function readBody(req: Request) {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) throw new Error('INVALID_BODY');
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_BODY') throw error;
    throw new Error('INVALID_JSON');
  }
}

function normalizeFilters(value: unknown): Filters {
  if (value === undefined) return {};
  if (!isObject(value)) throw new Error('INVALID_FILTERS');
  const allowed = new Set(['userType', 'registeredOlderThanDays', 'inactiveDays', 'hasOpenOwnedEvents']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('INVALID_FILTERS');
  const userType = value.userType ?? 'all';
  const hasOpenOwnedEvents = value.hasOpenOwnedEvents ?? 'all';
  if (!['all', 'real', 'generated'].includes(String(userType))
      || !['all', 'yes', 'no'].includes(String(hasOpenOwnedEvents))) throw new Error('INVALID_FILTERS');
  const day = (candidate: unknown) => {
    if (candidate === undefined || candidate === null || candidate === '') return null;
    if (!Number.isInteger(candidate) || Number(candidate) < 1 || Number(candidate) > 3650) {
      throw new Error('INVALID_FILTERS');
    }
    return Number(candidate);
  };
  return {
    userType: userType as UserType,
    registeredOlderThanDays: day(value.registeredOlderThanDays),
    inactiveDays: day(value.inactiveDays),
    hasOpenOwnedEvents: hasOpenOwnedEvents as HasOpenOwnedEvents,
  };
}

function normalizeIds(value: unknown, label: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TARGETS
      || value.some((item) => typeof item !== 'string' || !UUID_PATTERN.test(item))) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) throw new Error(`DUPLICATE_${label.toUpperCase()}`);
  return unique;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function requireCapability(admin: SupabaseAdminClient, userId: string, capability: string) {
  const { data, error } = await admin.rpc('admin_has_capability', {
    _user_id: userId,
    _capability_key: capability,
  });
  if (error) throw new Error('CAPABILITY_CHECK_FAILED');
  if (data !== true) throw new Error('CAPABILITY_REQUIRED');
}

async function listAllAuthUsers(admin: SupabaseAdminClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error('AUTH_USER_LIST_FAILED');
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < 500) return users;
  }
  throw new Error('AUTH_USER_LIST_LIMIT_EXCEEDED');
}

async function targetDigest(admin: SupabaseAdminClient, userIds: string[]) {
  const { data, error } = await admin.rpc('admin_bulk_target_digest', { _target_user_ids: userIds });
  if (error || !boundedText(data, 32, 32)) throw new Error('TARGET_DIGEST_FAILED');
  return data;
}

async function previewSelection(admin: SupabaseAdminClient, filters: Filters) {
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id,user_id,user_origin,is_active,created_at')
    .limit(10_000);
  if (error) throw new Error('PROFILE_PREVIEW_FAILED');

  const authUsers = await listAllAuthUsers(admin);
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  let filtered = ((profiles || []) as ProfileSelectionRow[]).filter((profile) => Boolean(profile.user_id));

  if (filters.userType && filters.userType !== 'all') {
    filtered = filtered.filter((profile) => (profile.user_origin || 'real') === filters.userType);
  }
  if (filters.registeredOlderThanDays) {
    const threshold = daysAgo(filters.registeredOlderThanDays);
    filtered = filtered.filter((profile) => new Date(profile.created_at) <= threshold);
  }
  if (filters.inactiveDays) {
    const threshold = daysAgo(filters.inactiveDays);
    filtered = filtered.filter((profile) => {
      const lastSignIn = authMap.get(profile.user_id)?.last_sign_in_at;
      return !lastSignIn || new Date(lastSignIn) <= threshold;
    });
  }
  if (filters.hasOpenOwnedEvents && filters.hasOpenOwnedEvents !== 'all') {
    const ownerIds = filtered.map((profile) => profile.user_id);
    if (ownerIds.length) {
      const events: OwnedEventRow[] = [];
      for (const ownerBatch of chunkValues(ownerIds, 200)) {
        const [createdByResult, organizerResult] = await Promise.all([
          admin.from('events')
            .select('id,created_by,organizer_id,is_active')
            .in('created_by', ownerBatch),
          admin.from('events')
            .select('id,created_by,organizer_id,is_active')
            .in('organizer_id', ownerBatch),
        ]);
        if (createdByResult.error || organizerResult.error) throw new Error('OWNED_EVENT_PREVIEW_FAILED');
        events.push(
          ...((createdByResult.data || []) as OwnedEventRow[]),
          ...((organizerResult.data || []) as OwnedEventRow[]),
        );
      }
      const openOwnerIds = new Set(events
        .filter((event) => event.is_active !== false)
        .flatMap((event) => [event.created_by, event.organizer_id])
        .filter((ownerId): ownerId is string => Boolean(ownerId)));
      filtered = filtered.filter((profile) => filters.hasOpenOwnedEvents === 'yes'
        ? openOwnerIds.has(profile.user_id)
        : !openOwnerIds.has(profile.user_id));
    }
  }

  const totalMatched = filtered.length;
  const bounded = filtered.slice(0, MAX_TARGETS);
  const selectedUserIds = bounded.map((profile) => profile.user_id);
  const selectedProfileIds = bounded.map((profile) => profile.id);
  return {
    selectedUserIds,
    selectedProfileIds,
    selectedCount: selectedUserIds.length,
    totalMatched,
    truncated: totalMatched > MAX_TARGETS,
    selectionToken: selectedUserIds.length ? await targetDigest(admin, selectedUserIds) : null,
  };
}

async function resolveProfiles(
  admin: SupabaseAdminClient,
  profileIds: string[],
  userIds: string[],
): Promise<ProfileReferenceRow[]> {
  const rows: ProfileReferenceRow[] = [];
  if (profileIds.length) {
    const { data, error } = await admin.from('profiles')
      .select('id,user_id,user_origin,is_active').in('id', profileIds);
    if (error) throw new Error('PROFILE_RESOLUTION_FAILED');
    const profileRows = (data || []) as ProfileReferenceRow[];
    if (missingRequestedIds(profileIds, profileRows.map((row) => row.id)).length > 0) {
      throw new Error('TARGET_PROFILE_MISMATCH');
    }
    rows.push(...profileRows);
  }
  if (userIds.length) {
    const { data, error } = await admin.from('profiles')
      .select('id,user_id,user_origin,is_active').in('user_id', userIds);
    if (error) throw new Error('PROFILE_RESOLUTION_FAILED');
    const userRows = (data || []) as ProfileReferenceRow[];
    if (missingRequestedIds(userIds, userRows.map((row) => row.user_id)).length > 0) {
      throw new Error('TARGET_PROFILE_MISMATCH');
    }
    rows.push(...userRows);
  }
  const map = new Map(rows.filter((row) => row.user_id).map((row) => [row.user_id, row]));
  if (map.size === 0 || rows.some((row) => !row.user_id)) throw new Error('TARGET_PROFILE_MISMATCH');
  return [...map.values()].sort((left, right) => left.user_id.localeCompare(right.user_id));
}

async function markItem(
  admin: SupabaseAdminClient,
  jobId: string,
  userId: string,
  status: 'succeeded' | 'failed' | 'skipped',
  errorCode: string | null,
  after: Record<string, unknown>,
) {
  const normalized = errorCode && SAFE_ERROR_PATTERN.test(errorCode) ? errorCode : 'BULK_ITEM_FAILED';
  const { error } = await admin.rpc('admin_mark_bulk_user_job_item', {
    _job_id: jobId,
    _target_user_id: userId,
    _status: status,
    _error_code: status === 'failed' ? normalized : null,
    _after_redacted: after,
  });
  if (error) throw new Error('JOB_ITEM_AUDIT_FAILED');
}

function normalizedDeleteError(message: string) {
  const upper = message.toUpperCase();
  if (upper.includes('FOREIGN KEY') || upper.includes('CONSTRAINT')) return 'RETENTION_DEPENDENCY_BLOCKED';
  if (upper.includes('NOT FOUND')) return 'AUTH_USER_NOT_FOUND';
  return 'AUTH_DELETE_FAILED';
}

async function loadJob(admin: SupabaseAdminClient, actorId: string, jobId: string) {
  const { data, error } = await admin.rpc('admin_get_bulk_user_job', {
    _actor_id: actorId,
    _job_id: jobId,
  });
  if (error || !isObject(data)) throw new Error('JOB_STATUS_FAILED');
  return data as unknown as JobSnapshot;
}

async function executeJob(
  admin: SupabaseAdminClient,
  actorId: string,
  jobId: string,
  action: Action,
  profiles: ProfileReferenceRow[],
) {
  const snapshot = await loadJob(admin, actorId, jobId);
  if (['completed', 'partial', 'failed', 'cancelled'].includes(snapshot.status)) return snapshot;
  const completed = new Map((snapshot.items || []).map((item) => [item.target_user_id, item.status]));

  if (action === 'activate' || action === 'deactivate') {
    const pendingIds = profiles.map((profile) => profile.user_id)
      .filter((userId) => completed.get(userId) !== 'succeeded');
    if (pendingIds.length) {
      const nextActive = action === 'activate';
      const { error } = await admin.from('profiles').update({ is_active: nextActive }).in('user_id', pendingIds);
      await Promise.all(pendingIds.map((userId) => markItem(
        admin,
        jobId,
        userId,
        error ? 'failed' : 'succeeded',
        error ? 'PROFILE_STATUS_UPDATE_FAILED' : null,
        error ? {} : { is_active: nextActive },
      )));
    }
  } else {
    for (const profile of profiles) {
      if (completed.get(profile.user_id) === 'succeeded') continue;
      try {
        const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(profile.user_id);
        if (authLookupError || !authData.user) {
          await markItem(admin, jobId, profile.user_id, 'failed', 'AUTH_USER_NOT_FOUND', {});
          continue;
        }
        const evidence = {
          user_id: profile.user_id,
          email: authData.user.email || `${profile.user_id}@unknown.local`,
          account_created_at: authData.user.created_at || null,
          deletion_reason: `admin_bulk_generated:${jobId}`,
        };
        const { error: deleteError } = await admin.auth.admin.deleteUser(profile.user_id);
        if (deleteError) {
          await markItem(admin, jobId, profile.user_id, 'failed', normalizedDeleteError(deleteError.message), {});
          continue;
        }
        const { error: evidenceError } = await admin.from('account_deletions').insert(evidence);
        await markItem(admin, jobId, profile.user_id, 'succeeded', null, {
          auth_deleted: true,
          deletion_evidence_recorded: !evidenceError,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markItem(admin, jobId, profile.user_id, 'failed', normalizedDeleteError(message), {});
      }
    }
  }

  const { data, error } = await admin.rpc('admin_finalize_bulk_user_job', { _job_id: jobId });
  if (error || !isObject(data)) throw new Error('JOB_FINALIZE_FAILED');
  return data as unknown as JobSnapshot;
}

function errorStatus(code: string) {
  if (['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code)) return 401;
  if (code.includes('CAPABILITY') || code.includes('APPROVAL')) return 403;
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (code.includes('NOT_FOUND')) return 404;
  if (code.startsWith('INVALID_') || code.startsWith('DUPLICATE_') || code.includes('MISMATCH')) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const request_id = requestId(req);
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id }, 405);

  try {
    const body = await readBody(req);
    const mode = body.mode;
    if (!['preview', 'apply', 'status'].includes(String(mode))) throw new Error('INVALID_MODE');
    const admin = getSupabaseAdmin(req);
    const { user: operator } = await requireAuthenticatedUserClient(req);

    if (mode === 'status') {
      assertAllowedAdminBulkBodyKeys(body, mode as AdminBulkMode);
      if (!boundedText(body.jobId, 36, 36) || !UUID_PATTERN.test(body.jobId)) throw new Error('INVALID_JOB_ID');
      const job = await loadJob(admin, operator.id, body.jobId);
      return jsonResponse({ ...job, request_id });
    }

    const reason = boundedText(body.reason, 1000, 3) ? body.reason.trim() : '';
    if (!reason) throw new Error('INVALID_REASON');
    if (mode === 'preview') {
      assertAllowedAdminBulkBodyKeys(body, mode as AdminBulkMode);
      await requireCapability(admin, operator.id, 'users.search_masked');
      const filters = normalizeFilters(body.filters);
      const preview = await previewSelection(admin, filters);
      const { error: auditError } = await admin.rpc('admin_record_audit_event', {
        _actor_id: operator.id,
        _capability_key: 'users.search_masked',
        _action: 'bulk_users.preview',
        _target_type: 'user_batch',
        _target_id: preview.selectionToken,
        _reason: reason,
        _request_id: request_id,
        _idempotency_key: `bulk-preview:${request_id}`,
        _outcome: 'succeeded',
        _safe_metadata: {
          selected_count: preview.selectedCount,
          total_matched: preview.totalMatched,
          truncated: preview.truncated,
          filters,
        },
      });
      if (auditError) throw new Error('PREVIEW_AUDIT_FAILED');
      return jsonResponse({ ...preview, request_id });
    }

    assertAllowedAdminBulkBodyKeys(body, mode as AdminBulkMode);

    const action = body.action;
    if (!['delete', 'activate', 'deactivate'].includes(String(action))) throw new Error('INVALID_ACTION');
    if (!boundedText(body.idempotencyKey, 240, 8)) throw new Error('INVALID_IDEMPOTENCY_KEY');
    const profileIds = normalizeIds(body.profileIds, 'profile_ids');
    const userIds = normalizeIds(body.userIds, 'user_ids');
    if (!profileIds.length && !userIds.length) throw new Error('INVALID_TARGETS');
    const profiles = await resolveProfiles(admin, profileIds, userIds);
    if (profiles.length > MAX_TARGETS) throw new Error('INVALID_TARGETS');
    const resolvedUserIds = profiles.map((profile) => profile.user_id);
    const selectionToken = await targetDigest(admin, resolvedUserIds);
    const requiredCapability = action === 'delete' ? 'bulk.destructive' : 'users.suspend';
    await requireCapability(admin, operator.id, requiredCapability);

    const expectedConfirmation = action === 'delete'
      ? `DELETE ${profiles.length} GENERATED USERS`
      : `${String(action).toUpperCase()} ${profiles.length} USERS`;
    if (body.confirmation !== expectedConfirmation) {
      return jsonResponse({
        error: 'Confirmation phrase mismatch.',
        code: 'CONFIRMATION_REQUIRED',
        expected_confirmation: expectedConfirmation,
        request_id,
      }, 400);
    }

    let approvalRequestId = boundedText(body.approvalRequestId, 36, 36) && UUID_PATTERN.test(body.approvalRequestId)
      ? body.approvalRequestId
      : null;
    if (action === 'delete') {
      if (profiles.some((profile) => profile.user_origin !== 'generated')) {
        return jsonResponse({
          error: 'Bulk deletion is restricted to generated users. Real-user deletion must use the data-subject request workflow.',
          code: 'REAL_USER_DELETE_FORBIDDEN',
          request_id,
        }, 403);
      }
      if (!approvalRequestId) {
        const { data, error } = await admin.rpc('admin_request_approval', {
          _actor_id: operator.id,
          _capability_key: 'bulk.destructive',
          _action: 'bulk_users.delete',
          _target_type: 'user_batch',
          _target_id: selectionToken,
          _safe_action_payload: {
            target_count: profiles.length,
            target_digest: selectionToken,
            generated_only: true,
          },
          _reason: reason,
          _request_id: request_id,
          _idempotency_key: `${body.idempotencyKey}:approval`,
        });
        if (error || !boundedText(data, 36, 36)) throw new Error('APPROVAL_REQUEST_FAILED');
        approvalRequestId = data;
        return jsonResponse({
          pending_approval: true,
          approval_request_id: approvalRequestId,
          selection_token: selectionToken,
          message: 'A different authorized operator must approve this exact generated-user target set.',
          request_id,
        }, 202);
      }
    }

    const { data: jobId, error: jobError } = await admin.rpc('admin_create_bulk_user_job', {
      _actor_id: operator.id,
      _action: action,
      _target_user_ids: resolvedUserIds,
      _target_filter_snapshot: isObject(body.filterSnapshot) ? body.filterSnapshot : {},
      _reason: reason,
      _request_id: request_id,
      _idempotency_key: body.idempotencyKey.trim(),
      _approval_request_id: approvalRequestId,
    });
    if (jobError || !boundedText(jobId, 36, 36)) {
      const approvalRejected = action === 'delete' && Boolean(approvalRequestId);
      return jsonResponse({
        error: approvalRejected ? 'Approval is missing, expired, already consumed, or does not match this target set.' : 'Bulk job rejected.',
        code: approvalRejected ? 'APPROVAL_MISMATCH' : 'JOB_CREATE_FAILED',
        request_id,
      }, approvalRejected ? 409 : 400);
    }

    const result = await executeJob(admin, operator.id, jobId, action as Action, profiles);
    return jsonResponse({ ...result, request_id });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    console.error(JSON.stringify({ event: 'admin_bulk_user_actions_failed', request_id, code }));
    return jsonResponse({ error: 'Admin bulk operation failed.', code, request_id }, errorStatus(code));
  }
});
