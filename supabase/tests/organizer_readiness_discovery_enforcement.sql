-- Organizer readiness discovery enforcement integration evidence.
-- Prerequisite: migrations through 20260822183000. All fixture rows roll back.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES ('71830000-0000-4000-8000-000000000001');
INSERT INTO public.profiles (user_id, display_name, user_origin, is_active)
VALUES ('71830000-0000-4000-8000-000000000001', 'Readiness owner', 'real', true)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active;

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '1 day'
WHERE key = 'organizer_readiness_enforcement';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '71830000-0000-4000-8000-000000000001', true);

INSERT INTO public.events (
  id, created_by, organizer_id, title, description, category,
  outcome_status, is_active, event_date, event_time, start_time,
  max_attendees, location_city
) VALUES (
  '71831000-0000-4000-8000-000000000001',
  '71830000-0000-4000-8000-000000000001',
  '71830000-0000-4000-8000-000000000001',
  'Readiness-gated event', 'A complete integration fixture description',
  'Hiking', 'published', true, current_date + 3, time '17:00',
  now() + interval '3 days', 10, 'Budapest'
);

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = '71831000-0000-4000-8000-000000000001'
      AND organizer_readiness_required
      AND readiness_enforcement_version = 'organizer-readiness-v2'
      AND outcome_status = 'draft'
      AND is_active = false
  ) THEN
    RAISE EXCEPTION 'readiness insert did not fail closed to an inactive draft';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '71830000-0000-4000-8000-000000000001', true);

DO $$
BEGIN
  BEGIN
    UPDATE public.events
    SET outcome_status = 'published', is_active = true
    WHERE id = '71831000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'direct readiness publication unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'EVENT_READINESS_LIFECYCLE_RPC_REQUIRED' THEN
      RAISE;
    END IF;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.publish_event_with_readiness_atomic(
      '71831000-0000-4000-8000-000000000001',
      'Fixture incomplete publication',
      '71832000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'incomplete readiness publication unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'EVENT_READINESS_INCOMPLETE:%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

SELECT public.save_organizer_readiness_assessment_atomic(
  '71831000-0000-4000-8000-000000000001',
  '{"identity":true,"description":true,"safety":true,"location":true,"capacity":true,"cancellation":true,"checkin":true,"communication":true,"accessibility":true,"legal_tax":true}',
  '71832000-0000-4000-8000-000000000002'
);
SELECT public.publish_event_with_readiness_atomic(
  '71831000-0000-4000-8000-000000000001',
  'Fixture completed publication',
  '71832000-0000-4000-8000-000000000003'
);

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = '71831000-0000-4000-8000-000000000001'
      AND outcome_status = 'published'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'audited readiness publication did not activate the event';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_operation_audits
    WHERE event_id = '71831000-0000-4000-8000-000000000001'
      AND action = 'event_published'
  ) THEN
    RAISE EXCEPTION 'readiness publication audit evidence is missing';
  END IF;
END;
$$;

ROLLBACK;
