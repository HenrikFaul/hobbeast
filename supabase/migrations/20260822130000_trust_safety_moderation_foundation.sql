-- Prompt 13: trust, safety, moderation and privacy foundation.
-- Append-only migration. This source file is NOT evidence that the migration
-- has been applied to any hosted project.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_safety_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'moderator'),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.is_safety_reviewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_safety_reviewer(uuid) TO authenticated, service_role;

-- `user_blocks` is canonical in 20260822030100. Prompt 13 extends its
-- enforcement boundary instead of creating a parallel block model.
DROP POLICY IF EXISTS "Safety reviewers view blocks" ON public.user_blocks;
CREATE POLICY "Safety reviewers view blocks"
ON public.user_blocks FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_blocked_between(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_a IS NULL OR _user_b IS NULL OR _user_a = _user_b THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_blocks b
      WHERE (b.blocker_id = _user_a AND b.blocked_id = _user_b)
         OR (b.blocker_id = _user_b AND b.blocked_id = _user_a)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated, service_role;

-- `user_reports` is canonical in 20260822030100. Expand it in place so the
-- premium taxonomy and idempotent intake share one reporter-private ledger.
ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS target_ref text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS source_surface text NOT NULL DEFAULT 'consumer',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS retention_until timestamptz NOT NULL DEFAULT (now() + interval '730 days'),
  ADD COLUMN IF NOT EXISTS redacted_at timestamptz;

UPDATE public.user_reports
SET target_ref = COALESCE(context_id::text, reported_user_id::text, 'legacy:' || id::text)
WHERE target_ref IS NULL;

ALTER TABLE public.user_reports ALTER COLUMN target_ref SET NOT NULL;
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_context_type_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_context_type_check
  CHECK (context_type IN ('profile', 'user', 'event', 'organizer', 'circle', 'hub', 'message', 'content', 'other'));
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_category_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_category_check
  CHECK (category IN (
    'harassment', 'hate', 'sexual_misconduct', 'fraud_scam', 'unsafe_event',
    'unsafe_behavior', 'impersonation', 'underage_concern', 'privacy_exposure',
    'privacy', 'spam', 'prohibited_commercial_behavior',
    'self_harm_emergency_routing', 'other'
  ));
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_status_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_status_check
  CHECK (status IN (
    'submitted', 'received', 'triaged', 'investigating', 'actioned', 'appealed',
    'closed', 'resolved', 'dismissed'
  ));
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_severity_check
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_target_ref_length
  CHECK (char_length(target_ref) BETWEEN 1 AND 200);
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_details_length
  CHECK (details IS NULL OR char_length(details) <= 1000) NOT VALID;

CREATE UNIQUE INDEX user_reports_reporter_idempotency_idx
  ON public.user_reports (reporter_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX user_reports_safety_queue_idx ON public.user_reports (severity, created_at);
CREATE INDEX user_reports_target_ref_idx ON public.user_reports (context_type, target_ref);

CREATE OR REPLACE FUNCTION public.normalize_user_report_safety_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.target_ref := COALESCE(
    NULLIF(trim(NEW.target_ref), ''),
    NEW.context_id::text,
    NEW.reported_user_id::text,
    'report:' || NEW.id::text
  );
  NEW.details := NULLIF(left(trim(COALESCE(NEW.details, '')), 1000), '');
  NEW.severity := CASE
    WHEN NEW.category IN ('sexual_misconduct', 'underage_concern', 'self_harm_emergency_routing') THEN 'critical'
    WHEN NEW.category IN ('hate', 'fraud_scam', 'unsafe_event', 'unsafe_behavior', 'privacy_exposure', 'privacy') THEN 'high'
    WHEN NEW.category = 'spam' THEN 'low'
    ELSE COALESCE(NEW.severity, 'medium')
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_user_report_before_write
BEFORE INSERT OR UPDATE ON public.user_reports
FOR EACH ROW EXECUTE FUNCTION public.normalize_user_report_safety_fields();

DROP POLICY IF EXISTS "Admins manage reports" ON public.user_reports;
DROP POLICY IF EXISTS "Safety reviewers manage reports" ON public.user_reports;
CREATE POLICY "Safety reviewers read reports"
ON public.user_reports FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.user_reports FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_safety_report(
  _reported_user_id uuid,
  _target_type text,
  _target_ref text,
  _reason_code text,
  _details text,
  _source_surface text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_id uuid;
  context_id_value uuid;
  derived_severity text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _reported_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot report yourself' USING ERRCODE = '22023';
  END IF;
  IF _target_type NOT IN ('user', 'event', 'organizer', 'message', 'content') THEN
    RAISE EXCEPTION 'unsupported report target' USING ERRCODE = '22023';
  END IF;
  IF _reason_code NOT IN (
    'harassment', 'hate', 'sexual_misconduct', 'fraud_scam', 'unsafe_event',
    'impersonation', 'underage_concern', 'privacy_exposure', 'spam',
    'prohibited_commercial_behavior', 'self_harm_emergency_routing', 'other'
  ) THEN
    RAISE EXCEPTION 'unsupported report reason' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(COALESCE(_target_ref, ''))) NOT BETWEEN 1 AND 200
     OR char_length(trim(COALESCE(_idempotency_key, ''))) NOT BETWEEN 8 AND 128
     OR char_length(trim(COALESCE(_details, ''))) > 1000 THEN
    RAISE EXCEPTION 'invalid report payload' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO report_id
  FROM public.user_reports
  WHERE reporter_id = auth.uid() AND idempotency_key = _idempotency_key;
  IF report_id IS NOT NULL THEN RETURN report_id; END IF;

  IF (
    SELECT count(*) FROM public.user_reports
    WHERE reporter_id = auth.uid() AND created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'report rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF _target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    context_id_value := _target_ref::uuid;
  END IF;

  derived_severity := CASE
    WHEN _reason_code IN ('sexual_misconduct', 'underage_concern', 'self_harm_emergency_routing') THEN 'critical'
    WHEN _reason_code IN ('hate', 'fraud_scam', 'unsafe_event', 'privacy_exposure') THEN 'high'
    WHEN _reason_code = 'spam' THEN 'low'
    ELSE 'medium'
  END;

  INSERT INTO public.user_reports (
    reporter_id, reported_user_id, context_type, context_id, target_ref,
    category, details, status, severity, source_surface, idempotency_key
  ) VALUES (
    auth.uid(), _reported_user_id, _target_type, context_id_value, trim(_target_ref),
    _reason_code, NULLIF(trim(COALESCE(_details, '')), ''), 'received',
    derived_severity, left(trim(COALESCE(_source_surface, 'consumer')), 80), _idempotency_key
  )
  RETURNING id INTO report_id;

  RETURN report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_safety_report(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_safety_report(uuid, text, text, text, text, text, text) TO authenticated;

CREATE TABLE public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL UNIQUE REFERENCES public.user_reports(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'received',
  severity text NOT NULL,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT moderation_cases_status_check CHECK (
    status IN ('received', 'triaged', 'investigating', 'actioned', 'appealed', 'closed')
  ),
  CONSTRAINT moderation_cases_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT moderation_cases_summary_length CHECK (internal_summary IS NULL OR char_length(internal_summary) <= 2000)
);

CREATE INDEX moderation_cases_queue_idx ON public.moderation_cases (status, severity, created_at);
CREATE INDEX moderation_cases_assignee_idx ON public.moderation_cases (assignee_id, status);
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Safety reviewers read moderation cases"
ON public.moderation_cases FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.moderation_cases FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_moderation_case_for_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.moderation_cases (report_id, severity)
  VALUES (NEW.id, NEW.severity)
  ON CONFLICT (report_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_moderation_case_for_report() FROM PUBLIC;

CREATE TRIGGER safety_report_creates_case
AFTER INSERT ON public.user_reports
FOR EACH ROW EXECUTE FUNCTION public.create_moderation_case_for_report();

INSERT INTO public.moderation_cases (report_id, severity, status, created_at, updated_at)
SELECT
  r.id,
  r.severity,
  CASE
    WHEN r.status IN ('triaged', 'investigating', 'actioned', 'appealed', 'closed') THEN r.status
    WHEN r.status IN ('resolved', 'dismissed') THEN 'closed'
    ELSE 'received'
  END,
  r.created_at,
  r.updated_at
FROM public.user_reports r
ON CONFLICT (report_id) DO NOTHING;

CREATE TABLE public.moderation_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_case_notes_note_length CHECK (char_length(note) BETWEEN 1 AND 2000),
  CONSTRAINT moderation_case_notes_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array')
);

ALTER TABLE public.moderation_case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Safety reviewers read case notes"
ON public.moderation_case_notes FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));
CREATE POLICY "Safety reviewers add case notes"
ON public.moderation_case_notes FOR INSERT TO authenticated
WITH CHECK (public.is_safety_reviewer(auth.uid()) AND author_id = auth.uid());

CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  policy_reason text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource_state_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  appeal_available boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_actions_type_check CHECK (
    action_type IN (
      'warning', 'education', 'feature_restriction', 'temporary_suspension',
      'permanent_ban', 'organizer_restriction', 'content_takedown', 'event_takedown'
    )
  ),
  CONSTRAINT moderation_actions_reason_length CHECK (char_length(policy_reason) BETWEEN 3 AND 1000),
  CONSTRAINT moderation_actions_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CONSTRAINT moderation_actions_resource_state_object CHECK (jsonb_typeof(resource_state_before) = 'object'),
  CONSTRAINT moderation_actions_expiry_order CHECK (expires_at IS NULL OR expires_at > starts_at)
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Safety reviewers read moderation actions"
ON public.moderation_actions FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.moderation_actions FROM authenticated;

CREATE TABLE public.safety_enforcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_action_id uuid NOT NULL UNIQUE REFERENCES public.moderation_actions(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restriction_type text NOT NULL,
  feature_key text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT safety_enforcements_type_check CHECK (
    restriction_type IN ('feature_restriction', 'temporary_suspension', 'permanent_ban', 'organizer_restriction')
  ),
  CONSTRAINT safety_enforcements_feature_check CHECK (
    (restriction_type = 'feature_restriction' AND feature_key IS NOT NULL)
    OR (restriction_type <> 'feature_restriction')
  )
);

CREATE INDEX safety_enforcements_active_idx
ON public.safety_enforcements (target_user_id, restriction_type, expires_at)
WHERE revoked_at IS NULL;
ALTER TABLE public.safety_enforcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own enforcement status"
ON public.safety_enforcements FOR SELECT TO authenticated
USING (target_user_id = auth.uid() OR public.is_safety_reviewer(auth.uid()));

CREATE TABLE public.moderation_resource_enforcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_action_id uuid NOT NULL UNIQUE REFERENCES public.moderation_actions(id) ON DELETE RESTRICT,
  target_type text NOT NULL,
  target_ref text NOT NULL,
  restriction_type text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT moderation_resource_target_check CHECK (target_type IN ('event', 'message', 'content')),
  CONSTRAINT moderation_resource_restriction_check CHECK (restriction_type IN ('content_takedown', 'event_takedown'))
);

CREATE INDEX moderation_resource_enforcements_active_idx
ON public.moderation_resource_enforcements (target_type, target_ref, restriction_type)
WHERE revoked_at IS NULL;
ALTER TABLE public.moderation_resource_enforcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Safety reviewers read resource enforcements"
ON public.moderation_resource_enforcements FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_resource_removed(_target_type text, _target_ref text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.moderation_resource_enforcements e
    WHERE e.target_type = _target_type
      AND e.target_ref = _target_ref
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.is_resource_removed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_resource_removed(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_user_suspended(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_enforcements e
    WHERE e.target_user_id = _user_id
      AND e.restriction_type IN ('temporary_suspension', 'permanent_ban')
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.is_user_suspended(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_user_organizer_restricted(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_enforcements e
    WHERE e.target_user_id = _user_id
      AND e.restriction_type IN ('organizer_restriction', 'temporary_suspension', 'permanent_ban')
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_user_feature_restricted(_user_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_enforcements e
    WHERE e.target_user_id = _user_id
      AND e.restriction_type = 'feature_restriction'
      AND e.feature_key = _feature_key
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.is_user_organizer_restricted(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_feature_restricted(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_organizer_restricted(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_feature_restricted(uuid, text) TO authenticated, service_role;

-- RLS-safe relationship helpers. These avoid circular policies between
-- events, participants and profiles while returning booleans only.
CREATE OR REPLACE FUNCTION public.is_event_participant(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_participants ep
    WHERE ep.user_id = _user_id AND ep.event_id = _event_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_event_owner(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.created_by = _user_id AND e.id = _event_id
  )
$$;

CREATE OR REPLACE FUNCTION public.organizer_can_view_profile(_organizer_id uuid, _profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_participants ep
    JOIN public.events e ON e.id = ep.event_id
    WHERE ep.user_id = _profile_user_id AND e.created_by = _organizer_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_from_event_organizer(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND public.is_blocked_between(_user_id, e.created_by)
  )
$$;

CREATE OR REPLACE FUNCTION public.reviewer_can_view_reported_profile(_reviewer_id uuid, _profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_safety_reviewer(_reviewer_id) AND EXISTS (
    SELECT 1 FROM public.user_reports r
    WHERE r.reported_user_id = _profile_user_id
      AND r.status NOT IN ('closed', 'resolved', 'dismissed')
  )
$$;

REVOKE ALL ON FUNCTION public.is_event_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_event_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organizer_can_view_profile(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_blocked_from_event_organizer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reviewer_can_view_reported_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_event_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizer_can_view_profile(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked_from_event_organizer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reviewer_can_view_reported_profile(uuid, uuid) TO authenticated, service_role;

CREATE TABLE public.moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_action_id uuid NOT NULL REFERENCES public.moderation_actions(id) ON DELETE RESTRICT,
  appellant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  statement text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT moderation_appeals_statement_length CHECK (char_length(statement) BETWEEN 10 AND 2000),
  CONSTRAINT moderation_appeals_status_check CHECK (status IN ('received', 'reviewing', 'upheld', 'modified', 'overturned')),
  CONSTRAINT moderation_appeals_one_per_action UNIQUE (moderation_action_id, appellant_id)
);

ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Appellants read own appeals"
ON public.moderation_appeals FOR SELECT TO authenticated
USING (appellant_id = auth.uid() OR public.is_safety_reviewer(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.moderation_appeals FROM authenticated;

CREATE TABLE public.safety_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role_snapshot text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_ref text NOT NULL,
  case_id uuid REFERENCES public.moderation_cases(id) ON DELETE SET NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  reason_code text,
  redacted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '2555 days'),
  CONSTRAINT safety_audit_metadata_object CHECK (jsonb_typeof(redacted_metadata) = 'object')
);

CREATE INDEX safety_audit_case_idx ON public.safety_audit_log (case_id, created_at);
ALTER TABLE public.safety_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Safety reviewers read audit log"
ON public.safety_audit_log FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));

CREATE TABLE public.event_safety_profiles (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  venue_visibility text NOT NULL DEFAULT 'participant_only',
  host_accountability_ack boolean NOT NULL DEFAULT false,
  capacity_ack boolean NOT NULL DEFAULT false,
  participant_rules text,
  venue_suitability_note text,
  risk_flags text[] NOT NULL DEFAULT '{}'::text[],
  review_status text NOT NULL DEFAULT 'not_required',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_safety_visibility_check CHECK (
    venue_visibility IN ('public_meeting_point', 'participant_only', 'private_exact_after_join', 'online')
  ),
  CONSTRAINT event_safety_review_check CHECK (
    review_status IN ('not_required', 'review_required', 'in_review', 'approved', 'changes_required')
  ),
  CONSTRAINT event_safety_rules_length CHECK (participant_rules IS NULL OR char_length(participant_rules) <= 2000),
  CONSTRAINT event_safety_venue_note_length CHECK (venue_suitability_note IS NULL OR char_length(venue_suitability_note) <= 1000),
  CONSTRAINT event_safety_risk_flags_check CHECK (
    risk_flags <@ ARRAY['private_home', 'night', 'physical_contact', 'remote_location', 'other']::text[]
  )
);

ALTER TABLE public.event_safety_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizers and reviewers read event safety profiles"
ON public.event_safety_profiles FOR SELECT TO authenticated
USING (
  public.is_safety_reviewer(auth.uid())
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.created_by = auth.uid())
);
REVOKE INSERT, UPDATE, DELETE ON public.event_safety_profiles FROM authenticated;

CREATE VIEW public.public_event_safety
WITH (security_barrier = true)
AS
SELECT
  event_id,
  venue_visibility,
  host_accountability_ack,
  capacity_ack,
  participant_rules,
  risk_flags,
  review_status
FROM public.event_safety_profiles;

REVOKE ALL ON public.public_event_safety FROM PUBLIC, anon;
GRANT SELECT ON public.public_event_safety TO authenticated;

CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  policy_version text NOT NULL,
  decision text NOT NULL,
  source_surface text NOT NULL,
  idempotency_key text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  CONSTRAINT consent_records_purpose_check CHECK (
    purpose IN ('terms', 'privacy', 'analytics', 'marketing', 'location_sharing', 'social_reconnection')
  ),
  CONSTRAINT consent_records_decision_check CHECK (decision IN ('granted', 'denied', 'withdrawn')),
  CONSTRAINT consent_records_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX consent_records_user_purpose_idx ON public.consent_records (user_id, purpose, decided_at DESC);
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own consent history"
ON public.consent_records FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users append own consent decisions"
ON public.consent_records FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_my_consent(
  _purpose text,
  _policy_version text,
  _decision text,
  _source_surface text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consent_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _purpose NOT IN ('terms', 'privacy', 'analytics', 'marketing', 'location_sharing', 'social_reconnection')
     OR _decision NOT IN ('granted', 'denied', 'withdrawn')
     OR char_length(trim(COALESCE(_policy_version, ''))) NOT BETWEEN 1 AND 80
     OR char_length(trim(COALESCE(_idempotency_key, ''))) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'invalid consent record' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO consent_id
  FROM public.consent_records
  WHERE user_id = auth.uid() AND idempotency_key = _idempotency_key;
  IF consent_id IS NOT NULL THEN RETURN consent_id; END IF;

  INSERT INTO public.consent_records (
    user_id, purpose, policy_version, decision, source_surface,
    idempotency_key, withdrawn_at
  ) VALUES (
    auth.uid(), _purpose, trim(_policy_version), _decision,
    left(trim(COALESCE(_source_surface, 'profile')), 80), _idempotency_key,
    CASE WHEN _decision = 'withdrawn' THEN now() ELSE NULL END
  ) RETURNING id INTO consent_id;
  RETURN consent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_my_consent(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_consent(text, text, text, text, text) TO authenticated;

CREATE TABLE public.data_deletion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_pseudonym text NOT NULL,
  domain text NOT NULL,
  deletion_mode text NOT NULL,
  rows_affected integer NOT NULL DEFAULT 0,
  correlation_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_deletion_mode_check CHECK (deletion_mode IN ('redact', 'anonymize', 'hard_delete')),
  CONSTRAINT data_deletion_rows_check CHECK (rows_affected >= 0)
);

ALTER TABLE public.data_deletion_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Safety reviewers read deletion receipts"
ON public.data_deletion_receipts FOR SELECT TO authenticated
USING (public.is_safety_reviewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.redact_expired_safety_evidence(
  _batch_limit integer,
  _correlation_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _batch_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'batch limit must be 1-1000' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT r.id
    FROM public.user_reports r
    JOIN public.moderation_cases c ON c.report_id = r.id
    WHERE r.retention_until <= now() AND r.redacted_at IS NULL AND c.status = 'closed'
    ORDER BY r.retention_until
    LIMIT _batch_limit
    FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE public.user_reports r
  SET details = NULL, redacted_at = now(), updated_at = now()
  WHERE r.id IN (SELECT id FROM expired);
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.moderation_case_notes n
  SET note = '[redacted by retention policy]', evidence_refs = '[]'::jsonb
  WHERE EXISTS (
    SELECT 1 FROM public.moderation_cases c
    JOIN public.user_reports r ON r.id = c.report_id
    WHERE c.id = n.case_id AND r.redacted_at IS NOT NULL AND r.retention_until <= now()
  );
  UPDATE public.moderation_actions a
  SET evidence_refs = '[]'::jsonb
  WHERE EXISTS (
    SELECT 1 FROM public.moderation_cases c
    JOIN public.user_reports r ON r.id = c.report_id
    WHERE c.id = a.case_id AND r.redacted_at IS NOT NULL AND r.retention_until <= now()
  );

  INSERT INTO public.data_deletion_receipts (
    subject_pseudonym, domain, deletion_mode, rows_affected, correlation_id
  ) VALUES (
    'batch:' || md5(_correlation_id), 'trust_safety_evidence', 'redact', affected, _correlation_id
  );
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.redact_expired_safety_evidence(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redact_expired_safety_evidence(integer, text) TO authenticated;

-- Tighten the raw profile boundary. Public-facing consumers use the canonical
-- safe-column public_profile_cards view; organizers retain access only to
-- participants of events they own.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles visible to owner reviewer or event organizer"
ON public.profiles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.reviewer_can_view_reported_profile(auth.uid(), profiles.user_id)
  OR public.organizer_can_view_profile(auth.uid(), profiles.user_id)
);

-- Keep the canonical safe-column profile DTO, adding active-enforcement
-- suppression without mutating the user's underlying profile lifecycle state.
CREATE OR REPLACE VIEW public.public_profile_cards
WITH (security_barrier = true)
AS
SELECT
  p.id AS profile_id,
  p.user_id,
  NULLIF(btrim(p.display_name), '') AS display_name,
  p.avatar_url,
  p.bio,
  CASE WHEN p.location_precision = 'city' THEN p.city ELSE NULL END AS city,
  CASE
    WHEN p.interests_visibility = 'public' THEN p.hobbies
    WHEN p.interests_visibility = 'members' AND auth.uid() IS NOT NULL THEN p.hobbies
    ELSE '{}'::text[]
  END AS interests,
  p.profile_visibility,
  p.created_at AS member_since
FROM public.profiles p
WHERE coalesce(p.is_active, true)
  AND NOT public.is_user_suspended(p.user_id)
  AND (
    p.user_id = auth.uid()
    OR p.profile_visibility = 'public'
    OR (p.profile_visibility = 'members' AND auth.uid() IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
       OR (b.blocker_id = p.user_id AND b.blocked_id = auth.uid())
  );

REVOKE ALL ON public.public_profile_cards FROM PUBLIC;
GRANT SELECT ON public.public_profile_cards TO anon, authenticated;

-- Blocked organizers disappear from discovery, but an existing participant
-- can still access the shared-event operational surface.
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "Events respect block discoverability"
ON public.events FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_safety_reviewer(auth.uid())
  OR (
    NOT public.is_resource_removed('event', events.id::text)
    AND (
      (
        NOT public.is_user_suspended(created_by)
        AND NOT public.is_blocked_between(auth.uid(), created_by)
      )
      OR public.is_event_participant(auth.uid(), events.id)
    )
  )
);

-- Preserve the Prompt 06 privacy boundary and atomic participation API. No
-- authenticated principal can INSERT/UPDATE/DELETE participant rows directly;
-- audited SECURITY DEFINER operations are the only mutation path.
DROP POLICY IF EXISTS "Participants viewable by authenticated" ON public.event_participants;
DROP POLICY IF EXISTS "Participants readable by authenticated" ON public.event_participants;
DROP POLICY IF EXISTS "Participants readable across non-blocked boundaries" ON public.event_participants;
DROP POLICY IF EXISTS "Participants read own or operated event" ON public.event_participants;
DROP POLICY IF EXISTS "Users can join events" ON public.event_participants;
DROP POLICY IF EXISTS "Active non-blocked users can join events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave own participation" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can update participants" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can manage participant rows" ON public.event_participants;

CREATE POLICY "Participants read own or operated event"
ON public.event_participants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_event_operator(event_id, 'view_participants'));

-- This trigger is deliberately below the atomic lifecycle RPC migration. It
-- protects every future write path (including SECURITY DEFINER functions) from
-- reactivating a suspended user or bypassing a bilateral organizer block.
CREATE OR REPLACE FUNCTION public.guard_active_event_participation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  becoming_active boolean;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  becoming_active := NEW.status IN ('going', 'waitlist', 'checked_in')
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status);
  IF NOT becoming_active THEN
    RETURN NEW;
  END IF;

  IF public.is_user_suspended(NEW.user_id) THEN
    RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
  END IF;
  IF public.is_blocked_from_event_organizer(NEW.user_id, NEW.event_id) THEN
    RAISE EXCEPTION 'EVENT_ORGANIZER_BLOCKED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_active_event_participation() FROM PUBLIC;
DROP TRIGGER IF EXISTS event_participation_safety_guard ON public.event_participants;
CREATE TRIGGER event_participation_safety_guard
BEFORE INSERT OR UPDATE OF status ON public.event_participants
FOR EACH ROW EXECUTE FUNCTION public.guard_active_event_participation();

DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Active users can create events"
ON public.events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND NOT public.is_user_organizer_restricted(auth.uid())
);

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Active organizers can update own events"
ON public.events FOR UPDATE TO authenticated
USING (
  auth.uid() = created_by
  AND NOT public.is_user_organizer_restricted(auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  AND NOT public.is_user_organizer_restricted(auth.uid())
);

CREATE OR REPLACE FUNCTION public.suppress_blocked_social_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_text text;
  actor_id uuid;
BEGIN
  actor_text := COALESCE(NEW.data ->> 'actor_user_id', NEW.data ->> 'sender_user_id');
  IF actor_text IS NULL OR actor_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  actor_id := actor_text::uuid;
  IF public.is_blocked_between(NEW.user_id, actor_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.suppress_blocked_social_notification() FROM PUBLIC;
CREATE TRIGGER notifications_respect_blocks
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.suppress_blocked_social_notification();

CREATE OR REPLACE FUNCTION public.apply_moderation_action(
  _case_id uuid,
  _action_type text,
  _policy_reason text,
  _evidence_refs jsonb,
  _duration interval,
  _feature_key text,
  _idempotency_key text,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  action_id uuid;
  report_id uuid;
  target_type text;
  target_ref text;
  target_user uuid;
  resource_state_before jsonb := '{}'::jsonb;
BEGIN
  IF actor_id IS NULL OR NOT public.is_safety_reviewer(actor_id) THEN
    RAISE EXCEPTION 'safety reviewer required' USING ERRCODE = '42501';
  END IF;
  IF _action_type = 'permanent_ban' AND NOT public.has_role(actor_id, 'admin') THEN
    RAISE EXCEPTION 'permanent ban requires admin' USING ERRCODE = '42501';
  END IF;
  IF _action_type NOT IN (
    'warning', 'education', 'feature_restriction', 'temporary_suspension',
    'permanent_ban', 'organizer_restriction', 'content_takedown', 'event_takedown'
  ) THEN
    RAISE EXCEPTION 'unsupported moderation action' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(COALESCE(_policy_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'policy reason required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO action_id
  FROM public.moderation_actions
  WHERE idempotency_key = _idempotency_key;
  IF action_id IS NOT NULL THEN
    RETURN action_id;
  END IF;

  SELECT c.report_id,
    CASE WHEN r.context_type = 'profile' THEN 'user' ELSE r.context_type END,
    r.target_ref
  INTO report_id, target_type, target_ref
  FROM public.moderation_cases c
  JOIN public.user_reports r ON r.id = c.report_id
  WHERE c.id = _case_id
  FOR UPDATE OF c;

  IF target_type IS NULL THEN
    RAISE EXCEPTION 'moderation case not found' USING ERRCODE = 'P0002';
  END IF;

  IF target_type IN ('user', 'organizer')
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    target_user := target_ref::uuid;
  ELSIF target_type = 'event'
        AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT created_by INTO target_user FROM public.events WHERE id = target_ref::uuid;
  END IF;

  IF _action_type IN ('content_takedown', 'event_takedown')
     AND target_type = 'event'
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT jsonb_build_object('is_active', e.is_active)
    INTO resource_state_before
    FROM public.events e
    WHERE e.id = target_ref::uuid;
    resource_state_before := COALESCE(resource_state_before, '{}'::jsonb);
  END IF;

  actor_role := CASE WHEN public.has_role(actor_id, 'admin') THEN 'admin' ELSE 'moderator' END;

  INSERT INTO public.moderation_actions (
    case_id, actor_id, action_type, policy_reason, evidence_refs, resource_state_before,
    expires_at, idempotency_key
  )
  VALUES (
    _case_id, actor_id, _action_type, trim(_policy_reason), COALESCE(_evidence_refs, '[]'::jsonb), resource_state_before,
    CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END,
    _idempotency_key
  )
  RETURNING id INTO action_id;

  IF _action_type IN ('feature_restriction', 'temporary_suspension', 'permanent_ban', 'organizer_restriction') THEN
    IF target_user IS NULL THEN
      RAISE EXCEPTION 'moderation target is not an enforceable user' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.safety_enforcements (
      moderation_action_id, target_user_id, restriction_type, feature_key, expires_at
    ) VALUES (
      action_id, target_user, _action_type, _feature_key,
      CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END
    )
    ON CONFLICT (moderation_action_id) DO NOTHING;
  END IF;

  IF _action_type IN ('content_takedown', 'event_takedown') THEN
    IF target_type NOT IN ('event', 'message', 'content') THEN
      RAISE EXCEPTION 'moderation target is not a removable resource' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.moderation_resource_enforcements (
      moderation_action_id, target_type, target_ref, restriction_type,
      expires_at
    ) VALUES (
      action_id, target_type, target_ref, _action_type,
      CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END
    )
    ON CONFLICT (moderation_action_id) DO NOTHING;
  END IF;

  UPDATE public.moderation_cases
  SET status = 'actioned', updated_at = now()
  WHERE id = _case_id AND status <> 'closed';

  UPDATE public.user_reports
  SET status = 'actioned', updated_at = now()
  WHERE id = report_id AND status NOT IN ('closed', 'resolved', 'dismissed');

  INSERT INTO public.safety_audit_log (
    actor_id, actor_role_snapshot, action, target_type, target_ref,
    case_id, correlation_id, idempotency_key, reason_code, redacted_metadata, outcome
  ) VALUES (
    actor_id, actor_role, _action_type, target_type, target_ref,
    _case_id, _correlation_id, 'action:' || _idempotency_key, 'policy_enforcement',
    jsonb_build_object('evidence_count', jsonb_array_length(COALESCE(_evidence_refs, '[]'::jsonb))),
    'applied'
  );

  RETURN action_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_moderation_action(uuid, text, text, jsonb, interval, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, jsonb, interval, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_moderation_case(
  _case_id uuid,
  _next_status text,
  _assignee_id uuid,
  _note text,
  _idempotency_key text,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  current_status text;
  report_id uuid;
  target_type text;
  target_ref text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_safety_reviewer(actor_id) THEN
    RAISE EXCEPTION 'safety reviewer required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.safety_audit_log WHERE idempotency_key = 'transition:' || _idempotency_key) THEN
    RETURN _case_id;
  END IF;
  IF _assignee_id IS NOT NULL AND NOT public.is_safety_reviewer(_assignee_id) THEN
    RAISE EXCEPTION 'assignee must be a safety reviewer' USING ERRCODE = '22023';
  END IF;

  SELECT c.status, c.report_id,
         CASE WHEN r.context_type = 'profile' THEN 'user' ELSE r.context_type END,
         r.target_ref
  INTO current_status, report_id, target_type, target_ref
  FROM public.moderation_cases c
  JOIN public.user_reports r ON r.id = c.report_id
  WHERE c.id = _case_id
  FOR UPDATE OF c;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'moderation case not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    (current_status = 'received' AND _next_status IN ('triaged', 'closed'))
    OR (current_status = 'triaged' AND _next_status IN ('investigating', 'actioned', 'closed'))
    OR (current_status = 'investigating' AND _next_status IN ('actioned', 'closed'))
    OR (current_status = 'actioned' AND _next_status IN ('appealed', 'closed'))
    OR (current_status = 'appealed' AND _next_status IN ('investigating', 'actioned', 'closed'))
  ) THEN
    RAISE EXCEPTION 'invalid moderation case transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.moderation_cases
  SET status = _next_status,
      assignee_id = COALESCE(_assignee_id, assignee_id),
      updated_at = now(),
      closed_at = CASE WHEN _next_status = 'closed' THEN now() ELSE NULL END
  WHERE id = _case_id;

  UPDATE public.user_reports
  SET status = _next_status, updated_at = now()
  WHERE id = report_id;

  IF NULLIF(trim(COALESCE(_note, '')), '') IS NOT NULL THEN
    INSERT INTO public.moderation_case_notes (case_id, author_id, note)
    VALUES (_case_id, actor_id, left(trim(_note), 2000));
  END IF;

  INSERT INTO public.safety_audit_log (
    actor_id, actor_role_snapshot, action, target_type, target_ref, case_id,
    correlation_id, idempotency_key, reason_code, redacted_metadata, outcome
  ) VALUES (
    actor_id,
    CASE WHEN public.has_role(actor_id, 'admin') THEN 'admin' ELSE 'moderator' END,
    'case_transition', target_type, target_ref, _case_id,
    _correlation_id, 'transition:' || _idempotency_key, 'case_lifecycle',
    jsonb_build_object('from', current_status, 'to', _next_status, 'note_present', NULLIF(trim(COALESCE(_note, '')), '') IS NOT NULL),
    'applied'
  );

  RETURN _case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_moderation_case(uuid, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_moderation_case(uuid, text, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_moderation_case(
  _case_id uuid,
  _idempotency_key text,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  current_assignee uuid;
  target_type text;
  target_ref text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_safety_reviewer(actor_id) THEN
    RAISE EXCEPTION 'safety reviewer required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.safety_audit_log WHERE idempotency_key = 'claim:' || _idempotency_key) THEN
    RETURN _case_id;
  END IF;

  SELECT c.assignee_id,
         CASE WHEN r.context_type = 'profile' THEN 'user' ELSE r.context_type END,
         r.target_ref
  INTO current_assignee, target_type, target_ref
  FROM public.moderation_cases c
  JOIN public.user_reports r ON r.id = c.report_id
  WHERE c.id = _case_id AND c.status <> 'closed'
  FOR UPDATE OF c;
  IF target_type IS NULL THEN
    RAISE EXCEPTION 'open moderation case not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.moderation_cases
  SET assignee_id = actor_id, updated_at = now()
  WHERE id = _case_id;

  INSERT INTO public.safety_audit_log (
    actor_id, actor_role_snapshot, action, target_type, target_ref, case_id,
    correlation_id, idempotency_key, reason_code, redacted_metadata, outcome
  ) VALUES (
    actor_id,
    CASE WHEN public.has_role(actor_id, 'admin') THEN 'admin' ELSE 'moderator' END,
    'case_claimed', target_type, target_ref, _case_id,
    _correlation_id, 'claim:' || _idempotency_key, 'queue_assignment',
    jsonb_build_object('previously_assigned', current_assignee IS NOT NULL), 'applied'
  );
  RETURN _case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_moderation_case(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_moderation_case(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_moderation_appeal(
  _moderation_action_id uuid,
  _statement text,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  appeal_id uuid;
  case_id uuid;
  report_id uuid;
  target_user_id uuid;
  target_type text;
  target_ref text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(COALESCE(_statement, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'appeal statement must be 10-2000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT a.case_id, c.report_id,
         CASE WHEN r.context_type = 'profile' THEN 'user' ELSE r.context_type END,
         r.target_ref,
         r.reported_user_id
  INTO case_id, report_id, target_type, target_ref, target_user_id
  FROM public.moderation_actions a
  JOIN public.moderation_cases c ON c.id = a.case_id
  JOIN public.user_reports r ON r.id = c.report_id
  WHERE a.id = _moderation_action_id AND a.appeal_available = true;

  IF case_id IS NULL THEN
    RAISE EXCEPTION 'appealable action not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_user_id IS NULL AND target_type = 'event'
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT created_by INTO target_user_id FROM public.events WHERE id = target_ref::uuid;
  END IF;
  IF target_user_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'appeal is restricted to the enforcement target' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO appeal_id
  FROM public.moderation_appeals
  WHERE moderation_action_id = _moderation_action_id AND appellant_id = actor_id;
  IF appeal_id IS NOT NULL THEN RETURN appeal_id; END IF;

  INSERT INTO public.moderation_appeals (moderation_action_id, appellant_id, statement)
  VALUES (_moderation_action_id, actor_id, trim(_statement))
  RETURNING id INTO appeal_id;

  UPDATE public.moderation_cases SET status = 'appealed', updated_at = now() WHERE id = case_id;
  UPDATE public.user_reports SET status = 'appealed', updated_at = now() WHERE id = report_id;

  INSERT INTO public.safety_audit_log (
    actor_id, actor_role_snapshot, action, target_type, target_ref, case_id,
    correlation_id, idempotency_key, reason_code, redacted_metadata, outcome
  ) VALUES (
    actor_id, 'user', 'appeal_submitted', target_type, target_ref, case_id,
    _correlation_id, 'appeal:' || _moderation_action_id::text || ':' || actor_id::text,
    'appeal', jsonb_build_object('statement_length', char_length(trim(_statement))), 'received'
  );

  RETURN appeal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_moderation_appeal(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_moderation_appeal(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_moderation_appeal(
  _appeal_id uuid,
  _resolution text,
  _resolution_note text,
  _idempotency_key text,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  action_id uuid;
  case_id uuid;
  report_id uuid;
  target_type text;
  target_ref text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_safety_reviewer(actor_id) THEN
    RAISE EXCEPTION 'safety reviewer required' USING ERRCODE = '42501';
  END IF;
  IF _resolution NOT IN ('upheld', 'modified', 'overturned')
     OR char_length(trim(COALESCE(_resolution_note, ''))) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'invalid appeal resolution' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.safety_audit_log WHERE idempotency_key = 'appeal-resolution:' || _idempotency_key) THEN
    RETURN _appeal_id;
  END IF;

  SELECT ma.id, ma.case_id, mc.report_id,
         CASE WHEN r.context_type = 'profile' THEN 'user' ELSE r.context_type END,
         r.target_ref
  INTO action_id, case_id, report_id, target_type, target_ref
  FROM public.moderation_appeals a
  JOIN public.moderation_actions ma ON ma.id = a.moderation_action_id
  JOIN public.moderation_cases mc ON mc.id = ma.case_id
  JOIN public.user_reports r ON r.id = mc.report_id
  WHERE a.id = _appeal_id AND a.status IN ('received', 'reviewing')
  FOR UPDATE OF a;
  IF action_id IS NULL THEN
    RAISE EXCEPTION 'open appeal not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.moderation_appeals
  SET status = _resolution,
      reviewer_id = actor_id,
      resolution_note = trim(_resolution_note),
      resolved_at = now()
  WHERE id = _appeal_id;

  IF _resolution = 'overturned' THEN
    UPDATE public.safety_enforcements
    SET revoked_at = now(), revoked_by = actor_id
    WHERE moderation_action_id = action_id AND revoked_at IS NULL;
    UPDATE public.moderation_resource_enforcements
    SET revoked_at = now(), revoked_by = actor_id
    WHERE moderation_action_id = action_id AND revoked_at IS NULL;
  END IF;

  UPDATE public.moderation_cases
  SET status = CASE WHEN _resolution = 'overturned' THEN 'closed' ELSE 'actioned' END,
      updated_at = now(),
      closed_at = CASE WHEN _resolution = 'overturned' THEN now() ELSE NULL END
  WHERE id = case_id;
  UPDATE public.user_reports
  SET status = CASE WHEN _resolution = 'overturned' THEN 'closed' ELSE 'actioned' END,
      updated_at = now()
  WHERE id = report_id;

  INSERT INTO public.moderation_case_notes (case_id, author_id, note)
  VALUES (case_id, actor_id, left('Appeal ' || _resolution || ': ' || trim(_resolution_note), 2000));

  INSERT INTO public.safety_audit_log (
    actor_id, actor_role_snapshot, action, target_type, target_ref, case_id,
    correlation_id, idempotency_key, reason_code, redacted_metadata, outcome
  ) VALUES (
    actor_id,
    CASE WHEN public.has_role(actor_id, 'admin') THEN 'admin' ELSE 'moderator' END,
    'appeal_resolved', target_type, target_ref, case_id,
    _correlation_id, 'appeal-resolution:' || _idempotency_key, 'appeal',
    jsonb_build_object('resolution', _resolution, 'enforcement_revoked', _resolution = 'overturned'),
    _resolution
  );
  RETURN _appeal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_moderation_appeal(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_moderation_appeal(uuid, text, text, text, text) TO authenticated;

COMMENT ON TABLE public.user_reports IS
  'Canonical reporter-private safety intake extended by Prompt 13. Attachments remain unsupported until a dedicated private storage policy exists.';
COMMENT ON TABLE public.safety_audit_log IS
  'Append-only moderation audit. Metadata must remain redacted and must never include report free text.';

COMMIT;

-- Rollback strategy (operator-reviewed, not auto-executed):
-- 1. Drop the replacement events/profiles/event_participants policies and
--    restore their prior definitions from the preceding migrations.
-- 2. Drop notifications_respect_blocks and the public DTO views.
-- 3. Drop Prompt-13 tables in reverse FK order only after exporting required
--    moderation/audit evidence according to the approved retention policy.
