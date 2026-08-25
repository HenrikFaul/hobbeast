-- Make every eligible research claim occupy an equal-width random interval.
--
-- The first implementation used persistent random_key gaps. That keeps lookup
-- cheap, but a claim's probability then equals the preceding gap and can be
-- permanently skewed. The reviewed corpus is intentionally bounded, so a
-- stable ordinal window gives each eligible claim exactly 1/N probability and
-- better matches the product's explicit full-random contract.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_random_community_research_claim(
  _locale text DEFAULT 'hu-HU',
  _placement text DEFAULT 'research_feature',
  _random_cursor double precision DEFAULT NULL
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
  is_saved boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_locale text := replace(trim(coalesce(_locale, '')), '_', '-');
  requested_language text;
  cursor_value double precision;
  selected_claim_id uuid;
BEGIN
  IF requested_locale !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
     OR length(requested_locale) > 35 THEN
    requested_locale := 'hu-HU';
  END IF;
  requested_language := lower(split_part(requested_locale, '-', 1));

  IF _placement NOT IN (
    'global', 'research_feature', 'home_connection', 'about_mission', 'explore_context'
  ) THEN
    RAISE EXCEPTION 'Unsupported research claim placement' USING ERRCODE = '22023';
  END IF;

  cursor_value := CASE
    WHEN _random_cursor IS NULL OR NOT (_random_cursor >= 0 AND _random_cursor < 1)
      THEN random()
    ELSE _random_cursor
  END;

  SELECT candidate.id
  INTO selected_claim_id
  FROM (
    SELECT
      claim.id,
      row_number() OVER (ORDER BY claim.id) AS ordinal,
      count(*) OVER () AS eligible_count
    FROM public.community_research_claims claim
    WHERE claim.review_status = 'approved'
      AND claim.publication_status = 'published'
      AND claim.is_active
      AND (_placement = ANY(claim.eligible_placements) OR 'global' = ANY(claim.eligible_placements))
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
  ) candidate
  WHERE candidate.ordinal = floor(cursor_value * candidate.eligible_count)::bigint + 1
  LIMIT 1;

  IF selected_claim_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
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
    EXISTS (
      SELECT 1
      FROM public.community_research_claim_saves saved
      WHERE saved.user_id = auth.uid() AND saved.claim_id = claim.id
    )
  FROM public.community_research_claims claim
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
  WHERE claim.id = selected_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_random_community_research_claim(text, text, double precision)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_random_community_research_claim(text, text, double precision)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_random_community_research_claim(text, text, double precision) IS
  'Returns one approved localized claim from an equal-probability ordinal bucket for a pre-approved UI slot.';

COMMIT;
