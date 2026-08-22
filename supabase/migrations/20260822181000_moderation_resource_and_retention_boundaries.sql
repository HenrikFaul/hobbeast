-- P1 follow-up for Prompts 13-15: unified Circle/Hub report intake,
-- removed-resource enforcement and scheduler-ready privacy maintenance.
-- Append-only source; no hosted database or scheduler is changed by this file.

BEGIN;

ALTER TABLE public.moderation_resource_enforcements
  DROP CONSTRAINT IF EXISTS moderation_resource_target_check;
ALTER TABLE public.moderation_resource_enforcements
  ADD CONSTRAINT moderation_resource_target_check
  CHECK (target_type IN ('event', 'message', 'content', 'circle', 'hub'));

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
SET search_path = pg_catalog, public
AS $$
DECLARE
  report_id uuid;
  context_id_value uuid;
  derived_reported_user_id uuid := _reported_user_id;
  derived_severity text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _target_type NOT IN ('user', 'event', 'organizer', 'circle', 'hub', 'message', 'content') THEN
    RAISE EXCEPTION 'unsupported report target' USING ERRCODE = '22023';
  END IF;
  IF _reason_code NOT IN (
    'harassment', 'hate', 'sexual_misconduct', 'fraud_scam', 'unsafe_event',
    'impersonation', 'underage_concern', 'privacy_exposure', 'spam',
    'prohibited_commercial_behavior', 'self_harm_emergency_routing', 'other'
  ) THEN
    RAISE EXCEPTION 'unsupported report reason' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_target_ref, ''))) NOT BETWEEN 1 AND 200
     OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 128
     OR char_length(btrim(coalesce(_source_surface, ''))) NOT BETWEEN 1 AND 80
     OR char_length(btrim(coalesce(_details, ''))) > 1000 THEN
    RAISE EXCEPTION 'invalid report payload' USING ERRCODE = '22023';
  END IF;

  SELECT r.id INTO report_id
  FROM public.user_reports r
  WHERE r.reporter_id = auth.uid() AND r.idempotency_key = _idempotency_key;
  IF report_id IS NOT NULL THEN RETURN report_id; END IF;

  IF (
    SELECT count(*) FROM public.user_reports r
    WHERE r.reporter_id = auth.uid() AND r.created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'report rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF _target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    context_id_value := _target_ref::uuid;
  END IF;

  IF _target_type IN ('user', 'organizer') THEN
    IF context_id_value IS NULL THEN
      RAISE EXCEPTION 'invalid user report target' USING ERRCODE = '22023';
    END IF;
    SELECT p.user_id INTO derived_reported_user_id
    FROM public.profiles p WHERE p.user_id = context_id_value;
  ELSIF _target_type = 'event' THEN
    SELECT e.created_by INTO derived_reported_user_id
    FROM public.events e WHERE e.id = context_id_value;
  ELSIF _target_type = 'circle' THEN
    SELECT c.host_id INTO derived_reported_user_id
    FROM public.social_circles c WHERE c.id = context_id_value;
  ELSIF _target_type = 'hub' THEN
    SELECT h.host_id INTO derived_reported_user_id
    FROM public.virtual_hubs h WHERE h.id = context_id_value;
  ELSIF _target_type = 'message' THEN
    SELECT m.actor_user_id INTO derived_reported_user_id
    FROM public.event_messages m WHERE m.id = context_id_value;
  END IF;

  IF _target_type <> 'content' AND derived_reported_user_id IS NULL THEN
    RAISE EXCEPTION 'report target not found' USING ERRCODE = 'P0002';
  END IF;
  IF derived_reported_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot report yourself' USING ERRCODE = '22023';
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
    auth.uid(), derived_reported_user_id, _target_type, context_id_value, btrim(_target_ref),
    _reason_code, NULLIF(btrim(coalesce(_details, '')), ''), 'received',
    derived_severity, left(btrim(_source_surface), 80), _idempotency_key
  )
  RETURNING id INTO report_id;

  RETURN report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_safety_report(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_safety_report(uuid, text, text, text, text, text, text)
  TO authenticated;

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
SET search_path = pg_catalog, public
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
  IF char_length(btrim(coalesce(_policy_reason, ''))) NOT BETWEEN 3 AND 1000
     OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 128
     OR char_length(btrim(coalesce(_correlation_id, ''))) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(_evidence_refs, '[]'::jsonb)) <> 'array'
     OR pg_column_size(coalesce(_evidence_refs, '[]'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'invalid moderation action payload' USING ERRCODE = '22023';
  END IF;

  SELECT a.id INTO action_id
  FROM public.moderation_actions a
  WHERE a.idempotency_key = _idempotency_key;
  IF action_id IS NOT NULL THEN RETURN action_id; END IF;

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
    SELECT e.created_by, jsonb_build_object('is_active', e.is_active)
    INTO target_user, resource_state_before
    FROM public.events e WHERE e.id = target_ref::uuid;
  ELSIF target_type = 'circle'
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT c.host_id, jsonb_build_object('lifecycle_state', c.lifecycle_state)
    INTO target_user, resource_state_before
    FROM public.social_circles c WHERE c.id = target_ref::uuid;
  ELSIF target_type = 'hub'
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT h.host_id, jsonb_build_object('lifecycle_state', h.lifecycle_state)
    INTO target_user, resource_state_before
    FROM public.virtual_hubs h WHERE h.id = target_ref::uuid;
  ELSIF target_type = 'message'
     AND target_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT m.actor_user_id, jsonb_build_object('delivery_state', m.delivery_state)
    INTO target_user, resource_state_before
    FROM public.event_messages m WHERE m.id = target_ref::uuid;
  END IF;
  resource_state_before := coalesce(resource_state_before, '{}'::jsonb);

  IF _action_type = 'event_takedown' AND target_type <> 'event' THEN
    RAISE EXCEPTION 'event takedown requires event target' USING ERRCODE = '22023';
  END IF;
  IF _action_type = 'content_takedown'
     AND target_type NOT IN ('event', 'message', 'content', 'circle', 'hub') THEN
    RAISE EXCEPTION 'moderation target is not a removable resource' USING ERRCODE = '22023';
  END IF;

  actor_role := CASE WHEN public.has_role(actor_id, 'admin') THEN 'admin' ELSE 'moderator' END;

  INSERT INTO public.moderation_actions (
    case_id, actor_id, action_type, policy_reason, evidence_refs, resource_state_before,
    expires_at, idempotency_key
  ) VALUES (
    _case_id, actor_id, _action_type, btrim(_policy_reason), coalesce(_evidence_refs, '[]'::jsonb),
    resource_state_before, CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END,
    _idempotency_key
  ) RETURNING id INTO action_id;

  IF _action_type IN ('feature_restriction', 'temporary_suspension', 'permanent_ban', 'organizer_restriction') THEN
    IF target_user IS NULL THEN
      RAISE EXCEPTION 'moderation target is not an enforceable user' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.safety_enforcements (
      moderation_action_id, target_user_id, restriction_type, feature_key, expires_at
    ) VALUES (
      action_id, target_user, _action_type, _feature_key,
      CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END
    ) ON CONFLICT (moderation_action_id) DO NOTHING;
  END IF;

  IF _action_type IN ('content_takedown', 'event_takedown') THEN
    INSERT INTO public.moderation_resource_enforcements (
      moderation_action_id, target_type, target_ref, restriction_type, expires_at
    ) VALUES (
      action_id, target_type, target_ref, _action_type,
      CASE WHEN _duration IS NULL THEN NULL ELSE now() + _duration END
    ) ON CONFLICT (moderation_action_id) DO NOTHING;
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
    jsonb_build_object('evidence_count', jsonb_array_length(coalesce(_evidence_refs, '[]'::jsonb))),
    'applied'
  );

  RETURN action_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_moderation_action(uuid, text, text, jsonb, interval, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, jsonb, interval, text, text, text)
  TO authenticated;

-- Removed resources are invisible to ordinary users even when their IDs are
-- known or an owner/member relationship previously granted access.
DROP POLICY IF EXISTS "Circles respect configured visibility" ON public.social_circles;
DROP POLICY IF EXISTS "Circles respect flag and operational visibility" ON public.social_circles;
DROP POLICY IF EXISTS "Circles respect flags and host blocks" ON public.social_circles;
DROP POLICY IF EXISTS "Circles hide removed resources" ON public.social_circles;
CREATE POLICY "Circles hide removed resources"
ON public.social_circles FOR SELECT TO authenticated
USING (
  public.is_safety_reviewer(auth.uid())
  OR (
    NOT public.is_resource_removed('circle', id::text)
    AND NOT public.is_blocked_between(auth.uid(), host_id)
    AND (
      created_by = auth.uid()
      OR host_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.social_circle_members own_membership
        WHERE own_membership.circle_id = social_circles.id
          AND own_membership.user_id = auth.uid()
      )
      OR (
        public.feature_enabled_for_subject('circles', auth.uid())
        AND (visibility IN ('public', 'members') OR public.is_circle_member(id))
      )
    )
  )
);

