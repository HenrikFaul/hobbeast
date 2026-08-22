import { supabase } from '@/integrations/supabase/client';
import {
  buildUserHubMap,
  type BulkAction,
  type BulkFilters,
  type EventOption,
  type EventParticipation,
  type HubMembershipReference,
  type HubOriginStatus,
  type ProfileRow,
  type VirtualHub,
} from './domain';

export class AdminUsersRepositoryError extends Error {
  constructor(
    message: string,
    readonly operation: string,
  ) {
    super(message);
    this.name = 'AdminUsersRepositoryError';
  }
}

export interface ProfilesPage {
  profiles: ProfileRow[];
  truncated: boolean;
}

export interface AdminHubsSnapshot {
  hubs: VirtualHub[];
  userHubMap: Map<string, VirtualHub[]>;
  originStatus: HubOriginStatus;
  membershipWarning: string | null;
}

export interface HubReconciliationResult {
  status?: string;
  profiles_completed?: number;
  profiles_failed?: number;
}

export interface UserDetailSnapshot {
  participations: EventParticipation[];
  events: EventOption[];
  hobbyOptions: string[];
  warnings: string[];
}

export interface UpdateAdminProfileInput {
  userId: string;
  gender: string | null;
  isActive: boolean;
  bio: string;
  hobbies: string[];
  eventIds: string[];
  reason: string;
  idempotencyKey: string;
}

export interface PreviewBulkSelectionInput {
  reason: string;
  filters: Pick<BulkFilters, 'userType' | 'hasOpenOwnedEvents'> & {
    registeredOlderThanDays: number | null;
    inactiveDays: number | null;
  };
}

export interface BulkSelectionPreview {
  selectedProfileIds: string[];
  selectedUserIds: string[];
  truncated: boolean;
}

export interface ApplyBulkActionInput {
  action: BulkAction;
  reason: string;
  confirmation: string;
  idempotencyKey: string;
  approvalRequestId?: string;
  filterSnapshot: {
    userType: BulkFilters['userType'];
    registeredOlderThanDays: string | null;
    inactiveDays: string | null;
    hasOpenOwnedEvents: BulkFilters['hasOpenOwnedEvents'];
    hobbyFilterApplied: boolean;
    hubFilterApplied: boolean;
  };
  userIds: string[];
  profileIds: string[];
}

export interface BulkActionResult {
  pendingApproval: boolean;
  approvalRequestId: string | null;
  affected: number;
  failures: number;
  jobId: string | null;
}

interface ListProfilesResponse {
  profiles?: ProfileRow[];
  truncated?: boolean;
}

interface ListHubsResponse {
  hubs?: VirtualHub[];
  origin_classification_status?: HubOriginStatus;
}

interface UserHubMapResponse {
  userHubMap?: Record<string, HubMembershipReference[]>;
}

interface ReconcileHubsResponse {
  reconciliation?: HubReconciliationResult;
}

interface UpdateProfileResponse {
  code?: string;
  result?: { ok?: boolean };
}

interface BulkPreviewResponse {
  selectedProfileIds?: unknown;
  selectedUserIds?: unknown;
  truncated?: boolean;
}

interface BulkApplyResponse {
  pending_approval?: boolean;
  approval_request_id?: unknown;
  affected?: unknown;
  failures?: unknown;
  job_id?: unknown;
}

function toMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

export async function listAdminProfiles(): Promise<ProfilesPage> {
  const { data, error } = await supabase.functions.invoke<ListProfilesResponse>('admin-control-plane', {
    body: {
      action: 'list_user_profiles',
      reason: 'Admin user directory management',
      limit: 1000,
      offset: 0,
    },
  });

  if (error || !Array.isArray(data?.profiles)) {
    throw new AdminUsersRepositoryError(
      toMessage(error, 'A profilkönyvtár válasza érvénytelen.'),
      'list_profiles',
    );
  }

  return { profiles: data.profiles, truncated: data.truncated === true };
}

export async function loadAdminHubs(): Promise<AdminHubsSnapshot> {
  const [hubResponse, membershipResponse] = await Promise.all([
    supabase.functions.invoke<ListHubsResponse>('virtual-hubs-admin', { body: { action: 'list' } }),
    supabase.functions.invoke<UserHubMapResponse>('virtual-hubs-admin', { body: { action: 'user_hub_map' } }),
  ]);

  if (hubResponse.error) {
    throw new AdminUsersRepositoryError(
      toMessage(hubResponse.error, 'A virtuális közösségek nem tölthetők be.'),
      'list_hubs',
    );
  }

  const hubs = Array.isArray(hubResponse.data?.hubs) ? hubResponse.data.hubs : [];
  const memberships = membershipResponse.error ? {} : membershipResponse.data?.userHubMap || {};
  return {
    hubs,
    userHubMap: buildUserHubMap(hubs, memberships),
    originStatus: hubResponse.data?.origin_classification_status === 'missing_column'
      ? 'missing_column'
      : 'available',
    membershipWarning: membershipResponse.error
      ? toMessage(membershipResponse.error, 'A Hub-tagságok nem tölthetők be.')
      : null,
  };
}

