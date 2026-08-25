import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type {
  CommunityResearchClaim,
  RandomResearchClaimRequest,
  SavedCommunityResearchClaim,
  SavedResearchClaimsPage,
  SavedResearchClaimsRequest,
} from './contracts';

interface ResearchClaimRow {
  claim_id: string;
  resolved_locale: string;
  statement_text: string;
  source_title: string;
  source_container: string | null;
  authors_display: string;
  publication_year: number;
  source_url: string | null;
  doi: string | null;
  is_saved: boolean;
}

interface SavedResearchClaimRow extends Omit<ResearchClaimRow, 'is_saved'> {
  saved_at: string;
  total_count: number | string;
}

interface ResearchClaimRpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<{
    data: T | null;
    error: PostgrestError | null;
  }>;
}

const researchClaimRpcClient = supabase as unknown as ResearchClaimRpcClient;

function mapClaim(row: ResearchClaimRow): CommunityResearchClaim {
  return {
    id: row.claim_id,
    locale: row.resolved_locale,
    statement: row.statement_text,
    sourceTitle: row.source_title,
    sourceContainer: row.source_container,
    authors: row.authors_display,
    publicationYear: row.publication_year,
    sourceUrl: row.source_url,
    doi: row.doi,
    isSaved: row.is_saved,
  };
}

export async function loadRandomResearchClaim(
  request: RandomResearchClaimRequest,
): Promise<CommunityResearchClaim | null> {
  const { data, error } = await researchClaimRpcClient.rpc<ResearchClaimRow[]>(
    'get_random_community_research_claim',
    {
      _locale: request.locale,
      _placement: request.placement,
      _random_cursor: request.randomCursor,
    },
  );
  if (error) throw error;
  const row = data?.[0];
  return row ? mapClaim(row) : null;
}

export async function setResearchClaimSaved(claimId: string, saved: boolean): Promise<boolean> {
  const { data, error } = await researchClaimRpcClient.rpc<boolean>(
    'set_community_research_claim_saved',
    { _claim_id: claimId, _saved: saved },
  );
  if (error) throw error;
  return data === true;
}

function mapSavedClaim(row: SavedResearchClaimRow): SavedCommunityResearchClaim {
  return {
    ...mapClaim({ ...row, is_saved: true }),
    isSaved: true,
    savedAt: row.saved_at,
  };
}

export async function loadSavedResearchClaims(
  request: SavedResearchClaimsRequest,
): Promise<SavedResearchClaimsPage> {
  const { data, error } = await researchClaimRpcClient.rpc<SavedResearchClaimRow[]>(
    'list_saved_community_research_claims',
    {
      _locale: request.locale,
      _limit: request.limit,
      _offset: request.offset,
    },
  );
  if (error) throw error;

  const rows = data ?? [];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : request.offset;
  return {
    items: rows.map(mapSavedClaim),
    totalCount: Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : 0,
    limit: request.limit,
    offset: request.offset,
  };
}
