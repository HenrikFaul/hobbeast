import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { SavedResearchClaimsPage } from './contracts';
import {
  removeSavedResearchClaimFromCache,
  savedResearchClaimsQueryKey,
} from './useSavedResearchClaims';

const page: SavedResearchClaimsPage = {
  items: [
    {
      id: 'claim-one',
      locale: 'hu-HU',
      statement: 'Pontos állítás.',
      sourceTitle: 'Forrás',
      sourceContainer: null,
      authors: 'Szerző',
      publicationYear: 2024,
      sourceUrl: 'https://example.org/source',
      doi: null,
      isSaved: true,
      savedAt: '2026-08-25T12:00:00.000Z',
    },
  ],
  totalCount: 1,
  limit: 4,
  offset: 0,
};

describe('saved research claim cache helpers', () => {
  it('keeps private caches scoped by authenticated user and locale', () => {
    expect(savedResearchClaimsQueryKey('user-one', 'hu-HU')).not.toEqual(
      savedResearchClaimsQueryKey('user-two', 'hu-HU'),
    );
    expect(savedResearchClaimsQueryKey('user-one', 'hu-HU')).not.toEqual(
      savedResearchClaimsQueryKey('user-one', 'en-GB'),
    );
  });

  it('removes an unsaved claim immediately and adjusts only its cached page total', () => {
    const data: InfiniteData<SavedResearchClaimsPage> = { pages: [page], pageParams: [0] };
    const updated = removeSavedResearchClaimFromCache(data, 'claim-one');

    expect(updated?.pages[0].items).toEqual([]);
    expect(updated?.pages[0].totalCount).toBe(0);
    expect(data.pages[0].items).toHaveLength(1);
  });
});