export async function reconcileAdminHubs(idempotencyKey: string): Promise<HubReconciliationResult> {
  const { data, error } = await supabase.functions.invoke<ReconcileHubsResponse>('virtual-hubs-admin', {
    body: { action: 'refresh', limit: 500, idempotency_key: idempotencyKey },
  });
  if (error) {
    throw new AdminUsersRepositoryError(
      toMessage(error, 'A Hub-tagságok egyeztetése sikertelen.'),
      'reconcile_hubs',
    );
  }
  return data?.reconciliation || {};
}

export async function loadAdminUserDetail(userId: string): Promise<UserDetailSnapshot> {
  const [participationsResponse, eventsResponse, hobbiesResponse] = await Promise.all([
    supabase
      .from('event_participants')
      .select('id, event_id, joined_at, event:events(id, title, category, event_date, image_emoji)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false }),
    supabase
      .from('events')
      .select('id, title, category, event_date, is_active')
      .neq('is_active', false)
      .order('event_date', { ascending: false })
      .limit(500),
    supabase
      .from('hobby_activities')
      .select('name, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  const warnings: string[] = [];
  if (participationsResponse.error) warnings.push(`participations: ${participationsResponse.error.message}`);
  if (eventsResponse.error) warnings.push(`events: ${eventsResponse.error.message}`);
  if (hobbiesResponse.error) warnings.push(`hobbies: ${hobbiesResponse.error.message}`);

  const participations = participationsResponse.error
    ? []
    : (participationsResponse.data as unknown as EventParticipation[]) || [];
  const events = eventsResponse.error ? [] : (eventsResponse.data as EventOption[]) || [];
  const hobbyRows = hobbiesResponse.error ? [] : (hobbiesResponse.data as { name: string }[]) || [];
  const hobbyOptions = Array.from(new Set(hobbyRows.map((row) => row.name).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));

  return { participations, events, hobbyOptions, warnings };
}

export async function updateAdminProfile(input: UpdateAdminProfileInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<UpdateProfileResponse>('admin-control-plane', {
    body: {
      action: 'update_user_profile',
      reason: input.reason,
      idempotency_key: input.idempotencyKey,
      user_id: input.userId,
      gender: input.gender,
      is_active: input.isActive,
      bio: input.bio,
      hobbies: input.hobbies,
      event_ids: input.eventIds,
    },
  });

  if (error || data?.code || data?.result?.ok !== true) {
    throw new AdminUsersRepositoryError(
      toMessage(error, data?.code || 'A capability/audit határ elutasította a módosítást.'),
      'update_profile',
    );
  }
}

export async function previewAdminBulkSelection(input: PreviewBulkSelectionInput): Promise<BulkSelectionPreview> {
  const { data, error } = await supabase.functions.invoke<BulkPreviewResponse>('admin-bulk-user-actions', {
    body: {
      mode: 'preview',
      reason: input.reason,
      filters: input.filters,
    },
  });
  if (error) {
    throw new AdminUsersRepositoryError(
      toMessage(error, 'A tömeges kijelölés előnézete sikertelen.'),
      'preview_bulk_selection',
    );
  }
  return {
    selectedProfileIds: stringArray(data?.selectedProfileIds),
    selectedUserIds: stringArray(data?.selectedUserIds),
    truncated: data?.truncated === true,
  };
}

export async function applyAdminBulkAction(input: ApplyBulkActionInput): Promise<BulkActionResult> {
  const { data, error } = await supabase.functions.invoke<BulkApplyResponse>('admin-bulk-user-actions', {
    body: {
      mode: 'apply',
      action: input.action,
      reason: input.reason,
      confirmation: input.confirmation,
      idempotencyKey: input.idempotencyKey,
      approvalRequestId: input.approvalRequestId,
      filterSnapshot: input.filterSnapshot,
      userIds: input.userIds,
      profileIds: input.profileIds,
    },
  });
  if (error) {
    throw new AdminUsersRepositoryError(
      toMessage(error, 'A tömeges művelet sikertelen.'),
      'apply_bulk_action',
    );
  }
  return {
    pendingApproval: data?.pending_approval === true,
    approvalRequestId: typeof data?.approval_request_id === 'string' ? data.approval_request_id : null,
    affected: Number(data?.affected || 0),
    failures: Number(data?.failures || 0),
    jobId: typeof data?.job_id === 'string' ? data.job_id : null,
  };
}
