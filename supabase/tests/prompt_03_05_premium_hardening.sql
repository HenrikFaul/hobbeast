-- Prompt 03-05 premium second-pass persona/integration regression.
-- Prerequisite: migrations through 20260822165000 (and later hardening
-- overrides, when present) are applied. All fixture data is rolled back.
\set ON_ERROR_STOP on

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (id) VALUES
  ('c1000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002'),
  ('c3000000-0000-4000-8000-000000000003'),
  ('c4000000-0000-4000-8000-000000000004')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (
  user_id, display_name, city, hobbies, user_origin, is_active,
  profile_visibility, interests_visibility, location_precision
) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Premium host', 'Budapest', '{}', 'real', true, 'members', 'members', 'city'),
  ('c2000000-0000-4000-8000-000000000002', 'Premium member', 'Budapest', '{}', 'real', true, 'members', 'members', 'city'),
  ('c3000000-0000-4000-8000-000000000003', 'Premium peer', 'Budapest', '{}', 'real', true, 'members', 'members', 'city'),
  ('c4000000-0000-4000-8000-000000000004', 'Unrelated user', 'Szeged', '{}', 'real', true, 'members', 'members', 'city')
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

UPDATE public.feature_flags
SET enabled = true, rollout_percentage = 100, cohorts = '{}',
    eligibility_rule = '{}', expires_at = now() + interval '1 day'
WHERE key IN ('connections', 'circles', 'hub2');

