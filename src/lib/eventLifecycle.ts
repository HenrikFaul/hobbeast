export type CanonicalEventLifecycle =
  | 'draft'
  | 'published'
  | 'full'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'archived';

export type StoredEventOutcome =
  | CanonicalEventLifecycle
  | 'scheduled'
  | 'held'
  | null
  | undefined;

export type ParticipantLifecycleStatus =
  | 'invited'
  | 'interested'
  | 'going'
  | 'waitlist'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type ParticipationActor = 'participant' | 'organizer' | 'system';

export interface EventLifecycleInput {
  outcomeStatus?: StoredEventOutcome;
  isActive?: boolean | null;
  eventDate?: string | null;
  eventTime?: string | null;
  maxAttendees?: number | null;
  activeAttendanceCount?: number;
  now?: Date;
  archiveAfterDays?: number;
}

export interface JoinDecisionInput {
  lifecycle: CanonicalEventLifecycle;
  maxAttendees?: number | null;
  activeAttendanceCount: number;
  waitlistEnabled?: boolean | null;
  existingStatus?: ParticipantLifecycleStatus | null;
}

export type JoinDecision =
  | { accepted: true; status: 'going' | 'waitlist'; reason: 'available' | 'waitlist' | 'idempotent' }
  | { accepted: false; status: null; reason: 'not_joinable' | 'full_without_waitlist' };

const JOINABLE_EVENT_STATES = new Set<CanonicalEventLifecycle>(['published', 'full']);

const PARTICIPANT_TRANSITIONS: Record<ParticipantLifecycleStatus, ReadonlySet<ParticipantLifecycleStatus>> = {
  invited: new Set(['going', 'waitlist', 'cancelled']),
  interested: new Set(['going', 'waitlist', 'cancelled']),
  going: new Set(['checked_in', 'cancelled', 'no_show']),
  waitlist: new Set(['going', 'cancelled']),
  checked_in: new Set(['going', 'completed']),
  completed: new Set(),
  cancelled: new Set(['going', 'waitlist']),
  no_show: new Set(['going', 'checked_in']),
};

