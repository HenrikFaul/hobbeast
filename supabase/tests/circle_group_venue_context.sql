-- Prompt 09 privacy/persona evidence for Circle group venue planning.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('96000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000002'),
  ('96000000-0000-4000-8000-000000000003'),
  ('96000000-0000-4000-8000-000000000004');

INSERT INTO public.profiles (
  user_id, display_name, city, location_lat, location_lon, user_origin, is_active
)
VALUES
  ('96000000-0000-4000-8000-000000000001', 'P1510 host', 'Budapest', 47.49791, 19.04021, 'real', true),
  ('96000000-0000-4000-8000-000000000002', 'P1510 member A', 'Budapest', 47.51333, 19.05777, 'real', true),
  ('96000000-0000-4000-8000-000000000003', 'P1510 member B', 'Budapest', 47.48111, 19.02123, 'real', true),
  ('96000000-0000-4000-8000-000000000004', 'P1510 outsider', 'Budapest', 47.60001, 19.20002, 'real', true)
ON CONFLICT (user_id) DO UPDATE SET
  city = EXCLUDED.city,
  location_lat = EXCLUDED.location_lat,
  location_lon = EXCLUDED.location_lon,
  user_origin = 'real',
  is_active = true;

UPDATE public.feature_flags
SET enabled = true, rollout_percentage = 100, cohorts = '{}'::text[],
    eligibility_rule = '{}'::jsonb, expires_at = now() + interval '30 days'
WHERE key = 'circles';

-- Keep owner privileges for fixture setup while exposing the same auth.uid()
-- that production mutations carry through the JWT claims.
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);

INSERT INTO public.social_circles (
  id, created_by, host_id, name, purpose, lifecycle_state
)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  'P1510 Circle', 'Consent-bound venue planning', 'active'
);

INSERT INTO public.social_circle_members (
  circle_id, user_id, role, membership_status, rules_consented_at, joined_at
)
VALUES
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'host', 'active', now(), now()),
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', 'member', 'active', now(), now()),
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000003', 'member', 'active', now(), now());

INSERT INTO public.consent_records (
  user_id, purpose, policy_version, decision, source_surface, idempotency_key
)
VALUES
  ('96000000-0000-4000-8000-000000000001', 'location_sharing', 'p1510-v1', 'granted', 'circle_venue', 'p1510-consent-host'),
  ('96000000-0000-4000-8000-000000000002', 'location_sharing', 'p1510-v1', 'granted', 'circle_venue', 'p1510-consent-a'),
  ('96000000-0000-4000-8000-000000000003', 'location_sharing', 'p1510-v1', 'granted', 'circle_venue', 'p1510-consent-b');

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time,
  location_type, location_city, outcome_status, is_active
)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  'P1510 Circle event', 'Túra', current_date + 7, time '10:00',
  'city', 'Budapest', 'published', true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  context jsonb;
  link_row record;
BEGIN
  context := public.get_circle_venue_search_context('97000000-0000-4000-8000-000000000001');
  IF NOT (context->>'available')::boolean
     OR (context->>'contributor_count')::integer <> 3
     OR context->>'privacy_mode' <> 'coarse_k_anonymous'
     OR length(split_part(context->'center'->>'lat', '.', 2)) > 1
     OR length(split_part(context->'center'->>'lon', '.', 2)) > 1 THEN
    RAISE EXCEPTION 'coarse k-anonymous venue context is invalid: %', context;
  END IF;
  IF context::text ~ '(47.49791|19.04021|96000000)' THEN
    RAISE EXCEPTION 'exact coordinate or member identity leaked';
  END IF;

  SELECT * INTO link_row FROM public.link_event_to_my_circle(
    '97000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001'
  );
  IF link_row.replayed THEN RAISE EXCEPTION 'initial link was marked replay'; END IF;
  SELECT * INTO link_row FROM public.link_event_to_my_circle(
    '97000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001'
  );
  IF NOT link_row.replayed THEN RAISE EXCEPTION 'link replay was not idempotent'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000004', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_circle_venue_search_context('97000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'outsider read group venue context';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

ROLLBACK;
\echo CIRCLE_GROUP_VENUE_CONTEXT_PASS
