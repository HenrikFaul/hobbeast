-- Private saved-claim library: ownership, review gates, locale fallback and paging.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('a1100000-0000-4000-8000-000000000001'),
  ('a1100000-0000-4000-8000-000000000002');

-- Give the first member the complete reviewed starter set. Deliberately varied
-- timestamps make the offset assertions deterministic.
INSERT INTO public.community_research_claim_saves (user_id, claim_id, created_at)
SELECT
  'a1100000-0000-4000-8000-000000000001'::uuid,
  claim.id,
  '2026-08-25 12:00:00+00'::timestamptz
    + make_interval(secs => claim.source_sequence_id)
FROM public.community_research_claims claim
WHERE claim.canonical_key LIKE 'literature-source-%'
  AND claim.review_status = 'approved'
  AND claim.publication_status = 'published'
  AND claim.is_active;

-- A separate member gets exactly one overlapping save. The first member must
-- never be able to infer this second member's library through the RPC.
INSERT INTO public.community_research_claim_saves (user_id, claim_id, created_at)
SELECT
  'a1100000-0000-4000-8000-000000000002'::uuid,
  claim.id,
  '2026-08-25 13:00:00+00'::timestamptz
FROM public.community_research_claims claim
WHERE claim.source_sequence_id = 6;

-- Supply a regional English translation for one row to prove language-level
-- fallback without altering the exact Hungarian original.
INSERT INTO public.community_research_claim_translations (
  claim_id, locale, statement_text, source_title, source_container,
  authors_display, is_original, review_status, publication_status, reviewed_at
)
SELECT
  claim.id,
  'en-US',
  'English saved-library fallback statement.',
  'English saved-library source',
  NULL,
  'Test Author',
  false,
  'approved',
  'published',
  now()
FROM public.community_research_claims claim
WHERE claim.source_sequence_id = 6;