function parseEventStart(eventDate?: string | null, eventTime?: string | null) {
  if (!eventDate) return null;
  const value = new Date(`${eventDate}T${eventTime || '00:00:00'}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Maps legacy persisted values to the canonical lifecycle without inventing a
 * second database status. Time is only used for a conservative presentation
 * state; completing attendance always remains an explicit organizer action.
 */
export function resolveEventLifecycle(input: EventLifecycleInput): CanonicalEventLifecycle {
  const outcome = input.outcomeStatus;
  if (outcome === 'cancelled') return 'cancelled';
  if (outcome === 'archived') return 'archived';
  if (outcome === 'completed' || outcome === 'held') return 'completed';
  if (outcome === 'started') return 'started';
  if (outcome === 'draft') return 'draft';
  if (input.isActive === false) return 'archived';

  const start = parseEventStart(input.eventDate, input.eventTime);
  const now = input.now ?? new Date();
  const archiveAfterDays = input.archiveAfterDays ?? 30;
  if (start && now.getTime() > start.getTime() + archiveAfterDays * 86_400_000) return 'archived';
  if (start && now >= start) return 'started';

  const capacity = input.maxAttendees;
  if (capacity && capacity > 0 && (input.activeAttendanceCount ?? 0) >= capacity) return 'full';
  return 'published';
}

export function decideEventJoin(input: JoinDecisionInput): JoinDecision {
  if (input.existingStatus && ['going', 'waitlist', 'checked_in', 'completed'].includes(input.existingStatus)) {
    const status = input.existingStatus === 'waitlist' ? 'waitlist' : 'going';
    return { accepted: true, status, reason: 'idempotent' };
  }
  if (!JOINABLE_EVENT_STATES.has(input.lifecycle)) {
    return { accepted: false, status: null, reason: 'not_joinable' };
  }
  const full = Boolean(input.maxAttendees && input.maxAttendees > 0 && input.activeAttendanceCount >= input.maxAttendees);
  if (!full) return { accepted: true, status: 'going', reason: 'available' };
  if (input.waitlistEnabled) return { accepted: true, status: 'waitlist', reason: 'waitlist' };
  return { accepted: false, status: null, reason: 'full_without_waitlist' };
}

export function canTransitionParticipation(
  current: ParticipantLifecycleStatus,
  next: ParticipantLifecycleStatus,
  actor: ParticipationActor,
) {
  if (current === next) return true;
  if (!PARTICIPANT_TRANSITIONS[current].has(next)) return false;
  if (actor === 'participant') return next === 'cancelled' || (current === 'invited' && next === 'going');
  if (actor === 'system') return (current === 'waitlist' && next === 'going') || (current === 'checked_in' && next === 'completed');
  return true;
}

export interface PrivateLocationVisibilityInput {
  isPrivate: boolean;
  isOrganizer?: boolean;
  hasActiveRsvp?: boolean;
  safetyOverride?: boolean;
  eventStart?: Date | null;
  now?: Date;
  revealWindowHours?: number;
}

export type LocationPrecision = 'coarse' | 'rsvp_detail' | 'full';

export function resolveLocationPrecision(input: PrivateLocationVisibilityInput): LocationPrecision {
  if (!input.isPrivate || input.isOrganizer || input.safetyOverride) return 'full';
  if (!input.hasActiveRsvp) return 'coarse';
  if (!input.eventStart) return 'rsvp_detail';
  const revealAt = input.eventStart.getTime() - (input.revealWindowHours ?? 24) * 3_600_000;
  return (input.now ?? new Date()).getTime() >= revealAt ? 'full' : 'rsvp_detail';
}

export interface ReadinessEventLike {
  title?: string | null;
  description?: string | null;
  locationCity?: string | null;
  meetingInstructions?: string | null;
  maxAttendees?: number | null;
  cancellationPolicy?: string | null;
  checkInMethod?: string | null;
  safetyPolicy?: string | null;
  accessibilityInfo?: string | null;
  hostIdentityReady?: boolean;
  participantCommunicationReady?: boolean;
  legalTaxReady?: boolean;
}

export interface ReadinessItem {
  key: string;
  label: string;
  complete: boolean;
  blockingForNewEvent: boolean;
}

export function buildOrganizerReadinessChecklist(event: ReadinessEventLike): ReadinessItem[] {
  return [
    { key: 'identity', label: 'Host profil és azonosítás', complete: event.hostIdentityReady === true, blockingForNewEvent: true },
    { key: 'description', label: 'Pontos eseményleírás', complete: Boolean(event.title?.trim() && event.description?.trim()), blockingForNewEvent: true },
    { key: 'safety', label: 'Biztonsági és résztvevői szabályok', complete: Boolean(event.safetyPolicy?.trim()), blockingForNewEvent: true },
    { key: 'location', label: 'Helyszín és találkozási instrukció', complete: Boolean(event.locationCity?.trim() && event.meetingInstructions?.trim()), blockingForNewEvent: true },
    { key: 'capacity', label: 'Kapacitás és várólista-döntés', complete: Boolean(event.maxAttendees && event.maxAttendees > 0), blockingForNewEvent: true },
    { key: 'cancellation', label: 'Lemondási szabály', complete: Boolean(event.cancellationPolicy?.trim()), blockingForNewEvent: true },
    { key: 'checkin', label: 'Check-in folyamat', complete: Boolean(event.checkInMethod?.trim()), blockingForNewEvent: false },
    { key: 'communication', label: 'Résztvevői kommunikáció', complete: event.participantCommunicationReady === true, blockingForNewEvent: false },
    { key: 'accessibility', label: 'Hozzáférhetőségi információ', complete: Boolean(event.accessibilityInfo?.trim()), blockingForNewEvent: false },
    { key: 'legal_tax', label: 'Jogi és adózási kötelezettségek', complete: event.legalTaxReady === true, blockingForNewEvent: true },
  ];
}

export function completionStatusForParticipant(status: ParticipantLifecycleStatus) {
  if (status === 'checked_in') return 'completed' as const;
  if (status === 'going') return 'no_show' as const;
  return status;
}
