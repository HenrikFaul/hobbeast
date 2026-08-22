import { supabase } from '@/integrations/supabase/client';
import { getParticipantStatsMap } from '@/lib/eventParticipantStats';
import { listMyOrganizerEventIds, saveOrganizerNoteAtomic, sendOrganizerEventMessage, transitionEventParticipant } from '@/lib/eventOperations';

export type ParticipationStatus = 'invited' | 'interested' | 'going' | 'waitlist' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type MessageAudience = 'all' | 'going' | 'waitlist' | 'checked_in' | 'selected';
export type MessageType = 'reminder' | 'logistics_update' | 'event_update' | 'cancellation' | 'custom_message';
export type DeliveryState = 'draft' | 'scheduled' | 'sent' | 'partially_failed' | 'failed';

export interface OrganizerEventSummary {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  category: string;
  image_emoji: string | null;
  max_attendees: number | null;
  waitlist_enabled: boolean | null;
  outcome_status: string | null;
  meeting_instructions: string | null;
  cancellation_policy: string | null;
  accessibility_info: string | null;
  host_responsibility_accepted_at: string | null;
  participantCount: number;
  goingCount: number;
  waitlistCount: number;
  checkedInCount: number;
}

export interface OrganizerParticipant {
  id: string;
  event_id: string;
  user_id: string;
  joined_at: string;
  status: ParticipationStatus;
  checked_in_at: string | null;
  organizer_note: string | null;
  invite_code: string | null;
  arriving_alone: boolean | null;
  first_hobbeast_event: boolean | null;
  arrival_visibility: 'host_only' | 'buddy_opt_in';
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    city: string | null;
  } | null;
}

export interface OrganizerMessage {
  id: string;
  event_id: string;
  message_type: MessageType;
  audience_filter: MessageAudience;
  subject: string | null;
  body: string;
  delivery_state: DeliveryState;
  scheduled_for: string | null;
  created_at: string;
}

export async function getOwnedEvents(_userId: string): Promise<OrganizerEventSummary[]> {
  const eventIds = await listMyOrganizerEventIds();
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select('id,title,description,event_date,event_time,location_city,category,image_emoji,max_attendees,waitlist_enabled,outcome_status,meeting_instructions,cancellation_policy,accessibility_info,host_responsibility_accepted_at')
    .in('id', eventIds)
    .order('event_date', { ascending: true, nullsFirst: false });

  if (error) throw error;

  const statsMap = await getParticipantStatsMap((data ?? []).map((event) => event.id));

  return (data ?? []).map((event) => {
    const stats = statsMap.get(event.id) ?? { total: 0, going: 0, waitlist: 0, checkedIn: 0, cancelled: 0 };
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      event_date: event.event_date,
      event_time: event.event_time,
      location_city: event.location_city,
      category: event.category,
      image_emoji: event.image_emoji,
      max_attendees: event.max_attendees,
      waitlist_enabled: event.waitlist_enabled,
      outcome_status: event.outcome_status,
      meeting_instructions: event.meeting_instructions,
      cancellation_policy: event.cancellation_policy,
      accessibility_info: event.accessibility_info,
      host_responsibility_accepted_at: event.host_responsibility_accepted_at,
      participantCount: stats.total,
      goingCount: stats.going,
      waitlistCount: stats.waitlist,
      checkedInCount: stats.checkedIn,
    };
  });
}

export async function getEventParticipants(
  eventId: string,
  options?: { status?: ParticipationStatus | 'all'; search?: string },
): Promise<OrganizerParticipant[]> {
  let query = supabase
    .from('event_participants')
    .select('id,event_id,user_id,joined_at,status,checked_in_at,organizer_note,invite_code,arriving_alone,first_hobbeast_event,arrival_visibility')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Participant identity is an allowlisted, event-scoped RPC contract. Never
  // read raw profile rows from an organizer surface.
  const participantRows = (data ?? []) as unknown as Array<Omit<OrganizerParticipant, 'profiles'>>;
  const { data: profilesData, error: profilesError } = participantRows.length > 0
    ? await supabase.rpc('get_event_participant_cards', { _event_id: eventId })
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const profileMap = new Map((profilesData ?? []).map((p) => [p.user_id, p]));

  const rows: OrganizerParticipant[] = participantRows.map((p) => ({
    ...p,
    status: p.status as ParticipationStatus,
    profiles: profileMap.get(p.user_id) ?? null,
  }));

  const lowered = options?.search?.trim().toLowerCase();
  if (!lowered) return rows;

  return rows.filter((row) => {
    const displayName = row.profiles?.display_name?.toLowerCase() ?? '';
    const inviteCode = row.invite_code?.toLowerCase() ?? '';
    return displayName.includes(lowered) || inviteCode.includes(lowered) || row.user_id.toLowerCase().includes(lowered);
  });
}

