import { supabase } from '@/integrations/supabase/client';
import type { ParticipantLifecycleStatus } from '@/lib/eventLifecycle';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

interface OperationErrorPayload {
  error?: { code?: string };
}

interface ParticipationMutationResult {
  participation?: {
    participation_id: string;
    participation_status: ParticipantLifecycleStatus;
    replayed: boolean;
  } | null;
}

export interface PublicParticipantCount {
  event_id: string;
  total: number;
  going: number;
  waitlist: number;
  checked_in: number;
  completed: number;
  cancelled: number;
}

function idempotencyKey() {
  return crypto.randomUUID();
}

interface UntypedRpcResult {
  data: unknown;
  error: { message: string } | null;
}

const eventRpcClient = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<UntypedRpcResult>;
};

export async function listMyOrganizerEventIds(): Promise<string[]> {
  const { data, error } = await eventRpcClient.rpc('list_my_organizer_event_ids', {});
  if (error) throw new Error('ORGANIZER_EVENT_LIST_FAILED');
  return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : [];
}

export async function getSafeEventDetail(eventId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await eventRpcClient.rpc('event_safe_payload', {
    p_event_id: eventId,
    p_requester_id: null,
  });
  if (error) throw new Error('EVENT_DETAIL_FAILED');
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

export async function listSafeDiscoverableEvents(fromDate: string, limit = 1000): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await eventRpcClient.rpc('list_discoverable_events_safe', {
    p_from_date: fromDate,
    p_requester_id: null,
    p_limit: Math.max(1, Math.min(1000, Math.trunc(limit) || 1000)),
  });
  if (error) throw new Error('EVENT_LIST_FAILED');
  return Array.isArray(data)
    ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : [];
}

export interface SafeEventPage {
  items: Array<Record<string, unknown>>;
  offset: number;
  nextOffset: number | null;
  hasMore: boolean;
}

function normalizeEventPage(value: unknown): SafeEventPage {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    items: Array.isArray(payload.items)
      ? payload.items.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
      : [],
    offset: Math.max(0, Number(payload.offset) || 0),
    nextOffset: payload.next_offset === null || payload.next_offset === undefined
      ? null
      : Math.max(0, Number(payload.next_offset) || 0),
    hasMore: payload.has_more === true,
  };
}

export async function listSafeDiscoverableEventsPage(input: {
  fromDate: string;
  limit?: number;
  offset?: number;
}): Promise<SafeEventPage> {
  const { data, error } = await eventRpcClient.rpc('list_discoverable_events_safe_page', {
    p_from_date: input.fromDate,
    p_requester_id: null,
    p_limit: Math.max(1, Math.min(100, Math.trunc(input.limit ?? 48) || 48)),
    p_offset: Math.max(0, Math.trunc(input.offset ?? 0) || 0),
  });
  if (error) throw new Error('EVENT_LIST_PAGE_FAILED');
  return normalizeEventPage(data);
}

export async function listSafeExternalEventsPage(input: {
  fromDate: string;
  limit?: number;
  offset?: number;
}): Promise<SafeEventPage> {
  const { data, error } = await eventRpcClient.rpc('list_external_events_safe_page', {
    p_from_date: input.fromDate,
    p_limit: Math.max(1, Math.min(100, Math.trunc(input.limit ?? 48) || 48)),
    p_offset: Math.max(0, Math.trunc(input.offset ?? 0) || 0),
  });
  if (error) throw new Error('EXTERNAL_EVENT_LIST_PAGE_FAILED');
  return normalizeEventPage(data);
}

export interface ExternalEventSocialSummary {
  featureEnabled: boolean;
  companyInterestCount: number;
  thresholdMet: boolean;
  myIntent: 'interested' | 'looking_for_company' | null;
  myStatus: 'active' | 'withdrawn' | null;
  privacyMode: 'aggregate_only';
}

