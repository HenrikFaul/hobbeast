-- P1 follow-up for Prompts 14-15: experiment registry with fail-closed
-- guardrail auto-stop and clearly labelled promoted-content eligibility.
-- This source does not schedule jobs, charge money or mutate a hosted system.

BEGIN;

CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  feature_flag_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  hypothesis text NOT NULL,
  primary_metric text NOT NULL,
  owner text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experiments_key_check CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  CONSTRAINT experiments_status_check CHECK (status IN ('draft', 'running', 'paused', 'stopped', 'completed')),
  CONSTRAINT experiments_hypothesis_check CHECK (char_length(hypothesis) BETWEEN 10 AND 1000),
  CONSTRAINT experiments_metric_check CHECK (primary_metric IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'report_rate', 'block_rate', 'error_rate', 'latency_p95_ms'
  )),
  CONSTRAINT experiments_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT experiments_stop_reason_check CHECK (stop_reason IS NULL OR char_length(stop_reason) BETWEEN 3 AND 1000)
);

CREATE UNIQUE INDEX experiments_one_running_per_flag_idx
  ON public.experiments (feature_flag_key)
  WHERE status = 'running';

CREATE TABLE public.experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  key text NOT NULL,
  allocation_percentage integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, key),
  CONSTRAINT experiment_variants_key_check CHECK (key ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT experiment_variants_allocation_check CHECK (allocation_percentage BETWEEN 0 AND 100),
  CONSTRAINT experiment_variants_config_check CHECK (jsonb_typeof(config) = 'object' AND pg_column_size(config) <= 8192)
);

CREATE TABLE public.experiment_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  direction text NOT NULL,
  threshold numeric NOT NULL,
  minimum_sample_size integer NOT NULL DEFAULT 100,
  auto_stop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, metric_key),
  CONSTRAINT experiment_guardrails_metric_check CHECK (metric_key IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'report_rate', 'block_rate', 'error_rate', 'latency_p95_ms'
  )),
  CONSTRAINT experiment_guardrails_direction_check CHECK (direction IN ('maximum', 'minimum')),
  CONSTRAINT experiment_guardrails_sample_check CHECK (minimum_sample_size BETWEEN 1 AND 100000000)
);

CREATE TABLE public.experiment_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  sample_size integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL,
  correlation_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, metric_key, window_ended_at, correlation_id),
  CONSTRAINT experiment_snapshots_metric_check CHECK (metric_key IN (
    'event_join_rate', 'checked_in_rate', 'completion_rate', 'retention_rate',
    'reconnection_rate', 'report_rate', 'block_rate', 'error_rate', 'latency_p95_ms'
  )),
  CONSTRAINT experiment_snapshots_sample_check CHECK (sample_size >= 0),
  CONSTRAINT experiment_snapshots_window_check CHECK (window_ended_at > window_started_at),
  CONSTRAINT experiment_snapshots_correlation_check CHECK (char_length(correlation_id) BETWEEN 8 AND 200)
);
CREATE INDEX experiment_metric_snapshots_latest_idx
  ON public.experiment_metric_snapshots (experiment_id, metric_key, window_ended_at DESC);

CREATE TABLE public.experiment_guardrail_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  breached_guardrails jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL,
  correlation_id text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, correlation_id),
  CONSTRAINT experiment_guardrail_evaluations_array CHECK (jsonb_typeof(breached_guardrails) = 'array'),
  CONSTRAINT experiment_guardrail_evaluations_outcome CHECK (outcome IN ('continue', 'auto_stopped', 'not_running'))
);

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_guardrail_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Experiment operators read registry" ON public.experiments
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'feature_flags.manage'));
CREATE POLICY "Experiment operators read variants" ON public.experiment_variants
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'feature_flags.manage'));
CREATE POLICY "Experiment operators read guardrails" ON public.experiment_guardrails
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'feature_flags.manage'));
CREATE POLICY "Experiment operators read snapshots" ON public.experiment_metric_snapshots
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'feature_flags.manage'));
CREATE POLICY "Experiment operators read evaluations" ON public.experiment_guardrail_evaluations
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'feature_flags.manage'));

