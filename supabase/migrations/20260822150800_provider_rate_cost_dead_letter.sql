-- Prompt 01/09 second pass: privacy-safe Edge rate buckets plus provider cost
-- and dead-letter/replay governance. Buckets store only keyed hashes, never IPs.
-- Rollback: stop provider workers, revoke RPCs, drop the new tables/functions,
-- and leave the additive sync-run columns in place for compatibility.

BEGIN;

CREATE TABLE public.edge_rate_limit_buckets (
  endpoint text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, subject_hash),
  CONSTRAINT edge_rate_limit_endpoint_check CHECK (endpoint ~ '^[a-z0-9_.:-]{3,100}$'),
  CONSTRAINT edge_rate_limit_subject_hash_check CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT edge_rate_limit_request_count_check CHECK (request_count >= 0)
);
ALTER TABLE public.edge_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limit_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_endpoint text,
  p_subject_hash text,
  p_window_seconds integer,
  p_request_limit integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row public.edge_rate_limit_buckets%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_endpoint !~ '^[a-z0-9_.:-]{3,100}$' OR p_subject_hash !~ '^[a-f0-9]{64}$'
     OR p_window_seconds NOT BETWEEN 1 AND 86400 OR p_request_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_INPUT' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_endpoint || ':' || p_subject_hash, 0));
  SELECT * INTO v_row FROM public.edge_rate_limit_buckets
  WHERE endpoint = p_endpoint AND subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND OR v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN
    INSERT INTO public.edge_rate_limit_buckets (endpoint, subject_hash, window_started_at, request_count, updated_at)
    VALUES (p_endpoint, p_subject_hash, v_now, 1, v_now)
    ON CONFLICT (endpoint, subject_hash) DO UPDATE SET
      window_started_at = EXCLUDED.window_started_at,
      request_count = 1,
      updated_at = EXCLUDED.updated_at;
    RETURN QUERY SELECT true, p_request_limit - 1, 0;
    RETURN;
  END IF;

  IF v_row.request_count >= p_request_limit THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, ceil(extract(epoch FROM (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer);
    RETURN;
  END IF;

  UPDATE public.edge_rate_limit_buckets
  SET request_count = request_count + 1, updated_at = v_now
  WHERE endpoint = p_endpoint AND subject_hash = p_subject_hash;
  RETURN QUERY SELECT true, p_request_limit - v_row.request_count - 1, 0;
END;
$$;

ALTER TABLE public.external_provider_sync_runs
  ADD COLUMN IF NOT EXISTS cost_units numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replay_of uuid REFERENCES public.external_provider_sync_runs(id) ON DELETE SET NULL;

CREATE TABLE public.external_provider_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.external_provider_sync_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  action text NOT NULL,
  error_kind text NOT NULL,
  error_code text NOT NULL,
  payload_digest text,
  safe_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 1,
  next_retry_at timestamptz,
  replay_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replay_reason text,
  replay_idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT external_provider_dead_letter_state_check CHECK (state IN ('pending', 'replay_requested', 'processing', 'resolved', 'discarded')),
  CONSTRAINT external_provider_dead_letter_digest_check CHECK (payload_digest IS NULL OR payload_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT external_provider_dead_letter_safe_context_check CHECK (
    jsonb_typeof(safe_context) = 'object'
    AND pg_column_size(safe_context) <= 4096
    AND NOT (safe_context ?| ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie', 'payload'])
  )
);

CREATE INDEX external_provider_dead_letters_queue_idx
  ON public.external_provider_dead_letters (state, next_retry_at, created_at);
ALTER TABLE public.external_provider_dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider operators read dead letters"
ON public.external_provider_dead_letters FOR SELECT TO authenticated
USING (public.admin_has_capability(auth.uid(), 'providers.manage'));
REVOKE INSERT, UPDATE, DELETE ON public.external_provider_dead_letters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_external_provider_cost(
  p_run_id uuid,
  p_provider text,
  p_cost_units numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_cost_units < 0 OR p_cost_units > 100000 THEN RAISE EXCEPTION 'INVALID_COST_UNITS' USING ERRCODE = '22023'; END IF;
  UPDATE public.external_provider_sync_runs
  SET cost_units = cost_units + p_cost_units
  WHERE id = p_run_id AND provider = p_provider;
  UPDATE public.external_provider_state
  SET estimated_cost_units = estimated_cost_units + p_cost_units, updated_at = now()
  WHERE provider = p_provider;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_external_provider_dead_letter(
  p_run_id uuid,
  p_provider text,
  p_action text,
  p_error_kind text,
  p_error_code text,
  p_payload_digest text DEFAULT NULL,
  p_safe_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.external_provider_dead_letters (
    run_id, provider, action, error_kind, error_code, payload_digest, safe_context,
    next_retry_at
  ) VALUES (
    p_run_id, left(p_provider, 80), left(p_action, 120), left(p_error_kind, 80),
    left(p_error_code, 120), p_payload_digest, COALESCE(p_safe_context, '{}'::jsonb),
    now() + interval '5 minutes'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_request_external_provider_replay(
  p_dead_letter_id uuid,
  p_reason text,
  p_request_id text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.external_provider_dead_letters%ROWTYPE;
BEGIN
  IF NOT public.admin_has_capability(v_actor, 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 8 OR char_length(COALESCE(p_request_id, '')) < 8
     OR char_length(COALESCE(p_idempotency_key, '')) < 8 THEN
    RAISE EXCEPTION 'INVALID_REPLAY_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.external_provider_dead_letters WHERE id = p_dead_letter_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEAD_LETTER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_row.replay_idempotency_key = p_idempotency_key THEN RETURN v_row.id; END IF;
  IF v_row.state NOT IN ('pending', 'replay_requested') THEN
    RAISE EXCEPTION 'DEAD_LETTER_NOT_REPLAYABLE' USING ERRCODE = '55000';
  END IF;

  UPDATE public.external_provider_dead_letters
  SET state = 'replay_requested', replay_requested_by = v_actor,
      replay_reason = trim(p_reason), replay_idempotency_key = p_idempotency_key,
      next_retry_at = now(), updated_at = now()
  WHERE id = p_dead_letter_id;

  INSERT INTO public.admin_audit_log (
    actor_id, capability_key, action, target_type, target_id, safe_metadata,
    reason, request_id, idempotency_key, outcome
  ) VALUES (
    v_actor, 'providers.manage', 'provider.dead_letter.replay_requested',
    'provider_dead_letter', p_dead_letter_id::text,
    jsonb_build_object('provider', v_row.provider, 'action', v_row.action),
    trim(p_reason), p_request_id, 'provider-replay:' || p_idempotency_key, 'requested'
  );
  RETURN p_dead_letter_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_external_provider_replays(p_limit integer DEFAULT 10)
RETURNS TABLE (dead_letter_id uuid, provider text, action text, safe_context jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT d.id
    FROM public.external_provider_dead_letters d
    WHERE d.state IN ('pending', 'replay_requested')
      AND COALESCE(d.next_retry_at, d.created_at) <= now()
    ORDER BY d.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100)
  ), updated AS (
    UPDATE public.external_provider_dead_letters d
    SET state = 'processing', attempt_count = d.attempt_count + 1, updated_at = now()
    FROM claimed c WHERE d.id = c.id
    RETURNING d.id, d.provider, d.action, d.safe_context
  )
  SELECT u.id, u.provider, u.action, u.safe_context FROM updated u;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_external_provider_dead_letter(
  p_dead_letter_id uuid,
  p_succeeded boolean,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.external_provider_dead_letters
  SET state = CASE WHEN p_succeeded THEN 'resolved' ELSE 'pending' END,
      error_code = CASE WHEN p_succeeded THEN error_code ELSE left(COALESCE(p_error_code, 'replay_failed'), 120) END,
      next_retry_at = CASE WHEN p_succeeded THEN NULL ELSE now() + make_interval(mins => LEAST(attempt_count * 5, 120)) END,
      resolved_at = CASE WHEN p_succeeded THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_dead_letter_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_external_provider_cost(uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_external_provider_dead_letter(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_request_external_provider_replay(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_external_provider_replays(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_external_provider_dead_letter(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_external_provider_cost(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_external_provider_dead_letter(uuid, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_request_external_provider_replay(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_external_provider_replays(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_external_provider_dead_letter(uuid, boolean, text) TO service_role;

COMMIT;
