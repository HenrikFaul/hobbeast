import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), functions: { invoke: vi.fn() } },
}));

import {
  adminListClubs,
  getClub,
  listClubs,
  setClubMembership,
  submitClubRegistration,
} from '@/lib/clubOperations';

const CLUB_ID = '9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

beforeEach(() => rpcMock.mockReset());

describe('listClubs', () => {
  it('maps a directory row into the card shape', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        items: [{
          id: CLUB_ID, slug: 'budapest-evezos-egyesulet-budapest',
          name: 'Budapest Evezős Egyesület', club_type: 'sport_club', topic: 'Evezés',
          city: 'Budapest', postal_code: '1138', website_url: 'https://evezz.hu/',
          accepts_new_members: true, claimed: false, interested_count: 3,
        }],
        has_more: false, next_offset: null,
      },
      error: null,
    });
    const page = await listClubs({ topic: 'Evezés' });
    expect(rpcMock).toHaveBeenCalledWith('list_clubs_public', {
      p_topic: 'Evezés', p_city: null, p_search: null, p_limit: 48, p_offset: 0,
      p_club_type: null, p_audience: null, p_countries: null,
    });
    expect(page.items[0]).toMatchObject({
      name: 'Budapest Evezős Egyesület', topic: 'Evezés', postalCode: '1138',
      claimed: false, interestedCount: 3,
    });
    expect(page.hasMore).toBe(false);
  });

  it('survives a payload with no items', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null });
    const page = await listClubs();
    expect(page.items).toEqual([]);
    expect(page.nextOffset).toBeNull();
  });
});

describe('getClub', () => {
  it('returns null when the slug is unknown', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getClub('nincs-ilyen')).toBeNull();
  });

  it('reports the caller own status', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: CLUB_ID, slug: 'karate-klub', name: 'Karate Klub', my_status: 'interested', is_owner: false },
      error: null,
    });
    const club = await getClub('karate-klub');
    expect(club?.myStatus).toBe('interested');
    expect(club?.isOwner).toBe(false);
  });

  it('ignores a status value it does not know', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: CLUB_ID, slug: 'x', name: 'X', my_status: 'banned' },
      error: null,
    });
    expect((await getClub('x'))?.myStatus).toBeNull();
  });
});

describe('setClubMembership', () => {
  it('sends the status through', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: CLUB_ID, slug: 'x', name: 'X', my_status: 'interested', interested_count: 1 },
      error: null,
    });
    const club = await setClubMembership({ clubId: CLUB_ID, status: 'interested' });
    expect(rpcMock).toHaveBeenCalledWith('set_club_membership', {
      p_club_id: CLUB_ID, p_status: 'interested', p_note: null,
    });
    expect(club?.interestedCount).toBe(1);
  });

  it('surfaces the database error code', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'CLUB_NOT_FOUND' } });
    await expect(setClubMembership({ clubId: CLUB_ID, status: 'interested' }))
      .rejects.toThrow('CLUB_NOT_FOUND');
  });
});

describe('submitClubRegistration', () => {
  it('reports the throttle so the UI can explain it', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'TOO_MANY_PENDING' } });
    await expect(submitClubRegistration({ name: 'Klub', topic: 'Karate', city: 'Budapest' }))
      .rejects.toThrow('TOO_MANY_PENDING');
  });
});

describe('adminListClubs', () => {
  it('keeps the review state and the per-state counts', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        items: [{ id: CLUB_ID, slug: 'x', name: 'X', review_state: 'pending', source: 'self_registered', is_active: true }],
        counts: { pending: 2, approved: 2698 },
      },
      error: null,
    });
    const page = await adminListClubs({ reviewState: 'pending' });
    expect(page.items[0]).toMatchObject({ reviewState: 'pending', source: 'self_registered', isActive: true });
    expect(page.counts.approved).toBe(2698);
  });

  it('reports a missing capability rather than a generic failure', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'CAPABILITY_REQUIRED' } });
    await expect(adminListClubs()).rejects.toThrow('CAPABILITY_REQUIRED');
  });
});

/**
 * v1.70.0 added the country filter to the clubs listing. Omitting it must keep
 * meaning "every country", and an empty selection must go as NULL — an empty
 * array would be indistinguishable from "no countries at all" and could only
 * ever return nothing.
 */
describe('club country filter', () => {
  it('sends NULL when nothing is selected', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null });
    await listClubs({ countries: [] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toBeNull();
  });

  it('passes a selection through, uppercased and de-duplicated', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null });
    await listClubs({ countries: ['hu', 'AT', 'hu'] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toEqual(['HU', 'AT']);
  });

  it('drops blank entries rather than sending them', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null });
    await listClubs({ countries: ['', '   ', 'sk'] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toEqual(['SK']);
  });
});