DROP POLICY IF EXISTS "Discoverable hubs are visible to members" ON public.virtual_hubs;
DROP POLICY IF EXISTS "Flagged hubs are visible to members" ON public.virtual_hubs;
DROP POLICY IF EXISTS "Hubs respect flags and host blocks" ON public.virtual_hubs;
DROP POLICY IF EXISTS "Hubs hide removed resources" ON public.virtual_hubs;
CREATE POLICY "Hubs hide removed resources"
ON public.virtual_hubs FOR SELECT TO authenticated
USING (
  public.is_safety_reviewer(auth.uid())
  OR (
    NOT public.is_resource_removed('hub', id::text)
    AND NOT public.is_blocked_between(auth.uid(), host_id)
    AND (
      host_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.virtual_hub_members m
        WHERE m.hub_id = virtual_hubs.id
          AND m.user_id = auth.uid()
          AND m.membership_status = 'active'
      )
      OR (
        public.feature_enabled_for_subject('hub2', auth.uid())
        AND is_discoverable
        AND lifecycle_state IN ('recruiting', 'active')
      )
    )
  )
);

DROP POLICY IF EXISTS "Owners can read messages on owned events" ON public.event_messages;
DROP POLICY IF EXISTS "Operators read nonremoved messages" ON public.event_messages;
CREATE POLICY "Operators read nonremoved messages"
ON public.event_messages FOR SELECT TO authenticated
USING (
  public.is_safety_reviewer(auth.uid())
  OR (
    NOT public.is_resource_removed('message', id::text)
    AND NOT public.is_resource_removed('event', event_id::text)
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_messages.event_id
        AND (e.created_by = auth.uid() OR e.organizer_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Owners can write messages on owned events" ON public.event_messages;
DROP POLICY IF EXISTS "Operators write messages to nonremoved events" ON public.event_messages;
CREATE POLICY "Operators write messages to nonremoved events"
ON public.event_messages FOR INSERT TO authenticated
WITH CHECK (
  NOT public.is_resource_removed('event', event_id::text)
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_messages.event_id
      AND (e.created_by = auth.uid() OR e.organizer_id = auth.uid())
  )
);

CREATE OR REPLACE VIEW public.virtual_hub_discovery_cards
WITH (security_barrier = true)
AS
SELECT
  h.id,
  h.hobby_category,
  h.hobby_subcategory,
  h.hobby_activity,
  h.city,
  h.purpose,
  h.host_id,
  h.join_policy,
  h.lifecycle_state,
  h.real_member_count AS member_count,
  h.activity_freshness_at,
  h.welcome_message,
  h.community_rules
FROM public.virtual_hubs h
WHERE (public.has_role(auth.uid(), 'admin') OR public.feature_enabled_for_subject('hub2', auth.uid()))
  AND (public.has_role(auth.uid(), 'admin') OR NOT public.is_blocked_between(auth.uid(), h.host_id))
  AND NOT public.is_resource_removed('hub', h.id::text)
  AND h.is_discoverable
  AND h.lifecycle_state IN ('recruiting', 'active')
  AND (h.activity_freshness_at IS NULL OR h.activity_freshness_at > now() - interval '120 days');

REVOKE ALL ON public.virtual_hub_discovery_cards FROM PUBLIC, anon;
GRANT SELECT ON public.virtual_hub_discovery_cards TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_removed_community_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resource_type text;
  resource_id uuid;
  row_payload jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'social_circle_members' THEN
    resource_type := 'circle';
    resource_id := NULLIF(row_payload ->> 'circle_id', '')::uuid;
  ELSIF TG_TABLE_NAME = 'virtual_hub_members' THEN
    resource_type := 'hub';
    resource_id := NULLIF(row_payload ->> 'hub_id', '')::uuid;
  END IF;
  IF resource_type IS NULL OR resource_id IS NULL
     OR public.is_resource_removed(resource_type, resource_id::text) THEN
    RAISE EXCEPTION 'RESOURCE_REMOVED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_removed_community_membership() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS social_circle_members_removed_guard ON public.social_circle_members;
CREATE TRIGGER social_circle_members_removed_guard
BEFORE INSERT OR UPDATE ON public.social_circle_members
FOR EACH ROW EXECUTE FUNCTION public.guard_removed_community_membership();
DROP TRIGGER IF EXISTS virtual_hub_members_removed_guard ON public.virtual_hub_members;
CREATE TRIGGER virtual_hub_members_removed_guard
BEFORE INSERT OR UPDATE ON public.virtual_hub_members
FOR EACH ROW EXECUTE FUNCTION public.guard_removed_community_membership();

ALTER TABLE public.product_analytics_events
  ADD COLUMN IF NOT EXISTS redacted_at timestamptz;
CREATE INDEX IF NOT EXISTS product_analytics_redaction_idx
  ON public.product_analytics_events (occurred_at)
  WHERE redacted_at IS NULL;

CREATE OR REPLACE FUNCTION public.run_privacy_retention_maintenance(
  _batch_limit integer,
  _correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  safety_ids uuid[] := '{}'::uuid[];
  analytics_redact_ids uuid[] := '{}'::uuid[];
  analytics_delete_ids uuid[] := '{}'::uuid[];
  safety_count integer := 0;
  analytics_redacted_count integer := 0;
  analytics_deleted_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'scheduler or service role required' USING ERRCODE = '42501';
  END IF;
  IF _batch_limit NOT BETWEEN 1 AND 10000
     OR char_length(btrim(coalesce(_correlation_id, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid retention request' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(candidate.id), '{}'::uuid[])
  INTO safety_ids
  FROM (
    SELECT r.id
    FROM public.user_reports r
    JOIN public.moderation_cases c ON c.report_id = r.id
    WHERE r.retention_until <= now() AND r.redacted_at IS NULL AND c.status = 'closed'
    ORDER BY r.retention_until
    LIMIT _batch_limit
    FOR UPDATE OF r SKIP LOCKED
  ) candidate;

  UPDATE public.user_reports r
  SET details = NULL, redacted_at = now(), updated_at = now()
  WHERE r.id = ANY(safety_ids);
  GET DIAGNOSTICS safety_count = ROW_COUNT;

  UPDATE public.moderation_case_notes n
  SET note = '[redacted by retention policy]', evidence_refs = '[]'::jsonb
  WHERE EXISTS (
    SELECT 1 FROM public.moderation_cases c
    WHERE c.id = n.case_id AND c.report_id = ANY(safety_ids)
  );
  UPDATE public.moderation_actions a
  SET evidence_refs = '[]'::jsonb
  WHERE EXISTS (
    SELECT 1 FROM public.moderation_cases c
    WHERE c.id = a.case_id AND c.report_id = ANY(safety_ids)
  );

  SELECT coalesce(array_agg(candidate.id), '{}'::uuid[])
  INTO analytics_redact_ids
  FROM (
    SELECT e.id
    FROM public.product_analytics_events e
    WHERE e.redacted_at IS NULL
      AND e.occurred_at <= now() - interval '90 days'
      AND e.retention_until > now()
    ORDER BY e.occurred_at
    LIMIT _batch_limit
    FOR UPDATE OF e SKIP LOCKED
  ) candidate;

  UPDATE public.product_analytics_events e
  SET actor_pseudonym = NULL,
      session_pseudonym = NULL,
      properties = '{}'::jsonb,
      redacted_at = now()
  WHERE e.id = ANY(analytics_redact_ids);
  GET DIAGNOSTICS analytics_redacted_count = ROW_COUNT;

  SELECT coalesce(array_agg(candidate.id), '{}'::uuid[])
  INTO analytics_delete_ids
  FROM (
    SELECT e.id
    FROM public.product_analytics_events e
    WHERE e.retention_until <= now()
    ORDER BY e.retention_until
    LIMIT _batch_limit
    FOR UPDATE OF e SKIP LOCKED
  ) candidate;

  DELETE FROM public.product_analytics_events e
  WHERE e.id = ANY(analytics_delete_ids);
  GET DIAGNOSTICS analytics_deleted_count = ROW_COUNT;

  INSERT INTO public.data_deletion_receipts (
    subject_pseudonym, domain, deletion_mode, rows_affected, correlation_id
  ) VALUES
    ('batch:' || md5(_correlation_id), 'trust_safety_evidence', 'redact', safety_count, _correlation_id),
    ('batch:' || md5(_correlation_id), 'product_analytics_payload', 'redact', analytics_redacted_count, _correlation_id),
    ('batch:' || md5(_correlation_id), 'product_analytics', 'hard_delete', analytics_deleted_count, _correlation_id);

  RETURN jsonb_build_object(
    'safety_reports_redacted', safety_count,
    'analytics_payloads_redacted', analytics_redacted_count,
    'analytics_events_deleted', analytics_deleted_count,
    'correlation_id', _correlation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_privacy_retention_maintenance(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_privacy_retention_maintenance(integer, text)
  TO service_role;

COMMIT;
