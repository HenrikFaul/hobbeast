import type { ParticipantLifecycleStatus, ReadinessEventLike } from '@/lib/eventLifecycle';

export type OrganizerCapability = 'check_in' | 'message_attendees' | 'edit_event' | 'view_finance' | 'moderate';

export interface OrganizerEventTemplate {
  id: 'walk' | 'hike' | 'board_games' | 'workshop' | 'sport' | 'tech_meetup' | 'gastronomy';
  label: string;
  values: Partial<ReadinessEventLike> & { category: string; tags: string[] };
}

export const ORGANIZER_EVENT_TEMPLATES: OrganizerEventTemplate[] = [
  { id: 'walk', label: 'Közösségi séta', values: { category: 'Utazás & Felfedezés › Utazási stílusok › Városfelfedezés / Séta', tags: ['séta', 'kezdőbarát'], beginnerFriendly: true, activityIntensity: 'könnyű' } as OrganizerEventTemplate['values'] },
  { id: 'hike', label: 'Túra', values: { category: 'Természet & Túra › Túrázás › Napi túra', tags: ['túra', 'természet'], equipmentRequired: 'Időjárásnak megfelelő cipő és víz' } as OrganizerEventTemplate['values'] },
  { id: 'board_games', label: 'Társasjáték-est', values: { category: 'Társasjáték & Gondolkodás › Társasjátékok › Társasozás (általános)', tags: ['társasjáték', 'kezdőbarát'], beginnerFriendly: true } as OrganizerEventTemplate['values'] },
  { id: 'workshop', label: 'Workshop', values: { category: 'Kreatív & Kézműves › Kézművesség › Kerámiázás', tags: ['workshop'], equipmentRequired: 'A host által jelzett eszközök' } as OrganizerEventTemplate['values'] },
  { id: 'sport', label: 'Közös sport', values: { category: 'Sport & Mozgás › Futás & Atlétika › Futás', tags: ['sport'], activityIntensity: 'közepes' } as OrganizerEventTemplate['values'] },
  { id: 'tech_meetup', label: 'Tech meetup', values: { category: 'Önkéntesség & Közösség › Közösségépítés › Meetup / Networking', tags: ['tech', 'meetup'] } as OrganizerEventTemplate['values'] },
  { id: 'gastronomy', label: 'Gasztro találkozó', values: { category: 'Gasztronómia › Főzés & Sütés › Főzés', tags: ['gasztro', 'közösség'] } as OrganizerEventTemplate['values'] },
];

export function applyOrganizerTemplate<T extends Record<string, unknown>>(current: T, template: OrganizerEventTemplate): T {
  const next = { ...current };
  for (const [key, value] of Object.entries(template.values)) {
    const existing = next[key];
    const isBlank = existing === null || existing === undefined || existing === '' || (Array.isArray(existing) && existing.length === 0);
    if (isBlank) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

export const SAFE_BULK_TRANSITIONS: Readonly<Record<ParticipantLifecycleStatus, ReadonlySet<ParticipantLifecycleStatus>>> = {
  invited: new Set(['going', 'waitlist', 'cancelled']),
  interested: new Set(['going', 'waitlist', 'cancelled']),
  going: new Set(['cancelled', 'no_show']),
  waitlist: new Set(['going', 'cancelled']),
  checked_in: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export function validateBulkParticipantTransition(current: ParticipantLifecycleStatus[], next: ParticipantLifecycleStatus) {
  const invalid = current.filter((status) => status !== next && !SAFE_BULK_TRANSITIONS[status].has(next));
  return { allowed: invalid.length === 0, invalidStatuses: [...new Set(invalid)] };
}

export interface HostReliabilityInput {
  publishedEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  expectedAttendees: number;
  attendedParticipants: number;
  noShowParticipants: number;
  repeatParticipants?: number | null;
  reportCount?: number | null;
  medianResponseHours?: number | null;
}

export interface HostReliabilityView {
  publishToCompletionRate: number | null;
  cancellationRate: number | null;
  attendanceRate: number | null;
  noShowRate: number | null;
  repeatParticipantRate: number | null;
  reportRate: number | null;
  responseTimeHours: number | null;
  explanations: string[];
}

function ratio(numerator: number | null | undefined, denominator: number) {
  return numerator !== null && numerator !== undefined && denominator > 0
    ? Number((numerator / denominator).toFixed(4))
    : null;
}

export function calculateHostReliability(input: HostReliabilityInput): HostReliabilityView {
  const explanations: string[] = [];
  if (input.publishedEvents === 0) explanations.push('Még nincs elég publikált esemény a completion/cancellation arányhoz.');
  if (input.expectedAttendees === 0) explanations.push('Még nincs elég attendance adat.');
  explanations.push('A nézet belső minőségfejlesztési jelzés; nem automatikus büntetés vagy publikus rangsor.');
  return {
    publishToCompletionRate: ratio(input.completedEvents, input.publishedEvents),
    cancellationRate: ratio(input.cancelledEvents, input.publishedEvents),
    attendanceRate: ratio(input.attendedParticipants, input.expectedAttendees),
    noShowRate: ratio(input.noShowParticipants, input.expectedAttendees),
    repeatParticipantRate: ratio(input.repeatParticipants, input.attendedParticipants),
    reportRate: ratio(input.reportCount, input.attendedParticipants),
    responseTimeHours: Number.isFinite(input.medianResponseHours) ? Math.max(0, Number(input.medianResponseHours)) : null,
    explanations,
  };
}
