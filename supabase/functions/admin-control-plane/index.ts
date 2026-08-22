import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuthenticatedUser } from '../shared/userAuth.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse, resolveInternalSupabaseUrl } from '../shared/providerFetch.ts';

const MAX_BODY_BYTES = 64 * 1024;
const ACTIONS = new Set([
  'capabilities', 'overview', 'list_operations', 'operation_history', 'transition_operation',
  'refresh_operations', 'list_audit', 'search_users', 'list_user_profiles', 'update_user_profile',
  'list_approvals', 'request_approval',
  'decide_approval', 'set_operator_role',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
}

function integer(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function onlyKeys(body: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
}

async function readBody(req: Request) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed)) throw new Error('INVALID_BODY');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_BODY') throw error;
    throw new Error('INVALID_JSON');
  }
}

async function hasCapability(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, capability: string) {
  const { data, error } = await admin.rpc('admin_has_capability', {
    _user_id: userId, _capability_key: capability,
  });
  if (error) throw new Error('CAPABILITY_CHECK_FAILED');
  return data === true;
}

async function requireCapability(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, capability: string) {
  if (!await hasCapability(admin, userId, capability)) throw new Error('CAPABILITY_REQUIRED');
}

async function audit(
  admin: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  capability: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string,
  requestId: string,
  idempotencyKey: string,
  outcome: string,
  safeMetadata: Record<string, unknown> = {},
) {
  const { error } = await admin.rpc('admin_record_audit_event', {
    _actor_id: actorId, _capability_key: capability, _action: action,
    _target_type: targetType, _target_id: targetId, _reason: reason,
    _request_id: requestId, _idempotency_key: idempotencyKey, _outcome: outcome,
    _safe_metadata: safeMetadata, _before_redacted: null, _after_redacted: null,
    _approval_request_id: null, _error_code: null,
  });
  if (error) throw new Error('AUDIT_WRITE_FAILED');
}

function requireReason(body: Record<string, unknown>) {
  if (!boundedText(body.reason, 1000, 3)) throw new Error('REASON_REQUIRED');
  return body.reason.trim();
}

function idempotency(body: Record<string, unknown>, requestId: string, prefix: string) {
  const key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : `${prefix}:${requestId}`;
  if (key.length < 8 || key.length > 240) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

function maskDisplayName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (text.length <= 2) return `${text[0] || ''}*`;
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}

async function safeCount(promise: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const result = await promise;
    return result.error ? { available: false, count: null } : { available: true, count: result.count || 0 };
  } catch {
    return { available: false, count: null };
  }
}

async function buildOverview(admin: ReturnType<typeof getSupabaseAdmin>, req: Request) {
  const [openOps, breachedOps, deadLetters, failedNotifications, stalledAi, openModeration, financialExceptions] = await Promise.all([
    safeCount(admin.from('operations_inbox_items').select('id', { count: 'exact', head: true }).in('state', ['open', 'acknowledged', 'in_progress', 'blocked'])),
    safeCount(admin.from('operations_inbox_items').select('id', { count: 'exact', head: true }).in('state', ['open', 'acknowledged', 'in_progress', 'blocked']).lt('sla_target_at', new Date().toISOString())),
    safeCount(admin.from('notifications').select('id', { count: 'exact', head: true }).eq('delivery_status', 'dead_letter')),
    safeCount(admin.from('notifications').select('id', { count: 'exact', head: true }).eq('delivery_status', 'failed')),
    safeCount(admin.from('ai_event_proposals').select('id', { count: 'exact', head: true }).in('status', ['draft', 'review']).lt('updated_at', new Date(Date.now() - 48 * 60 * 60_000).toISOString())),
    safeCount(admin.from('moderation_cases').select('id', { count: 'exact', head: true }).not('status', 'in', '(closed,actioned)')),
    safeCount(admin.from('financial_exception_queue').select('id', { count: 'exact', head: true }).in('state', ['open', 'investigating'])),
  ]);
  const { data: providers, error: providerError } = await admin.from('external_provider_state')
    .select('provider,enabled,circuit_state,consecutive_failures,last_success_at,last_error_at,last_error_kind,last_error_code,updated_at')
    .order('provider');
  const { data: flags, error: flagError } = await admin.from('feature_flags')
    .select('key,enabled,rollout_percentage,owner,expires_at,updated_at').order('key');
  let projectHost: string | null = null;
  try { projectHost = new URL(resolveInternalSupabaseUrl(req)).host; } catch { /* surfaced as unavailable below */ }
  return {
    operations: { open: openOps, sla_breached: breachedOps },
    notifications: { dead_letter: deadLetters, failed: failedNotifications },
    ai_proposals: { stalled: stalledAi, auto_publish_enabled: false },
    moderation: { open: openModeration },
    financial: { open: financialExceptions },
    providers: providerError ? { available: false, items: [] } : { available: true, items: providers || [] },
    feature_flags: flagError ? { available: false, items: [] } : { available: true, items: flags || [] },
    runtime: {
      core_project_host: projectHost,
      project_assertion_available: projectHost !== null,
      build_version: Deno.env.get('APP_VERSION') || null,
      migration_version: null,
      migration_version_evidence: 'not_exposed_by_runtime',
    },
  };
}

