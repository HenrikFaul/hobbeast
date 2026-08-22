-- Prompt 07, 10 and 11 runtime completion integration evidence.
-- Prerequisite: migrations through 20260822172000. All fixture rows roll back.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('07101100-0000-4000-8000-000000000001'),
  ('07101100-0000-4000-8000-000000000002'),
  ('07101100-0000-4000-8000-000000000003'),
  ('07101100-0000-4000-8000-000000000004'),
  ('07101100-0000-4000-8000-000000000005');
INSERT INTO public.profiles (user_id, display_name, user_origin, is_active) VALUES
  ('07101100-0000-4000-8000-000000000001', 'Owner', 'real', true),
  ('07101100-0000-4000-8000-000000000002', 'Crew', 'real', true),
  ('07101100-0000-4000-8000-000000000003', 'Participant A', 'real', true),
  ('07101100-0000-4000-8000-000000000004', 'Admin one', 'real', true),
  ('07101100-0000-4000-8000-000000000005', 'Admin two', 'real', true);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('07101100-0000-4000-8000-000000000004', 'admin'),
  ('07101100-0000-4000-8000-000000000005', 'admin');

INSERT INTO public.events (
  id, created_by, organizer_id, title, description, category, outcome_status,
  event_date, event_time, start_time, end_time, max_attendees, waitlist_enabled,
  location_city, meeting_instructions, cancellation_policy,
  host_responsibility_accepted_at, organizer_readiness_required, readiness_enforcement_version
) VALUES (
  '07101110-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000001',
  '07101100-0000-4000-8000-000000000001', 'Readiness event', 'Complete fixture description',
  'Hiking', 'draft', current_date + 3, time '17:00', now() + interval '3 days',
  now() + interval '3 days 2 hours', 10, true, 'Budapest', 'Main entrance',
  'Cancel at least one day before', now(), true, 'organizer-readiness-v2'
), (
  '07101110-0000-4000-8000-000000000002', '07101100-0000-4000-8000-000000000001',
  '07101100-0000-4000-8000-000000000001', 'Lifecycle event', 'Lifecycle fixture description',
  'Cycling', 'published', current_date + 4, time '17:00', now() + interval '4 days',
  now() + interval '4 days 2 hours', 10, true, 'Budapest', 'Gate',
  'Cancel at least one day before', now(), false, NULL
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '07101100-0000-4000-8000-000000000001', true);

SELECT public.manage_event_crew_role_atomic(
  '07101110-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000002',
  'upsert', true, true, false, false, false, 'Fixture crew grant',
  '07101120-0000-4000-8000-000000000001'
);
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_crew_roles
    WHERE event_id = '07101110-0000-4000-8000-000000000001'
      AND user_id = '07101100-0000-4000-8000-000000000002'
      AND can_check_in AND can_message_attendees) THEN
    RAISE EXCEPTION 'crew capability mutation failed';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '07101100-0000-4000-8000-000000000002', true);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.list_my_organizer_event_ids()
    WHERE list_my_organizer_event_ids = '07101110-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'assigned crew event discovery failed';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '07101100-0000-4000-8000-000000000001', true);
