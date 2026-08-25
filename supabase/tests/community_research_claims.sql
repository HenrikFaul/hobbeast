-- Localization, review gate, random cursor and private save contract.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  expected_sequences integer[] := ARRAY[
    6, 8, 27, 28, 113, 114, 115, 118, 121, 185,
    200, 201, 202, 205, 206, 301, 302, 308, 316, 317,
    322, 398, 399, 435, 436, 443, 444, 450, 459, 480
  ];
  actual_sequences integer[];
  missing_originals integer;
  missing_topics integer;
  hash_mismatches integer;
BEGIN
  SELECT array_agg(source_sequence_id ORDER BY source_sequence_id)
  INTO actual_sequences
  FROM public.community_research_claims
  WHERE canonical_key LIKE 'literature-source-%'
    AND review_status = 'approved'
    AND publication_status = 'published'
    AND is_active;

  IF actual_sequences IS DISTINCT FROM expected_sequences THEN
    RAISE EXCEPTION 'active literature seed differs from the reviewed 30 rows: %', actual_sequences;
  END IF;

  SELECT count(*) INTO missing_originals
  FROM public.community_research_claims claim
  WHERE claim.source_sequence_id = ANY(expected_sequences)
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_research_claim_translations translation
      WHERE translation.claim_id = claim.id
        AND translation.locale = 'hu-HU'
        AND translation.is_original
    );
  IF missing_originals <> 0 THEN
    RAISE EXCEPTION '% reviewed seed claim(s) lack an original hu-HU translation', missing_originals;
  END IF;

  SELECT count(*) INTO missing_topics
  FROM public.community_research_claims claim
  WHERE claim.source_sequence_id = ANY(expected_sequences)
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_research_claim_topics topic
      WHERE topic.claim_id = claim.id
    );
  IF missing_topics <> 0 THEN
    RAISE EXCEPTION '% reviewed seed claim(s) lack a topic assignment', missing_topics;
  END IF;

  SELECT count(*) INTO hash_mismatches
  FROM public.community_research_claims claim
  JOIN public.community_research_claim_translations translation
    ON translation.claim_id = claim.id
   AND translation.locale = 'hu-HU'
   AND translation.is_original
  WHERE claim.source_sequence_id = ANY(expected_sequences)
    AND claim.original_statement_sha256 IS DISTINCT FROM
      encode(extensions.digest(translation.statement_text, 'sha256'), 'hex');
  IF hash_mismatches <> 0 THEN
    RAISE EXCEPTION '% reviewed seed claim statement hash(es) do not match exact hu-HU text', hash_mismatches;
  END IF;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE
  selected record;
BEGIN
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'research_feature', 0.50);
  IF selected.claim_id IS NULL OR selected.statement_text IS NULL THEN
    RAISE EXCEPTION 'public research RPC returned no reviewed seed row';
  END IF;
END $$;
RESET ROLE;

-- Simulate an editorial withdrawal followed by a seed rerun. The seed's
-- ON CONFLICT DO NOTHING contract must not resurrect or reposition the row.
UPDATE public.community_research_claims
SET review_status = 'archived',
    publication_status = 'withdrawn',
    is_active = false,
    eligible_placements = ARRAY['about_mission']::text[]
WHERE canonical_key = 'literature-source-6';

INSERT INTO public.community_research_claims (
  canonical_key, source_sequence_id, original_locale, publication_year,
  original_statement_sha256, review_status, publication_status, is_active,
  eligible_placements, reviewed_at
)
VALUES (
  'literature-source-6', 6, 'hu-HU', 1973,
  encode(extensions.digest(convert_to(
    'A „gyenge kötések” – ismerősök, laza szakmai/társas kapcsolatok – gyakran fontos hidak új információkhoz és lehetőségekhez; nem csak az intim kapcsolatok értékesek.',
    'UTF8'
  ), 'sha256'), 'hex'),
  'approved', 'published', true, ARRAY['research_feature']::text[], now()
)
ON CONFLICT (canonical_key) DO NOTHING;