export async function transitionParticipation(params: {
  participantId: string;
  eventId: string;
  actorUserId: string;
  nextStatus: ParticipationStatus;
  metadata?: Record<string, unknown>;
}) {
  const previous = typeof params.metadata?.from_status === 'string' ? params.metadata.from_status : 'unknown';
  return transitionEventParticipant({
    participationId: params.participantId,
    nextStatus: params.nextStatus,
    reason: `organizer_dashboard:${previous}->${params.nextStatus}`,
  });
}

export interface ParticipationAuditEntry {
  id: string;
  participation_id: string;
  event_id: string;
  action: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface OrganizerAnalytics {
  totalViews: number;
  uniqueViewers: number;
  detailOpens: number;
  joinClicks: number;
  going: number;
  waitlist: number;
  checkedIn: number;
  completed: number;
  noShow: number;
  attendanceRate: number;
  sourceBreakdown: Array<{ source: string; views: number; joins: number; checkedIn: number }>;
}

export async function saveOrganizerNote(params: {
  participantId: string;
  eventId: string;
  actorUserId: string;
  organizerNote: string;
}) {
  return saveOrganizerNoteAtomic(params.participantId, params.organizerNote);
}

export async function getParticipationAudit(participantId: string): Promise<ParticipationAuditEntry[]> {
  const { data, error } = await supabase
    .from('participation_audits')
    .select('*')
    .eq('participation_id', participantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ParticipationAuditEntry[];
}

export async function getEventMessages(eventId: string): Promise<OrganizerMessage[]> {
  const { data, error } = await supabase
    .from('event_messages')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrganizerMessage[];
}

export async function createEventMessage(input: {
  eventId: string;
  actorUserId: string;
  messageType: MessageType;
  audienceFilter: MessageAudience;
  subject?: string;
  body: string;
  deliveryState: DeliveryState;
  scheduledFor?: string | null;
  selectedParticipationIds?: string[];
}) {
  return sendOrganizerEventMessage({
    eventId: input.eventId,
    messageType: input.messageType,
    audienceFilter: input.audienceFilter,
    subject: input.subject,
    body: input.body,
    scheduledFor: input.scheduledFor,
    selectedParticipationIds: input.selectedParticipationIds,
  });
}

export async function getUpcomingJoinedEvents(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('event_participants')
    .select('status,event_id,events(id,title,event_date,event_time,location_city,image_emoji)')
    .eq('user_id', userId)
    .in('status', ['going', 'waitlist'])
    .gte('events.event_date', today)
    .order('joined_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row.events, participation_status: row.status }));
}

export async function getOrganizerAnalytics(eventId: string): Promise<OrganizerAnalytics> {
  const { data: participants, error } = await supabase
    .from('event_participants')
    .select('status,joined_at,checked_in_at')
    .eq('event_id', eventId);
  if (error) throw error;

  const rows = participants ?? [];
  const going = rows.filter((row) => row.status === 'going').length;
  const waitlist = rows.filter((row) => row.status === 'waitlist').length;
  const checkedIn = rows.filter((row) => row.status === 'checked_in').length;
  const completed = rows.filter((row) => row.status === 'completed').length;
  const noShow = rows.filter((row) => row.status === 'no_show').length;
  const interested = rows.filter((row) => row.status === 'interested').length;
  const cancelled = rows.filter((row) => row.status === 'cancelled').length;

  return {
    totalViews: 0,
    uniqueViewers: 0,
    detailOpens: 0,
    joinClicks: interested + going + waitlist + checkedIn + completed + cancelled + noShow,
    going,
    waitlist,
    checkedIn,
    noShow,
    completed,
    attendanceRate: going + checkedIn + completed > 0 ? (checkedIn + completed) / (going + checkedIn + completed) : 0,
    sourceBreakdown: [
      { source: 'hobbeast_native', views: 0, joins: going + interested + waitlist, checkedIn: checkedIn + completed },
    ],
  };
}

export function buildAttendeeCsv(rows: OrganizerParticipant[]) {
  const header = ['display_name', 'user_id', 'status', 'joined_at', 'checked_in_at', 'invite_code'];
  const escape = (value: string | null | undefined) => {
    const normalized = value ?? '';
    return `"${normalized.replace(/"/g, '""')}"`;
  };
  return [
    header.join(','),
    ...rows.map((row) => [
      escape(row.profiles?.display_name ?? null),
      escape(row.user_id),
      escape(row.status),
      escape(row.joined_at),
      escape(row.checked_in_at),
      escape(row.invite_code),
    ].join(',')),
  ].join('\n');
}
