-- Circle/Hub release-state and kill-switch regression fixture.
-- The transaction restores the released registry state after every run.

BEGIN;

DO $release_state$
DECLARE
  subject_id constant uuid := '1c120000-0000-4000-8000-000000000001';
  expected_flag_key text;
BEGIN
  FOREACH expected_flag_key IN ARRAY ARRAY['circles', 'hub2']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.feature_flags flag
      WHERE flag.key = expected_flag_key
        AND flag.enabled
        AND flag.rollout_percentage = 100
        AND flag.cohorts = ARRAY[]::text[]
        AND flag.eligibility_rule = '{}'::jsonb
        AND flag.expires_at > now()
    ) THEN
      RAISE EXCEPTION '% is not configured for authenticated general availability', expected_flag_key;
    END IF;

    IF NOT public.feature_enabled_for_subject(expected_flag_key, subject_id) THEN
      RAISE EXCEPTION '% is not available to an ordinary authenticated subject', expected_flag_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.feature_flag_audit_log
      WHERE idempotency_key = 'release-v1.12-community-general-availability:' || expected_flag_key
        AND enabled_after
        AND rollout_after = 100
    ) THEN
      RAISE EXCEPTION '% activation is missing its immutable audit evidence', expected_flag_key;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE key = 'connections' AND (enabled OR rollout_percentage <> 0)
  ) THEN
    RAISE EXCEPTION 'Circle/Hub activation unexpectedly changed the Connections rollout';
  END IF;
END;
$release_state$;

INSERT INTO auth.users (id)
VALUES ('1c120000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.feature_flag_overrides (
  flag_key, user_id, enabled, reason, expires_at
) VALUES (
  'circles',
  '1c120000-0000-4000-8000-000000000001',
  false,
  'Circle opt-out regression fixture',
  now() + interval '1 day'
);

DO $negative_override$
BEGIN
  IF public.evaluate_feature_flag(
    'circles',
    '1c120000-0000-4000-8000-000000000001',
    NULL
  ) THEN
    RAISE EXCEPTION 'A negative per-user Circle override was ignored';
  END IF;
END;
$negative_override$;

UPDATE public.feature_flag_overrides
SET enabled = true,
    reason = 'Kill-switch precedence regression fixture'
WHERE flag_key = 'circles'
  AND user_id = '1c120000-0000-4000-8000-000000000001';

UPDATE public.feature_flags
SET enabled = false,
    rollout_percentage = 0
WHERE key = 'circles';

DO $global_kill_switch$
BEGIN
  IF public.evaluate_feature_flag(
    'circles',
    '1c120000-0000-4000-8000-000000000001',
    NULL
  ) THEN
    RAISE EXCEPTION 'A positive override bypassed the global Circle kill switch';
  END IF;

  IF NOT public.feature_enabled_for_subject(
    'hub2',
    '1c120000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Disabling Circle unexpectedly disabled Hub 2.0';
  END IF;
END;
$global_kill_switch$;

ROLLBACK;
