-- Prompt 08 persona/contract evidence for server-side recommendation signals.
-- Run with psql as the database owner. The fixture always rolls back.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('94000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000003');

INSERT INTO public.profiles (
  user_id, display_name, city, hobbies, preferred_radius_km,
  location_lat, location_lon, availability_window, user_origin, is_active
)
VALUES
  (
    '94000000-0000-4000-8000-000000000001', 'P1509 viewer', 'Budapest',
    ARRAY['Túra'], 30, 47.4979, 19.0402,
    jsonb_build_object('days', jsonb_build_array(
      (ARRAY['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow FROM current_date + 3)::integer]
    )), 'real', true
  ),
  ('94000000-0000-4000-8000-000000000002', 'P1509 host', 'Budapest', '{}', 25, NULL, NULL, '{}', 'real', true),
  ('94000000-0000-4000-8000-000000000003', 'P1509 blocked host', 'Budapest', '{}', 25, NULL, NULL, '{}', 'real', true)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  city = EXCLUDED.city,
  hobbies = EXCLUDED.hobbies,
  preferred_radius_km = EXCLUDED.preferred_radius_km,
  location_lat = EXCLUDED.location_lat,
  location_lon = EXCLUDED.location_lon,
  availability_window = EXCLUDED.availability_window,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active;

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, tags, event_date, event_time,
  location_type, location_city, location_lat, location_lon, max_attendees,
  outcome_status, is_active, created_at
)
VALUES
  (
    '95000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000002',
    '94000000-0000-4000-8000-000000000002',
    'Kezdő túra a Budai-hegyekben', 'Túra', ARRAY['Kezdőbarát'],
    current_date + 3, time '10:00', 'city', 'Budapest', 47.50, 19.02,
    20, 'published', true, now()
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000003',
    'Tiltott host túrája', 'Túra', ARRAY['Kezdőbarát'],
    current_date + 4, time '10:00', 'city', 'Budapest', 47.50, 19.02,
    20, 'published', true, now()
  );

INSERT INTO public.user_blocks (blocker_id, blocked_id, reason_code)
VALUES (
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000003',
  'P1509 privacy fixture'
);

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = '{}'::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '30 days'
WHERE key = 'new_recommender';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  ranked record;
  blocked_count integer;
BEGIN
  SELECT * INTO ranked
  FROM public.rank_activity_context_events(ARRAY[
    '95000000-0000-4000-8000-000000000001'::uuid,
    '95000000-0000-4000-8000-000000000002'::uuid
  ], 10)
  WHERE event_id = '95000000-0000-4000-8000-000000000001';

  IF ranked.event_id IS NULL
     OR NOT ('explicit_interest' = ANY(ranked.reason_codes))
     OR NOT ('nearby' = ANY(ranked.reason_codes))
     OR NOT ('beginner_friendly' = ANY(ranked.reason_codes))
     OR NOT ('fits_availability' = ANY(ranked.reason_codes)) THEN
    RAISE EXCEPTION 'expected privacy-safe relevance reasons are missing';
  END IF;
  IF ranked.distance_km IS NULL OR ranked.distance_km <> round(ranked.distance_km, 0) THEN
    RAISE EXCEPTION 'distance was not returned as a coarse derived value';
  END IF;
  IF array_to_string(ranked.reason_codes, ',') ~* '(user_id|friend_count|ismeros|94000000)' THEN
    RAISE EXCEPTION 'reason codes leaked another person';
  END IF;

  SELECT count(*) INTO blocked_count
  FROM public.rank_activity_context_events(ARRAY[
    '95000000-0000-4000-8000-000000000001'::uuid,
    '95000000-0000-4000-8000-000000000002'::uuid
  ], 10)
  WHERE event_id = '95000000-0000-4000-8000-000000000002';
  IF blocked_count <> 0 THEN
    RAISE EXCEPTION 'blocked organizer remained in server-side ranking';
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

UPDATE public.feature_flags
SET enabled = false, rollout_percentage = 0
WHERE key = 'new_recommender';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rank_activity_context_events(
      ARRAY['95000000-0000-4000-8000-000000000001'::uuid], 10
    )
  ) THEN
    RAISE EXCEPTION 'kill switch did not suppress server-side ranking';
  END IF;
END $$;

ROLLBACK;
\echo SERVER_RECOMMENDATION_SIGNALS_PASS
