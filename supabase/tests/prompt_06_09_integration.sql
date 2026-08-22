-- Reproducible Prompt 06-09 integration evidence.
-- Prerequisite: all repository migrations through 20260822150000 applied.
-- Run with psql as the database owner. The entire fixture rolls back.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    '10000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '30000000-0000-4000-8000-000000000003'::uuid,
    '40000000-0000-4000-8000-000000000004'::uuid,
    '50000000-0000-4000-8000-000000000005'::uuid
  ]
  LOOP
    INSERT INTO auth.users (id) VALUES (v_user);
    INSERT INTO public.profiles (user_id, display_name, user_origin, is_active)
    VALUES (v_user, 'P0609 ' || left(v_user::text, 8), 'real', true)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time, start_time,
  max_attendees, waitlist_enabled, outcome_status, visibility_type,
  location_type, location_city, location_address, place_name, meeting_instructions,
  private_location_reveal_hours, is_active
) VALUES
  (
    '60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'P0609 capacity', 'Teszt', current_date + 1,
    current_time, now() + interval '1 day', 1, true, 'published', 'public', 'address', 'Budapest',
    'Kapacitás utca 1.', 'Kapacitás helyszín', 'Főbejárat', 24, true
  ),
  (
    '60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'P0609 completion', 'Teszt', current_date,
    current_time, now() - interval '2 hours', 3, true, 'published', 'public', 'address', 'Budapest',
    'Completion utca 2.', 'Completion helyszín', 'Kapu előtt', 24, true
  ),
  (
    '60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'P0609 cancelled', 'Teszt', current_date,
    current_time, now(), 5, true, 'cancelled', 'public', 'city', 'Budapest', NULL,
    NULL, NULL, 24, false
  ),
  (
    '60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'P0609 private location', 'Teszt', current_date + 2,
    time '18:00', now() + interval '2 days', 5, true, 'published', 'private', 'address',
    'Budapest', 'Privát utca 4.', 'Privát közösségi tér', 'Csengő: 42', 24, true
  );

-- A cancelled event may contain legacy check-in rows, but completion must still
-- fail closed and must never generate encounters.
INSERT INTO public.event_participants (event_id, user_id, status, checked_in_at)
VALUES
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'checked_in', now()),
  ('60000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'checked_in', now());

-- Seed the already-started completion event before switching to user personas;
-- new RSVP attempts after its start must be rejected by the lifecycle RPC.
INSERT INTO public.event_participants (event_id, user_id, status)
VALUES
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'going'),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', 'going'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', 'going'),
  ('60000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'waitlist');

INSERT INTO public.event_trip_plans (
  event_id, provider, route_type, start_point, end_point, waypoints
) VALUES (
  '60000000-0000-4000-8000-000000000004', 'mapy', 'foot_hiking',
  '{"lat":47.50,"lon":19.05}'::jsonb, '{"lat":47.51,"lon":19.06}'::jsonb, '[]'::jsonb
);

-- Supabase grants this base-table privilege in the real project; the explicit
-- transactional grant keeps this fixture portable to a minimal PostgreSQL harness.
GRANT SELECT ON public.event_trip_plans TO authenticated;
GRANT SELECT ON public.discovery_preferences TO authenticated;

-- Anonymous discovery receives coarse allowlisted fields, but the legacy exact
-- PostgREST columns are not selectable even when row-level discovery allows it.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
DECLARE
  v_payload jsonb;
  v_denied boolean := false;
BEGIN
  IF NOT has_column_privilege('anon', 'public.events', 'title', 'select')
    OR NOT has_column_privilege('anon', 'public.events', 'location_city', 'select') THEN
    RAISE EXCEPTION 'anonymous safe event column grant is missing';
  END IF;
  v_payload := public.event_safe_payload('60000000-0000-4000-8000-000000000004', NULL);
  IF v_payload->>'_location_precision' <> 'coarse' OR v_payload->>'location_address' IS NOT NULL THEN
    RAISE EXCEPTION 'anonymous safe payload exposed exact location';
  END IF;
  BEGIN
    PERFORM location_address FROM public.events
    WHERE id = '60000000-0000-4000-8000-000000000004';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anonymous exact event column remained readable'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Capacity 1: first RSVP is going, second is waitlist, same key replays.
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.join_event_atomic(
    '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001');
  IF v_row.participation_status <> 'going' OR v_row.replayed THEN
    RAISE EXCEPTION 'first capacity join was not going/non-replay';
  END IF;
  SELECT * INTO v_row FROM public.join_event_atomic(
    '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001');
  IF NOT v_row.replayed THEN RAISE EXCEPTION 'join idempotency replay failed'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.join_event_atomic(
    '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002');
  IF v_row.participation_status <> 'waitlist' OR v_row.replayed THEN
    RAISE EXCEPTION 'capacity overflow was not waitlisted';
  END IF;
END $$;

-- An unrelated user cannot enumerate participant rows or mutate them directly.
SELECT set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
DO $$
DECLARE v_denied boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.event_participants WHERE event_id = '60000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'participant RLS disclosed rows to unrelated user';
  END IF;
  BEGIN
    INSERT INTO public.event_participants (event_id, user_id, status)
    VALUES ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'going');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'direct participant insert was not denied'; END IF;
