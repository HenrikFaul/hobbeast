import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));

import {
  loadRandomResearchClaim,
  loadSavedResearchClaims,
  setResearchClaimSaved,
} from './repository';

describe('research claim repository', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('maps the localized RPC DTO without rewriting the statement', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        claim_id: 'claim-one',
        resolved_locale: 'hu-HU',
        statement_text: '  A forrás pontos szövege a szóközökkel együtt.  ',
        source_title: 'Forrás címe',
        source_container: 'Folyóirat',
        authors_display: 'Szerző Egy és Szerző Kettő',
        publication_year: 2024,
        source_url: 'https://example.org/source',
        doi: '10.1000/example',
        is_saved: false,
      }],
      error: null,
    });

    const result = await loadRandomResearchClaim({
      locale: 'hu-HU',
      placement: 'research_feature',
      randomCursor: 0.25,
    });

    expect(result?.statement).toBe('  A forrás pontos szövege a szóközökkel együtt.  ');
    expect(result?.authors).toBe('Szerző Egy és Szerző Kettő');
    expect(mocks.rpc).toHaveBeenCalledWith('get_random_community_research_claim', {
      _locale: 'hu-HU',
      _placement: 'research_feature',
      _random_cursor: 0.25,
    });
  });

  it('uses the idempotent save RPC as the only browser write boundary', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(setResearchClaimSaved('claim-one', true)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('set_community_research_claim_saved', {
      _claim_id: 'claim-one',
      _saved: true,
    });
  });

  it('maps only the bounded localized saved-library DTO returned by its RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        claim_id: 'saved-one',
        resolved_locale: 'en-US',
        statement_text: 'An exact localized statement.',
        source_title: 'Source title',
        source_container: null,
        authors_display: 'First Author and Second Author',
        publication_year: 2023,
        source_url: null,
        doi: '10.1000/saved',
        saved_at: '2026-08-25T12:00:00.000Z',
        total_count: '7',
      }],
      error: null,
    });

    const page = await loadSavedResearchClaims({ locale: 'en-GB', limit: 4, offset: 4 });

    expect(page.totalCount).toBe(7);
    expect(page.items[0]).toMatchObject({
      id: 'saved-one',
      locale: 'en-US',
      statement: 'An exact localized statement.',
      isSaved: true,
      savedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('list_saved_community_research_claims', {
      _locale: 'en-GB',
      _limit: 4,
      _offset: 4,
    });
  });
});