SELECT public.manage_event_crew_role_atomic(
  '07101110-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000002',
  'remove', false, false, false, false, false, 'Fixture crew revoke',
  '07101120-0000-4000-8000-000000000009'
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.event_crew_roles
    WHERE event_id = '07101110-0000-4000-8000-000000000001'
      AND user_id = '07101100-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'crew removal failed';
  END IF;
END $$;

SELECT public.save_organizer_readiness_assessment_atomic(
  '07101110-0000-4000-8000-000000000001',
  '{"identity":true,"description":true,"safety":true,"location":true,"capacity":true,"cancellation":true,"checkin":true,"communication":true,"accessibility":true,"legal_tax":true}',
  '07101120-0000-4000-8000-000000000002'
);
SELECT public.publish_event_with_readiness_atomic(
  '07101110-0000-4000-8000-000000000001', 'Fixture readiness publish',
  '07101120-0000-4000-8000-000000000003'
);
SELECT public.reschedule_event_atomic(
  '07101110-0000-4000-8000-000000000002', now() + interval '5 days',
  now() + interval '5 days 2 hours', 'Fixture reschedule',
  '07101120-0000-4000-8000-000000000004'
);

DO $$
DECLARE series_id uuid; occurrence_id uuid;
BEGIN
  series_id := public.manage_event_series_atomic(
    'create', NULL, 'Weekly fixture', 'FREQ=WEEKLY;INTERVAL=1', 'Europe/Budapest',
    'Fixture series create', '07101120-0000-4000-8000-000000000005');
  occurrence_id := public.manage_event_series_occurrence_atomic(
    series_id, NULL, '07101110-0000-4000-8000-000000000002',
    now() + interval '5 days', now() + interval '5 days', 'scheduled',
    'Fixture occurrence create', '07101120-0000-4000-8000-000000000006');
  PERFORM public.manage_event_series_atomic(
    'update', series_id, 'Updated weekly fixture', 'FREQ=WEEKLY;INTERVAL=2', 'Europe/Budapest',
    'Fixture series update', '07101120-0000-4000-8000-000000000010');
  PERFORM public.manage_event_series_atomic(
    'deactivate', series_id, NULL, NULL, NULL,
    'Fixture series deactivate', '07101120-0000-4000-8000-000000000011');
  IF series_id IS NULL OR occurrence_id IS NULL THEN RAISE EXCEPTION 'series CRUD failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_series WHERE id = series_id AND is_active) THEN
    RAISE EXCEPTION 'series deactivation failed';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.event_participants (id, event_id, user_id, status) VALUES
  ('07101130-0000-4000-8000-000000000001', '07101110-0000-4000-8000-000000000002',
    '07101100-0000-4000-8000-000000000003', 'going'),
  ('07101130-0000-4000-8000-000000000002', '07101110-0000-4000-8000-000000000002',
    '07101100-0000-4000-8000-000000000002', 'waitlist');
INSERT INTO public.notification_preferences (user_id) VALUES
  ('07101100-0000-4000-8000-000000000002'),
  ('07101100-0000-4000-8000-000000000003');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '07101100-0000-4000-8000-000000000001', true);
SELECT public.organizer_send_event_message_atomic(
  '07101110-0000-4000-8000-000000000002', 'logistics_update', 'selected',
  'Fixture subject', 'Fixture selected audience message', NULL,
  ARRAY['07101130-0000-4000-8000-000000000001']::uuid[],
  '07101120-0000-4000-8000-000000000007', 'fixture-request-071011'
);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.organizer_send_event_message_atomic(
      '07101110-0000-4000-8000-000000000002', 'logistics_update', 'selected',
      'Out of scope', 'Must remain blocked', NULL,
      ARRAY['07101130-0000-4000-8000-000000000099']::uuid[],
      '07101120-0000-4000-8000-000000000012', 'fixture-request-blocked-071011');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'selected audience accepted an out-of-scope participation'; END IF;
END $$;
SELECT public.cancel_event_atomic(
  '07101110-0000-4000-8000-000000000002', 'Fixture audited cancellation',
  '07101120-0000-4000-8000-000000000008'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.event_message_recipients r
      JOIN public.event_messages m ON m.id = r.message_id
      WHERE m.idempotency_key = '07101120-0000-4000-8000-000000000007') <> 1 THEN
    RAISE EXCEPTION 'selected audience was not event scoped';
  END IF;
END $$;