export async function getExternalEventSocialSummary(externalEventId: string): Promise<ExternalEventSocialSummary> {
  const { data, error } = await eventRpcClient.rpc('get_external_event_social_summary', {
    p_external_event_id: externalEventId,
  });
  if (error) throw new Error('EXTERNAL_SOCIAL_SUMMARY_FAILED');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    featureEnabled: payload.feature_enabled === true,
    companyInterestCount: Math.max(0, Number(payload.company_interest_count) || 0),
    thresholdMet: payload.threshold_met === true,
    myIntent: payload.my_intent === 'interested' || payload.my_intent === 'looking_for_company' ? payload.my_intent : null,
    myStatus: payload.my_status === 'active' || payload.my_status === 'withdrawn' ? payload.my_status : null,
    privacyMode: 'aggregate_only',
  };
}

export async function setExternalEventSocialIntent(input: {
  externalEventId: string;
  intent: 'interested' | 'looking_for_company';
  active: boolean;
  idempotencyKey?: string;
}) {
  const { data, error } = await eventRpcClient.rpc('set_external_event_social_intent', {
    p_external_event_id: input.externalEventId,
    p_intent: input.intent,
    p_active: input.active,
    p_idempotency_key: input.idempotencyKey || idempotencyKey(),
  });
  if (error) {
    const message = error.message || '';
    if (message.includes('FEATURE_DISABLED')) throw new Error('FEATURE_DISABLED');
    if (message.includes('EXTERNAL_EVENT_NOT_AVAILABLE')) throw new Error('EXTERNAL_EVENT_NOT_AVAILABLE');
    throw new Error('EXTERNAL_SOCIAL_INTENT_FAILED');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
}

async function invokeEventOperation<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('event-operations', { body });
  if (error) {
    const context = error.context as Response | undefined;
    let code = 'EVENT_OPERATION_FAILED';
    if (context) {
      const payload = await context.clone().json().catch(() => null) as OperationErrorPayload | null;
      code = payload?.error?.code || code;
    }
    throw new Error(code);
  }
  const payload = data as OperationErrorPayload | T;
  if ('error' in (payload as OperationErrorPayload) && (payload as OperationErrorPayload).error) {
    throw new Error((payload as OperationErrorPayload).error?.code || 'EVENT_OPERATION_FAILED');
  }
  return payload as T;
}

export async function joinEventAtomic(eventId: string) {
  const result = await invokeEventOperation<ParticipationMutationResult>({
    action: 'join', event_id: eventId, idempotency_key: idempotencyKey(),
  });
  return result.participation ?? null;
}

export async function cancelEventParticipation(eventId: string) {
  const result = await invokeEventOperation<ParticipationMutationResult>({
    action: 'cancel', event_id: eventId, idempotency_key: idempotencyKey(),
  });
  return result.participation ?? null;
}

export interface ArrivalConfidenceResult {
  participation_id: string;
  arriving_alone: boolean | null;
  first_hobbeast_event: boolean | null;
  arrival_visibility: 'host_only' | 'buddy_opt_in';
  replayed: boolean;
}

export async function setArrivalConfidence(input: {
  eventId: string;
  arrivingAlone: boolean | null;
  firstHobbeastEvent: boolean | null;
}) {
  const result = await invokeEventOperation<{ arrival_confidence: ArrivalConfidenceResult | null }>({
    action: 'set_arrival_confidence',
    event_id: input.eventId,
    arriving_alone: input.arrivingAlone,
    first_hobbeast_event: input.firstHobbeastEvent,
    arrival_visibility: 'host_only',
    idempotency_key: idempotencyKey(),
  });
  return result.arrival_confidence;
}

export async function transitionEventParticipant(input: {
  participationId: string;
  nextStatus: ParticipantLifecycleStatus;
  reason: string;
  idempotencyKey?: string;
}) {
  const result = await invokeEventOperation<ParticipationMutationResult>({
    action: 'organizer_transition',
    participation_id: input.participationId,
    next_status: input.nextStatus,
    reason: input.reason,
    idempotency_key: input.idempotencyKey || idempotencyKey(),
  });
  return result.participation ?? null;
}

export async function saveOrganizerNoteAtomic(participationId: string, note: string) {
  await invokeEventOperation<{ saved: boolean }>({
    action: 'save_organizer_note', participation_id: participationId, note, idempotency_key: idempotencyKey(),
  });
}

