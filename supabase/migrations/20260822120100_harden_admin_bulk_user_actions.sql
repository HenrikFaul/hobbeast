-- Prompt 12 remediation: replace unaudited legacy bulk mutations with a
-- bounded, idempotent job ledger. Destructive deletion is generated-user only
-- and consumes a separate four-eyes approval bound to the exact target set.
-- Rollback: stop the Edge entrypoint, retain/export the immutable job/audit
-- evidence, then drop the functions followed by the two job tables.

BEGIN;

CREATE TABLE public.admin_bulk_user_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('activate', 'deactivate', 'delete')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  target_count integer NOT NULL CHECK (target_count BETWEEN 1 AND 500),
  target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{32}$'),
  target_filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(target_filter_snapshot) = 'object' AND pg_column_size(target_filter_snapshot) <= 8192),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  approval_request_id uuid REFERENCES public.admin_approval_requests(id) ON DELETE RESTRICT,
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  rollback_supported boolean NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (target_filter_snapshot ?| ARRAY[
    'email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'
  ])),
  CHECK (
    (action = 'delete' AND approval_request_id IS NOT NULL AND NOT rollback_supported)
    OR (action IN ('activate', 'deactivate') AND approval_request_id IS NULL AND rollback_supported)
  )
);

CREATE INDEX admin_bulk_user_jobs_actor_time_idx
  ON public.admin_bulk_user_jobs (actor_id, created_at DESC);
CREATE INDEX admin_bulk_user_jobs_status_idx
  ON public.admin_bulk_user_jobs (status, created_at);

CREATE TABLE public.admin_bulk_user_job_items (
  job_id uuid NOT NULL REFERENCES public.admin_bulk_user_jobs(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL,
  target_profile_id uuid,
  target_origin text NOT NULL CHECK (target_origin IN ('real', 'generated', 'unknown')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{3,120}$'),
  before_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(before_redacted) = 'object' AND pg_column_size(before_redacted) <= 4096),
  after_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(after_redacted) = 'object' AND pg_column_size(after_redacted) <= 4096),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, target_user_id),
  CHECK (NOT (before_redacted ?| ARRAY[
    'email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'
  ])),
  CHECK (NOT (after_redacted ?| ARRAY[
    'email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'
  ]))
);

CREATE INDEX admin_bulk_user_job_items_progress_idx
  ON public.admin_bulk_user_job_items (job_id, status, updated_at);

ALTER TABLE public.admin_bulk_user_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bulk_user_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bulk operators view their jobs"
ON public.admin_bulk_user_jobs FOR SELECT TO authenticated
USING (
  actor_id = auth.uid()
  OR public.admin_has_capability(auth.uid(), 'audit.view')
);

CREATE POLICY "Bulk operators view job items"
ON public.admin_bulk_user_job_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.admin_bulk_user_jobs job
  WHERE job.id = job_id
    AND (
      job.actor_id = auth.uid()
      OR public.admin_has_capability(auth.uid(), 'audit.view')
    )
));

REVOKE ALL ON public.admin_bulk_user_jobs, public.admin_bulk_user_job_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_bulk_user_jobs, public.admin_bulk_user_job_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_bulk_user_jobs, public.admin_bulk_user_job_items TO service_role;

