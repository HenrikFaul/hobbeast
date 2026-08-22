-- Prompt 12-15 P1 regression. Run after migration 20260822182000 on an
-- isolated PostgreSQL/Supabase-compatible database. Fixtures are rolled back.

BEGIN;

DO $structural_contract$
BEGIN
  IF has_function_privilege('authenticated', 'public.admin_list_user_profiles(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_update_user_profile(uuid,uuid,text,boolean,text,text[],uuid[],text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.run_privacy_retention_maintenance(integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.evaluate_experiment_guardrails(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A service/scheduler-only P1 function is executable by authenticated';
  END IF;

  IF has_function_privilege('authenticated', 'public.admin_update_member_profile(uuid,text,boolean,text,text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_set_member_event_participations(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'A legacy unreasoned admin mutation remains executable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promoted_experience_candidates'
      AND column_name IN ('payment_amount', 'bid', 'sponsor_email')
  ) THEN
    RAISE EXCEPTION 'Promoted candidate boundary exposes payment or sponsor PII';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'social_circles'
      AND policyname = 'Circles hide removed resources'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'virtual_hubs'
      AND policyname = 'Hubs hide removed resources'
  ) THEN
    RAISE EXCEPTION 'Removed-resource community read policy missing';
  END IF;
END
$structural_contract$;

INSERT INTO public.feature_flags (
  key, enabled, rollout_percentage, cohorts, eligibility_rule,
  owner, expires_at, description
) VALUES (
  'p1_guardrail_test', true, 100, '{}'::text[], '{}'::jsonb,
  'sql-test', now() + interval '1 day', 'Rollback-only guardrail fixture'
);

INSERT INTO public.experiments (
  key, feature_flag_key, status, hypothesis, primary_metric, owner, starts_at
) VALUES (
  'p1_guardrail_test', 'p1_guardrail_test', 'draft',
  'A report-rate regression must stop the experiment automatically.',
  'event_join_rate', 'sql-test', now() - interval '1 hour'
);

INSERT INTO public.experiments (
  key, feature_flag_key, status, hypothesis, primary_metric, owner, starts_at
) VALUES (
  'p1_incomplete_guardrail_test', 'p1_guardrail_test', 'draft',
  'An experiment without variants and guardrails must not start.',
  'event_join_rate', 'sql-test', now() - interval '1 hour'
);

DO $incomplete_launch_denied$
BEGIN
  BEGIN
    UPDATE public.experiments SET status = 'running'
    WHERE key = 'p1_incomplete_guardrail_test';
    RAISE EXCEPTION 'Incomplete experiment was allowed to start';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$incomplete_launch_denied$;

INSERT INTO public.experiment_variants (
  experiment_id, key, allocation_percentage
)
SELECT id, variant.key, variant.allocation
FROM public.experiments
CROSS JOIN (VALUES ('control', 50), ('treatment', 50)) AS variant(key, allocation)
WHERE experiments.key = 'p1_guardrail_test';

INSERT INTO public.experiment_guardrails (
  experiment_id, metric_key, direction, threshold, minimum_sample_size, auto_stop
)
SELECT experiment.id, guardrail.metric_key, guardrail.direction, guardrail.threshold, 100, true
FROM public.experiments experiment
CROSS JOIN (VALUES
  ('report_rate', 'maximum', 0.05::numeric),
  ('cancellation_rate', 'maximum', 0.10::numeric),
  ('no_show_rate', 'maximum', 0.20::numeric),
  ('notification_opt_out_rate', 'maximum', 0.10::numeric),
  ('accessibility_error_rate', 'maximum', 0.01::numeric),
  ('latency_p95_ms', 'maximum', 2500::numeric),
  ('new_user_first_value_rate', 'minimum', 0.20::numeric),
  ('organizer_quality_score', 'minimum', 0.50::numeric)
) AS guardrail(metric_key, direction, threshold)
WHERE experiment.key = 'p1_guardrail_test';

UPDATE public.experiments SET status = 'running'
WHERE key = 'p1_guardrail_test';

DO $running_configuration_immutable$
BEGIN
  BEGIN
    UPDATE public.experiment_variants
    SET allocation_percentage = 60
    WHERE experiment_id = (SELECT id FROM public.experiments WHERE key = 'p1_guardrail_test')
      AND key = 'control';
    RAISE EXCEPTION 'Running experiment variant configuration was mutable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;
END
$running_configuration_immutable$;

SELECT public.record_experiment_metric_snapshot(
  'p1_guardrail_test', 'report_rate', 0.08, 120,
  now() - interval '1 hour', now(), 'p1-snapshot-0001'
);
SELECT public.evaluate_experiment_guardrails('p1_guardrail_test', 'p1-evaluation-0001');

DO $guardrail_contract$
DECLARE
  experiment_status text;
  flag_enabled boolean;
  flag_rollout integer;
BEGIN
  SELECT status INTO experiment_status
  FROM public.experiments WHERE key = 'p1_guardrail_test';
  SELECT enabled, rollout_percentage INTO flag_enabled, flag_rollout
  FROM public.feature_flags WHERE key = 'p1_guardrail_test';

  IF experiment_status <> 'stopped' OR flag_enabled OR flag_rollout <> 0 THEN
    RAISE EXCEPTION 'Guardrail breach did not stop experiment and kill linked flag';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.experiment_guardrail_evaluations e
    JOIN public.experiments x ON x.id = e.experiment_id
    WHERE x.key = 'p1_guardrail_test' AND e.outcome = 'auto_stopped'
  ) THEN
    RAISE EXCEPTION 'Guardrail auto-stop evaluation evidence missing';
  END IF;
END
$guardrail_contract$;

SELECT public.run_privacy_retention_maintenance(10, 'p1-retention-0001');

DO $retention_contract$
BEGIN
  IF (
    SELECT count(*) FROM public.data_deletion_receipts
    WHERE correlation_id = 'p1-retention-0001'
  ) <> 3 THEN
    RAISE EXCEPTION 'Scheduler-ready retention receipt set is incomplete';
  END IF;
END
$retention_contract$;

ROLLBACK;
