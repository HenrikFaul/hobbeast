-- Per-locale review gates and source-text integrity for community research.
--
-- A translated statement must be independently reviewed before it can cross
-- the public RPC boundary. Display-field edits automatically return that
-- locale to draft. The original locale also remains bound to the immutable
-- parent hash, so changing both the text and a translation-local hash cannot
-- silently rewrite the reviewed source statement.

BEGIN;

ALTER TABLE public.community_research_claim_translations
  ADD COLUMN statement_sha256 text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN publication_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN translator_note text,
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz;

UPDATE public.community_research_claim_translations translation
SET statement_sha256 = encode(
      extensions.digest(convert_to(translation.statement_text, 'UTF8'), 'sha256'),
      'hex'
    ),
    review_status = CASE
      WHEN translation.is_original
       AND claim.review_status = 'approved'
       AND claim.publication_status = 'published'
       AND claim.original_statement_sha256 = encode(
         extensions.digest(convert_to(translation.statement_text, 'UTF8'), 'sha256'),
         'hex'
       )
        THEN 'approved'
      ELSE 'pending_review'
    END,
    publication_status = CASE
      WHEN translation.is_original
       AND claim.review_status = 'approved'
       AND claim.publication_status = 'published'
       AND claim.original_statement_sha256 = encode(
         extensions.digest(convert_to(translation.statement_text, 'UTF8'), 'sha256'),
         'hex'
       )
        THEN 'published'
      ELSE 'draft'
    END,
    reviewed_at = CASE
      WHEN translation.is_original
       AND claim.review_status = 'approved'
       AND claim.publication_status = 'published'
       AND claim.original_statement_sha256 = encode(
         extensions.digest(convert_to(translation.statement_text, 'UTF8'), 'sha256'),
         'hex'
       )
        THEN COALESCE(claim.reviewed_at, now())
      ELSE NULL
    END
FROM public.community_research_claims claim
WHERE claim.id = translation.claim_id;

ALTER TABLE public.community_research_claim_translations
  ALTER COLUMN statement_sha256 SET NOT NULL,
  ADD CONSTRAINT community_research_translation_hash_format
    CHECK (statement_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT community_research_translation_review_status
    CHECK (review_status IN ('pending_review', 'approved', 'excluded', 'archived')),
  ADD CONSTRAINT community_research_translation_publication_status
    CHECK (publication_status IN ('draft', 'published', 'withdrawn')),
  ADD CONSTRAINT community_research_translation_note_length
    CHECK (translator_note IS NULL OR length(translator_note) <= 2000),
  ADD CONSTRAINT community_research_translation_published_reviewed
    CHECK (
      publication_status <> 'published'
      OR (review_status = 'approved' AND reviewed_at IS NOT NULL)
    );

ALTER TABLE public.community_research_claims
  DROP CONSTRAINT community_research_claim_active_reviewed,
  ADD CONSTRAINT community_research_claim_active_reviewed
    CHECK (
      NOT is_active
      OR (
        review_status = 'approved'
        AND publication_status = 'published'
        AND reviewed_at IS NOT NULL
        AND original_statement_sha256 IS NOT NULL
      )
    );

CREATE OR REPLACE FUNCTION public.guard_community_research_claim_translation_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.statement_sha256 := encode(
    extensions.digest(convert_to(NEW.statement_text, 'UTF8'), 'sha256'),
    'hex'
  );

  IF TG_OP = 'UPDATE' AND (
    NEW.locale IS DISTINCT FROM OLD.locale
    OR NEW.statement_text IS DISTINCT FROM OLD.statement_text
    OR NEW.source_title IS DISTINCT FROM OLD.source_title
    OR NEW.source_container IS DISTINCT FROM OLD.source_container
    OR NEW.authors_display IS DISTINCT FROM OLD.authors_display
    OR NEW.is_original IS DISTINCT FROM OLD.is_original
  ) THEN
    NEW.review_status := 'pending_review';
    NEW.publication_status := 'draft';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_community_research_claim_translation_review()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_community_research_claim_translation_review()
  TO service_role;

DROP TRIGGER IF EXISTS community_research_claim_translation_review_guard
  ON public.community_research_claim_translations;
CREATE TRIGGER community_research_claim_translation_review_guard
  BEFORE INSERT OR UPDATE ON public.community_research_claim_translations
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_research_claim_translation_review();

CREATE OR REPLACE FUNCTION public.set_community_research_claim_saved(
  _claim_id uuid,
  _saved boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- A user must always be able to remove their own private save, even after
  -- an editor withdraws or deactivates the source claim.
  IF NOT _saved THEN
    DELETE FROM public.community_research_claim_saves
    WHERE user_id = auth.uid() AND claim_id = _claim_id;
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_research_claims claim
    WHERE claim.id = _claim_id
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
  ) THEN
    RAISE EXCEPTION 'Research claim is unavailable' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.community_research_claim_saves (user_id, claim_id)
  VALUES (auth.uid(), _claim_id)
  ON CONFLICT (user_id, claim_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_community_research_claim_saved(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_community_research_claim_saved(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON COLUMN public.community_research_claim_translations.statement_sha256 IS
  'SHA-256 of the exact UTF-8 statement_text reviewed for this locale.';
COMMENT ON COLUMN public.community_research_claim_translations.review_status IS
  'Locale-specific editorial review state; display-field changes reset it to pending_review.';
COMMENT ON COLUMN public.community_research_claim_translations.publication_status IS
  'Locale-specific publication state; only approved and published translations are public.';

COMMIT;
