export interface ReconnectionCard {
  avatar_url: string | null;
  city: string | null;
  confidence_status: string;
  display_name: string | null;
  encounter_id: string;
  event_id: string;
  event_title: string;
  expires_at: string;
  interests: string[] | null;
  other_user_id: string;
}

export interface ConnectionCard {
  avatar_url: string | null;
  city: string | null;
  connected_at: string;
  connection_id: string;
  display_name: string | null;
  interests: string[] | null;
  other_user_id: string;
}

export interface CircleCard {
  id: string;
  host_id: string;
  name: string;
  purpose: string;
  cadence: string;
  capacity: number;
  membership_policy: string;
  lifecycle_state: string;
  safety_rules: string | null;
  visibility: string;
}

export interface CircleSuggestionCard {
  suggestion_id: string;
  activity_label: string;
  city: string | null;
  suggested_member_count: number;
  status: string;
  expires_at: string;
}

export interface CircleMemberCard {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  role: string;
  joined_at: string | null;
}

export interface CirclePendingRequest {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
  rules_acknowledged: boolean;
}

export interface CircleDetail {
  circle_id: string;
  name: string;
  purpose: string;
  cadence: string;
  capacity: number;
  membership_policy: string;
  lifecycle_state: string;
  venue_preference: string | null;
  safety_rules: string | null;
  host_id: string;
  members: CircleMemberCard[];
  shared_interests?: Array<{
    label: string;
    member_count: number;
  }>;
  pending_requests: CirclePendingRequest[];
  next_event: {
    event_id: string;
    title: string;
    event_date: string | null;
    event_time: string | null;
    city: string | null;
  } | null;
}

export interface CircleHealth {
  circle_id: string;
  active_members: number;
  new_members_30d: number;
  event_count: number;
  events_30d: number;
  returning_attendees: number;
  returning_rate: number;
  no_show_rate: number;
  open_report_count: number;
  reports_30d: number;
  prior_reports_30d: number;
  pending_requests: number;
  host_load: number;
  cadence_status: 'no_events' | 'on_track' | 'attention';
  last_activity_at: string | null;
  next_event_at: string | null;
  generated_at: string;
  privacy_note: string;
}

export interface HubCard {
  id: string;
  hobby_category: string | null;
  city: string | null;
  purpose: string | null;
  join_policy: string | null;
  lifecycle_state: string | null;
  member_count: number | null;
  welcome_message: string | null;
  community_rules: string | null;
  activity_freshness_at: string | null;
  host_id: string | null;
  host_display_name: string | null;
  host_avatar_url: string | null;
  membership_status: string | null;
  pending_join_count: number;
  qualification_score: number;
  qualification_reasons: string[] | null;
  beginner_friendly: boolean;
  can_claim_host: boolean;
}

export interface HubPendingRequest {
  moderation_item_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  requested_at: string;
  policy_acknowledged: boolean;
}

export interface HubWelcome {
  hub_id: string;
  purpose: string | null;
  welcome_message: string | null;
  community_rules: string | null;
  host: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    city: string | null;
  } | null;
  next_beginner_event: {
    event_id: string;
    title: string;
    start_at: string;
    city: string;
    beginner_friendly: boolean;
  } | null;
  privacy_note: string;
}

export interface HubHostInsights {
  hub_id: string;
  window_days: number;
  suppression_threshold: number;
  funnel: Record<'discovery' | 'preview' | 'join_request' | 'joined' | 'first_activity' | 'first_attendance' | 'repeat_activity', number | null>;
  new_real_members_30d: number;
  open_moderation_count: number;
  qualification_score: number;
  qualification_reasons: string[];
  activity_freshness_at: string | null;
  archive_eligible_at: string | null;
  privacy_note: string;
}

export interface HubModerationItem {
  moderation_item_id: string;
  item_type: 'member_report' | 'content_report' | 'reactivation_review';
  status: 'open' | 'in_review';
  subject_user_id: string | null;
  subject_display_name: string | null;
  report_category: string | null;
  created_at: string;
}

export type CommunitySurface = 'reconnections' | 'connections' | 'preferences' | 'circles' | 'suggestions' | 'memberships' | 'hubs';

export interface CommunityFeatureAvailability {
  connections: boolean;
  circles: boolean;
  hub2: boolean;
  registryAvailable: boolean;
}

export interface CommunitySnapshot {
  reconnections: ReconnectionCard[];
  connections: ConnectionCard[];
  preferences: Map<string, string>;
  circles: CircleCard[];
  suggestions: CircleSuggestionCard[];
  memberships: Map<string, string>;
  hubs: HubCard[];
  availability: CommunityFeatureAvailability;
  unavailableSurfaces: CommunitySurface[];
}

export type DomainMutationErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION' | 'UNAVAILABLE';

export type DomainMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DomainMutationErrorCode };
