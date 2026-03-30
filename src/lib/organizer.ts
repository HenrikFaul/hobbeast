import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type ParticipationStatus = 'interested' | 'going' | 'waitlist' | 'checked_in' | 'cancelled' | 'no_show';
export type MessageAudience = 'all' | 'going' | 'waitlist' | 'checked_in' | 'no_show';
export type MessageType = 'reminder' | 'logistics_update' | 'event_update' | 'cancellation' | 'custom_message';
export type DeliveryState = 'draft' | 'scheduled' | 'sent' | 'partially_failed' | 'failed';

export interface OrganizerEventSummary {
  id: string;
  title: string;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  category: string;
  image_emoji: string | null;
  max_attendees: number | null;
  waitlist_enabled: boolean | null;
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

export async function getOwnedEvents(userId: string): Promise<OrganizerEventSummary[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id,title,event_date,event_time,location_city,category,image_emoji,max_attendees,waitlist_enabled,event_participants(status,checked_in_at)')
    .eq('created_by', userId)
    .order('event_date', { ascending: true, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((event: any) => {
    const participants = event.event_participants ?? [];
    return {
      id: event.id,
      title: event.title,
      event_date: event.event_date,
      event_time: event.event_time,
      location_city: event.location_city,
      category: event.category,
      image_emoji: event.image_emoji,
      max_attendees: event.max_attendees,
      waitlist_enabled: event.waitlist_enabled,
      participantCount: participants.length,
      goingCount: participants.filter((p: any) => p.status === 'going').length,
      waitlistCount: participants.filter((p: any) => p.status === 'waitlist').length,
      checkedInCount: participants.filter((p: any) => p.status === 'checked_in').length,
    };
  });
}

export async function getEventParticipants(
  eventId: string,
  options?: { status?: ParticipationStatus | 'all'; search?: string },
): Promise<OrganizerParticipant[]> {
  let query = supabase
    .from('event_participants')
    .select('id,event_id,user_id,joined_at,status,checked_in_at,organizer_note,invite_code,profiles(display_name,avatar_url,city)')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const lowered = options?.search?.trim().toLowerCase();
  const rows = (data ?? []) as OrganizerParticipant[];
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
  metadata?: Record<string, Json>;
}) {
  const updatePayload: Record<string, unknown> = {
    status: params.nextStatus,
  };

  if (params.nextStatus === 'checked_in') {
    updatePayload.checked_in_at = new Date().toISOString();
  }
  if (params.nextStatus !== 'checked_in') {
    updatePayload.checked_in_at = null;
  }

  const { error } = await supabase
    .from('event_participants')
    .update(updatePayload)
    .eq('id', params.participantId)
    .eq('event_id', params.eventId);

  if (error) throw error;

  const actionMap: Record<ParticipationStatus, string> = {
    interested: 'joined',
    going: 'promoted',
    waitlist: 'waitlisted',
    checked_in: 'checked_in',
    cancelled: 'cancelled',
    no_show: 'no_show',
  };

  await supabase.from('participation_audits' as any).insert({
    participation_id: params.participantId,
    event_id: params.eventId,
    action: actionMap[params.nextStatus],
    actor_user_id: params.actorUserId,
    metadata: params.metadata ?? null,
  });
}

export async function saveOrganizerNote(params: {
  participantId: string;
  eventId: string;
  actorUserId: string;
  organizerNote: string;
}) {
  const { error } = await supabase
    .from('event_participants')
    .update({ organizer_note: params.organizerNote })
    .eq('id', params.participantId)
    .eq('event_id', params.eventId);

  if (error) throw error;

  await supabase.from('participation_audits' as any).insert({
    participation_id: params.participantId,
    event_id: params.eventId,
    action: 'note_updated',
    actor_user_id: params.actorUserId,
    metadata: { organizer_note: params.organizerNote },
  });
}

export async function getParticipationAudit(participantId: string) {
  const { data, error } = await supabase
    .from('participation_audits' as any)
    .select('*')
    .eq('participation_id', participantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getEventMessages(eventId: string): Promise<OrganizerMessage[]> {
  const { data, error } = await supabase
    .from('event_messages' as any)
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrganizerMessage[];
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
}) {
  const { data, error } = await supabase
    .from('event_messages' as any)
    .insert({
      event_id: input.eventId,
      actor_user_id: input.actorUserId,
      message_type: input.messageType,
      audience_filter: input.audienceFilter,
      subject: input.subject ?? null,
      body: input.body,
      delivery_state: input.deliveryState,
      scheduled_for: input.scheduledFor ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as OrganizerMessage;
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
  return (data ?? []).map((row: any) => ({ ...row.events, participation_status: row.status }));
}

export async function getOrganizerAnalytics(eventId: string) {
  const { data: participants, error } = await supabase
    .from('event_participants')
    .select('status,joined_at,checked_in_at')
    .eq('event_id', eventId);
  if (error) throw error;

  const rows = participants ?? [];
  const going = rows.filter((row: any) => row.status === 'going').length;
  const waitlist = rows.filter((row: any) => row.status === 'waitlist').length;
  const checkedIn = rows.filter((row: any) => row.status === 'checked_in').length;
  const noShow = rows.filter((row: any) => row.status === 'no_show').length;
  const interested = rows.filter((row: any) => row.status === 'interested').length;
  const cancelled = rows.filter((row: any) => row.status === 'cancelled').length;

  return {
    totalViews: 0,
    uniqueViewers: 0,
    detailOpens: 0,
    joinClicks: interested + going + waitlist + checkedIn + cancelled + noShow,
    going,
    waitlist,
    checkedIn,
    noShow,
    attendanceRate: going > 0 ? checkedIn / going : 0,
    sourceBreakdown: [
      { source: 'hobbeast_native', views: 0, joins: going + interested + waitlist, checkedIn },
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
