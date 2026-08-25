import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createResearchRandomCursor,
  resolveResearchLocale,
  type ResearchClaimPlacement,
} from './contracts';
import { loadRandomResearchClaim } from './repository';

export function useRandomResearchClaim(placement: ResearchClaimPlacement) {
  const [randomCursor] = useState(createResearchRandomCursor);
  const locale = useMemo(() => resolveResearchLocale(
    typeof document === 'undefined' ? null : document.documentElement.lang,
    typeof navigator === 'undefined' ? null : navigator.language,
  ), []);

  return useQuery({
    queryKey: ['community-research-claim', placement, locale, randomCursor],
    queryFn: () => loadRandomResearchClaim({ locale, placement, randomCursor }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
