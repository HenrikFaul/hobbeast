-- P1 experiment launch completion: explicit safety/quality guardrail taxonomy,
-- immutable running configuration and fail-closed launch readiness.
-- No experiment is started and no hosted scheduler is changed by this source.

BEGIN;

ALTER TABLE public.experiments
  DROP CONSTRAINT experiments_metric_check;
ALTER TABLE public.experiments
  ADD CONSTRAINT experiments_metric_check CHECK (primary_metric IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'new_user_first_value_rate', 'organizer_quality_score',
    'report_rate', 'block_rate', 'cancellation_rate', 'no_show_rate',
    'notification_opt_out_rate', 'accessibility_error_rate', 'error_rate',
    'latency_p95_ms'
  ));

ALTER TABLE public.experiment_guardrails
  DROP CONSTRAINT experiment_guardrails_metric_check;
ALTER TABLE public.experiment_guardrails
  ADD CONSTRAINT experiment_guardrails_metric_check CHECK (metric_key IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'new_user_first_value_rate', 'organizer_quality_score',
    'report_rate', 'block_rate', 'cancellation_rate', 'no_show_rate',
    'notification_opt_out_rate', 'accessibility_error_rate', 'error_rate',
    'latency_p95_ms'
  ));
ALTER TABLE public.experiment_guardrails
  ADD CONSTRAINT experiment_guardrails_threshold_range_check CHECK (
    threshold >= 0
    AND (metric_key = 'latency_p95_ms' OR threshold <= 1)
  );

ALTER TABLE public.experiment_metric_snapshots
  DROP CONSTRAINT experiment_snapshots_metric_check;
ALTER TABLE public.experiment_metric_snapshots
  ADD CONSTRAINT experiment_snapshots_metric_check CHECK (metric_key IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'new_user_first_value_rate', 'organizer_quality_score',
    'report_rate', 'block_rate', 'cancellation_rate', 'no_show_rate',
    'notification_opt_out_rate', 'accessibility_error_rate', 'error_rate',
    'latency_p95_ms'
  ));
ALTER TABLE public.experiment_metric_snapshots
  ADD CONSTRAINT experiment_snapshots_value_range_check CHECK (
    metric_value >= 0
    AND (metric_key = 'latency_p95_ms' OR metric_value <= 1)
  );

CREATE OR REPLACE FUNCTION public.guard_experiment_launch_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  variant_count integer;
  allocation_total integer;
  missing_guardrails text[] := '{}'::text[];
BEGIN
  IF NEW.status <> 'running' OR (TG_OP = 'UPDATE' AND OLD.status = 'running') THEN
    RETURN NEW;
  END IF;
  IF NEW.starts_at IS NULL OR (NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at) THEN
    RAISE EXCEPTION 'EXPERIMENT_WINDOW_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), coalesce(sum(v.allocation_percentage), 0)
  INTO variant_count, allocation_total
  FROM public.experiment_variants v
  WHERE v.experiment_id = NEW.id;
  IF variant_count < 2 OR allocation_total <> 100 THEN
    RAISE EXCEPTION 'EXPERIMENT_VARIANTS_NOT_READY' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(required.metric_key ORDER BY required.metric_key), '{}'::text[])
  INTO missing_guardrails
  FROM (VALUES
    ('report_rate', 'maximum'),
    ('cancellation_rate', 'maximum'),
    ('no_show_rate', 'maximum'),
    ('notification_opt_out_rate', 'maximum'),
    ('accessibility_error_rate', 'maximum'),
    ('latency_p95_ms', 'maximum'),
    ('new_user_first_value_rate', 'minimum'),
    ('organizer_quality_score', 'minimum')
  ) AS required(metric_key, direction)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.experiment_guardrails guardrail
    WHERE guardrail.experiment_id = NEW.id
      AND guardrail.metric_key = required.metric_key
      AND guardrail.direction = required.direction
      AND guardrail.auto_stop
  );
  IF cardinality(missing_guardrails) > 0 THEN
    RAISE EXCEPTION 'EXPERIMENT_GUARDRAILS_NOT_READY: %', array_to_string(missing_guardrails, ',')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_experiment_launch_readiness()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS experiments_launch_readiness_guard ON public.experiments;
CREATE TRIGGER experiments_launch_readiness_guard
BEFORE INSERT OR UPDATE OF status, starts_at, ends_at ON public.experiments
FOR EACH ROW EXECUTE FUNCTION public.guard_experiment_launch_readiness();

CREATE OR REPLACE FUNCTION public.guard_running_experiment_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  experiment_id_value uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    experiment_id_value := OLD.experiment_id;
  ELSE
    experiment_id_value := NEW.experiment_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.experiments experiment
    WHERE experiment.id = experiment_id_value AND experiment.status = 'running'
  ) THEN
    RAISE EXCEPTION 'RUNNING_EXPERIMENT_CONFIG_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_running_experiment_configuration()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS experiment_variants_running_config_guard ON public.experiment_variants;
CREATE TRIGGER experiment_variants_running_config_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.experiment_variants
FOR EACH ROW EXECUTE FUNCTION public.guard_running_experiment_configuration();
DROP TRIGGER IF EXISTS experiment_guardrails_running_config_guard ON public.experiment_guardrails;
CREATE TRIGGER experiment_guardrails_running_config_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.experiment_guardrails
FOR EACH ROW EXECUTE FUNCTION public.guard_running_experiment_configuration();

COMMENT ON FUNCTION public.guard_experiment_launch_readiness() IS
  'Fail-closed experiment launch boundary: two allocated variants plus auto-stop safety, quality, accessibility and performance guardrails are mandatory.';
COMMENT ON FUNCTION public.guard_running_experiment_configuration() IS
  'Running experiment variants and guardrails are immutable; pause or stop before editing configuration.';

COMMIT;
