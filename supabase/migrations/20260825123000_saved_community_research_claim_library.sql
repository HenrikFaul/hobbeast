-- Private, localized and bounded retrieval for a member's saved research claims.
--
-- The browser never receives direct table access. This RPC resolves the caller
-- exclusively from auth.uid(), filters withdrawn/unreviewed content and clamps
-- every page so it cannot be repurposed as a full-corpus export boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_saved_community_research_claims(
  _locale text DEFAULT 'hu-HU',
  _limit integer DEFAULT 6,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  claim_id uuid,
  resolved_locale text,
  statement_text text,
  source_title text,
  source_container text,
  authors_display text,
  publication_year smallint,
  source_url text,
  doi text,
  saved_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  requested_locale text := replace(trim(coalesce(_locale, '')), '_', '-');
  requested_language text;
  page_limit integer := least(greatest(coalesce(_limit, 6), 1), 25);
  page_offset integer := least(greatest(coalesce(_offset, 0), 0), 10000);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF requested_locale !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
     OR length(requested_locale) > 35 THEN
    requested_locale := 'hu-HU';
  END IF;
  requested_language := lower(split_part(requested_locale, '-', 1));

  RETURN QUERY
  WITH own_available_saves AS (
    SELECT
      saved.claim_id,
      saved.created_at,
      count(*) OVER () AS available_count
    FROM public.community_research_claim_saves saved
    JOIN public.community_research_claims claim ON claim.id = saved.claim_id
    WHERE saved.user_id = caller_id
      AND claim.review_status = 'approved'
      AND claim.publication_status = 'published'
      AND claim.is_active
      AND claim.original_statement_sha256 IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.community_research_claim_translations original_translation
        WHERE original_translation.claim_id = claim.id
          AND original_translation.is_original
          AND lower(original_translation.locale) = lower(claim.original_locale)
          AND original_translation.review_status = 'approved'
          AND original_translation.publication_status = 'published'
          AND original_translation.statement_sha256 = claim.original_statement_sha256
          AND original_translation.statement_sha256 = encode(
            extensions.digest(convert_to(original_translation.statement_text, 'UTF8'), 'sha256'),
            'hex'
          )
      )
      AND EXISTS (
        SELECT 1
        FROM public.community_research_claim_translations available_translation
        WHERE available_translation.claim_id = claim.id
          AND available_translation.review_status = 'approved'
          AND available_translation.publication_status = 'published'
          AND available_translation.statement_sha256 = encode(
            extensions.digest(convert_to(available_translation.statement_text, 'UTF8'), 'sha256'),
            'hex'
          )
      )
    ORDER BY saved.created_at DESC, saved.claim_id DESC
    OFFSET page_offset
    LIMIT page_limit
  )
  SELECT
    claim.id,
    translation.locale,
    translation.statement_text,
    translation.source_title,
    translation.source_container,
    translation.authors_display,
    claim.publication_year,
    claim.source_url,
    claim.doi,
    saved.created_at,
    saved.available_count
  FROM own_available_saves saved
  JOIN public.community_research_claims claim ON claim.id = saved.claim_id
  CROSS JOIN LATERAL (
    SELECT candidate.*
    FROM public.community_research_claim_translations candidate
    WHERE candidate.claim_id = claim.id
      AND candidate.review_status = 'approved'
      AND candidate.publication_status = 'published'
      AND candidate.statement_sha256 = encode(
        extensions.digest(convert_to(candidate.statement_text, 'UTF8'), 'sha256'),
        'hex'
      )
    ORDER BY
      CASE
        WHEN lower(candidate.locale) = lower(requested_locale) THEN 0
        WHEN lower(split_part(candidate.locale, '-', 1)) = requested_language THEN 1
        WHEN lower(candidate.locale) = lower(claim.original_locale) THEN 2
        WHEN candidate.is_original THEN 3
        ELSE 4
      END,
      candidate.locale
    LIMIT 1
  ) translation
  ORDER BY saved.created_at DESC, saved.claim_id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_saved_community_research_claims(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_saved_community_research_claims(text, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.list_saved_community_research_claims(text, integer, integer) IS
  'Returns only the authenticated caller''s approved, published and active saved research claims with locale fallback and a 25-row page ceiling.';

COMMIT;
