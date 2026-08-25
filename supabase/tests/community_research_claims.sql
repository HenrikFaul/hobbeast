-- Localization, review gate, random cursor and private save contract.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');

INSERT INTO public.community_research_claims (
  id, canonical_key, source_sequence_id, original_locale, publication_year, source_url,
  review_status, publication_status, is_active, eligible_placements, random_key, reviewed_at
)
VALUES
  (
    'a2000000-0000-4000-8000-000000000001', 'fixture.claim.one', 1, 'hu-HU', 2020,
    'https://example.org/study-one', 'approved', 'published', true,
    ARRAY['research_feature', 'about_mission'], 0.20, now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'fixture.claim.two', 2, 'hu-HU', 2021,
    'https://example.org/study-two', 'approved', 'published', true,
    ARRAY['research_feature'], 0.80, now()
  ),
  (
    'a2000000-0000-4000-8000-000000000003', 'fixture.claim.pending', 3, 'hu-HU', 2022,
    'https://example.org/pending', 'pending_review', 'draft', false,
    ARRAY['research_feature'], 0.15, NULL
  );

INSERT INTO public.community_research_claim_translations (
  claim_id, locale, statement_text, source_title, source_container,
  authors_display, is_original
)
VALUES
  (
    'a2000000-0000-4000-8000-000000000001', 'hu-HU',
    'Az első állítás pontos magyar szövege.', 'Az első tanulmány', 'Tesztfolyóirat',
    'Első Szerző és Második Szerző', true
  ),
  (
    'a2000000-0000-4000-8000-000000000001', 'en-US',
    'The exact English translation of the first claim.', 'The first study', 'Test Journal',
    'First Author and Second Author', false
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'hu-HU',
    'A második állítás pontos magyar szövege.', 'A második tanulmány', NULL,
    'Harmadik Szerző', true
  ),
  (
    'a2000000-0000-4000-8000-000000000003', 'hu-HU',
    'Ez a függő állítás nem kerülhet ki.', 'Függő tanulmány', NULL,
    'Függő Szerző', true
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

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  selected record;
BEGIN
  SELECT * INTO selected
  FROM public.get_random_community_research_claim('en-GB', 'research_feature', 0.10);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000001'::uuid
     OR selected.resolved_locale <> 'en-US'
     OR selected.statement_text <> 'The exact English translation of the first claim.'
     OR selected.is_saved THEN
    RAISE EXCEPTION 'language fallback or first cursor selection failed: %', selected;
  END IF;

  SELECT * INTO selected
  FROM public.get_random_community_research_claim('hu-HU', 'research_feature', 0.50);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'second cursor selection failed: %', selected;
  END IF;

  SELECT * INTO selected
  FROM public.get_random_community_research_claim('de-DE', 'research_feature', 0.90);
  IF selected.claim_id <> 'a2000000-0000-4000-8000-000000000001'::uuid
     OR selected.resolved_locale <> 'hu-HU'
     OR selected.statement_text <> 'Az első állítás pontos magyar szövege.' THEN
    RAISE EXCEPTION 'cursor wrap or original-locale fallback failed: %', selected;
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
  FROM public.get_random_community_research_claim('hu-HU', 'research_feature', 0.10);
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
  FROM public.get_random_community_research_claim('hu-HU', 'research_feature', 0.10);
  IF selected.is_saved THEN
    RAISE EXCEPTION 'one user saw another user''s saved state';
  END IF;
END $$;

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
ROLLBACK;
\echo COMMUNITY_RESEARCH_CLAIMS_PASS