DO $$
DECLARE
  claim record;
BEGIN
  SELECT review_status, publication_status, is_active, eligible_placements
  INTO claim
  FROM public.community_research_claims
  WHERE canonical_key = 'literature-source-6';

  IF claim.review_status <> 'archived'
     OR claim.publication_status <> 'withdrawn'
     OR claim.is_active
     OR claim.eligible_placements <> ARRAY['about_mission']::text[] THEN
    RAISE EXCEPTION 'seed rerun resurrected or repositioned a withdrawn claim: %', claim;
  END IF;
END $$;

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');

INSERT INTO public.community_research_claims (
  id, canonical_key, source_sequence_id, original_locale, publication_year, source_url,
  original_statement_sha256, review_status, publication_status, is_active,
  eligible_placements, random_key, reviewed_at
)
VALUES
  (
    'a2000000-0000-4000-8000-000000000001', 'fixture.claim.one', 1, 'hu-HU', 2020,
    'https://example.org/study-one',
    encode(extensions.digest(convert_to('Az első állítás pontos magyar szövege.', 'UTF8'), 'sha256'), 'hex'),
    'approved', 'published', true,
    ARRAY['global'], 0.20, now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'fixture.claim.two', 2, 'hu-HU', 2021,
    'https://example.org/study-two',
    encode(extensions.digest(convert_to('A második állítás pontos magyar szövege.', 'UTF8'), 'sha256'), 'hex'),
    'approved', 'published', true,
    ARRAY['global'], 0.80, now()
  ),
  (
    'a2000000-0000-4000-8000-000000000003', 'fixture.claim.pending', 3, 'hu-HU', 2022,
    'https://example.org/pending', NULL, 'pending_review', 'draft', false,
    ARRAY['global'], 0.15, NULL
  );

INSERT INTO public.community_research_claim_translations (
  claim_id, locale, statement_text, source_title, source_container,
  authors_display, is_original, review_status, publication_status, reviewed_at
)
VALUES
  (
    'a2000000-0000-4000-8000-000000000001', 'hu-HU',
    'Az első állítás pontos magyar szövege.', 'Az első tanulmány', 'Tesztfolyóirat',
    'Első Szerző és Második Szerző', true, 'approved', 'published', now()
  ),
  (
    'a2000000-0000-4000-8000-000000000001', 'en-US',
    'The exact English translation of the first claim.', 'The first study', 'Test Journal',
    'First Author and Second Author', false, 'approved', 'published', now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'hu-HU',
    'A második állítás pontos magyar szövege.', 'A második tanulmány', NULL,
    'Harmadik Szerző', true, 'approved', 'published', now()
  ),
  (
    'a2000000-0000-4000-8000-000000000003', 'hu-HU',
    'Ez a függő állítás nem kerülhet ki.', 'Függő tanulmány', NULL,
    'Függő Szerző', true, 'pending_review', 'draft', NULL
  );

DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.community_research_claims'::regclass
  ) OR NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.community_research_claim_translations'::regclass
  ) OR NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.community_research_claim_saves'::regclass
  ) THEN
    RAISE EXCEPTION 'research claim RLS is not enabled on every table';
  END IF;

  IF has_table_privilege('anon', 'public.community_research_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_research_claim_translations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_research_claim_saves', 'INSERT') THEN
    RAISE EXCEPTION 'a protected research table has direct browser privileges';
  END IF;
END $$;

-- Editing reviewed original display text must force locale-level re-review and
-- immediately remove that claim from the public picker until restored.
UPDATE public.community_research_claim_translations
SET statement_text = 'Nem jóváhagyott szerkesztési próba.'
WHERE claim_id = 'a2000000-0000-4000-8000-000000000001'
  AND locale = 'hu-HU';

DO $$
DECLARE
  translation record;