INSERT INTO public.events (
  id, created_by, organizer_id, title, category, event_date, event_time,
  start_time, max_attendees, waitlist_enabled, outcome_status,
  visibility_type, location_type, location_city, is_active, tags
) VALUES
  ('ce000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Premium event one', 'Hiking', current_date - 20, time '10:00', now() - interval '20 days', 20, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']),
  ('ce000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Premium event two', 'Hiking', current_date - 10, time '10:00', now() - interval '10 days', 20, true, 'completed', 'members', 'city', 'Budapest', true, ARRAY['Hiking']),
  ('ce000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Premium event next', 'Hiking', current_date + 10, time '10:00', now() + interval '10 days', 20, true, 'scheduled', 'members', 'city', 'Budapest', true, ARRAY['Hiking']);

INSERT INTO public.event_participants (
  event_id, user_id, status, checked_in_at, completed_at
) VALUES
  ('ce000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'completed', now() - interval '20 days', now() - interval '20 days'),
  ('ce000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'completed', now() - interval '10 days', now() - interval '10 days'),
  ('ce000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', 'no_show', NULL, NULL),
  ('ce000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002', 'going', NULL, NULL);

INSERT INTO public.social_circles (
  id, created_by, host_id, name, purpose, cadence, capacity,
  membership_policy, visibility, safety_rules, lifecycle_state
) VALUES (
  'cc000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Premium Circle', 'Repeat verified hiking', 'monthly', 12,
  'approval', 'members', 'Respect the group', 'active'
);

INSERT INTO public.social_circle_members (
  circle_id, user_id, role, membership_status, rules_consented_at, joined_at
) VALUES
  ('cc000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'host', 'active', now(), now() - interval '60 days'),
  ('cc000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'member', 'active', now(), now() - interval '25 days'),
  ('cc000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', 'member', 'active', now(), now() - interval '5 days');

INSERT INTO public.social_circle_events (circle_id, event_id) VALUES
  ('cc000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000001'),
  ('cc000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000002'),
  ('cc000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000003');

INSERT INTO public.user_reports (
  reporter_id, reported_user_id, context_type, context_id, category, details
) VALUES (
  'c3000000-0000-4000-8000-000000000003',
  'c2000000-0000-4000-8000-000000000002',
  'circle', 'cc000000-0000-4000-8000-000000000001',
  'spam', 'Fixture details must never appear in Hub host DTOs.'
);

INSERT INTO public.virtual_hubs (
  id, hobby_category, city, identity_key, purpose, host_id, join_policy,
  lifecycle_state, is_discoverable, activity_freshness_at, community_rules,
  welcome_message
) VALUES (
  'cb000000-0000-4000-8000-000000000001', 'Hiking', 'Budapest',
  'premium-hiking|-|-|budapest', 'Premium Hub',
  'c1000000-0000-4000-8000-000000000001', 'approval', 'inactive', false,
  now() - interval '150 days', 'Respect the trail', 'Welcome safely.'
);

INSERT INTO public.virtual_hub_members (
  hub_id, user_id, membership_status, join_source, policy_acknowledged_at, joined_at
) VALUES
  ('cb000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'active', 'approved', now(), now() - interval '60 days'),
  ('cb000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'active', 'approved', now(), now() - interval '20 days'),
  ('cb000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', 'active', 'approved', now(), now() - interval '10 days');

INSERT INTO public.virtual_hub_activation_events (
  hub_id, user_id, stage, source, dedupe_key
)
SELECT
  'cb000000-0000-4000-8000-000000000001', user_id, stage, 'premium_fixture',
  'premium-funnel:' || user_id::text || ':' || stage
FROM unnest(ARRAY[
  'c1000000-0000-4000-8000-000000000001'::uuid,
  'c2000000-0000-4000-8000-000000000002'::uuid,
  'c3000000-0000-4000-8000-000000000003'::uuid
]) user_id
CROSS JOIN unnest(ARRAY['discovery', 'preview', 'joined', 'first_activity', 'first_attendance']) stage;

INSERT INTO public.virtual_hub_moderation_items (
  id, hub_id, report_id, item_type, subject_user_id
) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', NULL, 'content_report', 'c2000000-0000-4000-8000-000000000002'),
  ('ca000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001', NULL, 'reactivation_review', 'c2000000-0000-4000-8000-000000000002');

INSERT INTO public.user_session_devices (
  user_id, session_fingerprint, device_label, user_agent_family
) VALUES (
  'c2000000-0000-4000-8000-000000000002',
  'device:premium-fixture', 'Chrome · Windows', 'Chrome'
);

-- First-event confidence: owner save is idempotent, host access is explicit and
-- audited, unrelated/private reads fail closed.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
SELECT public.save_my_first_event_confidence(
  jsonb_build_object(
    'preferred_event_formats', jsonb_build_array('guided_beginner', 'buddy_welcome'),
    'beginner_friendly', true,
    'solo_arrival_comfort', 'prefer_buddy',
    'preferred_group_size', 'small',
    'accessibility_needs', 'Step-free entrance',
    'communication_preference', 'minimal',
    'visibility', 'event_host_after_join'
  ), false
);
SELECT public.save_my_first_event_confidence(
  jsonb_build_object(
    'preferred_event_formats', jsonb_build_array('guided_beginner', 'buddy_welcome'),
    'beginner_friendly', true,
    'solo_arrival_comfort', 'prefer_buddy',
    'preferred_group_size', 'small',
    'accessibility_needs', 'Step-free entrance',
    'communication_preference', 'minimal',
    'visibility', 'event_host_after_join'
  ), false
);

DO $confidence_owner_checks$
BEGIN
  IF (SELECT count(*) FROM public.profile_first_event_confidence) <> 1 THEN
    RAISE EXCEPTION 'Owner confidence row missing or duplicated';
  END IF;
  IF (
    SELECT count(*) FROM public.account_activity_events
    WHERE user_id = auth.uid() AND event_type = 'first_event_confidence_changed'
  ) <> 1 THEN
    RAISE EXCEPTION 'Idempotent confidence replay duplicated activity audit';
  END IF;
END;
$confidence_owner_checks$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
DO $confidence_host_checks$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count
  FROM public.get_event_first_confidence_cards('ce000000-0000-4000-8000-000000000003');
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Explicit host-after-join confidence was not visible to event host';
  END IF;
END;
$confidence_host_checks$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000004', true);
DO $confidence_negative_checks$
DECLARE row_count integer;
BEGIN
  SELECT count(*) INTO row_count FROM public.profile_first_event_confidence;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Unrelated user read private first-event confidence';
  END IF;
  BEGIN
    PERFORM * FROM public.get_event_first_confidence_cards('ce000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Unrelated user accessed event host confidence DTO';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$confidence_negative_checks$;
RESET ROLE;

-- Scoped export returns only requested top-level domains; deletion captures an
-- explicit grace/policy snapshot and remains cancellable.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'premium_fixture.export_request_id',
  public.request_my_data_subject_action_v2(
    'export', ARRAY['profile', 'account_activity'], 'premium-export-request-0001'
  )->>'request_id',
  true
);
SELECT public.request_my_data_subject_action_v2(
  'export', ARRAY['profile', 'account_activity'], 'premium-export-request-0001'
);
DO $export_checks$
DECLARE payload jsonb;
BEGIN
  payload := public.prepare_my_data_export(
    current_setting('premium_fixture.export_request_id')::uuid
  );
  IF NOT payload ? 'profile' OR NOT payload ? 'account_activity'
    OR payload ? 'events' OR payload ? 'social' THEN
    RAISE EXCEPTION 'Scoped export returned the wrong domains: %', payload;
  END IF;
  IF payload->'account_activity'->'devices'->0 ? 'session_fingerprint' THEN
    RAISE EXCEPTION 'Raw session fingerprint leaked into export';
  END IF;
  IF (
    SELECT count(*) FROM public.data_subject_requests
    WHERE user_id = auth.uid() AND request_type = 'export'
  ) <> 1 THEN
    RAISE EXCEPTION 'Export double-submit created duplicate request';
  END IF;
END;
$export_checks$;

SELECT public.request_my_data_subject_action_v2(
  'deletion', '{}'::text[], 'premium-deletion-request-0001'
);
DO $deletion_policy_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.data_subject_requests
    WHERE user_id = auth.uid() AND request_type = 'deletion'
      AND grace_period_ends_at > now()
      AND policy_snapshot->>'attendance' = 'anonymize_actor_keep_event_aggregate'
  ) THEN
    RAISE EXCEPTION 'Deletion grace/policy snapshot missing';
  END IF;
END;
$deletion_policy_checks$;
SELECT public.cancel_my_data_subject_action('deletion');
RESET ROLE;

-- Circle health is host-only, uses two distinct verified events for return,
-- and lifecycle replay creates one transition audit.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
DO $circle_health_checks$
DECLARE health jsonb;
BEGIN
  health := public.get_circle_health('cc000000-0000-4000-8000-000000000001');
  IF (health->>'returning_attendees')::integer <> 1
    OR (health->>'new_members_30d')::integer <> 2
    OR (health->>'event_count')::integer <> 3
    OR health->>'cadence_status' <> 'on_track' THEN
    RAISE EXCEPTION 'Circle health metrics are incorrect: %', health;
  END IF;
END;
$circle_health_checks$;
SELECT public.transition_social_circle('cc000000-0000-4000-8000-000000000001', 'paused', 'Premium fixture pause');
SELECT public.transition_social_circle('cc000000-0000-4000-8000-000000000001', 'paused', 'Premium fixture pause');
RESET ROLE;
DO $circle_lifecycle_idempotency$
BEGIN
  IF (
    SELECT count(*) FROM public.social_graph_audit_events
    WHERE entity_id = 'cc000000-0000-4000-8000-000000000001'
      AND event_type = 'circle_state_transitioned'
      AND metadata->>'to' = 'paused'
  ) <> 1 THEN
    RAISE EXCEPTION 'Circle lifecycle replay duplicated transition audit';
  END IF;
END;
$circle_lifecycle_idempotency$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
DO $circle_health_negative$
BEGIN
  BEGIN
    PERFORM public.get_circle_health('cc000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Non-host accessed Circle health';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$circle_health_negative$;
RESET ROLE;

-- Hub host sees k=3 funnel aggregates and a redacted queue. Moderation updates
-- are RPC-only and reactivation resolution is idempotent/audited.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
DO $hub_insight_checks$
DECLARE insights jsonb; queue_count integer;
BEGIN
  insights := public.get_virtual_hub_host_insights('cb000000-0000-4000-8000-000000000001');
  IF (insights->'funnel'->>'discovery')::integer <> 3
    OR insights->'funnel'->'repeat_activity' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Hub k-suppressed funnel is incorrect: %', insights;
  END IF;
  SELECT count(*) INTO queue_count
  FROM public.get_virtual_hub_moderation_queue('cb000000-0000-4000-8000-000000000001');
  IF queue_count <> 2 THEN
    RAISE EXCEPTION 'Expected two non-join moderation items, got %', queue_count;
  END IF;
  BEGIN
    UPDATE public.virtual_hub_moderation_items
    SET status = 'resolved'
    WHERE id = 'ca000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Host bypassed moderation RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$hub_insight_checks$;

SELECT public.resolve_virtual_hub_moderation_item(
  'ca000000-0000-4000-8000-000000000001', 'review',
  'Host started review', 'premium-hub-review-0001'
);
SELECT public.resolve_virtual_hub_moderation_item(
  'ca000000-0000-4000-8000-000000000001', 'review',
  'Host started review', 'premium-hub-review-0001'
);
SELECT public.resolve_virtual_hub_moderation_item(
  'ca000000-0000-4000-8000-000000000002', 'resolve',
  'Host approved reactivation', 'premium-hub-reactivation-0001'
);
DO $hub_resolution_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = 'cb000000-0000-4000-8000-000000000001'
      AND lifecycle_state = 'recruiting' AND is_discoverable
  ) THEN
    RAISE EXCEPTION 'Approved Hub reactivation did not restore recruiting state';
  END IF;
END;
$hub_resolution_checks$;
RESET ROLE;
DO $hub_resolution_audit_checks$
BEGIN
  IF (
    SELECT count(*) FROM public.virtual_hub_admin_audit_events
    WHERE idempotency_key = 'premium-hub-review-0001'
  ) <> 1 THEN
    RAISE EXCEPTION 'Hub moderation replay duplicated audit';
  END IF;
END;
$hub_resolution_audit_checks$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000004', true);
DO $hub_insight_negative$
BEGIN
  BEGIN
    PERFORM public.get_virtual_hub_host_insights('cb000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Unrelated user accessed Hub host insights';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$hub_insight_negative$;
RESET ROLE;

ROLLBACK;
