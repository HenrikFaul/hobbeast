import { useMemo } from 'react';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  resolveResearchLocale,
  type SavedResearchClaimsPage,
} from './contracts';
import { loadSavedResearchClaims, setResearchClaimSaved } from './repository';

const SAVED_CLAIMS_PAGE_SIZE = 4;

export const savedResearchClaimsQueryKey = (userId: string, locale: string) => (
  ['saved-community-research-claims', userId, locale] as const
);

export function removeSavedResearchClaimFromCache(
  data: InfiniteData<SavedResearchClaimsPage> | undefined,
  claimId: string,
): InfiniteData<SavedResearchClaimsPage> | undefined {
  if (!data) return data;
  const wasPresent = data.pages.some((page) => page.items.some((claim) => claim.id === claimId));
  if (!wasPresent) return data;

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((claim) => claim.id !== claimId),
      totalCount: Math.max(0, page.totalCount - 1),
    })),
  };
}

export function useSavedResearchClaims(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const locale = useMemo(() => resolveResearchLocale(
    typeof document === 'undefined' ? null : document.documentElement.lang,
    typeof navigator === 'undefined' ? null : navigator.language,
  ), []);
  const scopedUserId = userId ?? 'signed-out';
  const queryKey = savedResearchClaimsQueryKey(scopedUserId, locale);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => loadSavedResearchClaims({
      locale,
      limit: SAVED_CLAIMS_PAGE_SIZE,
      offset: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loadedCount = pages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.totalCount ? loadedCount : undefined;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const removeMutation = useMutation({
    mutationFn: ({ claimId }: { claimId: string; userId: string }) => (
      setResearchClaimSaved(claimId, false)
    ),
    onMutate: async ({ claimId, userId: mutationUserId }) => {
      const mutationQueryKey = savedResearchClaimsQueryKey(mutationUserId, locale);
      await queryClient.cancelQueries({ queryKey: mutationQueryKey });
      const previous = queryClient.getQueryData<InfiniteData<SavedResearchClaimsPage>>(
        mutationQueryKey,
      );
      queryClient.setQueryData(
        mutationQueryKey,
        removeSavedResearchClaimFromCache(previous, claimId),
      );
      return { previous, mutationQueryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.mutationQueryKey, context.previous);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context) void queryClient.invalidateQueries({ queryKey: context.mutationQueryKey });
    },
  });

  const claims = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    ...query,
    claims,
    removeSavedClaim: async (claimId: string) => {
      if (!userId) return false;
      return removeMutation.mutateAsync({ claimId, userId });
    },
    removingClaimId: removeMutation.isPending ? removeMutation.variables?.claimId ?? null : null,
    removeError: removeMutation.error,
  };
}
