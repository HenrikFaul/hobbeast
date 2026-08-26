import type {
  MessageAudience,
  MessageType,
  OrganizerEventSummary,
  OrganizerParticipant,
  ParticipationStatus,
} from '@/lib/organizer';

export type OrganizerDashboardTab = 'events' | 'attendees' | 'checkin' | 'messages' | 'analytics' | 'sources' | 'settings';
export type OrganizerIncidentType = 'safety' | 'venue' | 'attendance' | 'accessibility' | 'other';
export type OrganizerIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type OrganizerStatusBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export const ORGANIZER_DASHBOARD_TABS: Array<{ value: OrganizerDashboardTab; label: string }> = [
  { value: 'events', label: 'My events' },
  { value: 'attendees', label: 'Attendees' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'messages', label: 'Messages' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'sources', label: 'Program sources' },
  { value: 'settings', label: 'Settings' },
];

export const PARTICIPATION_FILTERS: Array<{ value: ParticipationStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Összes' },
  { value: 'interested', label: 'Érdeklődik' },
  { value: 'going', label: 'Megy' },
  { value: 'waitlist', label: 'Várólista' },
  { value: 'checked_in', label: 'Bejelentkezett' },
  { value: 'completed', label: 'Teljesített részvétel' },
  { value: 'cancelled', label: 'Lemondta' },
  { value: 'no_show', label: 'No-show' },
];

export const MESSAGE_AUDIENCES: Array<{ value: MessageAudience; label: string }> = [
  { value: 'all', label: 'Összes résztvevő' },
  { value: 'going', label: 'Megerősítettek' },
  { value: 'waitlist', label: 'Várólistások' },
  { value: 'checked_in', label: 'Bejelentkezettek' },
  { value: 'selected', label: 'Kijelölt résztvevők' },
];

export const MESSAGE_TYPES: Array<{ value: MessageType; label: string }> = [
  { value: 'reminder', label: 'Emlékeztető' },
  { value: 'logistics_update', label: 'Logisztikai frissítés' },
  { value: 'event_update', label: 'Eseményfrissítés' },
  { value: 'cancellation', label: 'Lemondás' },
  { value: 'custom_message', label: 'Egyedi üzenet' },
];

export function getParticipationStatusBadgeVariant(status: ParticipationStatus): OrganizerStatusBadgeVariant {
  switch (status) {
    case 'going':
      return 'default';
    case 'checked_in':
      return 'secondary';
    case 'waitlist':
      return 'outline';
    case 'cancelled':
    case 'no_show':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function getParticipationStatusLabel(status: ParticipationStatus) {
  return PARTICIPATION_FILTERS.find((item) => item.value === status)?.label ?? status;
}

export function selectOwnedOrganizerEventId(events: OrganizerEventSummary[], requestedEventId: string | null) {
  return requestedEventId && events.some((event) => event.id === requestedEventId)
    ? requestedEventId
    : events[0]?.id ?? '';
}

export function filterOrganizerCheckInCandidates(
  participants: OrganizerParticipant[],
  checkInSearch: string,
  inviteCode: string,
) {
  const search = checkInSearch.trim().toLowerCase();
  const invite = inviteCode.trim().toLowerCase();
  return participants.filter((participant) => {
    const displayName = participant.profiles?.display_name?.toLowerCase() ?? '';
    const code = participant.invite_code?.toLowerCase() ?? '';
    if (invite) return code.includes(invite);
    if (!search) return ['going', 'checked_in', 'waitlist'].includes(participant.status);
    return displayName.includes(search) || code.includes(search);
  });
}

