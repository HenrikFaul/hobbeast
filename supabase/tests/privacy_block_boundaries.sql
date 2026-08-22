-- P0 privacy/block boundary persona regression.
-- Prerequisite: repository migrations through
-- 20260822150200_privacy_block_boundaries.sql are applied.
-- Run with psql as the database owner. The fixture is fully rolled back.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000002'::uuid,
    'a3000000-0000-4000-8000-000000000003'::uuid,
    'a4000000-0000-4000-8000-000000000004'::uuid,
    'a5000000-0000-4000-8000-000000000005'::uuid
  ]
  LOOP
    INSERT INTO auth.users (id) VALUES (v_user);
  END LOOP;
END $$;

INSERT INTO public.profiles (
  user_id, display_name, address, city, location_precision,
  profile_visibility, is_active
) VALUES
  (
    'a1000000-0000-4000-8000-000000000001', 'Organizer and host',
    'P0 private address a1000000', 'Budapest', 'city', 'members', true
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'Participant two',
    'P0 private address a2000000', 'Budapest', 'city', 'members', true
  ),
  (
    'a3000000-0000-4000-8000-000000000003', 'Participant three',
    'P0 private address a3000000', 'Budapest', 'city', 'members', true
  ),
  (
    'a4000000-0000-4000-8000-000000000004', 'Safety reviewer',
    'P0 private address a4000000', 'Budapest', 'city', 'members', true
  ),
  (
    'a5000000-0000-4000-8000-000000000005', 'Blocked participant',
    'P0 private address a5000000', 'Budapest', 'city', 'members', true
  )
ON CONFLICT (user_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    location_precision = EXCLUDED.location_precision,
    profile_visibility = EXCLUDED.profile_visibility,
    is_active = EXCLUDED.is_active;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a4000000-0000-4000-8000-000000000004', 'moderator');

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key IN ('circles', 'hub2');

-- Fixture setup runs through the explicit service-role claim so rollout
-- mutation triggers do not make persona construction depend on a user cohort.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time, start_time,
  max_attendees, waitlist_enabled, outcome_status, visibility_type,
  location_type, location_city, private_location_reveal_hours, is_active
) VALUES
  (
    'ae000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Participant privacy event', 'Privacy', current_date + 1, time '18:00',
    now() + interval '1 day', 10, true, 'published', 'members', 'city',
    'Budapest', 24, true
  ),
  (
    'ae000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000004',
    'a4000000-0000-4000-8000-000000000004',
    'Other event scope', 'Privacy', current_date + 1, time '19:00',
    now() + interval '1 day', 10, true, 'published', 'members', 'city',
    'Budapest', 24, true
  );

