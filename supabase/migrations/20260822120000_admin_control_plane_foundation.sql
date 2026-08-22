-- Prompt 12: capability-based admin control plane and unified operations inbox.
-- Feature flag storage is intentionally owned by Prompt 15 and is not duplicated here.
-- Rollback: revoke Edge/RPC access, stop inbox refresh, export immutable audit evidence,
-- then drop functions/tables in reverse dependency order. Existing legacy admin roles remain.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_capabilities (
  capability_key text PRIMARY KEY CHECK (capability_key ~ '^[a-z_]+\.[a-z_]+$'),
  description text NOT NULL CHECK (length(description) BETWEEN 3 AND 500),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_reason boolean NOT NULL DEFAULT true,
  supports_four_eyes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_role_capabilities (
  role_key text NOT NULL CHECK (role_key IN (
    'support', 'moderator', 'content_ops', 'organizer_ops', 'finance_ops', 'security_admin', 'super_admin'
  )),
  capability_key text NOT NULL REFERENCES public.admin_capabilities(capability_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, capability_key)
);

CREATE TABLE IF NOT EXISTS public.admin_operator_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key IN (
    'support', 'moderator', 'content_ops', 'organizer_ops', 'finance_ops', 'security_admin', 'super_admin'
  )),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  grant_reason text NOT NULL CHECK (length(grant_reason) BETWEEN 3 AND 1000),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS admin_operator_roles_active_idx
  ON public.admin_operator_roles (user_id, role_key) WHERE revoked_at IS NULL;

INSERT INTO public.admin_capabilities (capability_key, description, risk_level, requires_reason, supports_four_eyes) VALUES
  ('health.view', 'View redacted system and provider health summaries', 'low', false, false),
  ('users.search_masked', 'Search bounded masked user profile results with access logging', 'medium', true, false),
  ('users.manage_profile', 'Edit allowlisted non-auth profile fields through safe RPCs', 'high', true, true),
  ('users.suspend', 'Apply or reverse account safety restrictions through moderation workflow', 'critical', true, true),
  ('moderation.manage', 'Triage moderation cases and record policy actions', 'high', true, true),
  ('content.manage', 'Manage event and catalog content', 'high', true, true),
  ('organizers.manage', 'Manage organizer operational state', 'high', true, true),
  ('hubs.manage', 'Manage community hub lifecycle and moderation', 'high', true, true),
  ('ai_proposals.manage', 'Review, assign, approve and publish AI event proposals', 'high', true, true),
  ('notifications.manage', 'Inspect and retry notification delivery operations', 'high', true, true),
  ('providers.manage', 'Operate external provider sync and circuit state', 'high', true, true),
  ('finance.manage', 'Inspect and resolve finance and entitlement exceptions', 'critical', true, true),
  ('feature_flags.manage', 'Change audited feature rollout configuration', 'critical', true, true),
  ('operations.assign', 'Acknowledge and assign operations inbox items', 'medium', true, false),
  ('operations.resolve', 'Resolve or dismiss operations inbox items', 'high', true, false),
  ('audit.view', 'View immutable redacted administrative audit evidence', 'medium', true, false),
  ('security.manage', 'Manage security operations and break-glass reviews', 'critical', true, true),
  ('bulk.destructive', 'Request bounded destructive bulk work with dry-run evidence', 'critical', true, true),
  ('approvals.decide', 'Approve or reject eligible four-eyes requests', 'critical', true, false)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.admin_role_capabilities (role_key, capability_key) VALUES
  ('support', 'health.view'), ('support', 'users.search_masked'), ('support', 'operations.assign'), ('support', 'audit.view'),
  ('moderator', 'health.view'), ('moderator', 'users.search_masked'), ('moderator', 'moderation.manage'),
  ('moderator', 'operations.assign'), ('moderator', 'operations.resolve'), ('moderator', 'audit.view'),
  ('content_ops', 'health.view'), ('content_ops', 'content.manage'), ('content_ops', 'hubs.manage'),
  ('content_ops', 'ai_proposals.manage'), ('content_ops', 'operations.assign'), ('content_ops', 'operations.resolve'), ('content_ops', 'audit.view'),
  ('organizer_ops', 'health.view'), ('organizer_ops', 'users.search_masked'), ('organizer_ops', 'organizers.manage'),
  ('organizer_ops', 'operations.assign'), ('organizer_ops', 'operations.resolve'), ('organizer_ops', 'audit.view'),
  ('finance_ops', 'health.view'), ('finance_ops', 'finance.manage'), ('finance_ops', 'operations.assign'),
  ('finance_ops', 'operations.resolve'), ('finance_ops', 'audit.view'),
  ('security_admin', 'health.view'), ('security_admin', 'users.search_masked'), ('security_admin', 'users.suspend'),
  ('security_admin', 'moderation.manage'), ('security_admin', 'operations.assign'), ('security_admin', 'operations.resolve'),
  ('security_admin', 'audit.view'), ('security_admin', 'security.manage'), ('security_admin', 'approvals.decide')
