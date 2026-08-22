export const FIRST_EVENT_FORMAT_OPTIONS = [
  { value: 'guided_beginner', label: 'Vezetett kezdő alkalom' },
  { value: 'small_group_intro', label: 'Kiscsoportos bemutatkozó program' },
  { value: 'drop_in_social', label: 'Kötetlen, bármikor becsatlakozható alkalom' },
  { value: 'easy_outdoor', label: 'Könnyű szabadtéri program' },
  { value: 'buddy_welcome', label: 'Buddyval vagy host-fogadással induló program' },
] as const;

export type FirstEventFormat = typeof FIRST_EVENT_FORMAT_OPTIONS[number]['value'];
export type FirstEventConfidenceVisibility = 'private' | 'event_host_after_join';

export interface FirstEventConfidenceDraft {
  preferredEventFormats: FirstEventFormat[];
  beginnerFriendly: boolean | null;
  soloArrivalComfort: 'prefer_buddy' | 'comfortable' | 'no_preference';
  preferredGroupSize: 'small' | 'medium' | 'large' | 'no_preference';
  accessibilityNeeds: string;
  communicationPreference: 'in_app' | 'email' | 'minimal';
  visibility: FirstEventConfidenceVisibility;
}

export interface FirstEventConfidenceRecord {
  preferred_event_formats: FirstEventFormat[];
  beginner_friendly: boolean | null;
  solo_arrival_comfort: 'prefer_buddy' | 'comfortable' | null;
  preferred_group_size: 'small' | 'medium' | 'large' | null;
  accessibility_needs: string | null;
  communication_preference: 'in_app' | 'email' | 'minimal' | null;
  visibility: FirstEventConfidenceVisibility;
  updated_at: string | null;
}

const FORMAT_VALUES = new Set(FIRST_EVENT_FORMAT_OPTIONS.map((option) => option.value));

export function normalizeFirstEventFormats(values: readonly string[]): FirstEventFormat[] {
  return [...new Set(values)]
    .filter((value): value is FirstEventFormat => FORMAT_VALUES.has(value as FirstEventFormat))
    .slice(0, 5)
    .sort();
}

export function buildFirstEventConfidencePayload(draft: FirstEventConfidenceDraft) {
  return {
    preferred_event_formats: normalizeFirstEventFormats(draft.preferredEventFormats),
    beginner_friendly: draft.beginnerFriendly,
    solo_arrival_comfort: draft.soloArrivalComfort,
    preferred_group_size: draft.preferredGroupSize,
    accessibility_needs: draft.accessibilityNeeds.trim().slice(0, 500),
    communication_preference: draft.communicationPreference,
    visibility: draft.visibility,
  };
}

export function firstEventConfidenceVisibilityLabel(visibility: FirstEventConfidenceVisibility) {
  return visibility === 'event_host_after_join'
    ? 'Csak olyan esemény hostja láthatja, amelyhez már csatlakoztál'
    : 'Csak te látod; ajánlási preferenciaként használható';
}