export async function completeEventAtomic(eventId: string, reason: string) {
  return invokeEventOperation<{ completion: { completed_participants: number; no_show_participants: number } | null }>({
    action: 'complete_event', event_id: eventId, reason, idempotency_key: idempotencyKey(),
  });
}

export async function saveOrganizerReadinessAssessment(eventId: string, checklist: Record<string, boolean>) {
  return invokeEventOperation<{ saved: boolean }>({
    action: 'save_readiness_assessment',
    event_id: eventId,
    checklist,
    idempotency_key: idempotencyKey(),
  });
}

function requireRpcData(result: UntypedRpcResult, code: string) {
  if (result.error) throw new Error(code);
  return result.data;
}

export async function publishOrganizerEvent(eventId: string, reason: string) {
  return requireRpcData(await eventRpcClient.rpc('publish_event_with_readiness_atomic', {
    p_event_id: eventId, p_reason: reason, p_idempotency_key: idempotencyKey(),
  }), 'EVENT_PUBLISH_FAILED');
}

export async function cancelOrganizerEvent(eventId: string, reason: string) {
  return requireRpcData(await eventRpcClient.rpc('cancel_event_atomic', {
    p_event_id: eventId, p_reason: reason, p_idempotency_key: idempotencyKey(),
  }), 'EVENT_CANCEL_FAILED');
}

export async function rescheduleOrganizerEvent(input: { eventId: string; startAt: string; endAt: string; reason: string }) {
  return requireRpcData(await eventRpcClient.rpc('reschedule_event_atomic', {
    p_event_id: input.eventId, p_start_at: input.startAt, p_end_at: input.endAt,
    p_reason: input.reason, p_idempotency_key: idempotencyKey(),
  }), 'EVENT_RESCHEDULE_FAILED');
}

export async function manageOrganizerCrew(input: {
  eventId: string; userId: string; action: 'upsert' | 'remove'; reason: string;
  canCheckIn?: boolean; canMessageAttendees?: boolean; canEditEvent?: boolean;
  canViewFinance?: boolean; canModerate?: boolean;
}) {
  return requireRpcData(await eventRpcClient.rpc('manage_event_crew_role_atomic', {
    p_event_id: input.eventId, p_user_id: input.userId, p_action: input.action,
    p_can_check_in: input.canCheckIn ?? false,
    p_can_message_attendees: input.canMessageAttendees ?? false,
    p_can_edit_event: input.canEditEvent ?? false,
    p_can_view_finance: input.canViewFinance ?? false,
    p_can_moderate: input.canModerate ?? false,
    p_reason: input.reason, p_idempotency_key: idempotencyKey(),
  }), 'EVENT_CREW_MUTATION_FAILED');
}

export async function manageOrganizerSeries(input: {
  action: 'create' | 'update' | 'deactivate'; seriesId?: string | null;
  title?: string; recurrenceRule?: string; timezone?: string; reason: string;
}) {
  return requireRpcData(await eventRpcClient.rpc('manage_event_series_atomic', {
    p_action: input.action, p_series_id: input.seriesId ?? null,
    p_title: input.title ?? null, p_recurrence_rule: input.recurrenceRule ?? null,
    p_timezone: input.timezone ?? 'Europe/Budapest', p_reason: input.reason,
    p_idempotency_key: idempotencyKey(),
  }), 'EVENT_SERIES_MUTATION_FAILED');
}

export async function manageOrganizerSeriesOccurrence(input: {
  seriesId: string; occurrenceId?: string | null; eventId?: string | null;
  originalStart: string; occurrenceStart: string;
  state: 'scheduled' | 'skipped' | 'rescheduled' | 'cancelled'; reason: string;
}) {
  return requireRpcData(await eventRpcClient.rpc('manage_event_series_occurrence_atomic', {
    p_series_id: input.seriesId, p_occurrence_id: input.occurrenceId ?? null,
    p_event_id: input.eventId ?? null, p_original_start: input.originalStart,
    p_occurrence_start: input.occurrenceStart, p_occurrence_state: input.state,
    p_reason: input.reason, p_idempotency_key: idempotencyKey(),
  }), 'EVENT_SERIES_OCCURRENCE_FAILED');
}

