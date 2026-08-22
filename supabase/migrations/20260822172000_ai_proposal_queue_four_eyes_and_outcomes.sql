-- Prompt 11 completion: durable generation queue/cache, independent moderation
-- and venue verification, plus privacy-safe proposal outcome analytics.
-- Provider and scheduler activation remain deployment-time concerns.

BEGIN;

ALTER TABLE public.ai_event_proposals
  ADD COLUMN IF NOT EXISTS moderation_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS venue_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ai_event_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'retry', 'completed', 'dead_letter', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  generation_run_id uuid REFERENCES public.ai_event_generation_runs(id) ON DELETE SET NULL,
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(request_metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (NOT (request_metadata ?| ARRAY['member_ids', 'user_ids', 'emails', 'session_ids', 'token', 'secret']))
);

CREATE INDEX IF NOT EXISTS ai_event_generation_jobs_due_idx
  ON public.ai_event_generation_jobs (next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry');
CREATE INDEX IF NOT EXISTS ai_event_generation_jobs_lease_idx
  ON public.ai_event_generation_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.ai_event_candidate_cache (
  cache_key text PRIMARY KEY CHECK (char_length(cache_key) BETWEEN 16 AND 240),
  hub_id uuid NOT NULL REFERENCES public.virtual_hubs(id) ON DELETE CASCADE,
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  prompt_template_version integer NOT NULL CHECK (prompt_template_version > 0),
  candidate jsonb NOT NULL CHECK (pg_column_size(candidate) <= 16384),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (candidate ?| ARRAY['member_ids', 'user_ids', 'emails', 'session_ids', 'email', 'phone', 'address', 'token', 'secret']))
);
CREATE INDEX IF NOT EXISTS ai_event_candidate_cache_expiry_idx
  ON public.ai_event_candidate_cache (expires_at);

ALTER TABLE public.ai_event_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_candidate_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read AI generation jobs" ON public.ai_event_generation_jobs;
CREATE POLICY "Admins read AI generation jobs" ON public.ai_event_generation_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service manages AI generation jobs" ON public.ai_event_generation_jobs;
CREATE POLICY "Service manages AI generation jobs" ON public.ai_event_generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service manages AI candidate cache" ON public.ai_event_candidate_cache;
CREATE POLICY "Service manages AI candidate cache" ON public.ai_event_candidate_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.ai_event_generation_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_event_candidate_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_event_generation_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_event_candidate_cache TO service_role;

CREATE OR REPLACE FUNCTION public.guard_ai_proposal_independent_reviews()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  review_actor uuid := NEW.reviewed_by;
BEGIN
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    IF NEW.moderation_status = 'passed' THEN
      IF review_actor IS NULL OR NOT public.has_role(review_actor, 'admin') THEN
        RAISE EXCEPTION 'AI_MODERATION_REVIEWER_REQUIRED' USING ERRCODE = '42501';
      END IF;
      NEW.moderation_reviewed_by := review_actor;
      NEW.moderation_reviewed_at := now();
    ELSE
      NEW.moderation_reviewed_by := NULL;
      NEW.moderation_reviewed_at := NULL;
    END IF;
  END IF;

  IF NEW.venue_validation_status IS DISTINCT FROM OLD.venue_validation_status THEN
    IF NEW.venue_validation_status = 'verified' THEN
      IF review_actor IS NULL OR NOT public.has_role(review_actor, 'admin') THEN
        RAISE EXCEPTION 'AI_VENUE_REVIEWER_REQUIRED' USING ERRCODE = '42501';
      END IF;
      IF NEW.moderation_reviewed_by IS NULL OR NEW.moderation_reviewed_by = review_actor THEN
        RAISE EXCEPTION 'AI_INDEPENDENT_VENUE_REVIEWER_REQUIRED' USING ERRCODE = '42501';
      END IF;
      NEW.venue_verified_by := review_actor;
      NEW.venue_verified_at := now();
    ELSE
      NEW.venue_verified_by := NULL;
      NEW.venue_verified_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF NEW.moderation_status <> 'passed'
       OR NEW.venue_validation_status <> 'verified'
       OR NEW.moderation_reviewed_by IS NULL
       OR NEW.venue_verified_by IS NULL
       OR NEW.moderation_reviewed_by = NEW.venue_verified_by THEN
      RAISE EXCEPTION 'AI_INDEPENDENT_REVIEWS_INCOMPLETE' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_proposal_independent_reviews() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_ai_proposal_independent_reviews ON public.ai_event_proposals;
CREATE TRIGGER guard_ai_proposal_independent_reviews
  BEFORE UPDATE ON public.ai_event_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_proposal_independent_reviews();

CREATE OR REPLACE FUNCTION public.guard_ai_proposal_event_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  proposal public.ai_event_proposals%ROWTYPE;
BEGIN
  IF NEW.source_origin <> 'ai_proposal' THEN RETURN NEW; END IF;
  IF NEW.ai_proposal_id IS NULL THEN
    RAISE EXCEPTION 'AI_PROPOSAL_ID_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO proposal FROM public.ai_event_proposals WHERE id = NEW.ai_proposal_id;
  IF NOT FOUND
     OR proposal.status <> 'approved'
     OR proposal.organizer_id IS NULL
     OR proposal.host_responsibility_accepted_at IS NULL
     OR proposal.moderation_status <> 'passed'
     OR proposal.venue_validation_status <> 'verified'
     OR proposal.moderation_reviewed_by IS NULL
     OR proposal.venue_verified_by IS NULL
     OR proposal.moderation_reviewed_by = proposal.venue_verified_by THEN
    RAISE EXCEPTION 'AI_PROPOSAL_PUBLISH_GATES_INCOMPLETE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_proposal_event_publish() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_ai_proposal_event_publish ON public.events;