BEGIN
  SELECT review_status, publication_status, reviewed_at
  INTO translation
  FROM public.community_research_claim_translations
  WHERE claim_id = 'a2000000-0000-4000-8000-000000000001'
    AND locale = 'hu-HU';

  IF translation.review_status <> 'pending_review'
     OR translation.publication_status <> 'draft'
     OR translation.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'display edit did not force translation re-review: %', translation;
  END IF;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE
  selected record;
BEGIN
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'global', 0.10);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'unreviewed original translation remained public: %', selected;
  END IF;
END $$;
RESET ROLE;

UPDATE public.community_research_claim_translations
SET statement_text = 'Az első állítás pontos magyar szövege.',
    source_title = 'Az első tanulmány',
    source_container = 'Tesztfolyóirat',
    authors_display = 'Első Szerző és Második Szerző'
WHERE claim_id = 'a2000000-0000-4000-8000-000000000001'
  AND locale = 'hu-HU';
UPDATE public.community_research_claim_translations
SET review_status = 'approved',
    publication_status = 'published',
    reviewed_at = now()
WHERE claim_id = 'a2000000-0000-4000-8000-000000000001'
  AND locale = 'hu-HU';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  selected record;
BEGIN
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('en-GB', 'global', 0.10);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000001'::uuid
     OR selected.resolved_locale <> 'en-US'
     OR selected.statement_text <> 'The exact English translation of the first claim.'
     OR selected.is_saved THEN
    RAISE EXCEPTION 'language fallback or first cursor selection failed: %', selected;
  END IF;

  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'global', 0.50);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'second cursor selection failed: %', selected;
  END IF;

  SELECT * INTO selected
  FROM public.get_random_community_research_claim('de-DE', 'global', 0.90);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000002'::uuid
     OR selected.resolved_locale <> 'hu-HU'
     OR selected.statement_text <> 'A második állítás pontos magyar szövege.' THEN
    RAISE EXCEPTION 'equal-width upper bucket or original-locale fallback failed: %', selected;
  END IF;

  BEGIN
    PERFORM public.set_community_research_claim_saved(
      'a2000000-0000-4000-8000-000000000001', true
    );
    RAISE EXCEPTION 'anonymous caller saved a claim';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  selected record;
BEGIN
  IF NOT public.set_community_research_claim_saved(
    'a2000000-0000-4000-8000-000000000001', true
  ) THEN
    RAISE EXCEPTION 'save RPC did not return the saved state';
  END IF;

  -- Replay is idempotent and the randomized DTO reports this user's state.
  PERFORM public.set_community_research_claim_saved(
    'a2000000-0000-4000-8000-000000000001', true
  );
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'global', 0.10);
  IF NOT selected.is_saved THEN
    RAISE EXCEPTION 'saved state was not returned to its owner';
  END IF;

  BEGIN
    PERFORM public.set_community_research_claim_saved(
      'a2000000-0000-4000-8000-000000000003', true
    );
    RAISE EXCEPTION 'pending claim was saved';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.community_research_claim_saves;
    RAISE EXCEPTION 'authenticated caller read the private table directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE
  selected record;
BEGIN
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'global', 0.10);
  IF selected.is_saved THEN
    RAISE EXCEPTION 'one user saw another user''s saved state';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
RESET ROLE;
UPDATE public.community_research_claims
SET review_status = 'archived',
    publication_status = 'withdrawn',
    is_active = false
WHERE id = 'a2000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF public.set_community_research_claim_saved(
    'a2000000-0000-4000-8000-000000000001', false
  ) THEN
    RAISE EXCEPTION 'unsave RPC returned the wrong state';
  END IF;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.community_research_claim_saves
    WHERE user_id = 'a1000000-0000-4000-8000-000000000001'
      AND claim_id = 'a2000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'withdrawn claim save could not be removed by its owner';
  END IF;
END $$;

ROLLBACK;
\echo COMMUNITY_RESEARCH_CLAIMS_PASS
