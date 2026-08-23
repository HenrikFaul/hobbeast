-- Prompt 12: capability, four-eyes, exact-target, idempotency and partial-job
-- regression for the hardened admin bulk user control plane.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('12000000-0000-4000-8000-000000000001'),
  ('12000000-0000-4000-8000-000000000002'),
  ('12000000-0000-4000-8000-000000000003'),
  ('12000000-0000-4000-8000-000000000004'),
  ('12000000-0000-4000-8000-000000000005')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, user_origin, is_active)
VALUES
  ('12000000-0000-4000-8000-000000000001', 'Bulk requester', 'real', true),
  ('12000000-0000-4000-8000-000000000002', 'Four eyes approver', 'real', true),
  ('12000000-0000-4000-8000-000000000003', 'Protected real target', 'real', true),
  ('12000000-0000-4000-8000-000000000004', 'Generated target A', 'generated', true),
  ('12000000-0000-4000-8000-000000000005', 'Generated target B', 'generated', true)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active;

INSERT INTO public.admin_operator_roles (user_id, role_key, grant_reason)
VALUES
  ('12000000-0000-4000-8000-000000000001', 'super_admin', 'SQL bulk-control fixture requester'),
  ('12000000-0000-4000-8000-000000000002', 'security_admin', 'SQL bulk-control fixture approver')
ON CONFLICT (user_id, role_key) DO UPDATE
SET revoked_at = NULL,
    expires_at = NULL,
    grant_reason = EXCLUDED.grant_reason;

DO $structural$
BEGIN
  IF has_function_privilege('authenticated', 'public.admin_create_bulk_user_job(uuid,text,uuid[],jsonb,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_mark_bulk_user_job_item(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_finalize_bulk_user_job(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated browser retained direct bulk-job mutation privileges';
  END IF;
END
$structural$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $bulk_contract$
DECLARE
  requester constant uuid := '12000000-0000-4000-8000-000000000001';
  approver constant uuid := '12000000-0000-4000-8000-000000000002';
  real_target constant uuid := '12000000-0000-4000-8000-000000000003';
  generated_a constant uuid := '12000000-0000-4000-8000-000000000004';
  generated_b constant uuid := '12000000-0000-4000-8000-000000000005';
  targets uuid[] := ARRAY[
    '12000000-0000-4000-8000-000000000004'::uuid,
    '12000000-0000-4000-8000-000000000005'::uuid
  ];
  digest text;
  approval_id uuid;
  job_id uuid;
  replay_job_id uuid;
  final_result jsonb;
  failed boolean;
BEGIN
  failed := false;
  BEGIN
    PERFORM public.admin_create_bulk_user_job(
      requester, 'delete', ARRAY[real_target], '{}'::jsonb,
      'Real-user deletion must be rejected', 'bulk-real-deny-request',
      'bulk-real-deny-idempotency', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Real user was accepted by bulk deletion'; END IF;

  digest := public.admin_bulk_target_digest(targets);
  approval_id := public.admin_request_approval(
    requester,
    'bulk.destructive',
    'bulk_users.delete',
    'user_batch',
    digest,
    jsonb_build_object('target_count', 2, 'target_digest', digest, 'generated_only', true),
    'Generated fixture cleanup',
    'bulk-approval-request-0001',
    'bulk-approval-idempotency-0001'
  );

  failed := false;
  BEGIN
    PERFORM public.admin_decide_approval(
      approval_id, requester, true, 'Self approval must fail',
      'bulk-self-approval-request', 'bulk-self-approval-idempotency'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Requester approved their own destructive job'; END IF;

  PERFORM public.admin_decide_approval(
    approval_id, approver, true, 'Independent generated cleanup approval',
    'bulk-four-eyes-request', 'bulk-four-eyes-idempotency'
  );

  job_id := public.admin_create_bulk_user_job(
    requester, 'delete', targets,
    jsonb_build_object('userType', 'generated', 'hasOpenOwnedEvents', 'no'),
    'Generated fixture cleanup', 'bulk-job-request-0001',
    'bulk-job-idempotency-0001', approval_id
  );
  replay_job_id := public.admin_create_bulk_user_job(
    requester, 'delete', targets,
    jsonb_build_object('userType', 'generated', 'hasOpenOwnedEvents', 'no'),
    'Generated fixture cleanup replay', 'bulk-job-request-0002',
    'bulk-job-idempotency-0001', approval_id
  );
  IF job_id IS NULL OR replay_job_id <> job_id THEN
    RAISE EXCEPTION 'Bulk job create did not replay idempotently';
  END IF;

  PERFORM public.admin_mark_bulk_user_job_item(
    job_id, generated_a, 'succeeded', NULL,
    jsonb_build_object('auth_deleted', true, 'deletion_evidence_recorded', true)
  );
  PERFORM public.admin_mark_bulk_user_job_item(
    job_id, generated_b, 'failed', 'RETENTION_DEPENDENCY_BLOCKED', '{}'::jsonb
  );
  final_result := public.admin_finalize_bulk_user_job(job_id);

  IF final_result->>'status' <> 'partial'
     OR (final_result->>'affected')::integer <> 1
     OR (final_result->>'failures')::integer <> 1
     OR (final_result->>'rollback_supported')::boolean THEN
    RAISE EXCEPTION 'Partial destructive job summary is incorrect: %', final_result;
  END IF;
END
$bulk_contract$;

RESET ROLE;

DO $audit_proof$
BEGIN
  IF (
    SELECT state FROM public.admin_approval_requests
    WHERE idempotency_key = 'bulk-approval-idempotency-0001'
  ) <> 'executed' THEN
    RAISE EXCEPTION 'Four-eyes approval was not consumed exactly once';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_audit_log
    WHERE idempotency_key = 'bulk-final:' || (
      SELECT id::text FROM public.admin_bulk_user_jobs
      WHERE idempotency_key = 'bulk-job-idempotency-0001'
    )
      AND outcome = 'partial'
      AND capability_key = 'bulk.destructive'
      AND approval_request_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Immutable partial bulk audit evidence is missing';
  END IF;
END
$audit_proof$;

ROLLBACK;