export async function sendOrganizerEventMessage(input: {
  eventId: string; messageType: string; audienceFilter: string; subject?: string;
  body: string; scheduledFor?: string | null; selectedParticipationIds?: string[];
  idempotencyKey?: string;
}) {
  return requireRpcData(await eventRpcClient.rpc('organizer_send_event_message_atomic', {
    p_event_id: input.eventId, p_message_type: input.messageType,
    p_audience_filter: input.audienceFilter, p_subject: input.subject ?? null,
    p_body: input.body, p_scheduled_for: input.scheduledFor ?? null,
    p_selected_participation_ids: input.selectedParticipationIds ?? [],
    p_idempotency_key: input.idempotencyKey ?? idempotencyKey(),
    p_request_id: `web-${idempotencyKey()}`,
  }), 'EVENT_MESSAGE_FAILED');
}

export interface OrganizerConfiguration {
  crew: Array<{
    id: string; user_id: string; can_check_in: boolean; can_message_attendees: boolean;
    can_edit_event: boolean; can_view_finance: boolean; can_moderate: boolean;
  }>;
  series: Array<{ id: string; title: string; recurrence_rule: string; timezone: string; is_active: boolean }>;
  occurrences: Array<{
    id: string; series_id: string; event_id: string | null; original_start: string;
    occurrence_start: string; occurrence_state: string; exception_reason: string | null;
  }>;
}

export async function getOrganizerConfiguration(eventId: string) {
  return invokeEventOperation<OrganizerConfiguration>({
    action: 'organizer_configuration', event_id: eventId, idempotency_key: idempotencyKey(),
  });
}

export async function createOrganizerIncidentHandoff(input: {
  eventId: string;
  incidentType: 'safety' | 'venue' | 'attendance' | 'accessibility' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}) {
  return invokeEventOperation<{ incident: { id: string; state: string; created_at: string } }>({
    action: 'create_incident_handoff',
    event_id: input.eventId,
    incident_type: input.incidentType,
    severity: input.severity,
    summary: input.summary,
    idempotency_key: idempotencyKey(),
  });
}

export async function submitPostEventFeedback(input: {
  eventId: string;
  descriptionAccuracy?: number | null;
  feltSafe?: boolean | null;
  wouldReturn?: boolean | null;
  privateNote?: string | null;
  moodScore?: number | null;
  metNewPeople?: boolean | null;
  wantToMeetAgain?: boolean | null;
}) {
  const result = await invokeEventOperation<{ saved: boolean }>({
    action: 'submit_feedback',
    event_id: input.eventId,
    description_accuracy: input.descriptionAccuracy ?? null,
    felt_safe: input.feltSafe ?? null,
    would_return: input.wouldReturn ?? null,
    private_note: input.privateNote?.trim() || null,
    mood_score: input.moodScore ?? null,
    met_new_people: input.metNewPeople ?? null,
    want_to_meet_again: input.wantToMeetAgain ?? null,
    idempotency_key: idempotencyKey(),
  });
  void trackProductEvent('post_event_feedback', {
    event_id: input.eventId, source: 'participant', surface: 'event_detail', status: 'submitted',
  });
  return result;
}

export async function getPublicParticipantCounts(eventIds: string[]): Promise<PublicParticipantCount[]> {
  if (eventIds.length === 0) return [];
  const result = await invokeEventOperation<{ counts: Array<Record<string, unknown>> }>({
    action: 'counts', event_ids: [...new Set(eventIds)].slice(0, 100),
  });
  return result.counts.map((row) => ({
    event_id: String(row.event_id),
    total: Number(row.total) || 0,
    going: Number(row.going) || 0,
    waitlist: Number(row.waitlist) || 0,
    checked_in: Number(row.checked_in) || 0,
    completed: Number(row.completed) || 0,
    cancelled: Number(row.cancelled) || 0,
  }));
}