REVOKE INSERT, UPDATE, DELETE ON public.experiments FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.experiment_variants FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.experiment_guardrails FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.experiment_metric_snapshots FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.experiment_guardrail_evaluations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_experiment_metric_snapshot(
  _experiment_key text,
  _metric_key text,
  _metric_value numeric,
  _sample_size integer,
  _window_started_at timestamptz,
  _window_ended_at timestamptz,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  experiment_id_value uuid;
  snapshot_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'scheduler or service role required' USING ERRCODE = '42501';
  END IF;
  IF _sample_size < 0 OR _window_ended_at <= _window_started_at
     OR char_length(btrim(coalesce(_correlation_id, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid metric snapshot' USING ERRCODE = '22023';
  END IF;
  SELECT e.id INTO experiment_id_value
  FROM public.experiments e
  WHERE e.key = _experiment_key AND e.status = 'running';
  IF experiment_id_value IS NULL THEN
    RAISE EXCEPTION 'running experiment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.experiment_guardrails g
    WHERE g.experiment_id = experiment_id_value AND g.metric_key = _metric_key
  ) THEN
    RAISE EXCEPTION 'metric is not registered as a guardrail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.experiment_metric_snapshots (
    experiment_id, metric_key, metric_value, sample_size,
    window_started_at, window_ended_at, correlation_id
  ) VALUES (
    experiment_id_value, _metric_key, _metric_value, _sample_size,
    _window_started_at, _window_ended_at, _correlation_id
  )
  ON CONFLICT (experiment_id, metric_key, window_ended_at, correlation_id)
  DO UPDATE SET metric_value = EXCLUDED.metric_value, sample_size = EXCLUDED.sample_size
  RETURNING id INTO snapshot_id;
  RETURN snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_experiment_metric_snapshot(text, text, numeric, integer, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_experiment_metric_snapshot(text, text, numeric, integer, timestamptz, timestamptz, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_experiment_guardrails(
  _experiment_key text,
  _correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  experiment_row public.experiments%ROWTYPE;
  flag_row public.feature_flags%ROWTYPE;
  breaches jsonb := '[]'::jsonb;
  outcome_value text := 'continue';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'scheduler or service role required' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(_correlation_id, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid guardrail evaluation request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO experiment_row
  FROM public.experiments e
  WHERE e.key = _experiment_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'experiment not found' USING ERRCODE = 'P0002';
  END IF;
  IF experiment_row.status <> 'running' THEN
    outcome_value := 'not_running';
    INSERT INTO public.experiment_guardrail_evaluations (
      experiment_id, breached_guardrails, outcome, correlation_id
    ) VALUES (experiment_row.id, '[]'::jsonb, outcome_value, _correlation_id)
    ON CONFLICT (experiment_id, correlation_id) DO NOTHING;
    RETURN jsonb_build_object('experiment_key', experiment_row.key, 'outcome', outcome_value, 'breaches', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'metric_key', evaluated.metric_key,
    'direction', evaluated.direction,
    'threshold', evaluated.threshold,
    'metric_value', evaluated.metric_value,
    'sample_size', evaluated.sample_size
  ) ORDER BY evaluated.metric_key), '[]'::jsonb)
  INTO breaches
  FROM (
    SELECT g.metric_key, g.direction, g.threshold, latest.metric_value, latest.sample_size
    FROM public.experiment_guardrails g
    JOIN LATERAL (
      SELECT s.metric_value, s.sample_size
      FROM public.experiment_metric_snapshots s
      WHERE s.experiment_id = g.experiment_id AND s.metric_key = g.metric_key
      ORDER BY s.window_ended_at DESC, s.recorded_at DESC
      LIMIT 1
    ) latest ON true
    WHERE g.experiment_id = experiment_row.id
      AND g.auto_stop
      AND latest.sample_size >= g.minimum_sample_size
      AND (
        (g.direction = 'maximum' AND latest.metric_value > g.threshold)
        OR (g.direction = 'minimum' AND latest.metric_value < g.threshold)
      )
  ) evaluated;

  IF jsonb_array_length(breaches) > 0 THEN
    outcome_value := 'auto_stopped';
    UPDATE public.experiments
    SET status = 'stopped', stopped_at = now(),
        stop_reason = 'Guardrail threshold breached; linked feature flag disabled automatically.',
        updated_at = now()
    WHERE id = experiment_row.id;

    SELECT * INTO flag_row
    FROM public.feature_flags f
    WHERE f.key = experiment_row.feature_flag_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked feature flag not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.feature_flags
    SET enabled = false, rollout_percentage = 0, updated_at = now()
    WHERE key = flag_row.key;

    INSERT INTO public.feature_flag_audit_log (
      flag_key, subject_user_id, change_scope, actor_id,
      enabled_before, enabled_after, rollout_before, rollout_after,
      config_before, config_after, reason, correlation_id, idempotency_key
    ) VALUES (
      flag_row.key, NULL, 'flag', NULL,
      flag_row.enabled, false, flag_row.rollout_percentage, 0,
      jsonb_build_object('source', 'experiment_guardrail', 'experiment_key', experiment_row.key),
      jsonb_build_object('source', 'experiment_guardrail', 'experiment_key', experiment_row.key, 'breaches', breaches),
      'Automatic experiment stop after a registered guardrail breach.',
      _correlation_id,
      left('experiment-autostop:' || experiment_row.id::text || ':' || _correlation_id, 240)
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO public.experiment_guardrail_evaluations (
    experiment_id, breached_guardrails, outcome, correlation_id
  ) VALUES (experiment_row.id, breaches, outcome_value, _correlation_id)
  ON CONFLICT (experiment_id, correlation_id) DO NOTHING;

  RETURN jsonb_build_object(
    'experiment_key', experiment_row.key,
    'outcome', outcome_value,
    'breaches', breaches,
    'feature_flag_key', experiment_row.feature_flag_key,
    'feature_disabled', outcome_value = 'auto_stopped'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_experiment_guardrails(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_experiment_guardrails(text, text)
  TO service_role;

-- `hub_qualified` is a system-level, subject-free transition. It is emitted
-- only when the analytics flag is globally enabled (100%, no cohort/rule), and
-- telemetry failure can never roll back the Hub qualification mutation.
CREATE OR REPLACE FUNCTION public.track_virtual_hub_qualification_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE analytics_globally_enabled boolean := false;
BEGIN
  IF coalesce(OLD.qualification_score, 0) >= 60 OR coalesce(NEW.qualification_score, 0) < 60 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(
    f.enabled
    AND f.rollout_percentage = 100
    AND cardinality(f.cohorts) = 0
    AND f.eligibility_rule = '{}'::jsonb
    AND f.expires_at > now(),
    false
  ) INTO analytics_globally_enabled
  FROM public.feature_flags f
  WHERE f.key = 'analytics';
  IF NOT analytics_globally_enabled THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO public.product_analytics_events (
      event_name, schema_version, actor_pseudonym, session_pseudonym,
      properties, source, idempotency_key, correlation_id, occurred_at
    ) VALUES (
      'hub_qualified', 1, NULL, NULL,
      jsonb_build_object(
        'surface', 'virtual_hub_runtime',
        'status', 'qualified',
        'count_bucket', CASE
          WHEN NEW.real_member_count < 5 THEN 'three_to_four'
          WHEN NEW.real_member_count < 10 THEN 'five_to_nine'
          ELSE 'ten_plus'
        END,
        'schema_version', 1
      ),
      'system',
      left('hub-qualified:' || NEW.id::text || ':' || md5(NEW.updated_at::text), 128),
      gen_random_uuid()::text,
      now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Product lifecycle mutations are authoritative; analytics is best-effort.
    NULL;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.track_virtual_hub_qualification_transition()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS virtual_hub_qualification_analytics ON public.virtual_hubs;
CREATE TRIGGER virtual_hub_qualification_analytics
AFTER UPDATE OF qualification_score ON public.virtual_hubs
FOR EACH ROW EXECUTE FUNCTION public.track_virtual_hub_qualification_transition();

CREATE TABLE public.promoted_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  disclosure_label text NOT NULL DEFAULT 'Promoted',
  policy_status text NOT NULL DEFAULT 'pending',
  quality_score numeric NOT NULL,
  relevance_score numeric NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  policy_reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promoted_experiences_label_check CHECK (disclosure_label = 'Promoted'),
  CONSTRAINT promoted_experiences_status_check CHECK (policy_status IN ('pending', 'approved', 'rejected', 'suspended')),
  CONSTRAINT promoted_experiences_quality_check CHECK (quality_score BETWEEN 0 AND 1),
  CONSTRAINT promoted_experiences_relevance_check CHECK (relevance_score BETWEEN 0 AND 1),
  CONSTRAINT promoted_experiences_window_check CHECK (ends_at > starts_at),
  CONSTRAINT promoted_experiences_reason_check CHECK (char_length(policy_reason) BETWEEN 3 AND 1000)
);
CREATE INDEX promoted_experiences_eligible_idx
  ON public.promoted_experiences (policy_status, starts_at, ends_at, relevance_score DESC, quality_score DESC);

ALTER TABLE public.promoted_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read eligible labelled promotions" ON public.promoted_experiences
  FOR SELECT TO authenticated
  USING (
    public.feature_enabled_for_subject('promoted_experiences', auth.uid())
    AND policy_status = 'approved'
    AND starts_at <= now() AND ends_at > now()
    AND NOT public.is_resource_removed('event', event_id::text)
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = promoted_experiences.event_id
        AND coalesce(e.is_active, false)
        AND coalesce(e.outcome_status, 'scheduled') NOT IN ('completed', 'held', 'cancelled', 'archived')
    )
  );
CREATE POLICY "Content operators read promotion policy state" ON public.promoted_experiences
  FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'content.manage'));
REVOKE INSERT, UPDATE, DELETE ON public.promoted_experiences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.promoted_experience_candidates
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.event_id,
  true AS is_promoted,
  p.disclosure_label,
  p.quality_score,
  p.relevance_score,
  p.starts_at,
  p.ends_at
FROM public.promoted_experiences p
JOIN public.events e ON e.id = p.event_id
WHERE auth.uid() IS NOT NULL
  AND public.feature_enabled_for_subject('promoted_experiences', auth.uid())
  AND p.policy_status = 'approved'
  AND p.disclosure_label = 'Promoted'
  AND p.starts_at <= now() AND p.ends_at > now()
  AND p.quality_score >= 0.5 AND p.relevance_score >= 0.5
  AND coalesce(e.is_active, false)
  AND coalesce(e.outcome_status, 'scheduled') NOT IN ('completed', 'held', 'cancelled', 'archived')
  AND NOT public.is_resource_removed('event', e.id::text);

REVOKE ALL ON public.promoted_experience_candidates FROM PUBLIC, anon;
GRANT SELECT ON public.promoted_experience_candidates TO authenticated;

COMMENT ON VIEW public.promoted_experience_candidates IS
  'Policy-eligible labelled candidates only. Organic ordering and insertion boundaries are enforced by the consumer ranking contract; payment never changes organic score.';

CREATE OR REPLACE FUNCTION public.admin_upsert_promoted_experience(
  _actor_id uuid,
  _event_id uuid,
  _policy_status text,
  _quality_score numeric,
  _relevance_score numeric,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _policy_reason text,
  _request_id text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE promotion_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     OR NOT public.admin_has_capability(_actor_id, 'content.manage') THEN
    RAISE EXCEPTION 'Content capability required' USING ERRCODE = '42501';
  END IF;
  IF _policy_status NOT IN ('pending', 'approved', 'rejected', 'suspended')
     OR _quality_score NOT BETWEEN 0 AND 1 OR _relevance_score NOT BETWEEN 0 AND 1
     OR _ends_at <= _starts_at
     OR char_length(btrim(coalesce(_policy_reason, ''))) NOT BETWEEN 3 AND 1000
     OR char_length(btrim(coalesce(_request_id, ''))) NOT BETWEEN 8 AND 200
     OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 240 THEN
    RAISE EXCEPTION 'Invalid promoted experience policy' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id) THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.id INTO promotion_id
  FROM public.promoted_experiences p WHERE p.event_id = _event_id FOR UPDATE;
  IF promotion_id IS NULL THEN
    INSERT INTO public.promoted_experiences (
      event_id, disclosure_label, policy_status, quality_score, relevance_score,
      starts_at, ends_at, policy_reason, created_by, reviewed_by, reviewed_at
    ) VALUES (
      _event_id, 'Promoted', _policy_status, _quality_score, _relevance_score,
      _starts_at, _ends_at, btrim(_policy_reason), _actor_id,
      CASE WHEN _policy_status <> 'pending' THEN _actor_id ELSE NULL END,
      CASE WHEN _policy_status <> 'pending' THEN now() ELSE NULL END
    ) RETURNING id INTO promotion_id;
  ELSE
    UPDATE public.promoted_experiences
    SET policy_status = _policy_status,
        quality_score = _quality_score,
        relevance_score = _relevance_score,
        starts_at = _starts_at,
        ends_at = _ends_at,
        policy_reason = btrim(_policy_reason),
        reviewed_by = CASE WHEN _policy_status <> 'pending' THEN _actor_id ELSE NULL END,
        reviewed_at = CASE WHEN _policy_status <> 'pending' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = promotion_id;
  END IF;

  PERFORM public.admin_record_audit_event(
    _actor_id, 'content.manage', 'promoted_experience.upsert', 'event', _event_id::text,
    _policy_reason, _request_id, _idempotency_key, 'succeeded',
    jsonb_build_object(
      'promotion_id', promotion_id,
      'policy_status', _policy_status,
      'quality_bucket', floor(_quality_score * 10)::integer,
      'relevance_bucket', floor(_relevance_score * 10)::integer
    ), NULL, NULL, NULL, NULL
  );
  RETURN promotion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_promoted_experience(uuid, uuid, text, numeric, numeric, timestamptz, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_promoted_experience(uuid, uuid, text, numeric, numeric, timestamptz, timestamptz, text, text, text)
  TO service_role;

COMMIT;