END $$;

-- A stale published flag cannot reopen RSVP after the canonical start time.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.join_event_atomic(
      '60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000009');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'EVENT_ALREADY_STARTED' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'post-start RSVP unexpectedly succeeded'; END IF;
END $$;

-- Arrival confidence is user-controlled, host-only, audited and idempotent.
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.set_arrival_confidence_atomic(
    '60000000-0000-4000-8000-000000000001', true, true, 'host_only',
    '70000000-0000-4000-8000-000000000003');
  IF v_row.replayed OR NOT v_row.arriving_alone OR NOT v_row.first_hobbeast_event THEN
    RAISE EXCEPTION 'arrival confidence initial mutation failed';
  END IF;
  SELECT * INTO v_row FROM public.set_arrival_confidence_atomic(
    '60000000-0000-4000-8000-000000000001', true, true, 'host_only',
    '70000000-0000-4000-8000-000000000003');
  IF NOT v_row.replayed THEN RAISE EXCEPTION 'arrival confidence replay failed'; END IF;
END $$;

-- Cancelling the only active seat promotes exactly one FIFO waitlist row.
SELECT * FROM public.cancel_own_participation_atomic(
  '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.event_participants
      WHERE event_id = '60000000-0000-4000-8000-000000000001'
        AND user_id = '30000000-0000-4000-8000-000000000003') <> 'going' THEN
    RAISE EXCEPTION 'waitlist promotion failed';
  END IF;
  IF (SELECT count(*) FROM public.participation_audits
      WHERE event_id = '60000000-0000-4000-8000-000000000001'
        AND action = 'auto_promoted_from_waitlist') <> 1 THEN
    RAISE EXCEPTION 'waitlist promotion was not exactly-once audited';
  END IF;
END $$;

