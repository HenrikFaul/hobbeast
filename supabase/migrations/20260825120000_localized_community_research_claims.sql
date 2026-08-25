-- Localized, review-gated community research claims and private user saves.
--
-- The source workbook/Markdown are intentionally not seeded here. Import is a
-- separate editorial step: only reviewed, approved and active claims can ever
-- cross the public RPC boundary.

BEGIN;

CREATE TABLE public.community_research_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE
    CHECK (canonical_key ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'),
  source_sequence_id integer CHECK (source_sequence_id IS NULL OR source_sequence_id > 0),
  original_locale text NOT NULL DEFAULT 'hu-HU'
    CHECK (
      length(original_locale) BETWEEN 2 AND 35
      AND original_locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
    ),
  publication_year smallint NOT NULL
    CHECK (publication_year BETWEEN 1000 AND 2200),
  source_url text
    CHECK (source_url IS NULL OR (length(source_url) <= 2048 AND source_url ~ '^https://[^[:space:]]+$')),
  doi text CHECK (doi IS NULL OR length(doi) BETWEEN 3 AND 255),
  original_statement_sha256 text
    CHECK (original_statement_sha256 IS NULL OR original_statement_sha256 ~ '^[0-9a-f]{64}$'),
  review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'approved', 'excluded', 'archived')),
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'withdrawn')),
  is_active boolean NOT NULL DEFAULT false,
  eligible_placements text[] NOT NULL DEFAULT ARRAY['research_feature']::text[]
    CHECK (
      cardinality(eligible_placements) BETWEEN 1 AND 5
      AND eligible_placements <@ ARRAY[
        'global', 'research_feature', 'home_connection', 'about_mission', 'explore_context'
      ]::text[]
    ),
  random_key double precision NOT NULL DEFAULT random()
    CHECK (random_key >= 0 AND random_key < 1),
  editorial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(editorial_metadata) = 'object'),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_research_claim_active_reviewed
    CHECK (
      NOT is_active
      OR (
        review_status = 'approved'
        AND publication_status = 'published'
        AND reviewed_at IS NOT NULL
      )
    )
);

CREATE TABLE public.community_research_claim_translations (
  claim_id uuid NOT NULL REFERENCES public.community_research_claims(id) ON DELETE CASCADE,
  locale text NOT NULL
    CHECK (
      length(locale) BETWEEN 2 AND 35
      AND locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
    ),
  statement_text text NOT NULL
    CHECK (length(statement_text) BETWEEN 1 AND 4000),
  source_title text NOT NULL
    CHECK (length(source_title) BETWEEN 1 AND 1000),
  source_container text
    CHECK (source_container IS NULL OR length(source_container) BETWEEN 1 AND 500),
  authors_display text NOT NULL
    CHECK (length(authors_display) BETWEEN 1 AND 1000),
  is_original boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, locale)
);

CREATE UNIQUE INDEX community_research_claim_one_original_translation_uidx
  ON public.community_research_claim_translations (claim_id)
  WHERE is_original;

CREATE UNIQUE INDEX community_research_claim_source_sequence_uidx
  ON public.community_research_claims (source_sequence_id)
  WHERE source_sequence_id IS NOT NULL;

CREATE TABLE public.community_research_claim_saves (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.community_research_claims(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, claim_id)
);

CREATE INDEX community_research_claim_random_lookup_idx
  ON public.community_research_claims (random_key, id)
  WHERE review_status = 'approved' AND publication_status = 'published' AND is_active;

CREATE INDEX community_research_claim_saves_recent_idx
  ON public.community_research_claim_saves (user_id, created_at DESC);

CREATE TRIGGER community_research_claims_updated_at
  BEFORE UPDATE ON public.community_research_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER community_research_claim_translations_updated_at
  BEFORE UPDATE ON public.community_research_claim_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.community_research_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_research_claim_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_research_claim_saves ENABLE ROW LEVEL SECURITY;

-- Content tables remain editorial/service-only. Public clients receive only a
-- deliberately small DTO through get_random_community_research_claim().
REVOKE ALL ON TABLE public.community_research_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_research_claim_translations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_research_claim_saves FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_research_claims TO service_role;
GRANT ALL ON TABLE public.community_research_claim_translations TO service_role;
GRANT ALL ON TABLE public.community_research_claim_saves TO service_role;

-- Defense in depth if direct grants are ever introduced later: a user can see
-- or remove only their own saves and can create only their own save rows.
CREATE POLICY community_research_claim_saves_select_own
  ON public.community_research_claim_saves
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY community_research_claim_saves_insert_own
  ON public.community_research_claim_saves
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY community_research_claim_saves_delete_own
  ON public.community_research_claim_saves
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

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

  -- Persistent random keys allow an indexed cursor lookup. This avoids
  -- ORDER BY random() scanning/sorting the entire reviewed corpus per view.
  SELECT claim.id
  INTO selected_claim_id
  FROM public.community_research_claims claim
  WHERE claim.review_status = 'approved'
    AND claim.publication_status = 'published'
    AND claim.is_active
    AND (_placement = ANY(claim.eligible_placements) OR 'global' = ANY(claim.eligible_placements))
    AND claim.random_key >= cursor_value
    AND EXISTS (
      SELECT 1
      FROM public.community_research_claim_translations translation
      WHERE translation.claim_id = claim.id
    )
  ORDER BY claim.random_key, claim.id
  LIMIT 1;

  IF selected_claim_id IS NULL THEN
    SELECT claim.id
    INTO selected_claim_id
    FROM public.community_research_claims claim
    WHERE claim.review_status = 'approved'
      AND claim.publication_status = 'published'
      AND claim.is_active
      AND (_placement = ANY(claim.eligible_placements) OR 'global' = ANY(claim.eligible_placements))
      AND EXISTS (
        SELECT 1
        FROM public.community_research_claim_translations translation
        WHERE translation.claim_id = claim.id
      )
    ORDER BY claim.random_key, claim.id
    LIMIT 1;
  END IF;

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

CREATE OR REPLACE FUNCTION public.set_community_research_claim_saved(
  _claim_id uuid,
  _saved boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_research_claims claim
    WHERE claim.id = _claim_id
      AND claim.review_status = 'approved'
      AND claim.publication_status = 'published'
      AND claim.is_active
  ) THEN
    RAISE EXCEPTION 'Research claim is unavailable' USING ERRCODE = 'P0002';
  END IF;

  IF _saved THEN
    INSERT INTO public.community_research_claim_saves (user_id, claim_id)
    VALUES (auth.uid(), _claim_id)
    ON CONFLICT (user_id, claim_id) DO NOTHING;
  ELSE
    DELETE FROM public.community_research_claim_saves
    WHERE user_id = auth.uid() AND claim_id = _claim_id;
  END IF;

  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.get_random_community_research_claim(text, text, double precision)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_community_research_claim_saved(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_random_community_research_claim(text, text, double precision)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_community_research_claim_saved(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON TABLE public.community_research_claims IS
  'Review-gated, locale-independent metadata for evidence-backed community claims.';
COMMENT ON TABLE public.community_research_claim_translations IS
  'Exact original statements and human-reviewed localized display variants.';
COMMENT ON TABLE public.community_research_claim_saves IS
  'Private per-user likes/saves for approved research claims.';
COMMENT ON FUNCTION public.get_random_community_research_claim(text, text, double precision) IS
  'Returns one approved localized claim for a pre-approved UI slot without exposing the corpus.';

COMMIT;
