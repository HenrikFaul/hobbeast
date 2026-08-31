import { supabase } from '@/integrations/supabase/client';

/**
 * Organizations (B2B) — the client side of Slice O-A.
 *
 * An organization is a first-class entity a business or community runs under its
 * own name, with a team. Everything that decides who may do what lives in the
 * database (RLS + the membership RPCs, proven live); this is the thin layer the
 * UI calls. The individual-organizer path is untouched — an organization is
 * additive.
 *
 * See .governance/organization_b2b_plan.md for the full plan.
 */

export type OrgRole = 'owner' | 'admin' | 'editor' | 'checkin' | 'viewer';

export interface MyOrganization {
  id: string;
  slug: string;
  name: string;
  kind: string;
  logo_url: string | null;
  verification_status: string;
  my_role: OrgRole;
  member_status: 'active' | 'invited';
  follower_count: number;
  /** Set when this organization is a brand under a parent (O-I multi-brand). */
  parent_organization_id: string | null;
}

export interface OrgMember {
  user_id: string;
  role: OrgRole;
  status: string;
  display_name: string | null;
  avatar_url: string | null;
  accepted_at: string | null;
}

/** The roles an admin may assign — owner is transferred, not handed out. */
export const ASSIGNABLE_ROLES: Array<{ value: Exclude<OrgRole, 'owner'>; label: string; hint: string }> = [
  { value: 'admin', label: 'Adminisztrátor', hint: 'Tagokat és beállításokat kezel, minden eseményhez fér.' },
  { value: 'editor', label: 'Szerkesztő', hint: 'Eseményt hoz létre és szerkeszt a szervezet nevében.' },
  { value: 'checkin', label: 'Beléptető', hint: 'Csak a helyszíni beléptetést intézi.' },
  { value: 'viewer', label: 'Megfigyelő', hint: 'Csak nézi az adatokat és az analitikát.' },
];

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Tulajdonos', admin: 'Adminisztrátor', editor: 'Szerkesztő',
  checkin: 'Beléptető', viewer: 'Megfigyelő',
};

export const ORG_KIND_LABEL: Record<string, string> = {
  company: 'Cég', ngo: 'Civil / nonprofit', venue: 'Helyszín',
  community: 'Közösség', creator: 'Alkotó',
};

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: string) => Promise<{ data: unknown; error: unknown }>;
      in: (col: string, v: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

function readable(message: string): string {
  if (message.includes('ORG_ADMIN_REQUIRED')) return 'Ehhez adminisztrátori jog kell a szervezetben.';
  if (message.includes('LAST_OWNER')) return 'Az utolsó tulajdonost nem lehet lefokozni vagy eltávolítani.';
  if (message.includes('NAME_TOO_SHORT')) return 'A név túl rövid.';
  if (message.includes('BRAND_CANNOT_HAVE_BRANDS')) return 'Márka alá nem hozható létre újabb márka.';
  if (message.includes('INVALID_ROLE')) return 'Érvénytelen szerepkör.';
  if (message.includes('AUTH_REQUIRED')) return 'Előbb jelentkezz be.';
  return 'A művelet nem sikerült.';
}

export async function listMyOrganizations(): Promise<MyOrganization[]> {
  const { data, error } = await rpc.rpc('list_my_organizations');
  return error || !Array.isArray(data) ? [] : (data as MyOrganization[]);
}

export async function createOrganization(
  name: string, kind: string,
): Promise<{ ok: true; id: string; slug: string } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('create_organization', { p_name: name.trim(), p_kind: kind });
  if (error) return { ok: false, message: readable(error.message) };
  const row = data as { id: string; slug: string };
  return { ok: true, id: row.id, slug: row.slug };
}

export async function updateOrganization(
  id: string, patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('update_organization', { p_id: id, ...patch });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

/** The team, with names attached (the members table stores ids only). */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await rpc.from('organization_members')
    .select('user_id, role, status, accepted_at')
    .eq('organization_id', orgId);
  if (error || !Array.isArray(data)) return [];
  const rows = data as OrgMember[];
  const active = rows.filter((r) => r.status !== 'removed');
  if (!active.length) return [];

  const { data: profiles } = await rpc.from('profiles')
    .select('user_id, id, display_name, avatar_url')
    .in('user_id', active.map((r) => r.user_id));
  const byId = new Map<string, { display_name?: string | null; avatar_url?: string | null }>();
  for (const p of (Array.isArray(profiles) ? profiles : []) as Array<Record<string, unknown>>) {
    const key = String(p.user_id ?? p.id ?? '');
    if (key) byId.set(key, { display_name: p.display_name as string | null, avatar_url: p.avatar_url as string | null });
  }
  return active.map((r) => ({ ...r, ...byId.get(r.user_id) }));
}