-- Completion: checked-in users complete, RSVP-only user becomes no-show,
-- waitlist is cancelled, and Prompt 04 encounters derive from verified attendance.
-- First prove that the default-off optional Connections rollout cannot break
-- core completion or create hidden social rows.
INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time, start_time,
  max_attendees, waitlist_enabled, outcome_status, visibility_type,
  location_type, location_city, is_active
) VALUES (
  '60000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'P0609 flag-off completion', 'Teszt', current_date, current_time,
  now() - interval '2 hours', 2, false, 'published', 'public', 'city', 'Budapest', true
);
INSERT INTO public.event_participants (event_id, user_id, status, checked_in_at)
VALUES
  ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'checked_in', now()),
  ('60000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 'checked_in', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT * FROM public.complete_event_atomic(
  '60000000-0000-4000-8000-000000000005',
  'flag-off core completion',
  '70000000-0000-4000-8000-000000000019'
);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT outcome_status FROM public.events WHERE id = '60000000-0000-4000-8000-000000000005') <> 'completed'
     OR EXISTS (SELECT 1 FROM public.event_encounters WHERE event_id = '60000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'optional Connections flag blocked core completion or generated hidden encounters';
  END IF;
END $$;

-- The optional Connections surface is enabled explicitly for this controlled
-- encounter-generation assertion; default-off completion is covered by the
-- cross-domain production-pack fixture.
UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key = 'connections';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.complete_event_atomic(
      '60000000-0000-4000-8000-000000000001', 'must remain future', '70000000-0000-4000-8000-000000000013');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'FUTURE_EVENT_CANNOT_COMPLETE' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'future event completion unexpectedly succeeded'; END IF;
END $$;

DO $$
DECLARE v_a uuid; v_c uuid; v_result record; v_cancel_denied boolean := false;
BEGIN
  SELECT id INTO v_a FROM public.event_participants WHERE event_id = '60000000-0000-4000-8000-000000000002' AND user_id = '20000000-0000-4000-8000-000000000002';
  SELECT id INTO v_c FROM public.event_participants WHERE event_id = '60000000-0000-4000-8000-000000000002' AND user_id = '40000000-0000-4000-8000-000000000004';
  PERFORM public.organizer_transition_participant_atomic(v_a, 'checked_in', 'fixture check-in A', '70000000-0000-4000-8000-000000000014');
  PERFORM public.organizer_transition_participant_atomic(v_c, 'checked_in', 'fixture check-in C', '70000000-0000-4000-8000-000000000015');
  PERFORM set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
  BEGIN
    PERFORM public.cancel_own_participation_atomic(
      '60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000018');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'VERIFIED_ATTENDANCE_IMMUTABLE' THEN RAISE; END IF;
    v_cancel_denied := true;
  END;
  IF NOT v_cancel_denied THEN
    RAISE EXCEPTION 'checked-in participant could self-cancel verified attendance';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  SELECT * INTO v_result FROM public.complete_event_atomic(
    '60000000-0000-4000-8000-000000000002', 'fixture completion', '70000000-0000-4000-8000-000000000016');
  IF v_result.completed_participants <> 2 OR v_result.no_show_participants <> 1 THEN
    RAISE EXCEPTION 'completion counts were unexpected: %/%', v_result.completed_participants, v_result.no_show_participants;
  END IF;
  IF (SELECT status FROM public.event_participants WHERE event_id = '60000000-0000-4000-8000-000000000002' AND user_id = '30000000-0000-4000-8000-000000000003') <> 'cancelled' THEN
    RAISE EXCEPTION 'completion did not cancel waitlist';
  END IF;
END $$;

-- A verified attendee can see the generated encounter through Prompt 04 RLS.
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_encounters WHERE event_id = '60000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'verified attendance did not generate a participant-visible Prompt 04 encounter';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

-- Cancelled events fail closed and produce no encounter.
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.complete_event_atomic(
      '60000000-0000-4000-8000-000000000003', 'must remain cancelled', '70000000-0000-4000-8000-000000000017');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'CANCELLED_EVENT_CANNOT_COMPLETE' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'cancelled event completion unexpectedly succeeded'; END IF;
END $$;

-- Private exact location is a server-side, progressive decision. Direct exact
-- column reads are revoked and trip-plan RLS follows the same precision.
SELECT set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
DO $$
DECLARE
  v_payload jsonb;
  v_safe_title text;
  v_safe_city text;
  v_denied boolean := false;
BEGIN
  SELECT title, location_city INTO v_safe_title, v_safe_city
  FROM public.events WHERE id = '60000000-0000-4000-8000-000000000004';
  IF v_safe_title <> 'P0609 private location' OR v_safe_city <> 'Budapest' THEN
    RAISE EXCEPTION 'safe event column grant did not return the coarse public fields';
  END IF;
  v_payload := public.event_safe_payload('60000000-0000-4000-8000-000000000004', NULL);
  IF v_payload->>'_location_precision' <> 'coarse' OR v_payload->>'location_address' IS NOT NULL THEN
    RAISE EXCEPTION 'guest/unrelated private location was not coarse';
  END IF;
  BEGIN
    PERFORM location_address FROM public.events WHERE id = '60000000-0000-4000-8000-000000000004';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'exact event column remained directly readable'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
SELECT * FROM public.join_event_atomic('60000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000018');
DO $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := public.event_safe_payload('60000000-0000-4000-8000-000000000004', NULL);
  IF v_payload->>'_location_precision' <> 'rsvp_detail' OR v_payload->>'location_address' IS NOT NULL OR v_payload->>'place_name' IS NULL THEN
    RAISE EXCEPTION 'RSVP private location did not return rsvp_detail';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_trip_plans WHERE event_id = '60000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'trip plan leaked before full location window';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := public.event_safe_payload('60000000-0000-4000-8000-000000000004', NULL);
  IF v_payload->>'_location_precision' <> 'full' OR v_payload->>'location_address' <> 'Privát utca 4.' THEN
    RAISE EXCEPTION 'owner exact location override failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_trip_plans WHERE event_id = '60000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'owner could not read trip plan';
  END IF;
END $$;

-- Discovery feedback is reversible and same-key idempotent.
RESET ROLE;
UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key = 'new_recommender';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.set_discovery_preference(
    'native:p0609', 'native', 'less_like_this', '70000000-0000-4000-8000-000000000020');
  IF v_row.replayed THEN RAISE EXCEPTION 'first discovery preference unexpectedly replayed'; END IF;
  SELECT * INTO v_row FROM public.set_discovery_preference(
    'native:p0609', 'native', 'less_like_this', '70000000-0000-4000-8000-000000000020');
  IF NOT v_row.replayed THEN RAISE EXCEPTION 'discovery preference replay failed'; END IF;
  PERFORM public.set_discovery_preference(
    'native:p0609', 'native', 'neutral', '70000000-0000-4000-8000-000000000021');
  IF EXISTS (SELECT 1 FROM public.discovery_preferences WHERE user_id = auth.uid() AND canonical_identity = 'native:p0609' AND active) THEN
    RAISE EXCEPTION 'neutral discovery preference did not deactivate suppression';
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

-- Database-owner evidence avoids mistaking encounter RLS invisibility for
-- absence: completed attendance must create one pair; cancellation creates none.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_encounters
      WHERE event_id = '60000000-0000-4000-8000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'completion did not create exactly one verified encounter pair';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_encounters
      WHERE event_id = '60000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'cancelled event generated encounter';
  END IF;
END $$;

-- Cross-provider exact fingerprints queue a reversible review instead of an
-- automatic canonical merge; stale state is explicit after refresh.
INSERT INTO public.external_events (
  id, external_source, external_id, external_url, title, event_date, event_time,
  location_city, canonical_fingerprint, dedupe_confidence, last_verified_at,
  source_last_synced_at, freshness_state, import_state, is_active
) VALUES
  (
    '80000000-0000-4000-8000-000000000001', 'ticketmaster', 'p0609-tm', 'https://example.invalid/tm',
    'P0609 shared event', current_date + 10, time '18:00', 'Budapest', 'p0609|shared|fixture',
    0.95, now() - interval '4 days', now() - interval '4 days', 'unknown', 'active', true
  ),
  (
    '80000000-0000-4000-8000-000000000002', 'seatgeek', 'p0609-sg', 'https://example.invalid/sg',
    'P0609 shared event', current_date + 10, time '18:00', 'Budapest', 'p0609|shared|fixture',
    0.95, now() - interval '4 days', now() - interval '4 days', 'unknown', 'active', true
  );

SELECT public.queue_external_event_dedupe_reviews();
SELECT * FROM public.refresh_external_supply_freshness();

DO $$
BEGIN
  IF (SELECT count(*) FROM public.external_event_dedupe_reviews
      WHERE source_event_id = '80000000-0000-4000-8000-000000000001'
        AND candidate_event_id = '80000000-0000-4000-8000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'cross-provider dedupe review was not queued exactly once';
  END IF;
  IF EXISTS (SELECT 1 FROM public.external_events
      WHERE id IN ('80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002')
        AND (freshness_state <> 'stale' OR import_state <> 'stale')) THEN
    RAISE EXCEPTION 'stale external supply was presented as current';
  END IF;
END $$;

ROLLBACK;
\echo PROMPT_06_09_INTEGRATION_PASS
