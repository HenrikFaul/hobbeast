import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;

type EventOperationAction =
  | 'counts'
  | 'join'
  | 'cancel'
  | 'set_arrival_confidence'
  | 'organizer_transition'
  | 'save_organizer_note'
  | 'complete_event'
  | 'submit_feedback'
  | 'save_readiness_assessment'
  | 'create_incident_handoff'
  | 'organizer_configuration';

interface EventOperationBody {
  action?: EventOperationAction;
  event_id?: string;
  event_ids?: string[];
  participation_id?: string;
  next_status?: string;
  reason?: string;
  note?: string;
  idempotency_key?: string;
  description_accuracy?: number | null;
  felt_safe?: boolean | null;
  would_return?: boolean | null;
  private_note?: string | null;
  arriving_alone?: boolean | null;
  first_hobbeast_event?: boolean | null;
  arrival_visibility?: string;
  checklist?: Record<string, boolean>;
  incident_type?: string;
  severity?: string;
  summary?: string;
}

const READINESS_KEYS = new Set([
  'identity', 'description', 'safety', 'location', 'capacity',
  'cancellation', 'checkin', 'communication', 'accessibility', 'legal_tax',
]);
const INCIDENT_TYPES = new Set(['safety', 'venue', 'attendance', 'accessibility', 'other']);
const INCIDENT_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function requireUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value;
}

function safeText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : 'EVENT_OPERATION_FAILED';
  if (message.includes('AUTH_') || message.includes('UNAUTHORIZED')) return 401;
  if (message.includes('REQUIRED') || message.includes('INVALID_')) return 400;
  if (message.includes('NOT_FOUND')) return 404;
  if (message.includes('EVENT_OPERATOR') || message.includes('USER_SUSPENDED') || message.includes('EVENT_ORGANIZER_BLOCKED')) return 403;
  if (message.includes('NOT_JOINABLE') || message.includes('NOT_EDITABLE') || message.includes('FULL') || message.includes('TRANSITION') || message.includes('CANNOT')) return 409;
  return 500;
}

function publicErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : 'EVENT_OPERATION_FAILED';
  const known = [
    'AUTH_REQUIRED', 'AUTH_INVALID', 'INVALID_ACTION', 'INVALID_EVENT_ID', 'INVALID_EVENT_IDS',
    'INVALID_PARTICIPATION_ID', 'INVALID_IDEMPOTENCY_KEY', 'EVENT_NOT_AVAILABLE',
    'EVENT_NOT_JOINABLE', 'EVENT_ALREADY_STARTED', 'EVENT_FULL_NO_WAITLIST',
    'PARTICIPATION_NOT_FOUND', 'COMPLETED_PARTICIPATION_IMMUTABLE',
    'ARRIVAL_CONFIDENCE_NOT_EDITABLE', 'INVALID_ARRIVAL_VISIBILITY',
    'INVALID_PARTICIPATION_STATUS', 'INVALID_PARTICIPATION_TRANSITION',
    'TRANSITION_REASON_REQUIRED', 'EVENT_OPERATOR_REQUIRED', 'FUTURE_EVENT_CANNOT_COMPLETE',
    'CANCELLED_EVENT_CANNOT_COMPLETE', 'NOTE_TOO_LONG', 'FEEDBACK_VALIDATION_FAILED',
    'INVALID_READINESS_CHECKLIST', 'INVALID_INCIDENT_HANDOFF',
    'USER_SUSPENDED', 'EVENT_ORGANIZER_BLOCKED',
  ];
  return known.find((code) => message.includes(code)) ?? 'EVENT_OPERATION_FAILED';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' }, request_id: requestId }, 405);

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: { code: 'BODY_TOO_LARGE' }, request_id: requestId }, 413);
    const body = await req.json() as EventOperationBody;
    if (!body.action) throw new Error('INVALID_ACTION');

    if (body.action === 'counts') {
      const ids = Array.isArray(body.event_ids)
        ? [...new Set(body.event_ids.map((id) => requireUuid(id, 'event_ids')))]
        : [];
      if (ids.length > 100) throw new Error('INVALID_EVENT_IDS');
      const { data, error } = await getSupabaseAdmin(req).rpc('public_event_participant_counts', { p_event_ids: ids });
      if (error) throw new Error(error.message);
      return jsonResponse({ counts: data ?? [], request_id: requestId });
    }

    const { client, user } = await requireAuthenticatedUserClient(req);
    const idempotencyKey = requireUuid(body.idempotency_key, 'idempotency_key');

    if (body.action === 'organizer_configuration') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const [crewResult, seriesResult] = await Promise.all([
        client.from('event_crew_roles').select('id,event_id,user_id,can_check_in,can_message_attendees,can_edit_event,can_view_finance,can_moderate,created_at,updated_at').eq('event_id', eventId).order('created_at'),
        client.from('event_series').select('id,title,recurrence_rule,timezone,is_active,created_at,updated_at').eq('owner_user_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (crewResult.error || seriesResult.error) throw new Error('ORGANIZER_CONFIGURATION_LOAD_FAILED');
      const seriesIds = (seriesResult.data || []).map((row) => row.id);
      const occurrenceResult = seriesIds.length > 0
        ? await client.from('event_series_occurrences').select('id,series_id,event_id,original_start,occurrence_start,occurrence_state,exception_reason,created_at,updated_at').in('series_id', seriesIds).order('occurrence_start')
        : { data: [], error: null };
      if (occurrenceResult.error) throw new Error('ORGANIZER_CONFIGURATION_LOAD_FAILED');
      return jsonResponse({
        crew: crewResult.data || [], series: seriesResult.data || [], occurrences: occurrenceResult.data || [], request_id: requestId,
      });
    }

    if (body.action === 'join') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const { data, error } = await client.rpc('join_event_atomic', { p_event_id: eventId, p_idempotency_key: idempotencyKey });
      if (error) throw new Error(error.message);
      return jsonResponse({ participation: data?.[0] ?? null, request_id: requestId });
    }

    if (body.action === 'cancel') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const { data, error } = await client.rpc('cancel_own_participation_atomic', { p_event_id: eventId, p_idempotency_key: idempotencyKey });
      if (error) throw new Error(error.message);
      return jsonResponse({ participation: data?.[0] ?? null, request_id: requestId });
    }

    if (body.action === 'set_arrival_confidence') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const visibility = safeText(body.arrival_visibility, 32) || 'host_only';
      // Buddy disclosure remains fail-closed until a selected-buddy relation is
      // available; this endpoint currently exposes the flags only to the host.
      if (visibility !== 'host_only') throw new Error('INVALID_ARRIVAL_VISIBILITY');
      const { data, error } = await client.rpc('set_arrival_confidence_atomic', {
        p_event_id: eventId,
        p_arriving_alone: typeof body.arriving_alone === 'boolean' ? body.arriving_alone : null,
        p_first_hobbeast_event: typeof body.first_hobbeast_event === 'boolean' ? body.first_hobbeast_event : null,
        p_arrival_visibility: visibility,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ arrival_confidence: data?.[0] ?? null, request_id: requestId });
    }

    if (body.action === 'organizer_transition') {
      const participationId = requireUuid(body.participation_id, 'participation_id');
      const { data, error } = await client.rpc('organizer_transition_participant_atomic', {
        p_participation_id: participationId,
        p_next_status: safeText(body.next_status, 32),
        p_reason: safeText(body.reason, 200),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ participation: data?.[0] ?? null, request_id: requestId });
    }

    if (body.action === 'save_organizer_note') {
      const participationId = requireUuid(body.participation_id, 'participation_id');
      const { error } = await client.rpc('save_organizer_note_atomic', {
        p_participation_id: participationId,
        p_note: safeText(body.note, 2000),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ saved: true, request_id: requestId });
    }

    if (body.action === 'complete_event') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const { data, error } = await client.rpc('complete_event_atomic', {
        p_event_id: eventId,
        p_reason: safeText(body.reason, 200),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ completion: data?.[0] ?? null, request_id: requestId });
    }

    if (body.action === 'submit_feedback') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const accuracy = body.description_accuracy;
      const privateNote = safeText(body.private_note, 1000) || null;
      if (accuracy !== null && accuracy !== undefined && (!Number.isInteger(accuracy) || accuracy < 1 || accuracy > 5)) {
        throw new Error('FEEDBACK_VALIDATION_FAILED');
      }
      const { error } = await client.from('post_event_feedback').upsert({
        event_id: eventId,
        user_id: user.id,
        description_accuracy: accuracy ?? null,
        felt_safe: typeof body.felt_safe === 'boolean' ? body.felt_safe : null,
        would_return: typeof body.would_return === 'boolean' ? body.would_return : null,
        private_note: privateNote,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id,user_id' });
      if (error) throw new Error(error.message);
      return jsonResponse({ saved: true, request_id: requestId });
    }

    if (body.action === 'save_readiness_assessment') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const rawChecklist = body.checklist && typeof body.checklist === 'object' ? body.checklist : {};
      const checklist = Object.fromEntries(
        Object.entries(rawChecklist)
          .filter(([key, value]) => READINESS_KEYS.has(key) && typeof value === 'boolean'),
      );
      if (Object.keys(checklist).length !== READINESS_KEYS.size) throw new Error('INVALID_READINESS_CHECKLIST');
      const { data, error } = await client.rpc('save_organizer_readiness_assessment_atomic', {
        p_event_id: eventId,
        p_checklist: checklist,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ saved: true, assessment: data, request_id: requestId });
    }

    if (body.action === 'create_incident_handoff') {
      const eventId = requireUuid(body.event_id, 'event_id');
      const incidentType = safeText(body.incident_type, 32);
      const severity = safeText(body.severity, 16);
      const summary = safeText(body.summary, 1000);
      if (!INCIDENT_TYPES.has(incidentType) || !INCIDENT_SEVERITIES.has(severity) || summary.length < 3) {
        throw new Error('INVALID_INCIDENT_HANDOFF');
      }
      const { data, error } = await client.from('organizer_incident_handoffs').upsert({
        event_id: eventId,
        reporter_user_id: user.id,
        incident_type: incidentType,
        severity,
        summary,
        idempotency_key: idempotencyKey,
      }, { onConflict: 'reporter_user_id,idempotency_key' }).select('id,state,created_at').single();
      if (error) throw new Error(error.message);
      return jsonResponse({ incident: data, request_id: requestId }, 201);
    }

    throw new Error('INVALID_ACTION');
  } catch (error) {
    const code = publicErrorCode(error);
    console.error(JSON.stringify({ level: 'error', code, request_id: requestId, scope: 'event-operations' }));
    return jsonResponse({ error: { code }, request_id: requestId }, statusForError(error));
  }
});
