import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, getSupabaseAdmin, resolveInternalSupabaseUrl } from '../shared/providerFetch.ts';
import { correlationIdFromRequest, logEdgeEvent, observeEdgeOperation } from '../shared/edgeObservability.ts';

const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_TYPES = new Set(['user', 'event', 'organizer', 'circle', 'hub', 'message', 'content']);
const REASON_CODES = new Set([
  'harassment', 'hate', 'sexual_misconduct', 'fraud_scam', 'unsafe_event',
  'impersonation', 'underage_concern', 'privacy_exposure', 'spam',
  'prohibited_commercial_behavior', 'self_harm_emergency_routing', 'other',
]);
const CASE_STATUSES = new Set(['triaged', 'investigating', 'actioned', 'appealed', 'closed']);
const ACTION_TYPES = new Set([
  'warning', 'education', 'feature_restriction', 'temporary_suspension',
  'permanent_ban', 'organizer_restriction', 'content_takedown', 'event_takedown',
]);
const APPEAL_RESOLUTIONS = new Set(['upheld', 'modified', 'overturned']);
const CONSENT_PURPOSES = new Set(['analytics', 'marketing', 'location_sharing', 'social_reconnection']);
const VENUE_VISIBILITY = new Set(['public_meeting_point', 'participant_only', 'private_exact_after_join', 'online']);
const EVENT_RISK_FLAGS = new Set(['private_home', 'night', 'physical_contact', 'remote_location', 'other']);

const responseHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-correlation-id, idempotency-key`,
};

function respond(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...responseHeaders,
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
  });
}

function getToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function parseBody(req: Request) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  if (!text.trim()) return {} as Record<string, unknown>;
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY');
  return value as Record<string, unknown>;
}

async function authenticatedContext(req: Request) {
  const token = getToken(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
  if (!anonKey) throw new Error('SERVER_CONFIG');
  const client = createClient(resolveInternalSupabaseUrl(req), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('UNAUTHORIZED');
  return { user, client };
}

async function reviewerRole(admin: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'moderator']);
  if (error) throw new Error('ROLE_CHECK_FAILED');
  const roles = (data || []).map((row) => String(row.role));
  if (!roles.length) throw new Error('FORBIDDEN');
  return roles.includes('admin') ? 'admin' : 'moderator';
}

function requiredString(body: Record<string, unknown>, key: string, max: number) {
  const value = String(body[key] || '').trim();
  if (!value || value.length > max) throw new Error('INVALID_BODY');
  return value;
}

Deno.serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: responseHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', correlationId }, 405, correlationId);

  try {
    const body = await parseBody(req);
    const action = requiredString(body, 'action', 60);
    const { user, client } = await authenticatedContext(req);
    const admin = getSupabaseAdmin(req);

    if (action === 'block_user' || action === 'unblock_user') {
      const targetUserId = requiredString(body, 'targetUserId', 36);
      if (!UUID_PATTERN.test(targetUserId) || targetUserId === user.id) throw new Error('INVALID_TARGET');
      const reasonCode = body.reasonCode ? String(body.reasonCode).slice(0, 80) : null;
      const { error } = await observeEdgeOperation('safety.set_user_block', correlationId, () =>
        client.rpc('set_user_block', {
          _blocked_user_id: targetUserId,
          _blocked: action === 'block_user',
          _reason_code: reasonCode,
        }), { feature_flags: ['moderation'] });
      if (error) throw new Error('BLOCK_WRITE_FAILED');
      logEdgeEvent('info', action, correlationId, { target_type: 'user' });
      return respond({ ok: true, blocked: action === 'block_user', correlationId }, 200, correlationId);
    }

    if (action === 'submit_report') {
      const targetType = requiredString(body, 'targetType', 30);
      const targetRef = requiredString(body, 'targetRef', 200);
      const reasonCode = requiredString(body, 'reasonCode', 80);
      const details = String(body.details || '').trim();
      if (!TARGET_TYPES.has(targetType) || !REASON_CODES.has(reasonCode) || details.length > 1000) {
        throw new Error('INVALID_REPORT');
      }
      const reportedUserId = body.targetUserId && UUID_PATTERN.test(String(body.targetUserId))
        ? String(body.targetUserId)
        : null;
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID()).trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
      const { data: reportId, error } = await observeEdgeOperation('safety.submit_report', correlationId, () =>
        client.rpc('submit_safety_report', {
          _reported_user_id: reportedUserId,
          _target_type: targetType,
          _target_ref: targetRef,
          _reason_code: reasonCode,
          _details: details || null,
          _source_surface: String(body.sourceSurface || 'consumer').slice(0, 80),
          _idempotency_key: idempotencyKey,
        }), { feature_flags: ['moderation'] });
      if (error) {
        if (error.message?.toLowerCase().includes('rate limit')) throw new Error('RATE_LIMITED');
        throw new Error('REPORT_WRITE_FAILED');
      }
      const { data: caseRow } = await admin
        .from('moderation_cases')
        .select('id')
        .eq('report_id', reportId)
        .maybeSingle();
      logEdgeEvent('info', 'safety_report_received', correlationId, {
        report_id: reportId,
        case_id: caseRow?.id,
        target_type: targetType,
        reason_code: reasonCode,
      });
      return respond({ ok: true, reportId, caseId: caseRow?.id || null, correlationId }, 201, correlationId);
    }

    if (action === 'my_reports') {
      const { data, error } = await client
        .from('user_reports')
        .select('id,context_type,target_ref,category,status,severity,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error('REPORT_READ_FAILED');
      return respond({ ok: true, reports: data || [], correlationId }, 200, correlationId);
    }

    if (action === 'my_consents') {
      const { data, error } = await client
        .from('consent_records')
        .select('purpose,policy_version,decision,decided_at,withdrawn_at')
        .order('decided_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('CONSENT_READ_FAILED');
      const latest = new Map<string, unknown>();
      for (const row of data || []) {
        if (!latest.has(String(row.purpose))) latest.set(String(row.purpose), row);
      }
      return respond({ ok: true, consents: Array.from(latest.values()), correlationId }, 200, correlationId);
    }

    if (action === 'record_consent') {
      const purpose = requiredString(body, 'purpose', 80);
      const decision = requiredString(body, 'decision', 20);
      const policyVersion = requiredString(body, 'policyVersion', 80);
      if (!CONSENT_PURPOSES.has(purpose) || !['granted', 'denied', 'withdrawn'].includes(decision)) {
        throw new Error('INVALID_CONSENT');
      }
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID());
      const { data: consentId, error } = await observeEdgeOperation('privacy.record_consent', correlationId, () =>
        client.rpc('record_my_consent', {
          _purpose: purpose,
          _policy_version: policyVersion,
          _decision: decision,
          _source_surface: String(body.sourceSurface || 'profile').slice(0, 80),
          _idempotency_key: idempotencyKey,
        }));
      if (error) throw new Error('CONSENT_WRITE_FAILED');
      return respond({ ok: true, consentId, correlationId }, 201, correlationId);
    }

    if (action === 'event_safety_summary') {
      const eventId = requiredString(body, 'eventId', 36);
      if (!UUID_PATTERN.test(eventId)) throw new Error('INVALID_EVENT');
      const { data, error } = await admin
        .from('public_event_safety')
        .select('event_id,venue_visibility,host_accountability_ack,capacity_ack,participant_rules,risk_flags,review_status')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error('EVENT_SAFETY_READ_FAILED');
      return respond({ ok: true, safety: data || null, correlationId }, 200, correlationId);
    }

    if (action === 'get_event_safety' || action === 'save_event_safety') {
      const eventId = requiredString(body, 'eventId', 36);
      if (!UUID_PATTERN.test(eventId)) throw new Error('INVALID_EVENT');
      const { data: eventRow, error: eventError } = await admin
        .from('events')
        .select('created_by')
        .eq('id', eventId)
        .maybeSingle();
      if (eventError || !eventRow) throw new Error('EVENT_NOT_FOUND');
      const roles = await admin.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'moderator']);
      const reviewer = Boolean(roles.data?.length);
      if (eventRow.created_by !== user.id && !reviewer) throw new Error('FORBIDDEN');

      if (action === 'get_event_safety') {
        const { data, error } = await admin.from('event_safety_profiles').select('*').eq('event_id', eventId).maybeSingle();
        if (error) throw new Error('EVENT_SAFETY_READ_FAILED');
        return respond({ ok: true, safety: data || null, correlationId }, 200, correlationId);
      }

      if (eventRow.created_by !== user.id) throw new Error('FORBIDDEN');
      const venueVisibility = requiredString(body, 'venueVisibility', 40);
      const participantRules = requiredString(body, 'participantRules', 2000);
      const venueSuitabilityNote = String(body.venueSuitabilityNote || '').trim().slice(0, 1000);
      const riskFlags = Array.isArray(body.riskFlags)
        ? [...new Set(body.riskFlags.filter((item): item is string => typeof item === 'string' && EVENT_RISK_FLAGS.has(item)))].slice(0, 5)
        : [];
      if (!VENUE_VISIBILITY.has(venueVisibility) || body.hostAccountabilityAck !== true || body.capacityAck !== true) {
        throw new Error('INVALID_EVENT_SAFETY');
      }
      const { data, error } = await observeEdgeOperation('safety.save_event_profile', correlationId, () =>
        admin.from('event_safety_profiles').upsert({
          event_id: eventId,
          venue_visibility: venueVisibility,
          host_accountability_ack: true,
          capacity_ack: true,
          participant_rules: participantRules,
          venue_suitability_note: venueSuitabilityNote || null,
          risk_flags: riskFlags,
          review_status: riskFlags.length ? 'review_required' : 'not_required',
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'event_id' }).select('*').single(), { feature_flags: ['moderation'] });
      if (error) throw new Error('EVENT_SAFETY_WRITE_FAILED');
      logEdgeEvent('info', 'event_safety_profile_saved', correlationId, {
        event_id: eventId,
        risk_flag_count: riskFlags.length,
        review_status: data.review_status,
      });
      return respond({ ok: true, safety: data, correlationId }, 200, correlationId);
    }

    if (action === 'submit_appeal') {
      const actionId = requiredString(body, 'moderationActionId', 36);
      const statement = requiredString(body, 'statement', 2000);
      if (!UUID_PATTERN.test(actionId) || statement.length < 10) throw new Error('INVALID_APPEAL');
      const { data: appealId, error } = await client.rpc('submit_moderation_appeal', {
        _moderation_action_id: actionId,
        _statement: statement,
        _correlation_id: correlationId,
      });
      if (error) throw new Error(error.code === '42501' ? 'FORBIDDEN' : 'APPEAL_WRITE_FAILED');
      return respond({ ok: true, appealId, correlationId }, 201, correlationId);
    }

    const role = await reviewerRole(admin, user.id);
    const { data: moderationEnabled, error: flagError } = await observeEdgeOperation('flags.evaluate_moderation', correlationId, () =>
      admin.rpc('evaluate_feature_flag', {
        _flag_key: 'moderation',
        _subject_id: user.id,
        _cohort: 'internal',
      }), { feature_flags: ['moderation'] });
    if (flagError) throw new Error('FLAG_CHECK_FAILED');
    if (!moderationEnabled) throw new Error('FEATURE_DISABLED');

    if (action === 'admin_queue') {
      const status = body.status ? String(body.status) : null;
      let query = admin
        .from('moderation_cases')
        .select('id,report_id,status,severity,assignee_id,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status && status !== 'all') query = query.eq('status', status);
      const { data: cases, error } = await query;
      if (error) throw new Error('QUEUE_READ_FAILED');
      const reportIds = (cases || []).map((item) => item.report_id);
      const { data: reports, error: reportsError } = reportIds.length
        ? await admin.from('user_reports')
          .select('id,context_type,target_ref,reported_user_id,category,details,severity,source_surface,created_at')
          .in('id', reportIds)
        : { data: [], error: null };
      if (reportsError) throw new Error('QUEUE_READ_FAILED');
      const byId = new Map((reports || []).map((item) => [item.id, item]));
      const caseIds = (cases || []).map((item) => item.id);
      const { data: actions, error: actionsError } = caseIds.length
        ? await admin.from('moderation_actions')
          .select('id,case_id,action_type,policy_reason,evidence_refs,starts_at,expires_at,appeal_available,created_at')
          .in('case_id', caseIds)
          .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (actionsError) throw new Error('QUEUE_READ_FAILED');
      const actionIds = (actions || []).map((item) => item.id);
      const [{ data: notes, error: notesError }, { data: appeals, error: appealsError }] = await Promise.all([
        caseIds.length
          ? admin.from('moderation_case_notes').select('id,case_id,note,evidence_refs,created_at').in('case_id', caseIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        actionIds.length
          ? admin.from('moderation_appeals').select('id,moderation_action_id,statement,status,resolution_note,submitted_at,resolved_at').in('moderation_action_id', actionIds).order('submitted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (notesError || appealsError) throw new Error('QUEUE_READ_FAILED');
      const actionsByCase = new Map<string, unknown[]>();
      const appealsByAction = new Map<string, unknown[]>();
      const notesByCase = new Map<string, unknown[]>();
      for (const appeal of appeals || []) {
        const key = String(appeal.moderation_action_id);
        appealsByAction.set(key, [...(appealsByAction.get(key) || []), appeal]);
      }
      for (const moderationAction of actions || []) {
        const key = String(moderationAction.case_id);
        actionsByCase.set(key, [...(actionsByCase.get(key) || []), {
          ...moderationAction,
          appeals: appealsByAction.get(String(moderationAction.id)) || [],
        }]);
      }
      for (const caseNote of notes || []) {
        const key = String(caseNote.case_id);
        notesByCase.set(key, [...(notesByCase.get(key) || []), caseNote]);
      }
      return respond({
        ok: true,
        cases: (cases || []).map((item) => ({
          ...item,
          report: byId.get(item.report_id) || null,
          actions: actionsByCase.get(item.id) || [],
          notes: notesByCase.get(item.id) || [],
        })),
        reviewerRole: role,
        correlationId,
      }, 200, correlationId);
    }

    if (action === 'claim_case') {
      const caseId = requiredString(body, 'caseId', 36);
      if (!UUID_PATTERN.test(caseId)) throw new Error('INVALID_CASE');
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID());
      const { error } = await observeEdgeOperation('safety.claim_case', correlationId, () =>
        client.rpc('claim_moderation_case', {
          _case_id: caseId,
          _idempotency_key: idempotencyKey,
          _correlation_id: correlationId,
        }), { feature_flags: ['moderation'] });
      if (error) throw new Error(error.code === '42501' ? 'FORBIDDEN' : 'CLAIM_FAILED');
      return respond({ ok: true, caseId, assigneeId: user.id, correlationId }, 200, correlationId);
    }

    if (action === 'transition_case') {
      const caseId = requiredString(body, 'caseId', 36);
      const nextStatus = requiredString(body, 'nextStatus', 30);
      const assigneeId = body.assigneeId ? String(body.assigneeId) : null;
      if (!UUID_PATTERN.test(caseId) || !CASE_STATUSES.has(nextStatus) || (assigneeId && !UUID_PATTERN.test(assigneeId))) {
        throw new Error('INVALID_TRANSITION');
      }
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID());
      const { error } = await observeEdgeOperation('safety.transition_case', correlationId, () =>
        client.rpc('transition_moderation_case', {
          _case_id: caseId,
          _next_status: nextStatus,
          _assignee_id: assigneeId,
          _note: body.note ? String(body.note).slice(0, 2000) : null,
          _idempotency_key: idempotencyKey,
          _correlation_id: correlationId,
        }), { feature_flags: ['moderation'] });
      if (error) throw new Error('TRANSITION_FAILED');
      return respond({ ok: true, caseId, status: nextStatus, correlationId }, 200, correlationId);
    }

    if (action === 'resolve_appeal') {
      const appealId = requiredString(body, 'appealId', 36);
      const resolution = requiredString(body, 'resolution', 30);
      const resolutionNote = requiredString(body, 'resolutionNote', 2000);
      if (!UUID_PATTERN.test(appealId) || !APPEAL_RESOLUTIONS.has(resolution) || resolutionNote.length < 3) {
        throw new Error('INVALID_APPEAL_RESOLUTION');
      }
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID());
      const { error } = await observeEdgeOperation('safety.resolve_appeal', correlationId, () =>
        client.rpc('resolve_moderation_appeal', {
          _appeal_id: appealId,
          _resolution: resolution,
          _resolution_note: resolutionNote,
          _idempotency_key: idempotencyKey,
          _correlation_id: correlationId,
        }), { feature_flags: ['moderation'] });
      if (error) throw new Error(error.code === '42501' ? 'FORBIDDEN' : 'APPEAL_RESOLUTION_FAILED');
      return respond({ ok: true, appealId, resolution, correlationId }, 200, correlationId);
    }

    if (action === 'apply_action') {
      const caseId = requiredString(body, 'caseId', 36);
      const actionType = requiredString(body, 'actionType', 50);
      const policyReason = requiredString(body, 'policyReason', 1000);
      const durationDays = body.durationDays == null ? null : Number(body.durationDays);
      if (!UUID_PATTERN.test(caseId) || !ACTION_TYPES.has(actionType)) throw new Error('INVALID_ENFORCEMENT');
      if (actionType === 'permanent_ban' && role !== 'admin') throw new Error('FORBIDDEN');
      if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
        throw new Error('INVALID_DURATION');
      }
      const evidenceRefs = Array.isArray(body.evidenceRefs)
        ? body.evidenceRefs.filter((value): value is string => typeof value === 'string').slice(0, 20)
        : [];
      const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || crypto.randomUUID());
      const { data: moderationActionId, error } = await observeEdgeOperation('safety.apply_action', correlationId, () =>
        client.rpc('apply_moderation_action', {
          _case_id: caseId,
          _action_type: actionType,
          _policy_reason: policyReason,
          _evidence_refs: evidenceRefs,
          _duration: durationDays === null ? null : `${durationDays} days`,
          _feature_key: body.featureKey ? String(body.featureKey).slice(0, 100) : null,
          _idempotency_key: idempotencyKey,
          _correlation_id: correlationId,
        }), { feature_flags: ['moderation'] });
      if (error) throw new Error(error.code === '42501' ? 'FORBIDDEN' : 'ENFORCEMENT_FAILED');
      return respond({ ok: true, moderationActionId, correlationId }, 201, correlationId);
    }

    return respond({ error: 'Unknown action.', code: 'UNKNOWN_ACTION', correlationId }, 400, correlationId);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401
      : code === 'FORBIDDEN' ? 403
        : code === 'RATE_LIMITED' ? 429
          : code === 'BODY_TOO_LARGE' ? 413
            : code === 'SERVER_CONFIG' || code === 'FEATURE_DISABLED' ? 503
              : code.startsWith('INVALID') || code === 'UNKNOWN_ACTION' ? 400
                : 500;
    logEdgeEvent(status >= 500 ? 'error' : 'warn', 'trust_safety_request_failed', correlationId, { code, status });
    const userMessage = status >= 500
      ? 'A safety művelet most nem fejezhető be. Próbáld újra később.'
      : status === 429
        ? 'Túl sok bejelentés érkezett rövid idő alatt. Próbáld újra később.'
        : status === 401
          ? 'A művelethez jelentkezz be újra.'
          : status === 403
            ? 'Ehhez a művelethez nincs jogosultságod.'
            : 'A megadott adatok érvénytelenek.';
    return respond({ error: userMessage, code, correlationId }, status, correlationId);
  }
});