SELECT set_config(
  'test.saved_claim_six_id',
  (SELECT id::text FROM public.community_research_claims WHERE source_sequence_id = 6),
  true
);
SELECT set_config(
  'test.saved_claim_eight_id',
  (SELECT id::text FROM public.community_research_claims WHERE source_sequence_id = 8),
  true
);

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.list_saved_community_research_claims(text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anonymous role can execute the private saved-claim library';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_saved_community_research_claims(text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role cannot execute its saved-claim library';
  END IF;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.list_saved_community_research_claims('hu-HU', 6, 0);
    RAISE EXCEPTION 'anonymous caller listed saved claims';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  returned_count integer;
  reported_total bigint;
  first_page_ids uuid[];
  second_page_ids uuid[];
  localized record;
BEGIN
  -- Huge limits are clamped to 25; the DTO may report only this caller's
  -- eligible total, never another member's or the complete claim corpus.
  SELECT count(*), max(total_count)
  INTO returned_count, reported_total
  FROM public.list_saved_community_research_claims('hu-HU', 500, 0);

  IF returned_count <> 25 OR reported_total <> 30 THEN
    RAISE EXCEPTION 'limit clamp or caller-only total failed: rows %, total %',
      returned_count, reported_total;
  END IF;

  -- Zero and negative input cannot disable paging or walk before page zero.
  SELECT count(*) INTO returned_count
  FROM public.list_saved_community_research_claims('hu-HU', 0, -25);
  IF returned_count <> 1 THEN
    RAISE EXCEPTION 'minimum limit/offset clamp failed: % rows', returned_count;
  END IF;

  SELECT array_agg(claim_id ORDER BY saved_at DESC, claim_id DESC)
  INTO first_page_ids
  FROM public.list_saved_community_research_claims('hu-HU', 5, 0);

  SELECT array_agg(claim_id ORDER BY saved_at DESC, claim_id DESC)
  INTO second_page_ids
  FROM public.list_saved_community_research_claims('hu-HU', 5, 5);

  IF cardinality(first_page_ids) <> 5
     OR cardinality(second_page_ids) <> 5
     OR first_page_ids && second_page_ids THEN
    RAISE EXCEPTION 'saved-claim pages overlap or have the wrong size';
  END IF;

  SELECT * INTO localized
  FROM public.list_saved_community_research_claims('en-GB', 25, 25)
  WHERE claim_id = current_setting('test.saved_claim_six_id')::uuid;

  IF localized.resolved_locale <> 'en-US'
     OR localized.statement_text <> 'English saved-library fallback statement.' THEN
    RAISE EXCEPTION 'language-level locale fallback failed: %', localized;
  END IF;

  SELECT * INTO localized
  FROM public.list_saved_community_research_claims('de-DE', 25, 25)
  WHERE claim_id = current_setting('test.saved_claim_eight_id')::uuid;

  IF localized.resolved_locale <> 'hu-HU' THEN
    RAISE EXCEPTION 'original-locale fallback failed: %', localized;
  END IF;
END $$;

-- Editing localized display metadata forces that locale back to review. The
-- saved library must immediately fall back to another approved translation.
RESET ROLE;
UPDATE public.community_research_claim_translations
SET source_title = 'Changed but not re-reviewed English source'
WHERE claim_id = current_setting('test.saved_claim_six_id')::uuid
  AND locale = 'en-US';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
DO $$
DECLARE
  localized record;
BEGIN
  SELECT * INTO localized
  FROM public.list_saved_community_research_claims('en-GB', 25, 25)
  WHERE claim_id = current_setting('test.saved_claim_six_id')::uuid;

  IF localized.resolved_locale <> 'hu-HU' THEN
    RAISE EXCEPTION 'unreviewed localized metadata crossed the saved-list boundary: %', localized;
  END IF;
END $$;

-- A saved row becomes invisible immediately when editorial state withdraws it.
RESET ROLE;
UPDATE public.community_research_claims
SET is_active = false,
    review_status = 'archived',
    publication_status = 'withdrawn'
WHERE source_sequence_id = 8;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
DO $$
DECLARE
  withdrawn_count integer;
  reported_total bigint;
BEGIN
  SELECT count(*), max(total_count)
  INTO withdrawn_count, reported_total
  FROM public.list_saved_community_research_claims('hu-HU', 25, 0)
  WHERE claim_id = current_setting('test.saved_claim_eight_id')::uuid;

  IF withdrawn_count <> 0 THEN
    RAISE EXCEPTION 'withdrawn saved claim remained visible';
  END IF;

  SELECT max(total_count) INTO reported_total
  FROM public.list_saved_community_research_claims('hu-HU', 25, 0);
  IF reported_total <> 29 THEN
    RAISE EXCEPTION 'withdrawn claim remained in the eligible saved total: %', reported_total;
  END IF;

  IF public.set_community_research_claim_saved(
    current_setting('test.saved_claim_eight_id')::uuid,
    false
  ) THEN
    RAISE EXCEPTION 'withdrawn claim unsave returned the wrong state';
  END IF;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.community_research_claim_saves
    WHERE user_id = 'a1100000-0000-4000-8000-000000000001'::uuid
      AND claim_id = current_setting('test.saved_claim_eight_id')::uuid
  ) THEN
    RAISE EXCEPTION 'withdrawn private save was not removed for its owner';
  END IF;
END $$;

-- The second member still sees only their own one-row library and cannot see
-- any of the first member's save count or ordering.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000002', true);
DO $$
DECLARE
  returned_count integer;
  reported_total bigint;
BEGIN
  SELECT count(*), max(total_count)
  INTO returned_count, reported_total
  FROM public.list_saved_community_research_claims('hu-HU', 25, 0);

  IF returned_count <> 1 OR reported_total <> 1 THEN
    RAISE EXCEPTION 'saved-claim owner isolation failed: rows %, total %',
      returned_count, reported_total;
  END IF;
END $$;

-- Parent/original integrity is also mandatory. A parent hash that no longer
-- matches its reviewed original makes the saved DTO unavailable.
RESET ROLE;
UPDATE public.community_research_claims
SET original_statement_sha256 = repeat('0', 64)
WHERE source_sequence_id = 6;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000002', true);
DO $$
DECLARE
  returned_count integer;
BEGIN
  SELECT count(*) INTO returned_count
  FROM public.list_saved_community_research_claims('hu-HU', 25, 0);
  IF returned_count <> 0 THEN
    RAISE EXCEPTION 'parent/original hash mismatch crossed the saved-list boundary';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
\echo SAVED_COMMUNITY_RESEARCH_CLAIM_LIBRARY_PASS