ON CONFLICT DO NOTHING;
INSERT INTO public.admin_role_capabilities (role_key, capability_key)
SELECT 'super_admin', capability_key FROM public.admin_capabilities ON CONFLICT DO NOTHING;

-- Preserve current admin access while moving new operations to least-privilege capabilities.
INSERT INTO public.admin_operator_roles (user_id, role_key, grant_reason)
SELECT ur.user_id, 'super_admin', 'Legacy admin role compatibility backfill'
FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT (user_id, role_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_has_capability(_user_id uuid, _capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.admin_operator_roles r
    JOIN public.admin_role_capabilities c ON c.role_key = r.role_key
    WHERE r.user_id = _user_id
      AND c.capability_key = _capability_key
      AND r.revoked_at IS NULL
      AND (r.expires_at IS NULL OR r.expires_at > now())
  )
$$;
REVOKE ALL ON FUNCTION public.admin_has_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_has_capability(uuid, text) TO authenticated, service_role;

ALTER TABLE public.admin_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_operator_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators view capability registry" ON public.admin_capabilities
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'health.view'));
CREATE POLICY "Operators view role capability registry" ON public.admin_role_capabilities
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'health.view'));
CREATE POLICY "Operators view own role assignments" ON public.admin_operator_roles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.admin_has_capability(auth.uid(), 'security.manage')
  );
REVOKE INSERT, UPDATE, DELETE ON public.admin_capabilities, public.admin_role_capabilities, public.admin_operator_roles
  FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_snapshot text[] NOT NULL DEFAULT '{}'::text[],
  capability_key text REFERENCES public.admin_capabilities(capability_key) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 120),
  target_type text NOT NULL CHECK (target_type ~ '^[a-z_]{2,80}$'),
  target_id text CHECK (target_id IS NULL OR length(target_id) <= 200),
  before_redacted jsonb,
  after_redacted jsonb,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  approval_request_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('requested', 'approved', 'rejected', 'succeeded', 'failed', 'partial', 'cancelled')),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '7 years'),
  CHECK (before_redacted IS NULL OR pg_column_size(before_redacted) <= 32768),
  CHECK (after_redacted IS NULL OR pg_column_size(after_redacted) <= 32768),
  CHECK (pg_column_size(safe_metadata) <= 16384),
  CHECK (NOT (safe_metadata ?| ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie']))
);
CREATE INDEX IF NOT EXISTS admin_audit_actor_time_idx ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON public.admin_audit_log (target_type, target_id, created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auditors view admin audit" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.admin_has_capability(auth.uid(), 'audit.view'));
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.admin_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  capability_key text NOT NULL REFERENCES public.admin_capabilities(capability_key) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 120),
  target_type text NOT NULL CHECK (target_type ~ '^[a-z_]{2,80}$'),
  target_id text CHECK (target_id IS NULL OR length(target_id) <= 200),
  safe_action_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(safe_action_payload) <= 16384),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'cancelled')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_reason text CHECK (decision_reason IS NULL OR length(decision_reason) <= 1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_at timestamptz,
  executed_at timestamptz,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  CHECK (expires_at > requested_at),
  CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CHECK (NOT (safe_action_payload ?| ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie']))
);
ALTER TABLE public.admin_approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators view relevant approval requests" ON public.admin_approval_requests
  FOR SELECT TO authenticated USING (
    requested_by = auth.uid() OR public.admin_has_capability(auth.uid(), 'approvals.decide')
  );
REVOKE INSERT, UPDATE, DELETE ON public.admin_approval_requests FROM anon, authenticated;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_approval_request_id_fkey
  FOREIGN KEY (approval_request_id) REFERENCES public.admin_approval_requests(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.operations_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain text NOT NULL CHECK (source_domain IN (
    'moderation', 'provider', 'notification', 'ai_proposal', 'sync', 'no_show', 'financial', 'data_quality', 'system'
  )),
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 200),
  dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 3 AND 240),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  safe_summary text NOT NULL CHECK (length(safe_summary) BETWEEN 3 AND 1000),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  sla_target_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'in_progress', 'blocked', 'resolved', 'dismissed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_entities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(related_entities) = 'array' AND pg_column_size(related_entities) <= 16384),
  safe_deep_link text NOT NULL DEFAULT '/admin?tab=operations' CHECK (
    safe_deep_link LIKE '/admin%' AND safe_deep_link NOT LIKE '//%' AND position(E'\\' IN safe_deep_link) = 0 AND length(safe_deep_link) <= 300
  ),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text CHECK (resolution_reason IS NULL OR length(resolution_reason) <= 1000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_inbox_queue_idx
  ON public.operations_inbox_items (state, severity, sla_target_at);
CREATE INDEX IF NOT EXISTS operations_inbox_owner_idx
  ON public.operations_inbox_items (assigned_to, state, sla_target_at);

CREATE TABLE IF NOT EXISTS public.operations_inbox_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.operations_inbox_items(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 120),
  from_state text,
  to_state text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(safe_metadata) <= 8192),
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_inbox_history_item_idx
  ON public.operations_inbox_history (item_id, created_at);

ALTER TABLE public.operations_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_inbox_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators view operations inbox" ON public.operations_inbox_items
  FOR SELECT TO authenticated USING (
    public.admin_has_capability(auth.uid(), 'operations.assign')
    OR public.admin_has_capability(auth.uid(), 'operations.resolve')
  );
CREATE POLICY "Operators view operations history" ON public.operations_inbox_history
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.operations_inbox_items i WHERE i.id = item_id AND (
      public.admin_has_capability(auth.uid(), 'operations.assign')
      OR public.admin_has_capability(auth.uid(), 'operations.resolve')
    )
  ));