export async function inviteMember(orgId: string, userId: string, role: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('invite_org_member', { p_org_id: orgId, p_user_id: userId.trim(), p_role: role });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function acceptInvite(orgId: string): Promise<boolean> {
  const { error } = await rpc.rpc('accept_org_invite', { p_org_id: orgId });
  return !error;
}

export async function setMemberRole(orgId: string, userId: string, role: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('set_org_member_role', { p_org_id: orgId, p_user_id: userId, p_role: role });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function removeMember(orgId: string, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('remove_org_member', { p_org_id: orgId, p_user_id: userId });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

/** May this role manage the team and settings? Owner and admin. */
export function canManage(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin';
}

// --- O-C: public brand page + follow ---------------------------------------

export interface OrgPublicEvent {
  id: string; title: string; event_date: string | null; event_time: string | null;
  city: string | null; emoji: string | null; category: string | null;
}

export interface OrgPublic {
  id: string; slug: string; name: string; kind: string;
  tagline: string | null; description: string | null;
  logo_url: string | null; cover_url: string | null; brand_color: string | null;
  website_url: string | null; social: Record<string, string>; city: string | null;
  categories: string[]; verification_status: string; follower_count: number;
  is_following: boolean; is_member: boolean; events: OrgPublicEvent[];
}

export async function getOrganizationPublic(slug: string): Promise<OrgPublic | null> {
  const { data, error } = await rpc.rpc('get_organization_public', { p_slug: slug });
  return error || !data ? null : (data as OrgPublic);
}

export async function followOrganization(
  orgId: string, follow: boolean,
): Promise<{ following: boolean; follower_count: number } | null> {
  const { data, error } = await rpc.rpc('follow_organization', { p_org_id: orgId, p_follow: follow });
  return error || !data ? null : (data as { following: boolean; follower_count: number });
}

// --- O-E: verification ------------------------------------------------------

export async function requestVerification(
  orgId: string, website: string, social: string, note: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('request_org_verification', {
    p_org_id: orgId, p_website: website, p_social: social, p_note: note,
  });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export interface OrgVerificationRequest {
  id: string; organization_id: string; org_name: string; org_slug: string;
  website_url: string | null; social_proof: string | null; note: string | null; created_at: string;
}

export async function listVerificationRequests(): Promise<OrgVerificationRequest[]> {
  const { data, error } = await rpc.rpc('admin_list_org_verification_requests');
  return error || !Array.isArray(data) ? [] : (data as OrgVerificationRequest[]);
}

export async function reviewVerification(
  requestId: string, decision: 'verified' | 'rejected', note?: string,
): Promise<boolean> {
  const { error } = await rpc.rpc('admin_review_org_verification', {
    p_request_id: requestId, p_decision: decision, p_note: note ?? null,
  });
  return !error;
}

// --- O-F: organization analytics -------------------------------------------

export interface OrgAnalytics {
  events_total: number; upcoming: number; participants_total: number;
  views_total: number; follower_count: number;
}

export async function getOrganizationAnalytics(orgId: string): Promise<OrgAnalytics | null> {
  const { data, error } = await rpc.rpc('get_organization_analytics', { p_org_id: orgId });
  return error || !data ? null : (data as OrgAnalytics);
}

// --- O-D: attach a created event to an organization ------------------------

export async function assignEventToOrganization(eventId: string, orgId: string): Promise<void> {
  const { error } = await rpc.rpc('assign_event_organization', { p_event_id: eventId, p_org_id: orgId });
  if (error) throw new Error(error.message);
}

/** The organizations the caller may create events under (editor and above). */
export async function listOrganizationsICanPublishAs(): Promise<MyOrganization[]> {
  const orgs = await listMyOrganizations();
  return orgs.filter((o) => o.member_status === 'active' && ['owner', 'admin', 'editor'].includes(o.my_role));
}

// --- O-G: public B2B API keys ----------------------------------------------

/** The scopes a key can carry. Read is always granted; write is opt-in. */
export const API_SCOPES: Array<{ value: string; label: string }> = [
  { value: 'events:read', label: 'Események olvasása' },
  { value: 'events:write', label: 'Események létrehozása' },
];

export interface OrgApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function listApiKeys(orgId: string): Promise<OrgApiKey[]> {
  const { data, error } = await rpc.rpc('list_org_api_keys', { p_org_id: orgId });
  return error || !Array.isArray(data) ? [] : (data as OrgApiKey[]);
}

/** Mint a key. The full key is returned exactly once — surface it, then forget it. */
export async function createApiKey(
  orgId: string, name: string, scopes: string[],
): Promise<{ ok: true; id: string; key: string; prefix: string } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('create_org_api_key', {
    p_org_id: orgId, p_name: name, p_scopes: scopes.length ? scopes : ['events:read'],
  });
  if (error || !data) return { ok: false, message: readable(error?.message ?? '') };
  const row = data as { id: string; key: string; prefix: string };
  return { ok: true, id: row.id, key: row.key, prefix: row.prefix };
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const { error } = await rpc.rpc('revoke_org_api_key', { p_key_id: keyId });
  return !error;
}

/** The public API base — the same origin the OpenAPI document is served from. */
export const B2B_API_BASE =
  'https://bqdvqmpwccsxumzijspj.supabase.co/functions/v1/api-b2b';

// --- O-I: multiple brands under one organization ---------------------------

export interface OrgBrand {
  id: string;
  slug: string;
  name: string;
  kind: string;
  logo_url: string | null;
  verification_status: string;
  follower_count: number;
  events_total: number;
}

/** Create a brand (a child organization) under a parent. Admin+ of the parent. */
export async function createBrand(
  parentOrgId: string, name: string, kind: string,
): Promise<{ ok: true; id: string; slug: string } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('create_brand', {
    p_parent_org_id: parentOrgId, p_name: name, p_kind: kind,
  });
  if (error || !data) return { ok: false, message: readable(error?.message ?? '') };
  const row = data as { id: string; slug: string };
  return { ok: true, id: row.id, slug: row.slug };
}

export async function listOrganizationBrands(parentOrgId: string): Promise<OrgBrand[]> {
  const { data, error } = await rpc.rpc('list_organization_brands', { p_parent_org_id: parentOrgId });
  return error || !Array.isArray(data) ? [] : (data as OrgBrand[]);
}

/** Top-level organizations only (not brands) — for the "my organizations" list. */
export function topLevelOrganizations(orgs: MyOrganization[]): MyOrganization[] {
  return orgs.filter((o) => !o.parent_organization_id);
}
