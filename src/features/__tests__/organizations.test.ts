import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Organizations — the client contract for Slice O-A.
 *
 * The rules that keep it safe (RLS, last-owner protection, role→capability) live
 * in the database and are proven live. These tests pin the client half: that the
 * calls send what the RPCs expect, that errors become sentences a person can act
 * on, and that the role helpers agree with the database's authority model.
 */

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a), from: (...a: unknown[]) => fromMock(...a) },
}));

const {
  createOrganization, updateOrganization, inviteMember, setMemberRole, removeMember,
  listMyOrganizations, canManage, ASSIGNABLE_ROLES,
  createBrand, listOrganizationBrands, topLevelOrganizations,
} = await import('@/features/organizations/organizations');

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe('creating and editing', () => {
  it('creates an organization and returns its slug', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'o1', slug: 'budapesti-turaklub' }, error: null });
    const result = await createOrganization('  Budapesti Túraklub ', 'community');
    expect(rpcMock).toHaveBeenCalledWith('create_organization', { p_name: 'Budapesti Túraklub', p_kind: 'community' });
    expect(result).toEqual({ ok: true, id: 'o1', slug: 'budapesti-turaklub' });
  });

  it('passes an update through as p_-prefixed fields', async () => {
    await updateOrganization('o1', { p_tagline: 'Együtt a hegyekben' });
    expect(rpcMock).toHaveBeenCalledWith('update_organization', { p_id: 'o1', p_tagline: 'Együtt a hegyekben' });
  });
});

describe('team management', () => {
  it('never offers owner as an assignable role — it is transferred, not handed out', () => {
    expect(ASSIGNABLE_ROLES.map((r) => r.value)).toEqual(['admin', 'editor', 'checkin', 'viewer']);
  });

  it('sends an invite with the trimmed id', async () => {
    await inviteMember('o1', '  user-123  ', 'editor');
    expect(rpcMock).toHaveBeenCalledWith('invite_org_member', { p_org_id: 'o1', p_user_id: 'user-123', p_role: 'editor' });
  });

  it('turns the last-owner refusal into a clear message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'LAST_OWNER' } });
    expect(await setMemberRole('o1', 'u1', 'viewer')).toEqual({
      ok: false, message: 'Az utolsó tulajdonost nem lehet lefokozni vagy eltávolítani.',
    });
  });

  it('turns an authorization refusal into a clear message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ORG_ADMIN_REQUIRED' } });
    expect(await removeMember('o1', 'u1')).toEqual({
      ok: false, message: 'Ehhez adminisztrátori jog kell a szervezetben.',
    });
  });
});

describe('reading and roles', () => {
  it('returns an empty list rather than throwing when there is nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await listMyOrganizations()).toEqual([]);
  });

  it('agrees with the database on who may manage the team', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('admin')).toBe(true);
    expect(canManage('editor')).toBe(false);
    expect(canManage('checkin')).toBe(false);
    expect(canManage('viewer')).toBe(false);
  });
});

describe('multi-brand (O-I)', () => {
  it('creates a brand under a parent organization', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'b1', slug: 'nyari-fesztival' }, error: null });
    const result = await createBrand('parent-1', '  Nyári Fesztivál ', 'community');
    expect(rpcMock).toHaveBeenCalledWith('create_brand', {
      p_parent_org_id: 'parent-1', p_name: '  Nyári Fesztivál ', p_kind: 'community',
    });
    expect(result).toEqual({ ok: true, id: 'b1', slug: 'nyari-fesztival' });
  });

  it('turns the nested-brand refusal into a clear message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'BRAND_CANNOT_HAVE_BRANDS' } });
    expect(await createBrand('b1', 'Al-márka', 'community')).toEqual({
      ok: false, message: 'Márka alá nem hozható létre újabb márka.',
    });
  });

  it('returns an empty brand list rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await listOrganizationBrands('parent-1')).toEqual([]);
  });

  it('separates top-level organizations from brands', () => {
    const orgs = [
      { id: 'p1', parent_organization_id: null },
      { id: 'b1', parent_organization_id: 'p1' },
    ] as Parameters<typeof topLevelOrganizations>[0];
    expect(topLevelOrganizations(orgs).map((o) => o.id)).toEqual(['p1']);
  });
});
