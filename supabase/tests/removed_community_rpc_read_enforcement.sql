-- Runtime regression for moderation takedown enforcement across SECURITY
-- DEFINER community reads. Every fixture is rolled back.
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (id) VALUES
  ('c7000000-0000-4000-8000-000000000001'),
  ('c8000000-0000-4000-8000-000000000002'),
  ('c9000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (
  user_id, display_name, city, hobbies, user_origin, is_active,
  profile_visibility, interests_visibility, location_precision
) VALUES
  ('c7000000-0000-4000-8000-000000000001', 'Takedown member', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city'),
  ('c8000000-0000-4000-8000-000000000002', 'Takedown host', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city'),
  ('c9000000-0000-4000-8000-000000000003', 'Takedown reporter', 'Budapest', ARRAY['Hiking'], 'real', true, 'members', 'members', 'city')
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  city = EXCLUDED.city,
  hobbies = EXCLUDED.hobbies,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active,
  profile_visibility = EXCLUDED.profile_visibility,
  interests_visibility = EXCLUDED.interests_visibility,
  location_precision = EXCLUDED.location_precision;

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = '{}'::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key IN ('circles', 'hub2');

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time,
  start_time, max_attendees, waitlist_enabled, outcome_status,
  visibility_type, location_type, location_city, is_active, tags,
  beginner_friendly
) VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000002',
  'c8000000-0000-4000-8000-000000000002',
  'Removed beginner hike', 'Hiking', current_date + 7, time '10:00',
  now() + interval '7 days', 12, true, 'published',
  'public', 'city', 'Budapest', true, ARRAY['Hiking'], true
);

INSERT INTO public.social_circles (
  id, created_by, host_id, name, purpose, membership_policy, visibility,
  lifecycle_state, creation_key
) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002', 'Removed Circle', 'Removed Circle regression', 'open', 'public', 'active', 'removed-circle-runtime-0001'),
  ('c2000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002', 'Live Circle', 'Linked event regression', 'open', 'public', 'active', 'live-circle-runtime-0002');

INSERT INTO public.social_circle_events (circle_id, event_id)
VALUES ('c2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001');

INSERT INTO public.virtual_hubs (
  id, hobby_category, city, identity_key, purpose, host_id, join_policy,
  lifecycle_state, is_discoverable, activity_freshness_at, community_rules,
  welcome_message
) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Removed Hiking', 'Budapest', 'removed-hiking|-|-|budapest', 'Removed Hub regression', 'c8000000-0000-4000-8000-000000000002', 'open', 'active', true, now(), 'Be kind.', 'Removed welcome.'),
  ('d2000000-0000-4000-8000-000000000002', 'Hiking', 'Budapest', 'hiking|-|-|budapest-takedown-live', 'Linked event regression', 'c8000000-0000-4000-8000-000000000002', 'open', 'active', true, now(), 'Be kind.', 'Live welcome.');

INSERT INTO public.virtual_hub_members (
  hub_id, user_id, membership_status, join_source, policy_acknowledged_at, joined_at
) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'active', 'open_join', now(), now()),
  ('d2000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002', 'active', 'open_join', now(), now());

INSERT INTO public.user_reports (
  id, reporter_id, reported_user_id, context_type, context_id, target_ref,
  category, status, severity, source_surface, idempotency_key
) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'circle', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'unsafe_behavior', 'received', 'high', 'sql_test', 'removed-circle-report-0001'),
  ('f2000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'hub', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'unsafe_behavior', 'received', 'high', 'sql_test', 'removed-hub-report-0002'),
  ('f3000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'event', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'unsafe_event', 'received', 'high', 'sql_test', 'removed-event-report-0003');

INSERT INTO public.moderation_actions (
  id, case_id, actor_id, action_type, policy_reason, idempotency_key
) VALUES
  ('f4000000-0000-4000-8000-000000000004', (SELECT id FROM public.moderation_cases WHERE report_id = 'f1000000-0000-4000-8000-000000000001'), 'c9000000-0000-4000-8000-000000000003', 'content_takedown', 'Circle policy regression', 'removed-circle-action-0001'),
  ('f5000000-0000-4000-8000-000000000005', (SELECT id FROM public.moderation_cases WHERE report_id = 'f2000000-0000-4000-8000-000000000002'), 'c9000000-0000-4000-8000-000000000003', 'content_takedown', 'Hub policy regression', 'removed-hub-action-0002'),
  ('f6000000-0000-4000-8000-000000000006', (SELECT id FROM public.moderation_cases WHERE report_id = 'f3000000-0000-4000-8000-000000000003'), 'c9000000-0000-4000-8000-000000000003', 'event_takedown', 'Event policy regression', 'removed-event-action-0003');

INSERT INTO public.moderation_resource_enforcements (
  moderation_action_id, target_type, target_ref, restriction_type
) VALUES
  ('f4000000-0000-4000-8000-000000000004', 'circle', 'c1000000-0000-4000-8000-000000000001', 'content_takedown'),
  ('f5000000-0000-4000-8000-000000000005', 'hub', 'd1000000-0000-4000-8000-000000000001', 'content_takedown'),
  ('f6000000-0000-4000-8000-000000000006', 'event', 'e1000000-0000-4000-8000-000000000001', 'event_takedown');

-- Terminal membership transitions stay possible after a takedown.
UPDATE public.virtual_hub_members
SET membership_status = 'left', left_at = now(), updated_at = now()
WHERE hub_id = 'd1000000-0000-4000-8000-000000000001'
  AND user_id = 'c8000000-0000-4000-8000-000000000002';

DO $terminal_transition_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = 'd1000000-0000-4000-8000-000000000001'
      AND user_id = 'c8000000-0000-4000-8000-000000000002'
      AND membership_status = 'left'
  ) THEN
    RAISE EXCEPTION 'Removed-resource guard blocked a terminal membership transition';
  END IF;
  BEGIN
    INSERT INTO public.virtual_hub_members (
      hub_id, user_id, membership_status, join_source, policy_acknowledged_at
    ) VALUES (
      'd1000000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000001',
      'active', 'open_join', now()
    );
    RAISE EXCEPTION 'Removed Hub accepted a new membership';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$terminal_transition_check$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000002', true);

DO $removed_resource_reads$
DECLARE
  detail jsonb;
  welcome jsonb;
BEGIN
  BEGIN
    PERFORM public.get_circle_detail('c1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Removed Circle remained readable through get_circle_detail';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.get_virtual_hub_welcome('d1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Removed Hub remained readable through get_virtual_hub_welcome';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM * FROM public.get_virtual_hub_pending_requests('d1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Removed Hub requests remained readable';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.get_my_virtual_hub_cards()
    WHERE id = 'd1000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Removed Hub remained visible in Hub cards';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_my_virtual_hub_cards()
    WHERE id = 'd2000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Live Hub disappeared while filtering removed cards';
  END IF;

  detail := public.get_circle_detail('c2000000-0000-4000-8000-000000000002');
  IF detail -> 'next_event' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Removed linked event remained readable in Circle detail';
  END IF;

  welcome := public.get_virtual_hub_welcome('d2000000-0000-4000-8000-000000000002');
  IF welcome -> 'next_beginner_event' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Removed linked event remained readable in Hub welcome';
  END IF;
END;
$removed_resource_reads$;

RESET ROLE;
ROLLBACK;