-- Future delivery normalization, digest materialization and retryable claims.
INSERT INTO public.notifications (
  id, user_id, type, title, body, category, channel, delivery_status, scheduled_at, delivered_at, dedupe_key
) VALUES (
  '07101140-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000003',
  'organizer_message', 'Future fixture', 'Future body', 'organizer', 'email',
  'delivered', now() + interval '1 day', now(), 'future-fixture-071011'
);
DO $$ BEGIN
  IF (SELECT delivery_status FROM public.notifications WHERE id = '07101140-0000-4000-8000-000000000001') <> 'scheduled' THEN
    RAISE EXCEPTION 'future notification was exposed as delivered';
  END IF;
END $$;

UPDATE public.notification_preferences SET digest_mode = 'daily'
WHERE user_id = '07101100-0000-4000-8000-000000000003';
INSERT INTO public.notifications (
  id, user_id, type, title, body, category, channel, delivery_status,
  suppression_reason, scheduled_at, dedupe_key
) VALUES (
  '07101140-0000-4000-8000-000000000002', '07101100-0000-4000-8000-000000000003',
  'circle_activity', 'Digest fixture', 'Digest body', 'community', 'in_app',
  'scheduled', 'digest', now() - interval '1 minute', 'digest-fixture-071011'
);
SELECT public.materialize_due_notification_digests(10);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_digest_items
    WHERE notification_id = '07101140-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'digest did not materialize';
  END IF;
END $$;

UPDATE public.notification_preferences SET email_enabled = true, digest_mode = 'off'
WHERE user_id = '07101100-0000-4000-8000-000000000003';
INSERT INTO public.notifications (
  id, user_id, type, title, body, category, channel, delivery_status, scheduled_at, dedupe_key
) VALUES (
  '07101140-0000-4000-8000-000000000003', '07101100-0000-4000-8000-000000000003',
  'organizer_message', 'Claim fixture', 'Claim body', 'organizer', 'email',
  'scheduled', now() - interval '1 minute', 'claim-fixture-071011'
);
DO $$
DECLARE claimed record;
BEGIN
  SELECT * INTO claimed FROM public.claim_due_external_notifications('fixture-worker', 10, 60)
  WHERE notification_id = '07101140-0000-4000-8000-000000000003';
  IF claimed.claim_token IS NULL THEN RAISE EXCEPTION 'external notification was not claimed'; END IF;
  PERFORM public.complete_external_notification_claim(
    claimed.notification_id, claimed.claim_token, 'failed', 'fixture-provider', NULL,
    '503', 'PROVIDER_UNAVAILABLE', true, '{"fixture":true}');
  IF (SELECT delivery_status FROM public.notifications WHERE id = claimed.notification_id) <> 'failed'
     OR NOT EXISTS (SELECT 1 FROM public.notification_delivery_attempts
       WHERE notification_id = claimed.notification_id AND retryable AND next_retry_at > now()) THEN
    RAISE EXCEPTION 'retryable failure was not persisted';
  END IF;
END $$;

-- Aggregate-only queue/cache and independent review gates.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.virtual_hubs (
  id, hobby_category, hobby_subcategory, hobby_activity, city, identity_key
) VALUES (
  '07101150-0000-4000-8000-000000000001', 'Outdoor', 'Hiking', 'Night hike', 'Budapest', 'fixture-ai-hub-071011'
);
INSERT INTO public.ai_event_generation_runs (
  id, idempotency_key, requested_by, status, prompt_template_version, completed_at
) VALUES (
  '07101160-0000-4000-8000-000000000001', 'fixture-ai-run-071011',
  '07101100-0000-4000-8000-000000000004', 'completed', 1, now()
);
INSERT INTO public.ai_event_proposals (
  id, generation_run_id, hub_id, idempotency_key, status, title, description,
  category, activity, suggested_start, suggested_end, city, venue_category,
  target_capacity, demand_reason, confidence, organizer_id, moderation_status
) VALUES (
  '07101170-0000-4000-8000-000000000001', '07101160-0000-4000-8000-000000000001',
  '07101150-0000-4000-8000-000000000001', 'fixture-ai-proposal-071011', 'draft',
  'AI fixture hike', 'Human controlled aggregate proposal fixture.', 'Outdoor', 'Night hike',
  now() + interval '10 days', now() + interval '10 days 2 hours', 'Budapest', 'park',
  12, 'Aggregate fixture demand exceeds the privacy threshold.', 0.8,
  '07101100-0000-4000-8000-000000000001', 'needs_review'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.admin_transition_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000004',
  'review', 'Initial admin review', '07101100-0000-4000-8000-000000000001',
  NULL, NULL, NULL, NULL, NULL, NULL, '{}'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '07101100-0000-4000-8000-000000000001', true);