CREATE TRIGGER guard_ai_proposal_event_publish
  BEFORE INSERT OR UPDATE OF source_origin, ai_proposal_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_proposal_event_publish();

CREATE OR REPLACE FUNCTION public.enqueue_ai_event_generation_job(
  _idempotency_key text,
  _requested_by uuid,
  _request_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.ai_event_generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE result public.ai_event_generation_jobs%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     OR _requested_by IS NULL
     OR NOT public.has_role(_requested_by, 'admin') THEN
    RAISE EXCEPTION 'AI_JOB_ADMIN_SERVICE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 240
     OR pg_column_size(coalesce(_request_metadata, '{}'::jsonb)) > 8192
     OR coalesce(_request_metadata, '{}'::jsonb) ?| ARRAY['member_ids', 'user_ids', 'emails', 'session_ids', 'token', 'secret'] THEN
    RAISE EXCEPTION 'AI_JOB_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ai_event_generation_jobs (idempotency_key, requested_by, request_metadata)
  VALUES (btrim(_idempotency_key), _requested_by, coalesce(_request_metadata, '{}'::jsonb))
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_event_generation_jobs(
  _limit integer DEFAULT 1,
  _lease_seconds integer DEFAULT 120,
  _job_id uuid DEFAULT NULL
)
RETURNS SETOF public.ai_event_generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'AI_JOB_SERVICE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _limit NOT BETWEEN 1 AND 10 OR _lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'AI_JOB_INVALID_CLAIM' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.ai_event_generation_jobs
    WHERE (_job_id IS NULL OR id = _job_id)
      AND (
        (status IN ('queued', 'retry') AND next_attempt_at <= now())
        OR (status = 'running' AND lease_expires_at < now())
      )
      AND attempt_count < max_attempts
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.ai_event_generation_jobs job
  SET status = 'running', attempt_count = job.attempt_count + 1,
      lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => _lease_seconds),
      updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ai_event_generation_job(
  _job_id uuid,
  _lease_token uuid,
  _generation_run_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'AI_JOB_SERVICE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ai_event_generation_jobs
  SET status = 'completed', generation_run_id = _generation_run_id,
      lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL,
      completed_at = now(), updated_at = now()
  WHERE id = _job_id AND status = 'running' AND lease_token = _lease_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_ai_event_generation_job(
  _job_id uuid,
  _lease_token uuid,
  _error_code text,
  _retryable boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE job public.ai_event_generation_jobs%ROWTYPE; next_status text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'AI_JOB_SERVICE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job FROM public.ai_event_generation_jobs
  WHERE id = _job_id AND status = 'running' AND lease_token = _lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI_JOB_LEASE_MISMATCH' USING ERRCODE = '22023'; END IF;
  next_status := CASE WHEN _retryable AND job.attempt_count < job.max_attempts THEN 'retry' ELSE 'dead_letter' END;
  UPDATE public.ai_event_generation_jobs
  SET status = next_status,
      next_attempt_at = CASE WHEN next_status = 'retry'
        THEN now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, job.attempt_count - 1))::integer))
        ELSE next_attempt_at END,
      lease_token = NULL, lease_expires_at = NULL,
      last_error_code = left(coalesce(nullif(btrim(_error_code), ''), 'AI_JOB_FAILED'), 120),
      completed_at = CASE WHEN next_status = 'dead_letter' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = job.id;
  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ai_event_generation_job(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_event_generation_jobs(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ai_event_generation_job(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_ai_event_generation_job(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_event_generation_job(text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_event_generation_jobs(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_event_generation_job(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_ai_event_generation_job(uuid, uuid, text, boolean) TO service_role;

DROP FUNCTION IF EXISTS public.get_ai_event_proposal_outcomes(integer);
CREATE OR REPLACE FUNCTION public.get_ai_event_proposal_outcomes(
  _actor_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  proposal_id uuid, proposal_status text, generation_mode text,
  organizer_accepted boolean, published_event_id uuid,
  going_count bigint, checked_in_count bigint, completed_count bigint, report_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'AI_OUTCOME_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION 'AI_OUTCOME_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.status, p.generation_mode,
    p.host_responsibility_accepted_at IS NOT NULL, p.published_event_id,
    count(ep.id) FILTER (WHERE ep.status = 'going'),
    count(ep.id) FILTER (WHERE ep.status = 'checked_in'),
    count(ep.id) FILTER (WHERE ep.status = 'completed'),
    (SELECT count(*) FROM public.user_reports r
      WHERE r.context_type = 'event' AND r.target_ref = p.published_event_id::text)
  FROM public.ai_event_proposals p
  LEFT JOIN public.event_participants ep ON ep.event_id = p.published_event_id
  GROUP BY p.id
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 100), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_event_proposal_outcomes(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_event_proposal_outcomes(uuid, integer) TO authenticated, service_role;

COMMENT ON TABLE public.ai_event_generation_jobs IS
  'Durable, leased AI proposal-generation jobs with bounded exponential retry and dead-letter state.';
COMMENT ON TABLE public.ai_event_candidate_cache IS
  'Short-lived aggregate-only proposal candidates. Provider activation is external and never implied by cache presence.';
COMMENT ON FUNCTION public.get_ai_event_proposal_outcomes(uuid, integer) IS
  'Admin-only aggregate proposal acceptance, publish, attendance and report outcomes; returns no member identity.';

COMMIT;
