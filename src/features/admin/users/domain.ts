export type UserOrigin = 'real' | 'generated' | null;
export type PageSize = 10 | 20 | 50;
export type HubOriginStatus = 'available' | 'missing_column';
export type BulkAction = 'delete' | 'activate' | 'deactivate';

export interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  city: string | null;
  district: string | null;
  hobbies: string[] | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  age_band: string | null;
  preferred_radius_km: number | null;
  user_origin?: UserOrigin;
  is_active?: boolean | null;
}

export interface EventParticipation {
  id: string;
  event_id?: string;
  joined_at: string;
  event: {
    id: string;
    title: string;
    category: string;
    event_date: string | null;
    image_emoji: string | null;
  };
}

export interface EventOption {
  id: string;
  title: string;
  category: string | null;
  event_date: string | null;
  is_active?: boolean | null;
}

export interface VirtualHub {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
  real_member_count?: number;
  simulated_member_count?: number;
  unknown_origin_member_count?: number;
  created_at: string;
}

export interface HubMembershipReference {
  hub_id: string;
}

export interface BulkFilters {
  userType: 'all' | 'real' | 'generated';
  registeredOlderThanDays: string;
  inactiveDays: string;
  hasOpenOwnedEvents: 'all' | 'yes' | 'no';
  hobbyFilter: string;
  hubFilter: string;
}

export const EMPTY_FILTERS: BulkFilters = {
  userType: 'all',
  registeredOlderThanDays: '',
  inactiveDays: '',
  hasOpenOwnedEvents: 'all',
  hobbyFilter: '',
  hubFilter: '',
};

export const ADMIN_USER_ROW_HEIGHT = 52;
export const ADMIN_USER_TABLE_HEAD_HEIGHT = 48;

export function buildUserHubMap(
  hubs: readonly VirtualHub[],
  membershipsByUser: Readonly<Record<string, readonly HubMembershipReference[]>>,
): Map<string, VirtualHub[]> {
  const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
  const result = new Map<string, VirtualHub[]>();

  Object.entries(membershipsByUser).forEach(([userId, memberships]) => {
    const userHubs = memberships
      .map((membership) => hubById.get(membership.hub_id))
      .filter((hub): hub is VirtualHub => Boolean(hub));
    if (userHubs.length > 0) result.set(userId, userHubs);
  });

  return result;
}

export function filterProfiles(
  profiles: readonly ProfileRow[],
  search: string,
  userHubMap: ReadonlyMap<string, readonly VirtualHub[]>,
): ProfileRow[] {
  const query = search.trim().toLocaleLowerCase('hu-HU');
  if (!query) return [...profiles];

  return profiles.filter((profile) => {
    const hubNames = (userHubMap.get(profile.user_id) || [])
      .map((hub) => `${hub.hobby_category} ${hub.city || ''}`)
      .join(' ');
    const haystack = [
      profile.display_name,
      profile.city,
      profile.user_origin,
      ...(profile.hobbies || []),
      hubNames,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('hu-HU');
    return haystack.includes(query);
  });
}

export function allVisibleProfilesSelected(
  visibleProfiles: readonly ProfileRow[],
  selectedUserIds: ReadonlySet<string>,
): boolean {
  return visibleProfiles.length > 0
    && visibleProfiles.every((profile) => Boolean(profile.user_id) && selectedUserIds.has(profile.user_id));
}

export function selectedProfilesAreGeneratedOnly(
  profiles: readonly ProfileRow[],
  selectedUserIds: ReadonlySet<string>,
): boolean {
  return selectedUserIds.size > 0
    && profiles
      .filter((profile) => selectedUserIds.has(profile.user_id))
      .every((profile) => profile.user_origin === 'generated');
}

export function buildBulkConfirmation(action: BulkAction | null, selectedCount: number): string {
  if (action === 'delete') return `DELETE ${selectedCount} GENERATED USERS`;
  return action ? `${action.toUpperCase()} ${selectedCount} USERS` : '';
}

export function toggleVisibleProfileSelection(
  currentSelection: ReadonlySet<string>,
  visibleProfiles: readonly ProfileRow[],
  checked: boolean,
): Set<string> {
  const next = new Set(currentSelection);
  visibleProfiles.forEach((profile) => {
    if (!profile.user_id) return;
    if (checked) next.add(profile.user_id);
    else next.delete(profile.user_id);
  });
  return next;
}

export function toggleProfileSelection(
  currentSelection: ReadonlySet<string>,
  userId: string,
  checked: boolean,
): Set<string> {
  const next = new Set(currentSelection);
  if (checked) next.add(userId);
  else next.delete(userId);
  return next;
}

export function hasServerBulkFilters(filters: BulkFilters): boolean {
  return filters.userType !== 'all'
    || filters.hasOpenOwnedEvents !== 'all'
    || Boolean(filters.registeredOlderThanDays)
    || Boolean(filters.inactiveDays);
}

export function mergePreviewSelection(
  profiles: readonly ProfileRow[],
  selectedProfileIds: readonly string[],
  selectedUserIds: readonly string[],
): Set<string> {
  const usersFromProfileIds = profiles
    .filter((profile) => selectedProfileIds.includes(profile.id) && Boolean(profile.user_id))
    .map((profile) => profile.user_id);
  return new Set([...selectedUserIds, ...usersFromProfileIds].filter(Boolean));
}

export function applyClientBulkFilters(
  candidateUserIds: ReadonlySet<string>,
  profiles: readonly ProfileRow[],
  userHubMap: ReadonlyMap<string, readonly VirtualHub[]>,
  filters: BulkFilters,
): Set<string> {
  let result = new Set(candidateUserIds);

  if (filters.hobbyFilter.trim()) {
    const query = filters.hobbyFilter.trim().toLocaleLowerCase('hu-HU');
    const matchingUsers = new Set(
      profiles
        .filter((profile) => profile.user_id && (profile.hobbies || [])
          .some((hobby) => hobby.toLocaleLowerCase('hu-HU').includes(query)))
        .map((profile) => profile.user_id),
    );
    result = new Set([...result].filter((id) => matchingUsers.has(id)));
  }

  if (filters.hubFilter.trim()) {
    const query = filters.hubFilter.trim().toLocaleLowerCase('hu-HU');
    const matchingUsers = new Set<string>();
    userHubMap.forEach((hubs, userId) => {
      if (hubs.some((hub) => hub.hobby_category.toLocaleLowerCase('hu-HU').includes(query)
        || (hub.city || '').toLocaleLowerCase('hu-HU').includes(query))) {
        matchingUsers.add(userId);
      }
    });
    result = new Set([...result].filter((id) => matchingUsers.has(id)));
  }

  return result;
}

export function formatUserOrigin(origin: UserOrigin | undefined): string {
  if (origin === 'real') return 'Valódi';
  if (origin === 'generated') return 'Generált';
  return 'Ismeretlen';
}

export function countProfileOrigins(profiles: readonly ProfileRow[]) {
  return {
    real: profiles.filter((profile) => profile.user_origin === 'real').length,
    generated: profiles.filter((profile) => profile.user_origin === 'generated').length,
    unknown: profiles.filter((profile) => !profile.user_origin).length,
  };
}
