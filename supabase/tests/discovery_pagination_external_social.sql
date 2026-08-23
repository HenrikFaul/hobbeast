\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000003');

INSERT INTO public.profiles (user_id, display_name, user_origin, is_active)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'P1507 A', 'real', true),
  ('91000000-0000-4000-8000-000000000002', 'P1507 B', 'real', true),
  ('91000000-0000-4000-8000-000000000003', 'P1507 C', 'real', true)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active;

INSERT INTO public.external_events (
  id, external_source, external_id, external_url, title, event_date, event_time,
  location_city, source_payload, source_last_synced_at, last_verified_at,
  freshness_state, import_state, is_active
)
VALUES (
  '92000000-0000-4000-8000-000000000001', 'ticketmaster', 'p1507-event',
  'https://example.invalid/p1507-event', 'P1507 external event', current_date + 7,
  time '18:00', 'Budapest', '{"private_provider_field":"must-not-leak"}'::jsonb,
  now(), now(), 'fresh', 'active', true
)
ON CONFLICT (id) DO UPDATE SET
  external_url = EXCLUDED.external_url,
  event_date = EXCLUDED.event_date,
  source_payload = EXCLUDED.source_payload,
  freshness_state = 'fresh',
  import_state = 'active',
  is_active = true;

UPDATE public.feature_flags
SET enabled = true, rollout_percentage = 100, cohorts = '{}'::text[],
    eligibility_rule = '{}'::jsonb, expires_at = now() + interval '30 days'
WHERE key = 'external_social_intent';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.external_event_social_intents (external_event_id, user_id, intent)
    VALUES (
      '92000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'interested'
    );
    RAISE EXCEPTION 'direct social intent insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.set_external_event_social_intent(
    '92000000-0000-4000-8000-000000000001', 'looking_for_company', true,
    '93000000-0000-4000-8000-000000000001'
  );
  IF v_row.replayed THEN RAISE EXCEPTION 'first intent call was replayed'; END IF;
  SELECT * INTO v_row FROM public.set_external_event_social_intent(
    '92000000-0000-4000-8000-000000000001', 'looking_for_company', true,
    '93000000-0000-4000-8000-000000000001'
  );
  IF NOT v_row.replayed THEN RAISE EXCEPTION 'intent replay was not detected'; END IF;
END $$;

DO $$
DECLARE v_summary jsonb;
BEGIN
  v_summary := public.get_external_event_social_summary('92000000-0000-4000-8000-000000000001');
  IF (v_summary->>'company_interest_count')::integer <> 0 OR (v_summary->>'threshold_met')::boolean THEN
    RAISE EXCEPTION 'sub-threshold social count leaked';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
SELECT * FROM public.set_external_event_social_intent(
  '92000000-0000-4000-8000-000000000001', 'looking_for_company', true,
  '93000000-0000-4000-8000-000000000002'
);
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
SELECT * FROM public.set_external_event_social_intent(
  '92000000-0000-4000-8000-000000000001', 'looking_for_company', true,
  '93000000-0000-4000-8000-000000000003'
);

SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_summary jsonb;
BEGIN
  v_summary := public.get_external_event_social_summary('92000000-0000-4000-8000-000000000001');
  IF (v_summary->>'company_interest_count')::integer <> 3 OR NOT (v_summary->>'threshold_met')::boolean THEN
    RAISE EXCEPTION 'k-anonymous social aggregate is incorrect';
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

DO $$
DECLARE v_page jsonb;
BEGIN
  IF (SELECT count(*) FROM public.external_event_social_intent_audits
      WHERE user_id = '91000000-0000-4000-8000-000000000001'
        AND idempotency_key = '93000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'idempotent intent audit is incorrect';
  END IF;
  v_page := public.list_external_events_safe_page(current_date, 10, 0);
  IF jsonb_array_length(v_page->'items') < 1 THEN RAISE EXCEPTION 'external page is empty'; END IF;
  IF (v_page->'items'->0) ? 'source_payload' THEN RAISE EXCEPTION 'raw provider payload leaked'; END IF;
  v_page := public.list_discoverable_events_safe_page(current_date, NULL, 10, 10000);
  IF jsonb_typeof(v_page->'items') <> 'array' THEN RAISE EXCEPTION 'empty native page contract is invalid'; END IF;
END $$;

UPDATE public.external_events
SET freshness_state = 'stale', import_state = 'stale'
WHERE id = '92000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_external_event_social_intent(
      '92000000-0000-4000-8000-000000000001', 'interested', true,
      '93000000-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'stale external event accepted a social intent';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;
END $$;

ROLLBACK;
\echo DISCOVERY_PAGINATION_EXTERNAL_SOCIAL_PASS
