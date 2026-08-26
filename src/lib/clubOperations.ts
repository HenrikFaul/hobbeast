import { supabase } from '@/integrations/supabase/client';

/**
 * Sport clubs and teams.
 *
 * "Joining" a club here is an interest signal, never enrolment: Hobbeast
 * cannot make anyone a member of a real association. The wording in the UI has
 * to keep saying so.
 */

interface UntypedRpcResult {
  data: unknown;
  error: { message: string } | null;
}

const rpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<UntypedRpcResult>;
};

export type ClubType = 'sport_club' | 'team' | 'hobby_club';
export type ClubMembershipStatus = 'interested' | 'member' | 'left';
export type ClubReviewState = 'pending' | 'approved' | 'rejected';

export interface ClubListItem {
  id: string;
  slug: string;
  name: string;
  clubType: ClubType;
  sport: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  logoUrl: string | null;
  beginnerFriendly: boolean | null;
  acceptsNewMembers: boolean;
  claimed: boolean;
  interestedCount: number;
}

export interface ClubDetail extends ClubListItem {
  description: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  trainingInfo: string | null;
  membershipInfo: string | null;
  isOwner: boolean;
  source: string;
  sourceUrl: string | null;
  myStatus: ClubMembershipStatus | null;
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function clubType(value: unknown): ClubType {
  return value === 'team' || value === 'hobby_club' ? value : 'sport_club';
}

function toListItem(row: Record<string, unknown>): ClubListItem {
  return {
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    name: text(row, 'name') || 'Klub',
    clubType: clubType(row.club_type),
    sport: text(row, 'sport'),
    city: text(row, 'city'),
    district: text(row, 'district'),
    postalCode: text(row, 'postal_code'),
    websiteUrl: text(row, 'website_url'),
    facebookUrl: text(row, 'facebook_url'),
    logoUrl: text(row, 'logo_url'),
    beginnerFriendly: typeof row.beginner_friendly === 'boolean' ? row.beginner_friendly : null,
    acceptsNewMembers: row.accepts_new_members !== false,
    claimed: row.claimed === true,
    interestedCount: Math.max(0, Number(row.interested_count) || 0),
  };
}

export interface ClubPage {
  items: ClubListItem[];
  hasMore: boolean;
  nextOffset: number | null;
}

export async function listClubs(input: {
  sport?: string | null;
  city?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<ClubPage> {
  const { data, error } = await rpc.rpc('list_clubs_public', {
    p_sport: input.sport ?? null,
    p_city: input.city ?? null,
    p_search: input.search ?? null,
    p_limit: Math.max(1, Math.min(100, Math.trunc(input.limit ?? 48) || 48)),
    p_offset: Math.max(0, Math.trunc(input.offset ?? 0) || 0),
  });
  if (error) throw new Error('CLUB_LIST_FAILED');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    items: Array.isArray(payload.items)
      ? payload.items
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .map(toListItem)
      : [],
    hasMore: payload.has_more === true,
    nextOffset: typeof payload.next_offset === 'number' ? payload.next_offset : null,
  };
}

export interface ClubFacets {
  sports: Array<{ sport: string; clubs: number }>;
  cities: Array<{ city: string; clubs: number }>;
  total: number;
}

export async function listClubFacets(): Promise<ClubFacets> {
  const { data, error } = await rpc.rpc('list_club_facets', {});
  if (error) throw new Error('CLUB_FACETS_FAILED');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const rows = (value: unknown, key: string) => (Array.isArray(value)
    ? value
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => ({ [key]: String(row[key] ?? ''), clubs: Number(row.clubs) || 0 }))
    : []);
  return {
    sports: rows(payload.sports, 'sport') as Array<{ sport: string; clubs: number }>,
    cities: rows(payload.cities, 'city') as Array<{ city: string; clubs: number }>,
    total: Number(payload.total) || 0,
  };
}

export async function getClub(slug: string): Promise<ClubDetail | null> {
  const { data, error } = await rpc.rpc('get_club_public', { p_slug: slug });
  if (error) throw new Error('CLUB_DETAIL_FAILED');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const status = row.my_status;
  return {
    ...toListItem(row),
    description: text(row, 'description'),
    address: text(row, 'address'),
    contactEmail: text(row, 'contact_email'),
    contactPhone: text(row, 'contact_phone'),
    trainingInfo: text(row, 'training_info'),
    membershipInfo: text(row, 'membership_info'),
    isOwner: row.is_owner === true,
    source: String(row.source ?? 'admin'),
    sourceUrl: text(row, 'source_url'),
    myStatus: status === 'interested' || status === 'member' || status === 'left' ? status : null,
  };
}

function clubError(error: { message?: string } | null, fallback: string): Error {
  const message = error?.message || '';
  for (const code of [
    'AUTH_REQUIRED', 'FEATURE_DISABLED', 'CLUB_NOT_FOUND', 'USER_SUSPENDED',
    'INVALID_STATUS', 'INVALID_NAME', 'INVALID_TYPE', 'TOO_MANY_PENDING',
    'CAPABILITY_REQUIRED', 'INVALID_DECISION',
  ]) {
    if (message.includes(code)) return new Error(code);
  }
  return new Error(fallback);
}

export async function setClubMembership(input: {
  clubId: string;
  status: ClubMembershipStatus;
  note?: string | null;
}): Promise<ClubDetail | null> {
  const { data, error } = await rpc.rpc('set_club_membership', {
    p_club_id: input.clubId,
    p_status: input.status,
    p_note: input.note ?? null,
  });
  if (error) throw clubError(error, 'CLUB_MEMBERSHIP_FAILED');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const status = row.my_status;
  return {
    ...toListItem(row),
    description: text(row, 'description'),
    address: text(row, 'address'),
    contactEmail: text(row, 'contact_email'),
    contactPhone: text(row, 'contact_phone'),
    trainingInfo: text(row, 'training_info'),
    membershipInfo: text(row, 'membership_info'),
    isOwner: row.is_owner === true,
    source: String(row.source ?? 'admin'),
    sourceUrl: text(row, 'source_url'),
    myStatus: status === 'interested' || status === 'member' || status === 'left' ? status : null,
  };
}

export interface ClubRegistrationInput {
  name: string;
  sport: string;
  city: string;
  clubType?: ClubType;
  description?: string | null;
  address?: string | null;
  postalCode?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  trainingInfo?: string | null;
  membershipInfo?: string | null;
  beginnerFriendly?: boolean | null;
}

export async function submitClubRegistration(input: ClubRegistrationInput) {
  const { data, error } = await rpc.rpc('submit_club_registration', {
    p_name: input.name,
    p_sport: input.sport,
    p_city: input.city,
    p_club_type: input.clubType ?? 'sport_club',
    p_description: input.description ?? null,
    p_address: input.address ?? null,
    p_postal_code: input.postalCode ?? null,
    p_website_url: input.websiteUrl ?? null,
    p_facebook_url: input.facebookUrl ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_training_info: input.trainingInfo ?? null,
    p_membership_info: input.membershipInfo ?? null,
    p_beginner_friendly: input.beginnerFriendly ?? null,
  });
  if (error) throw clubError(error, 'CLUB_REGISTRATION_FAILED');
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

// --- admin -----------------------------------------------------------------

export interface AdminClubRow extends ClubListItem {
  description: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  trainingInfo: string | null;
  membershipInfo: string | null;
  source: string;
  sourceUrl: string | null;
  reviewState: ClubReviewState;
  reviewNote: string | null;
  isActive: boolean;
  createdAt: string | null;
}

export interface AdminClubPage {
  items: AdminClubRow[];
  counts: Record<string, number>;
}

export async function adminListClubs(input: {
  reviewState?: ClubReviewState | null;
  search?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminClubPage> {
  const { data, error } = await rpc.rpc('admin_list_clubs', {
    p_review_state: input.reviewState ?? null,
    p_search: input.search ?? null,
    p_limit: Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100) || 100)),
    p_offset: Math.max(0, Math.trunc(input.offset ?? 0) || 0),
  });
  if (error) throw clubError(error, 'ADMIN_CLUB_LIST_FAILED');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const counts: Record<string, number> = {};
  if (payload.counts && typeof payload.counts === 'object') {
    for (const [key, value] of Object.entries(payload.counts as Record<string, unknown>)) {
      counts[key] = Number(value) || 0;
    }
  }
  return {
    counts,
    items: Array.isArray(payload.items)
      ? payload.items
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .map((row) => ({
          ...toListItem(row),
          description: text(row, 'description'),
          address: text(row, 'address'),
          contactEmail: text(row, 'contact_email'),
          contactPhone: text(row, 'contact_phone'),
          trainingInfo: text(row, 'training_info'),
          membershipInfo: text(row, 'membership_info'),
          source: String(row.source ?? 'admin'),
          sourceUrl: text(row, 'source_url'),
          reviewState: (row.review_state === 'approved' || row.review_state === 'rejected'
            ? row.review_state
            : 'pending') as ClubReviewState,
          reviewNote: text(row, 'review_note'),
          isActive: row.is_active !== false,
          createdAt: text(row, 'created_at'),
        }))
      : [],
  };
}

export async function adminReviewClub(input: {
  clubId: string;
  decision: ClubReviewState;
  note?: string | null;
}) {
  const { error } = await rpc.rpc('admin_review_club', {
    p_club_id: input.clubId,
    p_decision: input.decision,
    p_note: input.note ?? null,
  });
  if (error) throw clubError(error, 'ADMIN_CLUB_REVIEW_FAILED');
}

export async function adminUpsertClub(input: ClubRegistrationInput & {
  clubId?: string | null;
  acceptsNewMembers?: boolean;
  reviewState?: ClubReviewState;
  isActive?: boolean;
}) {
  const { data, error } = await rpc.rpc('admin_upsert_club', {
    p_name: input.name,
    p_sport: input.sport || null,
    p_city: input.city || null,
    p_club_type: input.clubType ?? 'sport_club',
    p_description: input.description ?? null,
    p_address: input.address ?? null,
    p_postal_code: input.postalCode ?? null,
    p_website_url: input.websiteUrl ?? null,
    p_facebook_url: input.facebookUrl ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_training_info: input.trainingInfo ?? null,
    p_membership_info: input.membershipInfo ?? null,
    p_beginner_friendly: input.beginnerFriendly ?? null,
    p_accepts_new_members: input.acceptsNewMembers ?? true,
    p_review_state: input.reviewState ?? 'approved',
    p_is_active: input.isActive ?? true,
    p_club_id: input.clubId ?? null,
  });
  if (error) throw clubError(error, 'ADMIN_CLUB_UPSERT_FAILED');
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

export interface AdminClubMember {
  displayName: string;
  role: string;
  status: ClubMembershipStatus;
  createdAt: string | null;
}

export async function adminListClubMembers(clubId: string): Promise<AdminClubMember[]> {
  const { data, error } = await rpc.rpc('admin_list_club_members', { p_club_id: clubId });
  if (error) throw clubError(error, 'ADMIN_CLUB_MEMBERS_FAILED');
  return Array.isArray(data)
    ? data
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => ({
        displayName: text(row, 'display_name') || 'Hobbeast tag',
        role: String(row.role ?? 'member'),
        status: (row.status === 'member' || row.status === 'left' ? row.status : 'interested') as ClubMembershipStatus,
        createdAt: text(row, 'created_at'),
      }))
    : [];
}
