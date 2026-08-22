-- Prompt 03-05 runtime completion persona/integration regression.
-- Prerequisite: migrations through 20260822162000 are applied.
-- Run as database owner; every fixture and temporary grant is rolled back.
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (id) VALUES
  ('b1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002'),
  ('b3000000-0000-4000-8000-000000000003'),
  ('b4000000-0000-4000-8000-000000000004')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (
  user_id, display_name, city, hobbies, user_origin, is_active,
  profile_visibility, interests_visibility, location_precision,
  availability_window, beginner_friendly_preference
) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Runtime host', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city', '{"days":["sat"]}', true),
  ('b2000000-0000-4000-8000-000000000002', 'Runtime peer one', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city', '{"days":["sat"]}', true),
  ('b3000000-0000-4000-8000-000000000003', 'Runtime peer two', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city', '{}', false),
  ('b4000000-0000-4000-8000-000000000004', 'Runtime applicant', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city', '{}', false)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  city = EXCLUDED.city,
  hobbies = EXCLUDED.hobbies,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active,
  profile_visibility = EXCLUDED.profile_visibility,
  interests_visibility = EXCLUDED.interests_visibility,
  location_precision = EXCLUDED.location_precision,
  availability_window = EXCLUDED.availability_window,
  beginner_friendly_preference = EXCLUDED.beginner_friendly_preference;

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = '{}'::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key IN ('connections', 'circles', 'hub2');

DO $catalog_fixture$
BEGIN
  IF to_regclass('public.hobby_categories') IS NOT NULL THEN
    INSERT INTO public.hobby_categories (id, slug, name, emoji, is_active)
    VALUES ('bc000000-0000-4000-8000-000000000001', 'runtime-outdoor', 'Runtime outdoor', 'R', true);
    INSERT INTO public.hobby_subcategories (id, category_id, slug, name, is_active)
    VALUES ('bc000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000001', 'runtime-hiking', 'Runtime hiking', true);
    INSERT INTO public.hobby_activities (id, subcategory_id, slug, name, is_active)
    VALUES ('bc000000-0000-4000-8000-000000000003', 'bc000000-0000-4000-8000-000000000002', 'hiking-runtime', 'Hiking', true);
  ELSE
    INSERT INTO public.hobby_activities (id, slug, name)
    VALUES ('bc000000-0000-4000-8000-000000000003', 'hiking-runtime', 'Hiking');
  END IF;
END;
$catalog_fixture$;

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time,
  start_time, max_attendees, waitlist_enabled, outcome_status,
  visibility_type, location_type, location_city, is_active, tags
) VALUES
  ('be000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Runtime hike one', 'Hiking', current_date - 20, time '10:00', now() - interval '20 days', 12, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']),
  ('be000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Runtime hike two', 'Hiking', current_date - 15, time '10:00', now() - interval '15 days', 12, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']),
  ('be000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Runtime hike three', 'Hiking', current_date - 10, time '10:00', now() - interval '10 days', 12, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']),
  ('be000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Runtime hike four', 'Hiking', current_date - 5, time '10:00', now() - interval '5 days', 12, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']);

INSERT INTO public.event_encounters (
  id, event_id, user_low_id, user_high_id, confidence_status,
  attendance_verified, eligible_at, expires_at
) VALUES
  ('bd000000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'connected', true, now() - interval '20 days', now() + interval '10 days'),
  ('bd000000-0000-4000-8000-000000000002', 'be000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'connected', true, now() - interval '15 days', now() + interval '10 days'),
  ('bd000000-0000-4000-8000-000000000003', 'be000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000003', 'connected', true, now() - interval '10 days', now() + interval '10 days'),
  ('bd000000-0000-4000-8000-000000000004', 'be000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000003', 'connected', true, now() - interval '5 days', now() + interval '10 days'),
  ('bd000000-0000-4000-8000-000000000005', 'be000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000004', 'eligible', true, now() - interval '5 days', now() + interval '10 days');

INSERT INTO public.connections (
  id, user_low_id, user_high_id, source_encounter_id, status, connected_at
) VALUES
  ('bf000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001', 'active', now() - interval '19 days'),
  ('bf000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000003', 'active', now() - interval '9 days');

INSERT INTO public.virtual_hubs (
  id, hobby_category, city, identity_key, purpose, host_id, join_policy,
  lifecycle_state, is_discoverable, activity_freshness_at, community_rules,
  welcome_message
) VALUES
  ('bb000000-0000-4000-8000-000000000001', 'Hiking', 'Budapest', 'hiking|-|-|budapest-runtime-approval', 'Approval runtime hub', 'b1000000-0000-4000-8000-000000000001', 'approval', 'active', true, now(), 'Respect the trail.', 'Welcome to the next beginner-friendly hike.'),
  ('bb000000-0000-4000-8000-000000000002', 'Hiking Claim', 'Budapest', 'hiking-claim|-|-|budapest', 'Host claim runtime hub', NULL, 'open', 'latent', false, now(), NULL, NULL),
  ('bb000000-0000-4000-8000-000000000003', 'Hiking Reactivate', 'Budapest', 'hiking-reactivate|-|-|budapest', 'Reactivation runtime hub', 'b1000000-0000-4000-8000-000000000001', 'open', 'inactive', false, now() - interval '150 days', NULL, NULL);

INSERT INTO public.virtual_hub_members (
  hub_id, user_id, membership_status, join_source, policy_acknowledged_at, joined_at
) VALUES
  ('bb000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'active', 'approved', now(), now()),
  ('bb000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'active', 'approved', now(), now()),
  ('bb000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000003', 'active', 'approved', now(), now()),
  ('bb000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'active', 'approved', now(), now()),
  ('bb000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'active', 'approved', now(), now());

SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Identity: optional fields may be empty; canonical preferences receive the
-- experience level while profiles.hobbies remains available to legacy code.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

SELECT public.save_my_onboarding_progress(
  jsonb_build_object(
    'display_name', 'Runtime host',
    'avatar_url', NULL,
    'city', 'Budapest',
    'hobbies', jsonb_build_array('Hiking'),
    'activity_modes', jsonb_build_array('small_group'),
    'availability_window', jsonb_build_object('days', jsonb_build_array('sat'), 'from', '09:00', 'to', '13:00'),
    'normalized_preferences', jsonb_build_array(jsonb_build_object(
      'activity_id', 'bc000000-0000-4000-8000-000000000003',
      'experience_level', 'intermediate'
    )),
    'beginner_friendly', true,
    'solo_arrival_comfort', 'comfortable',
    'preferred_group_size', 'small',
    'accessibility_needs', '',
    'communication_preference', 'in_app',
    'profile_visibility', 'members',
    'interests_visibility', 'members',
    'privacy_accepted', true,
    'notification_consent', false
  ),
  5::smallint,
  true
);

RESET ROLE;

DO $identity_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = 'b1000000-0000-4000-8000-000000000001'
      AND hobbies = ARRAY['Hiking']
      AND availability_window->'days' = '["sat"]'::jsonb
      AND onboarding_completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Resumable onboarding payload was not persisted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_hobby_preferences
    WHERE user_id = 'b1000000-0000-4000-8000-000000000001'
      AND activity_id = 'bc000000-0000-4000-8000-000000000003'
      AND experience_level = 'intermediate'
      AND sync_source = 'onboarding'
  ) THEN
    RAISE EXCEPTION 'Canonical hobby preference dual-write failed';
  END IF;
END;
$identity_checks$;

-- The legacy profile editor remains an active writer during migration. Removing
-- a legacy hobby must remove its canonical preference even when onboarding was
-- the row's previous source; keep the remainder of the fixture unchanged.
SAVEPOINT identity_dual_write_removal;
UPDATE public.profiles
SET hobbies = '{}'::text[]
WHERE user_id = 'b1000000-0000-4000-8000-000000000001';
DO $identity_continuous_dual_write$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profile_hobby_preferences
    WHERE user_id = 'b1000000-0000-4000-8000-000000000001'
      AND activity_id = 'bc000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'Legacy hobby removal did not continuously update canonical preferences';
  END IF;
END;
$identity_continuous_dual_write$;
ROLLBACK TO SAVEPOINT identity_dual_write_removal;

-- Mutual reconnection is a transition, not a repeatable side effect. Retrying
-- the second preference keeps one connection and one outcome audit event.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
SELECT public.set_reconnection_preference('bd000000-0000-4000-8000-000000000005', 'interested');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000004', true);
SELECT public.set_reconnection_preference('bd000000-0000-4000-8000-000000000005', 'interested');
SELECT public.set_reconnection_preference('bd000000-0000-4000-8000-000000000005', 'interested');
RESET ROLE;
DO $mutual_reconnection_idempotency$
BEGIN
  IF (
    SELECT count(*) FROM public.connections
    WHERE user_low_id = 'b2000000-0000-4000-8000-000000000002'
      AND user_high_id = 'b4000000-0000-4000-8000-000000000004'
      AND status = 'active'
  ) <> 1 OR (
    SELECT count(*) FROM public.social_graph_audit_events
    WHERE entity_type = 'connection' AND event_type = 'mutual_reconnection_created'
      AND entity_id = (
        SELECT id FROM public.connections
        WHERE user_low_id = 'b2000000-0000-4000-8000-000000000002'
          AND user_high_id = 'b4000000-0000-4000-8000-000000000004'
      )
  ) <> 1 THEN
    RAISE EXCEPTION 'Mutual reconnection retry was not idempotent';
  END IF;
END;
$mutual_reconnection_idempotency$;

-- Social suggestions require repeat verified evidence for at least two peers.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT public.refresh_my_circle_suggestions();

DO $suggestion_visible$
DECLARE
  suggestion_count integer;
BEGIN
  SELECT count(*) INTO suggestion_count FROM public.get_my_circle_suggestion_cards();
  IF suggestion_count <> 1 THEN
    RAISE EXCEPTION 'Expected one repeat-evidence Circle suggestion, got %', suggestion_count;
  END IF;
END;
$suggestion_visible$;

SELECT suggestion_id AS runtime_suggestion_id
FROM public.get_my_circle_suggestion_cards()
LIMIT 1 \gset
SELECT public.accept_circle_suggestion(
  :'runtime_suggestion_id'::uuid,
  'Runtime hiking Circle',
  'Repeat hiking with people met at verified events',
  'runtime-circle-suggestion-0001'
);
-- A lost response may be retried without duplicating the Circle or invitations.
SELECT public.accept_circle_suggestion(
  :'runtime_suggestion_id'::uuid,
  'Runtime hiking Circle',
  'Repeat hiking with people met at verified events',
  'runtime-circle-suggestion-0001'
);

RESET ROLE;

DO $suggestion_acceptance$
DECLARE
  v_circle_id uuid;
BEGIN
  SELECT id INTO v_circle_id FROM public.social_circles
  WHERE creation_key = 'runtime-circle-suggestion-0001';
  IF v_circle_id IS NULL THEN
    RAISE EXCEPTION 'Circle suggestion did not create a Circle';
  END IF;
  IF (SELECT count(*) FROM public.social_circle_members WHERE social_circle_members.circle_id = v_circle_id AND membership_status = 'invited') <> 2 THEN
    RAISE EXCEPTION 'Suggestion did not invite both repeat-evidence peers';
  END IF;
END;
$suggestion_acceptance$;

-- An approval request cannot be self-approved by the requester.
INSERT INTO public.social_circles (
  id, created_by, host_id, name, purpose, membership_policy, visibility,
  lifecycle_state, creation_key
) VALUES (
  'ba000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Approval Circle', 'Host approval regression', 'approval', 'members', 'active',
  'runtime-approval-circle-0001'
);
INSERT INTO public.social_circle_members (
  circle_id, user_id, role, membership_status, rules_consented_at, joined_at
) VALUES (
  'ba000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001', 'host', 'active', now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000004', true);
SELECT public.request_circle_membership('ba000000-0000-4000-8000-000000000001', true);

DO $self_approval_denied$
BEGIN
  BEGIN
    PERFORM public.respond_to_circle_membership('ba000000-0000-4000-8000-000000000001', true, true);
    RAISE EXCEPTION 'Requester self-approved an approval-policy Circle request';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;
END;
$self_approval_denied$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT public.resolve_circle_membership_request(
  'ba000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000004',
  true,
  'Community rules acknowledged'
);
RESET ROLE;

DO $circle_approval_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.social_circle_members
    WHERE circle_id = 'ba000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Host Circle approval did not activate membership';
  END IF;
END;
$circle_approval_check$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
DO $circle_shared_interest_detail$
DECLARE
  circle_detail jsonb;
BEGIN
  circle_detail := public.get_circle_detail('ba000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(coalesce(circle_detail->'shared_interests', '[]'::jsonb)) <> 1
    OR circle_detail->'shared_interests'->0->>'label' <> 'Hiking'
    OR (circle_detail->'shared_interests'->0->>'member_count')::integer <> 2 THEN
    RAISE EXCEPTION 'Circle detail did not expose the privacy-safe shared-interest aggregate';
  END IF;
END;
$circle_shared_interest_detail$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000004', true);
SELECT public.leave_social_circle('ba000000-0000-4000-8000-000000000001', 'Schedule changed');
RESET ROLE;

DO $circle_leave_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.social_circle_members
    WHERE circle_id = 'ba000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND membership_status = 'left' AND left_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Circle leave did not preserve the audited soft-left state';
  END IF;
END;
$circle_leave_check$;

-- Hub approval resolution, host claim and reactivation are separate explicit paths.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000004', true);
SELECT public.request_virtual_hub_join(
  'bb000000-0000-4000-8000-000000000001', true, 'runtime-hub-join-applicant-0001'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT moderation_item_id AS runtime_hub_moderation_id
FROM public.get_virtual_hub_pending_requests('bb000000-0000-4000-8000-000000000001')
LIMIT 1 \gset
SELECT public.resolve_virtual_hub_join_request(
  :'runtime_hub_moderation_id'::uuid,
  true,
  'Approved after policy acknowledgment',
  'runtime-hub-approval-0001'
);
SELECT public.resolve_virtual_hub_join_request(
  :'runtime_hub_moderation_id'::uuid,
  true,
  'Approved after policy acknowledgment',
  'runtime-hub-approval-0001'
);
SELECT public.claim_virtual_hub_host(
  'bb000000-0000-4000-8000-000000000002',
  'runtime-hub-host-claim-0001'
);
SELECT public.request_virtual_hub_reactivation(
  'bb000000-0000-4000-8000-000000000003',
  'A new beginner-friendly walk is ready',
  'runtime-hub-reactivation-0001'
);
SELECT public.request_virtual_hub_reactivation(
  'bb000000-0000-4000-8000-000000000003',
  'A new beginner-friendly walk is ready',
  'runtime-hub-reactivation-0001'
);
DO $client_attendance_spoof_denied$
BEGIN
  BEGIN
    PERFORM public.record_virtual_hub_activation(
      'bb000000-0000-4000-8000-000000000001',
      'first_attendance',
      'runtime-client-spoof-0001'
    );
    RAISE EXCEPTION 'Client recorded a server-owned attendance stage';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END;
$client_attendance_spoof_denied$;
RESET ROLE;

DO $hub_runtime_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = 'bb000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND membership_status = 'active' AND join_source = 'approved'
  ) THEN
    RAISE EXCEPTION 'Hub approval did not activate the pending member';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = 'bb000000-0000-4000-8000-000000000002'
      AND host_id = 'b1000000-0000-4000-8000-000000000001'
      AND lifecycle_state = 'recruiting' AND is_discoverable
  ) THEN
    RAISE EXCEPTION 'Eligible member did not claim host ownership';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = 'bb000000-0000-4000-8000-000000000003'
      AND lifecycle_state = 'recruiting' AND reactivation_requested_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Host reactivation did not restore recruiting state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = 'bb000000-0000-4000-8000-000000000001'
      AND qualification_score >= 60
      AND real_member_count = 4
      AND availability_overlap_count >= 2
      AND organizer_presence_count >= 1
  ) THEN
    RAISE EXCEPTION 'Explainable Hub qualification was not refreshed';
  END IF;
END;
$hub_runtime_checks$;

-- Verified, category/city-matching attendance advances the Hub funnel without
-- requiring the event lifecycle to call a Hub-specific browser mutation.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.event_participants (
  event_id, user_id, status, checked_in_at
) VALUES (
  'be000000-0000-4000-8000-000000000004',
  'b4000000-0000-4000-8000-000000000004',
  'checked_in', now()
);

DO $hub_attendance_consumer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_activation_events
    WHERE hub_id = 'bb000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND stage = 'first_activity'
      AND source = 'event_participation'
  ) THEN
    RAISE EXCEPTION 'Matching event participation did not materialize first Hub activity';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_activation_events
    WHERE hub_id = 'bb000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND stage = 'first_attendance'
      AND source = 'verified_event_attendance'
  ) THEN
    RAISE EXCEPTION 'Verified matching attendance did not advance the Hub funnel';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.virtual_hub_activity_consumption_failures
    WHERE event_id = 'be000000-0000-4000-8000-000000000004'
  ) THEN
    RAISE EXCEPTION 'Hub attendance consumer recorded an unexpected failure';
  END IF;
END;
$hub_attendance_consumer$;

-- A status refinement for the same event must not fake repeat activity.
UPDATE public.event_participants
SET status = 'completed'
WHERE event_id = 'be000000-0000-4000-8000-000000000004'
  AND user_id = 'b4000000-0000-4000-8000-000000000004';
DO $same_event_not_repeat$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = 'bb000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND repeat_activity_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'One event was incorrectly counted as repeat Hub activity';
  END IF;
END;
$same_event_not_repeat$;

INSERT INTO public.event_participants (
  event_id, user_id, status, checked_in_at
) VALUES (
  'be000000-0000-4000-8000-000000000003',
  'b4000000-0000-4000-8000-000000000004',
  'checked_in', now()
);
DO $second_event_is_repeat$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = 'bb000000-0000-4000-8000-000000000001'
      AND user_id = 'b4000000-0000-4000-8000-000000000004'
      AND repeat_activity_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Second verified event did not advance repeat Hub activity';
  END IF;
END;
$second_event_is_repeat$;

-- Materialized expiry preserves an audit event instead of merely hiding rows.
INSERT INTO public.circle_suggestions (
  id, suggested_by, activity_label, status, expires_at
) VALUES (
  'b9000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Expired runtime suggestion', 'draft', now() - interval '1 minute'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT public.expire_my_social_graph_records();
RESET ROLE;

DO $expiry_audit_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.circle_suggestions
    WHERE id = 'b9000000-0000-4000-8000-000000000001' AND status = 'expired'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.social_graph_audit_events
    WHERE entity_id = 'b9000000-0000-4000-8000-000000000001'
      AND event_type = 'circle_suggestion_expired'
  ) THEN
    RAISE EXCEPTION 'Circle suggestion expiry did not transition and audit';
  END IF;
END;
$expiry_audit_check$;

ROLLBACK;