SELECT public.organizer_accept_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', true, NULL
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.admin_transition_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000004',
  'review', 'Moderation passed independently', NULL, 'passed', NULL,
  NULL, NULL, NULL, NULL, '{}'
);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_transition_ai_event_proposal(
      '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000004',
      'review', 'Same reviewer venue attempt', NULL, NULL, 'verified',
      'Fixture park', 'Coarse verified fixture address', NULL, NULL, '{}');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'single-admin moderation/venue loophole remained'; END IF;
END $$;
SELECT public.admin_transition_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000005',
  'review', 'Independent venue verification', NULL, NULL, 'verified',
  'Fixture park', 'Coarse verified fixture address', NULL, NULL, '{}'
);
SELECT public.admin_transition_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000005',
  'approved', 'All independent gates complete', NULL, NULL, NULL,
  NULL, NULL, NULL, NULL, '{}'
);
SELECT public.admin_publish_ai_event_proposal(
  '07101170-0000-4000-8000-000000000001', '07101100-0000-4000-8000-000000000005'
);

DO $$
DECLARE job public.ai_event_generation_jobs%ROWTYPE; claimed public.ai_event_generation_jobs%ROWTYPE;
BEGIN
  job := public.enqueue_ai_event_generation_job(
    'fixture-durable-ai-job-071011', '07101100-0000-4000-8000-000000000004',
    '{"source":"fixture"}');
  SELECT * INTO claimed FROM public.claim_ai_event_generation_jobs(1, 60, job.id);
  IF claimed.lease_token IS NULL OR claimed.attempt_count <> 1 THEN RAISE EXCEPTION 'AI job lease failed'; END IF;
  IF public.retry_ai_event_generation_job(claimed.id, claimed.lease_token, 'TRANSIENT_FIXTURE', true) <> 'retry' THEN
    RAISE EXCEPTION 'AI retry state failed';
  END IF;
END $$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.ai_event_candidate_cache (
      cache_key, hub_id, model, prompt_template_version, candidate, expires_at
    ) VALUES (
      repeat('a', 64), '07101150-0000-4000-8000-000000000001', 'fixture-model', 1,
      '{"member_ids":["forbidden"]}', now() + interval '1 hour'
    );
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'AI cache accepted identity-bearing payload'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_ai_event_proposal_outcomes(
      '07101100-0000-4000-8000-000000000005', 10
    ) WHERE proposal_id = '07101170-0000-4000-8000-000000000001'
      AND proposal_status = 'published' AND organizer_accepted
  ) THEN RAISE EXCEPTION 'AI outcome analytics did not return the published outcome'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

DO $$ BEGIN
  IF (SELECT count(*) FROM public.ai_event_proposals
      WHERE id = '07101170-0000-4000-8000-000000000001'
        AND status = 'published' AND published_event_id IS NOT NULL
        AND moderation_reviewed_by <> venue_verified_by) <> 1 THEN
    RAISE EXCEPTION 'independent review/publish outcome failed';
  END IF;
  IF (SELECT count(*) FROM public.event_operation_audits
      WHERE event_id IN ('07101110-0000-4000-8000-000000000001', '07101110-0000-4000-8000-000000000002')
        AND action IN ('event_published', 'event_rescheduled', 'event_cancelled', 'organizer_message_sent')) < 4 THEN
    RAISE EXCEPTION 'organizer audit trail incomplete';
  END IF;
END $$;

ROLLBACK;