CREATE OR REPLACE FUNCTION public.admin_bulk_target_digest(_target_user_ids uuid[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT md5(coalesce(string_agg(DISTINCT target_id::text, ',' ORDER BY target_id::text), ''))
  FROM unnest(coalesce(_target_user_ids, '{}'::uuid[])) AS target_id
  WHERE target_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_target_digest(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_target_digest(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_bulk_user_job(
  _actor_id uuid,
  _action text,
  _target_user_ids uuid[],
  _target_filter_snapshot jsonb,
  _reason text,
  _request_id text,
  _idempotency_key text,
  _approval_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_targets uuid[];
  target_total integer;
  target_key text;
  required_capability text;
  existing_job public.admin_bulk_user_jobs%ROWTYPE;
  approval public.admin_approval_requests%ROWTYPE;
  job_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('activate', 'deactivate', 'delete')
     OR length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 1000
     OR length(btrim(coalesce(_request_id, ''))) NOT BETWEEN 8 AND 200
     OR length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 240
     OR jsonb_typeof(coalesce(_target_filter_snapshot, '{}'::jsonb)) <> 'object'
     OR pg_column_size(coalesce(_target_filter_snapshot, '{}'::jsonb)) > 8192 THEN
    RAISE EXCEPTION 'Invalid bulk job contract' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT target_id ORDER BY target_id)
    INTO normalized_targets
  FROM unnest(coalesce(_target_user_ids, '{}'::uuid[])) AS target_id
  WHERE target_id IS NOT NULL;
  target_total := coalesce(cardinality(normalized_targets), 0);
  IF target_total NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Bulk target count must be between 1 and 500' USING ERRCODE = '22023';
  END IF;
  IF target_total <> cardinality(_target_user_ids) THEN
    RAISE EXCEPTION 'Bulk targets must be unique and non-null' USING ERRCODE = '22023';
  END IF;
  target_key := public.admin_bulk_target_digest(normalized_targets);
  IF _actor_id = ANY(normalized_targets) THEN
    RAISE EXCEPTION 'Operators cannot target themselves in bulk' USING ERRCODE = '42501';
  END IF;

  required_capability := CASE WHEN _action = 'delete' THEN 'bulk.destructive' ELSE 'users.suspend' END;
  IF NOT public.admin_has_capability(_actor_id, required_capability) THEN
    RAISE EXCEPTION 'Bulk capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_job
  FROM public.admin_bulk_user_jobs
  WHERE idempotency_key = btrim(_idempotency_key);
  IF FOUND THEN
    IF existing_job.actor_id <> _actor_id
       OR existing_job.action <> _action
       OR existing_job.target_count <> target_total
       OR existing_job.target_digest <> target_key THEN
      RAISE EXCEPTION 'Idempotency key reused for a different job' USING ERRCODE = '22023';
    END IF;
    RETURN existing_job.id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.profiles
    WHERE user_id = ANY(normalized_targets)
  ) <> target_total THEN
    RAISE EXCEPTION 'Every target must resolve to one profile' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_operator_roles role
    WHERE role.user_id = ANY(normalized_targets)
      AND role.revoked_at IS NULL
      AND (role.expires_at IS NULL OR role.expires_at > now())
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles legacy_role
    WHERE legacy_role.user_id = ANY(normalized_targets)
      AND legacy_role.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Active operators cannot be bulk targets' USING ERRCODE = '42501';
  END IF;

  IF _action = 'delete' THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.user_id = ANY(normalized_targets)
        AND coalesce(profile.user_origin, 'unknown') <> 'generated'
    ) THEN
      RAISE EXCEPTION 'Bulk deletion is restricted to generated users' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO approval
    FROM public.admin_approval_requests
    WHERE id = _approval_request_id
    FOR UPDATE;
    IF NOT FOUND
       OR approval.state <> 'approved'
       OR approval.expires_at <= now()
       OR approval.requested_by <> _actor_id
       OR approval.capability_key <> 'bulk.destructive'
       OR approval.action <> 'bulk_users.delete'
       OR approval.target_type <> 'user_batch'
       OR approval.target_id IS DISTINCT FROM target_key
       OR approval.safe_action_payload->>'target_digest' IS DISTINCT FROM target_key
       OR approval.safe_action_payload->>'target_count' IS DISTINCT FROM target_total::text THEN
      RAISE EXCEPTION 'Matching four-eyes approval required' USING ERRCODE = '42501';
    END IF;
    UPDATE public.admin_approval_requests
    SET state = 'executed', executed_at = now()
    WHERE id = approval.id;
  ELSIF _approval_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'Approval is only accepted for destructive bulk deletion' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_bulk_user_jobs (
    actor_id, action, status, target_count, target_digest,
    target_filter_snapshot, reason, request_id, idempotency_key,
    approval_request_id, rollback_supported, started_at
  ) VALUES (
    _actor_id, _action, 'running', target_total, target_key,
    coalesce(_target_filter_snapshot, '{}'::jsonb), left(btrim(_reason), 1000),
    left(btrim(_request_id), 200), left(btrim(_idempotency_key), 240),
    _approval_request_id, _action <> 'delete', now()
  )
  RETURNING id INTO job_id;

  INSERT INTO public.admin_bulk_user_job_items (
    job_id, target_user_id, target_profile_id, target_origin,
    before_redacted, started_at
  )
  SELECT
    job_id,
    profile.user_id,
    profile.id,
    CASE WHEN profile.user_origin IN ('real', 'generated') THEN profile.user_origin ELSE 'unknown' END,
    jsonb_build_object('is_active', coalesce(profile.is_active, true), 'origin', coalesce(profile.user_origin, 'unknown')),
    now()
  FROM public.profiles profile
  WHERE profile.user_id = ANY(normalized_targets);

  PERFORM public.admin_record_audit_event(
    _actor_id,
    required_capability,
    'bulk_users.started',
    'user_batch',
    target_key,
    _reason,
    _request_id,
    left(_idempotency_key, 226) || ':start',
    'requested',
    jsonb_build_object('job_id', job_id, 'action', _action, 'target_count', target_total, 'target_digest', target_key),
    NULL,
    NULL,
    _approval_request_id,
    NULL
  );

  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_bulk_user_job_item(
  _job_id uuid,
  _target_user_id uuid,
  _status text,
  _error_code text DEFAULT NULL,
  _after_redacted jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('succeeded', 'failed', 'skipped')
     OR (_status = 'failed' AND coalesce(_error_code, '') !~ '^[A-Z0-9_]{3,120}$')
     OR jsonb_typeof(coalesce(_after_redacted, '{}'::jsonb)) <> 'object'
     OR pg_column_size(coalesce(_after_redacted, '{}'::jsonb)) > 4096 THEN
    RAISE EXCEPTION 'Invalid bulk item result' USING ERRCODE = '22023';
  END IF;

  UPDATE public.admin_bulk_user_job_items
  SET status = _status,
      attempts = attempts + 1,
      error_code = CASE WHEN _status = 'failed' THEN _error_code ELSE NULL END,
      after_redacted = coalesce(_after_redacted, '{}'::jsonb)
        - ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'],
      completed_at = now(),
      updated_at = now()
  WHERE job_id = _job_id
    AND target_user_id = _target_user_id
    AND status IN ('pending', 'running', 'failed');

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.admin_bulk_user_job_items
      WHERE job_id = _job_id AND target_user_id = _target_user_id AND status = _status
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Bulk job item not mutable' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finalize_bulk_user_job(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job public.admin_bulk_user_jobs%ROWTYPE;
  success_total integer;
  failure_total integer;
  unfinished_total integer;
  final_status text;
  required_capability text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job FROM public.admin_bulk_user_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulk job not found' USING ERRCODE = 'P0002';
  END IF;
  IF job.status IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'job_id', job.id, 'status', job.status, 'affected', job.affected_count,
      'failures', job.failure_count, 'target_count', job.target_count,
      'rollback_supported', job.rollback_supported
    );
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'succeeded'),
    count(*) FILTER (WHERE status IN ('failed', 'skipped')),
    count(*) FILTER (WHERE status IN ('pending', 'running'))
  INTO success_total, failure_total, unfinished_total
  FROM public.admin_bulk_user_job_items
  WHERE job_id = _job_id;

  IF unfinished_total > 0 THEN
    RAISE EXCEPTION 'Bulk job still has unfinished items' USING ERRCODE = '55000';
  END IF;
  final_status := CASE
    WHEN success_total = 0 AND failure_total > 0 THEN 'failed'
    WHEN failure_total > 0 THEN 'partial'
    ELSE 'completed'
  END;
  required_capability := CASE WHEN job.action = 'delete' THEN 'bulk.destructive' ELSE 'users.suspend' END;

  UPDATE public.admin_bulk_user_jobs
  SET status = final_status,
      affected_count = success_total,
      failure_count = failure_total,
      completed_at = now(),
      updated_at = now()
  WHERE id = job.id;

  PERFORM public.admin_record_audit_event(
    job.actor_id,
    required_capability,
    'bulk_users.' || final_status,
    'user_batch',
    job.target_digest,
    job.reason,
    job.request_id,
    'bulk-final:' || job.id::text,
    CASE WHEN final_status = 'completed' THEN 'succeeded' WHEN final_status = 'partial' THEN 'partial' ELSE 'failed' END,
    jsonb_build_object(
      'job_id', job.id, 'action', job.action, 'target_count', job.target_count,
      'affected', success_total, 'failures', failure_total, 'target_digest', job.target_digest,
      'rollback_supported', job.rollback_supported
    ),
    NULL,
    NULL,
    job.approval_request_id,
    CASE WHEN failure_total > 0 THEN 'BULK_ITEM_FAILURES' ELSE NULL END
  );

  RETURN jsonb_build_object(
    'job_id', job.id, 'status', final_status, 'affected', success_total,
    'failures', failure_total, 'target_count', job.target_count,
    'rollback_supported', job.rollback_supported
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_bulk_user_job(
  _actor_id uuid,
  _job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job public.admin_bulk_user_jobs%ROWTYPE;
  items jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job FROM public.admin_bulk_user_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bulk job not found' USING ERRCODE = 'P0002'; END IF;
  IF job.actor_id <> _actor_id AND NOT public.admin_has_capability(_actor_id, 'audit.view') THEN
    RAISE EXCEPTION 'Bulk job access denied' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'target_user_id', item.target_user_id,
    'status', item.status,
    'attempts', item.attempts,
    'error_code', item.error_code,
    'updated_at', item.updated_at
  ) ORDER BY item.target_user_id), '[]'::jsonb)
  INTO items
  FROM public.admin_bulk_user_job_items item
  WHERE item.job_id = job.id;

  RETURN jsonb_build_object(
    'job_id', job.id,
    'action', job.action,
    'status', job.status,
    'target_count', job.target_count,
    'target_digest', job.target_digest,
    'affected', job.affected_count,
    'failures', job.failure_count,
    'rollback_supported', job.rollback_supported,
    'created_at', job.created_at,
    'completed_at', job.completed_at,
    'items', items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_bulk_user_job(uuid, text, uuid[], jsonb, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_mark_bulk_user_job_item(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_finalize_bulk_user_job(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_bulk_user_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_create_bulk_user_job(uuid, text, uuid[], jsonb, text, text, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_bulk_user_job_item(uuid, uuid, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_bulk_user_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_bulk_user_job(uuid, uuid) TO service_role;

COMMENT ON TABLE public.admin_bulk_user_jobs IS
  'PII-minimized immutable-context ledger for bounded, resumable, audited admin user bulk jobs.';
COMMENT ON TABLE public.admin_bulk_user_job_items IS
  'Per-target progress and normalized error evidence; never stores contact or credential data.';

COMMIT;