INSERT INTO public.event_participants (event_id, user_id, status)
VALUES
  ('ae000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'going'),
  ('ae000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', 'going'),
  ('ae000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', 'going');

INSERT INTO public.user_reports (
  reporter_id, reported_user_id, context_type, category, status, target_ref,
  source_surface, idempotency_key
) VALUES (
  'a3000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000002',
  'profile',
  'privacy',
  'submitted',
  'a2000000-0000-4000-8000-000000000002',
  'profile',
  'privacy-boundary-report-0001'
);

INSERT INTO public.social_circles (
  id, created_by, host_id, name, purpose, cadence, capacity,
  membership_policy, visibility, lifecycle_state, creation_key
) VALUES (
  'ac000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Block-safe Circle',
  'Persona privacy regression',
  'monthly',
  10,
  'open',
  'members',
  'active',
  'privacy-block-circle-0001'
);

INSERT INTO public.social_circle_members (
  circle_id, user_id, role, membership_status, rules_consented_at, joined_at
) VALUES
  (
    'ac000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'host', 'active', now(), now()
  ),
  (
    'ac000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'member', 'active', now(), now()
  ),
  (
    'ac000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000003',
    'member', 'active', now(), now()
  );

INSERT INTO public.virtual_hubs (
  id, hobby_category, city, identity_key, purpose, host_id, join_policy,
  lifecycle_state, is_discoverable, activity_freshness_at
) VALUES (
  'ab000000-0000-4000-8000-000000000001',
  'Privacy fixture',
  'Budapest',
  'privacy fixture|-|-|budapest',
  'Hub host-block regression',
  'a1000000-0000-4000-8000-000000000001',
  'open',
  'recruiting',
  true,
  now()
);

-- One participant blocks the event operator; two ordinary Circle members have
-- a bilateral block. Neither relationship involves the Circle/Hub host yet.
INSERT INTO public.user_blocks (blocker_id, blocked_id, reason_code)
VALUES
  (
    'a5000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000001',
    'privacy'
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000002',
    'privacy'
  );

SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- The isolated harness has deliberately minimal default grants. These grants
-- expose only the intended RLS/read contracts and roll back with the fixture.
GRANT SELECT ON
  public.profiles,
  public.social_circles,
  public.social_circle_members,
  public.virtual_hubs,
  public.virtual_hub_discovery_cards,
  public.virtual_hub_members
TO authenticated;

-- Event owner: raw participant profile denied, allowlisted card available,
-- blocked card suppressed and a different event never bleeds into the result.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

DO $organizer_checks$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE user_id = 'a2000000-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Event organizer retained raw participant profile access';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.get_event_participant_cards('ae000000-0000-4000-8000-000000000001');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Event-scoped participant card count expected 1, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_event_participant_cards('ae000000-0000-4000-8000-000000000001')
    WHERE user_id = 'a2000000-0000-4000-8000-000000000002'
      AND display_name = 'Participant two'
      AND city = 'Budapest'
  ) THEN
    RAISE EXCEPTION 'Allowlisted event participant card is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_event_participant_cards('ae000000-0000-4000-8000-000000000001')
    WHERE user_id IN (
      'a3000000-0000-4000-8000-000000000003',
      'a5000000-0000-4000-8000-000000000005'
    )
  ) THEN
    RAISE EXCEPTION 'Participant RPC leaked a cross-event or blocked card';
  END IF;
END
$organizer_checks$;

-- A moderator with an open report can use case-scoped safety contracts, but
-- no longer receives the reported user's complete raw profile row.
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
DO $reviewer_checks$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE user_id = 'a2000000-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Safety reviewer retained raw reported-profile access';
  END IF;
END
$reviewer_checks$;

-- A participant of another event has no operator capability for the target.
SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
DO $event_scope_denial$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.get_event_participant_cards('ae000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Non-operator enumerated another event participant surface';
  END IF;
END
$event_scope_denial$;

-- Ordinary Circle member: self and non-blocked host remain visible; the other
-- ordinary member disappears across a block in either direction.
SELECT set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
DO $member_and_discovery_checks$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.social_circle_members
  WHERE circle_id = 'ac000000-0000-4000-8000-000000000001';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Ordinary member expected 2 non-blocked Circle rows, got %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_circle_members
    WHERE circle_id = 'ac000000-0000-4000-8000-000000000001'
      AND user_id = 'a3000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'Blocked ordinary Circle member remained visible';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.social_circles
  WHERE id = 'ac000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Non-blocked Circle discovery positive path failed';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.virtual_hub_discovery_cards
  WHERE id = 'ab000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Non-blocked Hub discovery positive path failed';
  END IF;

  PERFORM public.set_user_block(
    'a1000000-0000-4000-8000-000000000001',
    true,
    'privacy'
  );

  SELECT count(*) INTO v_count
  FROM public.social_circles
  WHERE id = 'ac000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Host-blocked Circle remained discoverable';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.virtual_hubs
  WHERE id = 'ab000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Host-blocked Hub remained readable through base-table RLS';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.virtual_hub_discovery_cards
  WHERE id = 'ab000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Host-blocked Hub remained visible in discovery cards';
  END IF;

  BEGIN
    PERFORM public.request_virtual_hub_join(
      'ab000000-0000-4000-8000-000000000001',
      true,
      'privacy-block-hub-join-0001'
    );
    RAISE EXCEPTION 'Host-blocked Hub join unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF position('Hub is unavailable' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_count
  FROM public.virtual_hub_members
  WHERE hub_id = 'ab000000-0000-4000-8000-000000000001'
    AND user_id = auth.uid();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Denied host-blocked Hub join created membership state';
  END IF;
END
$member_and_discovery_checks$;

RESET ROLE;
ROLLBACK;