CREATE POLICY "Service manages operations inbox" ON public.operations_inbox_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON public.operations_inbox_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.operations_inbox_history FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_record_audit_event(
  _actor_id uuid,
  _capability_key text,
  _action text,
  _target_type text,
  _target_id text,
  _reason text,
  _request_id text,
  _idempotency_key text,
  _outcome text,
  _safe_metadata jsonb DEFAULT '{}'::jsonb,
  _before_redacted jsonb DEFAULT NULL,
  _after_redacted jsonb DEFAULT NULL,
  _approval_request_id uuid DEFAULT NULL,
  _error_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE audit_id uuid; roles text[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_has_capability(_actor_id, _capability_key) THEN
    RAISE EXCEPTION 'Capability required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Reason and idempotency key required' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO audit_id FROM public.admin_audit_log WHERE idempotency_key = _idempotency_key;
  IF audit_id IS NOT NULL THEN RETURN audit_id; END IF;
  SELECT coalesce(array_agg(role_key ORDER BY role_key), '{}'::text[]) INTO roles
  FROM public.admin_operator_roles
  WHERE user_id = _actor_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());
  INSERT INTO public.admin_audit_log (
    actor_id, role_snapshot, capability_key, action, target_type, target_id,
    before_redacted, after_redacted, safe_metadata, reason, request_id,
    idempotency_key, approval_request_id, outcome, error_code
  ) VALUES (
    _actor_id, roles, _capability_key, left(btrim(_action), 120), btrim(_target_type), left(_target_id, 200),
    _before_redacted, _after_redacted,
    coalesce(_safe_metadata, '{}'::jsonb) - ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'],
    left(btrim(_reason), 1000), left(btrim(_request_id), 200), left(btrim(_idempotency_key), 240),
    _approval_request_id, _outcome, left(_error_code, 120)
  ) RETURNING id INTO audit_id;
  RETURN audit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_audit_event(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_audit_event(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_request_approval(
  _actor_id uuid,
  _capability_key text,
  _action text,
  _target_type text,
  _target_id text,
  _safe_action_payload jsonb,
  _reason text,
  _request_id text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE request_uuid uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT public.admin_has_capability(_actor_id, _capability_key) THEN
    RAISE EXCEPTION 'Capability required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 OR pg_column_size(coalesce(_safe_action_payload, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'Invalid approval request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_approval_requests (
    requested_by, capability_key, action, target_type, target_id, safe_action_payload,
    reason, correlation_id, idempotency_key
  ) VALUES (
    _actor_id, _capability_key, left(btrim(_action), 120), btrim(_target_type), left(_target_id, 200),
    coalesce(_safe_action_payload, '{}'::jsonb) - ARRAY['email', 'phone', 'address', 'token', 'secret', 'password', 'authorization', 'cookie'],
    left(btrim(_reason), 1000), gen_random_uuid(), left(btrim(_idempotency_key), 240)
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO request_uuid;
  PERFORM public.admin_record_audit_event(
    _actor_id, _capability_key, 'approval.requested', _target_type, _target_id, _reason,
    _request_id, left(_idempotency_key, 234) || ':audit', 'requested',
    jsonb_build_object('approval_request_id', request_uuid, 'action', _action), NULL, NULL, request_uuid, NULL
  );
  RETURN request_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_approval(
  _approval_request_id uuid,
  _actor_id uuid,
  _approve boolean,
  _reason text,
  _request_id text,
  _idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE approval public.admin_approval_requests%ROWTYPE; next_state text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT public.admin_has_capability(_actor_id, 'approvals.decide') THEN
    RAISE EXCEPTION 'Approval capability required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO approval FROM public.admin_approval_requests WHERE id = _approval_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002'; END IF;
  IF approval.state <> 'pending' OR approval.expires_at <= now() THEN
    RAISE EXCEPTION 'Approval request is not pending' USING ERRCODE = '22023';
  END IF;
  IF approval.requested_by = _actor_id THEN
    RAISE EXCEPTION 'Four-eyes approver must be different' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Decision reason required' USING ERRCODE = '22023'; END IF;
  next_state := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
  UPDATE public.admin_approval_requests SET
    state = next_state, decided_by = _actor_id, decision_reason = left(btrim(_reason), 1000), decided_at = now()
  WHERE id = approval.id;
  PERFORM public.admin_record_audit_event(
    _actor_id, 'approvals.decide', 'approval.' || next_state, approval.target_type, approval.target_id,
    _reason, _request_id, _idempotency_key, next_state,
    jsonb_build_object('approval_request_id', approval.id, 'requested_by', approval.requested_by),
    jsonb_build_object('state', approval.state), jsonb_build_object('state', next_state), approval.id, NULL
  );
  RETURN next_state;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_request_approval(uuid, text, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_approval(uuid, uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_approval(uuid, text, text, text, text, jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_approval(uuid, uuid, boolean, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_operator_role(
  _target_user_id uuid,
  _role_key text,
  _grant boolean,
  _expires_at timestamptz,
  _actor_id uuid,
  _reason text,
  _request_id text,
  _idempotency_key text,
  _approval_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE approval public.admin_approval_requests%ROWTYPE; before_roles text[]; after_roles text[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT public.admin_has_capability(_actor_id, 'security.manage') THEN
    RAISE EXCEPTION 'Security capability required' USING ERRCODE = '42501';
  END IF;
  IF _role_key NOT IN ('support', 'moderator', 'content_ops', 'organizer_ops', 'finance_ops', 'security_admin', 'super_admin')
    OR length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Invalid role change' USING ERRCODE = '22023';
  END IF;
  IF _grant AND _role_key = 'super_admin' AND (_expires_at IS NULL OR _expires_at > now() + interval '4 hours') THEN
    RAISE EXCEPTION 'Super admin is break-glass only and must expire within four hours' USING ERRCODE = '22023';
  END IF;
  IF _grant AND _role_key = 'security_admin' AND (_expires_at IS NULL OR _expires_at > now() + interval '90 days') THEN
    RAISE EXCEPTION 'Security admin grants require an expiry within ninety days' USING ERRCODE = '22023';
  END IF;
  IF _role_key IN ('security_admin', 'super_admin') THEN
    SELECT * INTO approval FROM public.admin_approval_requests WHERE id = _approval_request_id FOR UPDATE;
    IF NOT FOUND OR approval.state <> 'approved' OR approval.expires_at <= now()
      OR approval.requested_by <> _actor_id OR approval.target_id IS DISTINCT FROM _target_user_id::text
      OR approval.action IS DISTINCT FROM (CASE WHEN _grant THEN 'operator_role.grant' ELSE 'operator_role.revoke' END) THEN
      RAISE EXCEPTION 'Matching four-eyes approval required' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT coalesce(array_agg(role_key ORDER BY role_key), '{}'::text[]) INTO before_roles
  FROM public.admin_operator_roles WHERE user_id = _target_user_id AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  IF _grant THEN
    INSERT INTO public.admin_operator_roles (user_id, role_key, granted_by, grant_reason, expires_at, revoked_at, revoked_by, updated_at)
    VALUES (_target_user_id, _role_key, _actor_id, left(btrim(_reason), 1000), _expires_at, NULL, NULL, now())
    ON CONFLICT (user_id, role_key) DO UPDATE SET
      granted_by = EXCLUDED.granted_by, grant_reason = EXCLUDED.grant_reason, expires_at = EXCLUDED.expires_at,
      revoked_at = NULL, revoked_by = NULL, updated_at = now();
  ELSE
    UPDATE public.admin_operator_roles SET revoked_at = now(), revoked_by = _actor_id, updated_at = now()
    WHERE user_id = _target_user_id AND role_key = _role_key AND revoked_at IS NULL;
  END IF;
  IF approval.id IS NOT NULL THEN
    UPDATE public.admin_approval_requests SET state = 'executed', executed_at = now() WHERE id = approval.id;
  END IF;
  SELECT coalesce(array_agg(role_key ORDER BY role_key), '{}'::text[]) INTO after_roles
  FROM public.admin_operator_roles WHERE user_id = _target_user_id AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  PERFORM public.admin_record_audit_event(
    _actor_id, 'security.manage', CASE WHEN _grant THEN 'operator_role.granted' ELSE 'operator_role.revoked' END,
    'admin_operator', _target_user_id::text, _reason, _request_id, _idempotency_key, 'succeeded',
    jsonb_build_object('role_key', _role_key, 'expires_at', _expires_at),
    jsonb_build_object('roles', before_roles), jsonb_build_object('roles', after_roles), approval.id, NULL
  );
  RETURN jsonb_build_object('user_id', _target_user_id, 'roles', after_roles);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_operator_role(uuid, text, boolean, timestamptz, uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_operator_role(uuid, text, boolean, timestamptz, uuid, text, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_operations_inbox_item(
  _source_domain text,
  _source_ref text,
  _dedupe_key text,
  _title text,
  _safe_summary text,
  _severity text,
  _sla_target_at timestamptz,
  _related_entities jsonb DEFAULT '[]'::jsonb,
  _safe_deep_link text DEFAULT '/admin?tab=operations'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE item_id uuid; prior_state text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF _source_domain NOT IN ('moderation', 'provider', 'notification', 'ai_proposal', 'sync', 'no_show', 'financial', 'data_quality', 'system')
    OR _severity NOT IN ('low', 'medium', 'high', 'critical')
    OR _safe_deep_link NOT LIKE '/admin%'
    OR _safe_deep_link LIKE '//%'
    OR position(E'\\' IN _safe_deep_link) > 0 THEN
    RAISE EXCEPTION 'Invalid operations item' USING ERRCODE = '22023';
  END IF;
  SELECT state INTO prior_state FROM public.operations_inbox_items WHERE dedupe_key = _dedupe_key FOR UPDATE;
  INSERT INTO public.operations_inbox_items (
    source_domain, source_ref, dedupe_key, title, safe_summary, severity,
    sla_target_at, related_entities, safe_deep_link
  ) VALUES (
    _source_domain, left(_source_ref, 200), left(_dedupe_key, 240), left(_title, 160),
    left(_safe_summary, 1000), _severity, _sla_target_at, coalesce(_related_entities, '[]'::jsonb), left(_safe_deep_link, 300)
  )
  ON CONFLICT (dedupe_key) DO UPDATE SET
    title = EXCLUDED.title, safe_summary = EXCLUDED.safe_summary, severity = EXCLUDED.severity,
    sla_target_at = LEAST(public.operations_inbox_items.sla_target_at, EXCLUDED.sla_target_at),
    related_entities = EXCLUDED.related_entities, safe_deep_link = EXCLUDED.safe_deep_link,
    last_seen_at = now(), updated_at = now(), version = public.operations_inbox_items.version + 1
  RETURNING id INTO item_id;
  IF prior_state IS NULL THEN
    INSERT INTO public.operations_inbox_history (item_id, action, to_state, safe_metadata)
    VALUES (item_id, 'detected', 'open', jsonb_build_object('source_domain', _source_domain, 'severity', _severity));
  END IF;
  RETURN item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_operations_inbox_item(text, text, text, text, text, text, timestamptz, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_operations_inbox_item(text, text, text, text, text, text, timestamptz, jsonb, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_transition_operations_item(
  _item_id uuid,
  _actor_id uuid,
  _expected_version integer,
  _next_state text,
  _assigned_to uuid,
  _reason text,
  _request_id text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE before_row public.operations_inbox_items%ROWTYPE; after_row public.operations_inbox_items%ROWTYPE; capability text;
BEGIN
  capability := CASE WHEN _next_state IN ('resolved', 'dismissed') THEN 'operations.resolve' ELSE 'operations.assign' END;
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT public.admin_has_capability(_actor_id, capability) THEN
    RAISE EXCEPTION 'Operations capability required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_audit_log WHERE idempotency_key = _idempotency_key) THEN
    SELECT * INTO after_row FROM public.operations_inbox_items WHERE id = _item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operations item not found' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('id', after_row.id, 'state', after_row.state,
      'assigned_to', after_row.assigned_to, 'version', after_row.version, 'idempotent_replay', true);
  END IF;
  SELECT * INTO before_row FROM public.operations_inbox_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operations item not found' USING ERRCODE = 'P0002'; END IF;
  IF before_row.version <> _expected_version THEN RAISE EXCEPTION 'Operations item changed' USING ERRCODE = '40001'; END IF;
  IF NOT (
    (before_row.state = 'open' AND _next_state IN ('acknowledged', 'in_progress', 'dismissed'))
    OR (before_row.state = 'acknowledged' AND _next_state IN ('in_progress', 'blocked', 'resolved', 'dismissed'))
    OR (before_row.state = 'in_progress' AND _next_state IN ('blocked', 'resolved', 'dismissed'))
    OR (before_row.state = 'blocked' AND _next_state IN ('in_progress', 'resolved', 'dismissed'))
    OR (before_row.state IN ('resolved', 'dismissed') AND _next_state = 'open')
  ) THEN RAISE EXCEPTION 'Invalid operations transition' USING ERRCODE = '22023'; END IF;
  IF _assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_operator_roles WHERE user_id = _assigned_to AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
  ) THEN RAISE EXCEPTION 'Assignee is not an active operator' USING ERRCODE = '22023'; END IF;

  UPDATE public.operations_inbox_items SET
    state = _next_state, assigned_to = coalesce(_assigned_to, assigned_to),
    acknowledged_at = CASE WHEN _next_state IN ('acknowledged', 'in_progress') THEN coalesce(acknowledged_at, now()) ELSE acknowledged_at END,
    resolved_at = CASE WHEN _next_state IN ('resolved', 'dismissed') THEN now() WHEN _next_state = 'open' THEN NULL ELSE resolved_at END,
    resolution_reason = CASE WHEN _next_state IN ('resolved', 'dismissed') THEN left(btrim(_reason), 1000) WHEN _next_state = 'open' THEN NULL ELSE resolution_reason END,
    version = version + 1, updated_at = now()
  WHERE id = _item_id RETURNING * INTO after_row;
  INSERT INTO public.operations_inbox_history (item_id, actor_id, action, from_state, to_state, safe_metadata, reason)
  VALUES (_item_id, _actor_id, 'state_transition', before_row.state, after_row.state,
    jsonb_build_object('assigned_to', after_row.assigned_to, 'version', after_row.version), left(btrim(_reason), 1000));
  PERFORM public.admin_record_audit_event(
    _actor_id, capability, 'operations.transition', 'operations_item', _item_id::text,
    _reason, _request_id, _idempotency_key, 'succeeded',
    jsonb_build_object('source_domain', before_row.source_domain),
    jsonb_build_object('state', before_row.state, 'assigned_to', before_row.assigned_to, 'version', before_row.version),
    jsonb_build_object('state', after_row.state, 'assigned_to', after_row.assigned_to, 'version', after_row.version), NULL, NULL
  );
  RETURN jsonb_build_object('id', after_row.id, 'state', after_row.state, 'assigned_to', after_row.assigned_to, 'version', after_row.version);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_transition_operations_item(uuid, uuid, integer, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transition_operations_item(uuid, uuid, integer, text, uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_operations_inbox(_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE row_item record; notification_count integer := 0; ai_count integer := 0; provider_count integer := 0;
  no_show_count integer := 0; moderation_count integer := 0; financial_count integer := 0; data_quality_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF _limit NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid refresh limit' USING ERRCODE = '22023'; END IF;

  FOR row_item IN
    SELECT id, channel, delivery_status, last_error_code, created_at
    FROM public.notifications
    WHERE delivery_status IN ('failed', 'dead_letter')
    ORDER BY CASE delivery_status WHEN 'dead_letter' THEN 0 ELSE 1 END, created_at
    LIMIT _limit
  LOOP
    PERFORM public.upsert_operations_inbox_item(
      'notification', row_item.id::text, 'notification:' || row_item.id::text,
      'Notification delivery needs attention',
      'Channel: ' || row_item.channel || '; state: ' || row_item.delivery_status || '; error code: ' || coalesce(row_item.last_error_code, 'unknown'),
      CASE WHEN row_item.delivery_status = 'dead_letter' THEN 'critical' ELSE 'high' END,
      row_item.created_at + CASE WHEN row_item.delivery_status = 'dead_letter' THEN interval '1 hour' ELSE interval '4 hours' END,
      jsonb_build_array(jsonb_build_object('type', 'notification', 'id', row_item.id)), '/admin?tab=operations'
    );
    notification_count := notification_count + 1;
  END LOOP;

  FOR row_item IN
    SELECT id, source_event_id, candidate_event_id, confidence, created_at
    FROM public.external_event_dedupe_reviews
    WHERE review_state = 'pending'
    ORDER BY confidence DESC, created_at LIMIT _limit
  LOOP
    PERFORM public.upsert_operations_inbox_item(
      'data_quality', row_item.id::text, 'external-dedupe-review:' || row_item.id::text,
      'External event duplicate needs review',
      'A duplicate candidate requires human review; confidence: ' || round(row_item.confidence * 100, 1) || '%.',
      CASE WHEN row_item.confidence >= 0.9 THEN 'high' ELSE 'medium' END,
      row_item.created_at + interval '72 hours',
      jsonb_build_array(
        jsonb_build_object('type', 'external_event', 'id', row_item.source_event_id),
        jsonb_build_object('type', 'external_event', 'id', row_item.candidate_event_id)
      ), '/admin?tab=eventbrite'
    );
    data_quality_count := data_quality_count + 1;
  END LOOP;

  FOR row_item IN
    SELECT id, status, created_at FROM public.ai_event_proposals
    WHERE (status = 'draft' AND created_at < now() - interval '48 hours')
       OR (status = 'review' AND updated_at < now() - interval '48 hours')
       OR (status = 'approved' AND updated_at < now() - interval '24 hours')
    ORDER BY created_at LIMIT _limit
  LOOP
    PERFORM public.upsert_operations_inbox_item(
      'ai_proposal', row_item.id::text, 'ai-proposal-stalled:' || row_item.id::text,
      'AI event proposal is stalled', 'Proposal state: ' || row_item.status || '; no automatic publishing occurred.',
      CASE WHEN row_item.status = 'approved' THEN 'high' ELSE 'medium' END,
      row_item.created_at + CASE WHEN row_item.status = 'approved' THEN interval '48 hours' ELSE interval '72 hours' END,
      jsonb_build_array(jsonb_build_object('type', 'ai_event_proposal', 'id', row_item.id)), '/admin?tab=auto-events'
    );
    ai_count := ai_count + 1;
  END LOOP;

  FOR row_item IN
    SELECT id, provider, status, error_kind, error_code, started_at
    FROM public.external_provider_sync_runs
    WHERE status IN ('failed', 'dead_letter') AND started_at > now() - interval '30 days'
    ORDER BY started_at DESC LIMIT _limit
  LOOP
    PERFORM public.upsert_operations_inbox_item(
      'provider', row_item.id::text, 'provider-run:' || row_item.id::text,
      'External provider sync failed',
      'Provider: ' || row_item.provider || '; state: ' || row_item.status || '; error: ' || coalesce(row_item.error_kind, row_item.error_code, 'unknown'),
      CASE WHEN row_item.status = 'dead_letter' THEN 'critical' ELSE 'high' END,
      row_item.started_at + CASE WHEN row_item.status = 'dead_letter' THEN interval '1 hour' ELSE interval '4 hours' END,
      jsonb_build_array(jsonb_build_object('type', 'provider_run', 'id', row_item.id)), '/admin?tab=eventbrite'
    );
    provider_count := provider_count + 1;
  END LOOP;

  FOR row_item IN
    SELECT e.id,
      count(*) FILTER (WHERE ep.status = 'no_show') AS no_shows,
      count(*) FILTER (WHERE ep.status IN ('checked_in', 'completed', 'no_show')) AS outcomes,
      max(e.event_date) AS event_date
    FROM public.events e JOIN public.event_participants ep ON ep.event_id = e.id
    WHERE e.event_date >= current_date - 30
    GROUP BY e.id
    HAVING count(*) FILTER (WHERE ep.status IN ('checked_in', 'completed', 'no_show')) >= 5
      AND count(*) FILTER (WHERE ep.status = 'no_show')::numeric
        / count(*) FILTER (WHERE ep.status IN ('checked_in', 'completed', 'no_show')) >= 0.4
    ORDER BY event_date DESC LIMIT _limit
  LOOP
    PERFORM public.upsert_operations_inbox_item(
      'no_show', row_item.id::text, 'high-no-show:' || row_item.id::text,
      'Event has a high no-show rate',
      row_item.no_shows || ' no-shows among ' || row_item.outcomes || ' recorded attendance outcomes; human review only.',
      'medium', now() + interval '3 days', jsonb_build_array(jsonb_build_object('type', 'event', 'id', row_item.id)), '/admin?tab=events'
    );
    no_show_count := no_show_count + 1;
  END LOOP;

  IF to_regclass('public.moderation_cases') IS NOT NULL THEN
    FOR row_item IN EXECUTE $query$
      SELECT id, status, severity, created_at FROM public.moderation_cases
      WHERE status NOT IN ('closed', 'actioned') ORDER BY created_at LIMIT $1
    $query$ USING _limit
    LOOP
      PERFORM public.upsert_operations_inbox_item(
        'moderation', row_item.id::text, 'moderation-case:' || row_item.id::text,
        'Moderation case awaiting review', 'Case state: ' || row_item.status || '; severity: ' || row_item.severity,
        row_item.severity, row_item.created_at + CASE row_item.severity
          WHEN 'critical' THEN interval '1 hour' WHEN 'high' THEN interval '4 hours' WHEN 'medium' THEN interval '24 hours' ELSE interval '72 hours' END,
        jsonb_build_array(jsonb_build_object('type', 'moderation_case', 'id', row_item.id)), '/admin?tab=moderation'
      );
      moderation_count := moderation_count + 1;
    END LOOP;
  END IF;

  IF to_regclass('public.financial_exception_queue') IS NOT NULL THEN
    FOR row_item IN EXECUTE $query$
      SELECT id, kind, severity, state, created_at FROM public.financial_exception_queue
      WHERE state IN ('open', 'investigating') ORDER BY created_at LIMIT $1
    $query$ USING _limit
    LOOP
      PERFORM public.upsert_operations_inbox_item(
        'financial', row_item.id::text, 'financial-exception:' || row_item.id::text,
        'Financial exception awaiting review', 'Exception kind: ' || row_item.kind || '; state: ' || row_item.state,
        row_item.severity, row_item.created_at + CASE row_item.severity
          WHEN 'critical' THEN interval '1 hour' WHEN 'high' THEN interval '4 hours' WHEN 'medium' THEN interval '24 hours' ELSE interval '72 hours' END,
        jsonb_build_array(jsonb_build_object('type', 'financial_exception', 'id', row_item.id)), '/admin?tab=operations'
      );
      financial_count := financial_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'notifications', notification_count, 'ai_proposals', ai_count, 'providers', provider_count,
    'high_no_show_events', no_show_count, 'moderation', moderation_count, 'financial', financial_count,
    'data_quality', data_quality_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_operations_inbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_operations_inbox(integer) TO service_role;

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable, redacted evidence for privileged operations. Secrets and unnecessary PII are prohibited.';
COMMENT ON TABLE public.operations_inbox_items IS
  'Unified operational signals with severity, SLA, owner, state, safe relations and internal deep links.';
COMMENT ON TABLE public.admin_approval_requests IS
  'Optional four-eyes foundation. Approval alone never executes a domain mutation.';

COMMIT;