function mapError(error: unknown) {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  if (code === 'Missing authorization token.' || code.startsWith('Unauthorized request:')) return [401, 'UNAUTHORIZED'] as const;
  if (code === 'Admin access required.' || code === 'CAPABILITY_REQUIRED') return [403, code] as const;
  if (['BODY_TOO_LARGE', 'INVALID_JSON', 'INVALID_BODY', 'REASON_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED'].includes(code)) return [400, code] as const;
  return [500, code] as const;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405);
  const requestId = crypto.randomUUID();
  try {
    const body = await readBody(req);
    const action = typeof body.action === 'string' ? body.action : 'overview';
    if (!ACTIONS.has(action)) return jsonResponse({ error: 'Unknown action.', code: 'INVALID_ACTION', request_id: requestId }, 400);
    const admin = getSupabaseAdmin(req);
    const { user: operator } = await requireAuthenticatedUser(req);

    if (action === 'capabilities') {
      const { data: roles, error: roleError } = await admin.from('admin_operator_roles')
        .select('role_key,expires_at').eq('user_id', operator.id).is('revoked_at', null);
      if (roleError) throw new Error('ROLE_LOAD_FAILED');
      const roleKeys = (roles || []).filter((role) => !role.expires_at || Date.parse(role.expires_at) > Date.now()).map((role) => role.role_key);
      const { data: capabilityRows, error: capabilityError } = await admin.from('admin_role_capabilities')
        .select('capability_key').in('role_key', roleKeys.length ? roleKeys : ['__none__']);
      if (capabilityError) throw new Error('CAPABILITY_LOAD_FAILED');
      return jsonResponse({
        roles: roleKeys,
        capabilities: [...new Set((capabilityRows || []).map((row) => row.capability_key))].sort(),
        request_id: requestId,
      });
    }

    if (action === 'overview') {
      await requireCapability(admin, operator.id, 'health.view');
      return jsonResponse({ overview: await buildOverview(admin, req), request_id: requestId });
    }

    if (action === 'list_operations') {
      await requireCapability(admin, operator.id, 'operations.assign');
      const limit = integer(body.limit, 1, 200) ? body.limit : 100;
      const allowedStates = ['open', 'acknowledged', 'in_progress', 'blocked', 'resolved', 'dismissed'];
      const state = typeof body.state === 'string' && allowedStates.includes(body.state) ? body.state : null;
      let query = admin.from('operations_inbox_items').select([
        'id', 'source_domain', 'source_ref', 'title', 'safe_summary', 'severity', 'sla_target_at',
        'state', 'assigned_to', 'related_entities', 'safe_deep_link', 'first_seen_at', 'last_seen_at',
        'acknowledged_at', 'resolved_at', 'resolution_reason', 'version', 'updated_at',
      ].join(',')).order('sla_target_at').limit(limit);
      if (state) query = query.eq('state', state);
      else query = query.in('state', ['open', 'acknowledged', 'in_progress', 'blocked']);
      const { data, error } = await query;
      if (error) throw new Error('OPERATIONS_LOAD_FAILED');
      return jsonResponse({ items: data || [], request_id: requestId });
    }

    if (action === 'operation_history') {
      await requireCapability(admin, operator.id, 'operations.assign');
      if (!boundedText(body.item_id, 128)) return jsonResponse({ error: 'Item required.', code: 'INVALID_ITEM', request_id: requestId }, 400);
      const { data, error } = await admin.from('operations_inbox_history')
        .select('id,item_id,actor_id,action,from_state,to_state,safe_metadata,reason,created_at')
        .eq('item_id', body.item_id).order('created_at');
      if (error) throw new Error('OPERATIONS_HISTORY_LOAD_FAILED');
      return jsonResponse({ history: data || [], request_id: requestId });
    }

    if (action === 'transition_operation') {
      const reason = requireReason(body);
      if (!boundedText(body.item_id, 128) || !integer(body.expected_version, 1, 1_000_000)
        || !boundedText(body.next_state, 40)) {
        return jsonResponse({ error: 'Invalid transition.', code: 'INVALID_TRANSITION', request_id: requestId }, 400);
      }
      const key = idempotency(body, requestId, 'operations-transition');
      const { data, error } = await admin.rpc('admin_transition_operations_item', {
        _item_id: body.item_id, _actor_id: operator.id, _expected_version: body.expected_version,
        _next_state: body.next_state, _assigned_to: typeof body.assigned_to === 'string' ? body.assigned_to : null,
        _reason: reason, _request_id: requestId, _idempotency_key: key,
      });
      if (error) return jsonResponse({ error: 'Operation changed or transition rejected.', code: 'OPERATIONS_TRANSITION_REJECTED', request_id: requestId }, 409);
      return jsonResponse({ item: data, request_id: requestId });
    }

    if (action === 'refresh_operations') {
      await requireCapability(admin, operator.id, 'operations.resolve');
      const reason = requireReason(body);
      const key = idempotency(body, requestId, 'operations-refresh');
      const limit = integer(body.limit, 1, 2000) ? body.limit : 500;
      const { data, error } = await admin.rpc('refresh_operations_inbox', { _limit: limit });
      if (error) throw new Error('OPERATIONS_REFRESH_FAILED');
      await audit(admin, operator.id, 'operations.resolve', 'operations.refresh', 'operations_inbox', null, reason, requestId, key, 'succeeded', { limit, result: data });
      return jsonResponse({ result: data, request_id: requestId });
    }

    if (action === 'list_audit') {
      await requireCapability(admin, operator.id, 'audit.view');
      const reason = requireReason(body);
      const limit = integer(body.limit, 1, 200) ? body.limit : 100;
      await audit(admin, operator.id, 'audit.view', 'audit.read', 'admin_audit', null, reason, requestId, `audit-read:${requestId}`, 'succeeded', { limit });
      const { data, error } = await admin.from('admin_audit_log').select([
        'id', 'actor_id', 'role_snapshot', 'capability_key', 'action', 'target_type', 'target_id',
        'before_redacted', 'after_redacted', 'safe_metadata', 'reason', 'request_id', 'correlation_id',
        'approval_request_id', 'outcome', 'error_code', 'created_at',
      ].join(',')).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error('AUDIT_LOAD_FAILED');
      return jsonResponse({ entries: data || [], request_id: requestId });
    }

    if (action === 'search_users') {
      await requireCapability(admin, operator.id, 'users.search_masked');
      const reason = requireReason(body);
      if (!boundedText(body.query, 80, 3) || !/^[\p{L}\p{N} .'-]+$/u.test(body.query.trim())) {
        return jsonResponse({ error: 'Use at least three letters/numbers or an immutable user ID.', code: 'INVALID_SEARCH', request_id: requestId }, 400);
      }
      const search = body.query.trim();
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
      let query = admin.from('profiles').select('user_id,display_name,city,user_origin,is_active,created_at').limit(20);
      query = uuid ? query.eq('user_id', search) : query.ilike('display_name', `${search}%`);
      const { data, error } = await query;
      if (error) throw new Error('MASKED_USER_SEARCH_FAILED');
      const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(search.toLocaleLowerCase('hu-HU')));
      const fingerprint = [...new Uint8Array(fingerprintBytes)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      await audit(admin, operator.id, 'users.search_masked', 'users.search_masked', 'user_directory', null, reason, requestId,
        `masked-search:${requestId}`, 'succeeded', { query_fingerprint: fingerprint, result_count: data?.length || 0, exact_id: uuid });
      return jsonResponse({
        users: (data || []).map((profile) => ({
          user_id: profile.user_id,
          display_name_masked: maskDisplayName(profile.display_name),
          city: profile.city,
          user_origin: profile.user_origin,
          is_active: profile.is_active,
          created_at: profile.created_at,
        })),
        request_id: requestId,
      });
    }

    if (action === 'list_user_profiles') {
      await requireCapability(admin, operator.id, 'users.manage_profile');
      const reason = requireReason(body);
      if (!onlyKeys(body, ['action', 'reason', 'limit', 'offset'])) {
        return jsonResponse({ error: 'Unsupported request field.', code: 'INVALID_BODY_FIELDS', request_id: requestId }, 400);
      }
      const limit = integer(body.limit, 1, 1000) ? body.limit : 500;
      const offset = integer(body.offset, 0, 1_000_000) ? body.offset : 0;
      const { data, error } = await admin.rpc('admin_list_user_profiles', {
        _actor_id: operator.id,
        _limit: limit + 1,
        _offset: offset,
      });
      if (error) throw new Error('PROFILE_DIRECTORY_LOAD_FAILED');
      const rows = Array.isArray(data) ? data : [];
      const visibleRows = rows.slice(0, limit);
      await audit(
        admin,
        operator.id,
        'users.manage_profile',
        'users.profile_directory.read',
        'user_directory',
        null,
        reason,
        requestId,
        `profile-directory:${requestId}`,
        'succeeded',
        { result_count: visibleRows.length, offset, truncated: rows.length > limit },
      );
      return jsonResponse({
        profiles: visibleRows,
        offset,
        limit,
        truncated: rows.length > limit,
        request_id: requestId,
      });
    }

    if (action === 'update_user_profile') {
      await requireCapability(admin, operator.id, 'users.manage_profile');
      const reason = requireReason(body);
      if (!onlyKeys(body, [
        'action', 'reason', 'idempotency_key', 'user_id', 'gender', 'is_active',
        'bio', 'hobbies', 'event_ids',
      ])) {
        return jsonResponse({ error: 'Unsupported request field.', code: 'INVALID_BODY_FIELDS', request_id: requestId }, 400);
      }
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const gender = body.gender === null ? null : typeof body.gender === 'string' ? body.gender : undefined;
      const hobbies = Array.isArray(body.hobbies) ? body.hobbies : null;
      const eventIds = Array.isArray(body.event_ids) ? body.event_ids : null;
      if (!boundedText(body.user_id, 36, 36) || !uuidPattern.test(body.user_id)
        || (gender !== null && !['male', 'female', 'other', 'prefer_not_to_say'].includes(String(gender)))
        || typeof body.is_active !== 'boolean'
        || typeof body.bio !== 'string' || body.bio.length > 500
        || !hobbies || hobbies.length > 100 || hobbies.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80)
        || !eventIds || eventIds.length > 500 || eventIds.some((value) => typeof value !== 'string' || !uuidPattern.test(value))) {
        return jsonResponse({ error: 'Invalid profile mutation.', code: 'INVALID_PROFILE_MUTATION', request_id: requestId }, 400);
      }
      const key = idempotency(body, requestId, 'users-profile-update');
      const { data, error } = await admin.rpc('admin_update_user_profile', {
        _actor_id: operator.id,
        _target_user_id: body.user_id,
        _gender: gender,
        _is_active: body.is_active,
        _bio: body.bio,
        _hobbies: hobbies,
        _event_ids: eventIds,
        _reason: reason,
        _request_id: requestId,
        _idempotency_key: key,
      });
      if (error) {
        return jsonResponse({ error: 'Profile update rejected.', code: 'PROFILE_UPDATE_REJECTED', request_id: requestId }, 409);
      }
      return jsonResponse({ result: data, request_id: requestId });
    }

    if (action === 'list_approvals') {
      await requireCapability(admin, operator.id, 'approvals.decide');
      const { data, error } = await admin.from('admin_approval_requests').select([
        'id', 'requested_by', 'capability_key', 'action', 'target_type', 'target_id', 'safe_action_payload',
        'reason', 'state', 'decided_by', 'decision_reason', 'requested_at', 'expires_at', 'decided_at', 'executed_at',
      ].join(',')).eq('state', 'pending').gt('expires_at', new Date().toISOString()).order('requested_at').limit(100);
      if (error) throw new Error('APPROVAL_LIST_FAILED');
      return jsonResponse({ approvals: data || [], request_id: requestId });
    }

    if (action === 'request_approval') {
      const reason = requireReason(body);
      if (!boundedText(body.capability_key, 100) || !boundedText(body.requested_action, 120)
        || !boundedText(body.target_type, 80) || !boundedText(body.target_id, 200)) {
        return jsonResponse({ error: 'Invalid approval request.', code: 'INVALID_APPROVAL', request_id: requestId }, 400);
      }
      await requireCapability(admin, operator.id, body.capability_key);
      const key = idempotency(body, requestId, 'approval-request');
      const { data, error } = await admin.rpc('admin_request_approval', {
        _actor_id: operator.id, _capability_key: body.capability_key, _action: body.requested_action,
        _target_type: body.target_type, _target_id: body.target_id,
        _safe_action_payload: isObject(body.safe_action_payload) ? body.safe_action_payload : {},
        _reason: reason, _request_id: requestId, _idempotency_key: key,
      });
      if (error) return jsonResponse({ error: 'Approval request rejected.', code: 'APPROVAL_REQUEST_REJECTED', request_id: requestId }, 409);
      return jsonResponse({ approval_request_id: data, request_id: requestId }, 201);
    }

    if (action === 'decide_approval') {
      const reason = requireReason(body);
      if (!boundedText(body.approval_request_id, 128) || typeof body.approve !== 'boolean') {
        return jsonResponse({ error: 'Invalid approval decision.', code: 'INVALID_APPROVAL_DECISION', request_id: requestId }, 400);
      }
      const key = idempotency(body, requestId, 'approval-decision');
      const { data, error } = await admin.rpc('admin_decide_approval', {
        _approval_request_id: body.approval_request_id, _actor_id: operator.id, _approve: body.approve,
        _reason: reason, _request_id: requestId, _idempotency_key: key,
      });
      if (error) return jsonResponse({ error: 'Approval decision rejected.', code: 'APPROVAL_DECISION_REJECTED', request_id: requestId }, 409);
      return jsonResponse({ state: data, request_id: requestId });
    }

    if (action === 'set_operator_role') {
      await requireCapability(admin, operator.id, 'security.manage');
      const reason = requireReason(body);
      if (!boundedText(body.target_user_id, 128) || !boundedText(body.role_key, 40) || typeof body.grant !== 'boolean') {
        return jsonResponse({ error: 'Invalid role change.', code: 'INVALID_ROLE_CHANGE', request_id: requestId }, 400);
      }
      const confirmation = `CONFIRM ${body.grant ? 'GRANT' : 'REVOKE'} ${String(body.role_key).toUpperCase()} ${body.target_user_id}`;
      if (body.confirmation !== confirmation) return jsonResponse({ error: 'Confirmation phrase mismatch.', code: 'CONFIRMATION_REQUIRED', expected_confirmation: confirmation, request_id: requestId }, 400);
      const key = idempotency(body, requestId, 'operator-role');
      const { data, error } = await admin.rpc('admin_set_operator_role', {
        _target_user_id: body.target_user_id, _role_key: body.role_key, _grant: body.grant,
        _expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
        _actor_id: operator.id, _reason: reason, _request_id: requestId, _idempotency_key: key,
        _approval_request_id: typeof body.approval_request_id === 'string' ? body.approval_request_id : null,
      });
      if (error) return jsonResponse({ error: 'Role change rejected.', code: 'ROLE_CHANGE_REJECTED', request_id: requestId }, 409);
      return jsonResponse({ result: data, request_id: requestId });
    }

    return jsonResponse({ error: 'Unknown action.', code: 'INVALID_ACTION', request_id: requestId }, 400);
  } catch (error) {
    const [status, code] = mapError(error);
    if (status >= 500) console.error('admin-control-plane failed', { request_id: requestId, code });
    return jsonResponse({ error: status >= 500 ? 'Admin operation failed.' : 'Request rejected.', code, request_id: requestId }, status);
  }
});
