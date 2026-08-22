-- Prompt 07 completion: audited organizer operations, crew/series mutation
-- boundaries, selected-audience messaging and progressive readiness enforcement.
--
-- Rollback: disable `organizer_readiness_enforcement`, stop using the RPCs,
-- restore the legacy authenticated table grants/policies if required, then drop
-- the new functions/tables/columns in reverse dependency order. Historical
-- audit and message-recipient evidence should be exported, never silently lost.

BEGIN;

INSERT INTO public.feature_flags (
  key, enabled, rollout_percentage, cohorts, owner, expires_at, description
)
VALUES (
  'organizer_readiness_enforcement', false, 0, ARRAY['internal'],
  'organizer-ops', '2027-02-28T23:59:59Z',
  'Progressive readiness enforcement for newly created organizer events'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organizer_readiness_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_enforcement_version text,
  ADD COLUMN IF NOT EXISTS reschedule_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_reschedule_version_check;
ALTER TABLE public.events ADD CONSTRAINT events_reschedule_version_check
  CHECK (reschedule_version BETWEEN 0 AND 10000);

ALTER TABLE public.event_messages
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS audience_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text;

ALTER TABLE public.event_messages DROP CONSTRAINT IF EXISTS event_messages_runtime_bounds_check;
ALTER TABLE public.event_messages ADD CONSTRAINT event_messages_runtime_bounds_check CHECK (
  length(body) BETWEEN 1 AND 4000
  AND (subject IS NULL OR length(subject) <= 160)
  AND audience_count BETWEEN 0 AND 5000
  AND delivered_count BETWEEN 0 AND audience_count
  AND failed_count BETWEEN 0 AND audience_count
  AND (request_id IS NULL OR length(request_id) BETWEEN 8 AND 200)
  AND (last_error_code IS NULL OR length(last_error_code) <= 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS event_messages_actor_idempotency_uidx
  ON public.event_messages (actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_message_recipients (
  message_id uuid NOT NULL REFERENCES public.event_messages(id) ON DELETE CASCADE,
  participation_id uuid NOT NULL REFERENCES public.event_participants(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selection_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_user_id),
  UNIQUE (message_id, participation_id),
  CHECK (selection_source IN ('all', 'going', 'waitlist', 'checked_in', 'selected'))
);
CREATE INDEX IF NOT EXISTS event_message_recipients_user_idx
  ON public.event_message_recipients (recipient_user_id, created_at DESC);
ALTER TABLE public.event_message_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Message operators read recipient evidence"
  ON public.event_message_recipients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_messages m
    WHERE m.id = event_message_recipients.message_id
      AND public.is_event_operator(m.event_id, 'message')
  ));
REVOKE INSERT, UPDATE, DELETE ON public.event_message_recipients FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.event_series_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.event_series(id) ON DELETE CASCADE,
  occurrence_id uuid REFERENCES public.event_series_occurrences(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 80),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  before_state jsonb,
  after_state jsonb,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key),
  CHECK (before_state IS NULL OR pg_column_size(before_state) <= 16384),
  CHECK (after_state IS NULL OR pg_column_size(after_state) <= 16384)
);
CREATE INDEX IF NOT EXISTS event_series_audit_series_idx
  ON public.event_series_audit_events (series_id, created_at DESC);
ALTER TABLE public.event_series_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Series owners read series audit"
  ON public.event_series_audit_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_series s
    WHERE s.id = event_series_audit_events.series_id
      AND (s.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
REVOKE INSERT, UPDATE, DELETE ON public.event_series_audit_events FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Owners manage event crew" ON public.event_crew_roles;
CREATE POLICY "Owners and crew read event crew"
  ON public.event_crew_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_event_operator(event_id, 'manage_crew'));
REVOKE INSERT, UPDATE, DELETE ON public.event_crew_roles FROM anon, authenticated;
GRANT SELECT ON public.event_crew_roles TO authenticated;

DROP POLICY IF EXISTS "Assigned crew read managed events" ON public.events;
CREATE POLICY "Assigned crew read managed events"
  ON public.events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_crew_roles c
    WHERE c.event_id = events.id AND c.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.list_my_organizer_event_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id FROM public.events e
  WHERE auth.uid() IS NOT NULL
    AND (
      e.created_by = auth.uid()
      OR e.organizer_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.event_crew_roles c
        WHERE c.event_id = e.id AND c.user_id = auth.uid()
      )
    )
  ORDER BY e.event_date NULLS LAST, e.created_at;
$$;
REVOKE ALL ON FUNCTION public.list_my_organizer_event_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_organizer_event_ids() TO authenticated;

DROP POLICY IF EXISTS "Series owners manage own series" ON public.event_series;
CREATE POLICY "Series owners read own series"
  ON public.event_series FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE INSERT, UPDATE, DELETE ON public.event_series FROM anon, authenticated;
GRANT SELECT ON public.event_series TO authenticated;

DROP POLICY IF EXISTS "Series owners manage occurrence exceptions" ON public.event_series_occurrences;
CREATE POLICY "Series owners read occurrence exceptions"
  ON public.event_series_occurrences FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_series s
    WHERE s.id = event_series_occurrences.series_id
      AND (s.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
REVOKE INSERT, UPDATE, DELETE ON public.event_series_occurrences FROM anon, authenticated;
GRANT SELECT ON public.event_series_occurrences TO authenticated;

DROP POLICY IF EXISTS "Owners can read messages on owned events" ON public.event_messages;
CREATE POLICY "Message operators read event messages"
  ON public.event_messages FOR SELECT TO authenticated
  USING (public.is_event_operator(event_id, 'message'));
DROP POLICY IF EXISTS "Owners can write messages on owned events" ON public.event_messages;
REVOKE INSERT, UPDATE, DELETE ON public.event_messages FROM anon, authenticated;
GRANT SELECT ON public.event_messages, public.event_message_recipients TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_new_event_readiness_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE subject_id uuid := COALESCE(NEW.organizer_id, NEW.created_by);
BEGIN
  IF subject_id IS NOT NULL
     AND public.evaluate_feature_flag('organizer_readiness_enforcement', subject_id, 'internal') THEN
    NEW.organizer_readiness_required := true;
    NEW.readiness_enforcement_version := 'organizer-readiness-v2';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_new_event_readiness_requirement() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_mark_new_event_readiness_requirement ON public.events;
CREATE TRIGGER trg_mark_new_event_readiness_requirement
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.mark_new_event_readiness_requirement();

CREATE OR REPLACE FUNCTION public.manage_event_crew_role_atomic(
  p_event_id uuid,
  p_user_id uuid,
  p_action text,
  p_can_check_in boolean DEFAULT false,
  p_can_message_attendees boolean DEFAULT false,
  p_can_edit_event boolean DEFAULT false,
  p_can_view_finance boolean DEFAULT false,
  p_can_moderate boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  before_row public.event_crew_roles%ROWTYPE;
  after_row public.event_crew_roles%ROWTYPE;
  event_owner uuid;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'manage_crew') THEN
    RAISE EXCEPTION 'EVENT_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_action NOT IN ('upsert', 'remove')
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_CREW_MUTATION' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(organizer_id, created_by) INTO event_owner
  FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF event_owner IS NULL THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_user_id = event_owner THEN
    RAISE EXCEPTION 'EVENT_OWNER_ALREADY_HAS_ACCESS' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE COALESCE(p.user_id, p.id) = p_user_id AND COALESCE(p.user_origin, 'unknown') = 'real'
  ) THEN
    RAISE EXCEPTION 'REAL_CREW_PROFILE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_operation_audits
    WHERE actor_user_id = actor_id AND idempotency_key = p_idempotency_key
  ) THEN
    SELECT * INTO after_row FROM public.event_crew_roles
    WHERE event_id = p_event_id AND user_id = p_user_id;
    RETURN jsonb_build_object('event_id', p_event_id, 'user_id', p_user_id,
      'action', p_action, 'replayed', true, 'role_id', after_row.id);
  END IF;

  SELECT * INTO before_row FROM public.event_crew_roles
  WHERE event_id = p_event_id AND user_id = p_user_id FOR UPDATE;

  IF p_action = 'remove' THEN
    DELETE FROM public.event_crew_roles WHERE event_id = p_event_id AND user_id = p_user_id;
  ELSE
    IF NOT (p_can_check_in OR p_can_message_attendees OR p_can_edit_event OR p_can_view_finance OR p_can_moderate) THEN
      RAISE EXCEPTION 'AT_LEAST_ONE_CREW_CAPABILITY_REQUIRED' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.event_crew_roles (
      event_id, user_id, can_check_in, can_message_attendees, can_edit_event,
      can_view_finance, can_moderate, granted_by, updated_at
    ) VALUES (
      p_event_id, p_user_id, p_can_check_in, p_can_message_attendees, p_can_edit_event,
      p_can_view_finance, p_can_moderate, actor_id, now()
    )
    ON CONFLICT (event_id, user_id) DO UPDATE SET
      can_check_in = EXCLUDED.can_check_in,
      can_message_attendees = EXCLUDED.can_message_attendees,
      can_edit_event = EXCLUDED.can_edit_event,
      can_view_finance = EXCLUDED.can_view_finance,
      can_moderate = EXCLUDED.can_moderate,
      granted_by = actor_id,
      updated_at = now()
    RETURNING * INTO after_row;
  END IF;

  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, reason, idempotency_key, metadata
  ) VALUES (
    p_event_id, actor_id, 'event_crew_' || p_action, left(btrim(p_reason), 500), p_idempotency_key,
    jsonb_build_object(
      'crew_user_id', p_user_id,
      'before_capabilities', CASE WHEN before_row.id IS NULL THEN NULL ELSE jsonb_build_object(
        'check_in', before_row.can_check_in, 'message', before_row.can_message_attendees,
        'edit', before_row.can_edit_event, 'finance', before_row.can_view_finance,
        'moderate', before_row.can_moderate) END,
      'after_capabilities', CASE WHEN p_action = 'remove' THEN NULL ELSE jsonb_build_object(
        'check_in', after_row.can_check_in, 'message', after_row.can_message_attendees,
        'edit', after_row.can_edit_event, 'finance', after_row.can_view_finance,
        'moderate', after_row.can_moderate) END,
      'admin_override', public.has_role(actor_id, 'admin'::public.app_role)
    )
  );
  RETURN jsonb_build_object('event_id', p_event_id, 'user_id', p_user_id,
    'action', p_action, 'replayed', false, 'role_id', after_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_organizer_readiness_assessment_atomic(
  p_event_id uuid,
  p_checklist jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  required_keys text[] := ARRAY[
    'identity','description','safety','location','capacity','cancellation',
    'checkin','communication','accessibility','legal_tax'
  ];
  key_name text;
  complete_count integer := 0;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR jsonb_typeof(COALESCE(p_checklist, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_READINESS_CHECKLIST' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_checklist)) <> cardinality(required_keys) THEN
    RAISE EXCEPTION 'INVALID_READINESS_CHECKLIST' USING ERRCODE = '22023';
  END IF;
  FOREACH key_name IN ARRAY required_keys LOOP
    IF NOT (p_checklist ? key_name) OR jsonb_typeof(p_checklist->key_name) <> 'boolean' THEN
      RAISE EXCEPTION 'INVALID_READINESS_CHECKLIST' USING ERRCODE = '22023';
    END IF;
    IF (p_checklist->>key_name)::boolean THEN complete_count := complete_count + 1; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.event_operation_audits
    WHERE actor_user_id = actor_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'replayed', true, 'complete_count', complete_count);
  END IF;
  INSERT INTO public.organizer_readiness_assessments (
    event_id, checklist_version, checklist, enforcement_state,
    assessed_by, assessed_at, updated_at
  ) VALUES (
    p_event_id, 'organizer-readiness-v2', p_checklist,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.organizer_readiness_required
    ) THEN 'required_for_publish' ELSE 'advisory' END,
    actor_id, now(), now()
  )
  ON CONFLICT (event_id) DO UPDATE SET
    checklist_version = EXCLUDED.checklist_version,
    checklist = EXCLUDED.checklist,
    enforcement_state = EXCLUDED.enforcement_state,
    assessed_by = actor_id,
    assessed_at = now(),
    updated_at = now();
  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, idempotency_key, metadata
  ) VALUES (
    p_event_id, actor_id, 'organizer_readiness_assessed', p_idempotency_key,
    jsonb_build_object('checklist_version', 'organizer-readiness-v2',
      'complete_count', complete_count, 'total_count', cardinality(required_keys))
  );
  RETURN jsonb_build_object('event_id', p_event_id, 'replayed', false,
    'complete_count', complete_count, 'total_count', cardinality(required_keys));
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_event_with_readiness_atomic(
  p_event_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  event_row public.events%ROWTYPE;
  checklist jsonb;
  blocking_keys text[] := ARRAY['identity','description','safety','location','capacity','cancellation','legal_tax'];
  key_name text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'PUBLISH_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('event-publish:' || p_event_id::text, 0));
  SELECT * INTO event_row FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF event_row.outcome_status = 'published' THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', 'published', 'replayed', true);
  END IF;
  IF event_row.outcome_status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'EVENT_NOT_PUBLISHABLE' USING ERRCODE = 'P0001';
  END IF;
  IF event_row.organizer_readiness_required THEN
    SELECT a.checklist INTO checklist FROM public.organizer_readiness_assessments a
    WHERE a.event_id = p_event_id AND a.checklist_version = 'organizer-readiness-v2';
    FOREACH key_name IN ARRAY blocking_keys LOOP
      IF checklist IS NULL OR COALESCE((checklist->>key_name)::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'EVENT_READINESS_INCOMPLETE:%', key_name USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;
  UPDATE public.events SET outcome_status = 'published', is_active = true, updated_at = now()
  WHERE id = p_event_id;
  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, previous_state, next_state, reason, idempotency_key,
    metadata
  ) VALUES (
    p_event_id, actor_id, 'event_published', event_row.outcome_status, 'published',
    left(btrim(p_reason), 500), p_idempotency_key,
    jsonb_build_object('readiness_required', event_row.organizer_readiness_required,
      'readiness_version', event_row.readiness_enforcement_version,
      'admin_override', public.has_role(actor_id, 'admin'::public.app_role))
  ) ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'published', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event_atomic(
  p_event_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id uuid := auth.uid(); event_row public.events%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('event-cancel:' || p_event_id::text, 0));
  SELECT * INTO event_row FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF event_row.outcome_status = 'cancelled' THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', 'cancelled', 'replayed', true);
  END IF;
  IF event_row.outcome_status IN ('completed', 'held', 'archived') THEN
    RAISE EXCEPTION 'EVENT_NOT_CANCELLABLE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.events SET outcome_status = 'cancelled', is_active = false,
    cancelled_at = now(), cancellation_reason = left(btrim(p_reason), 1000), updated_at = now()
  WHERE id = p_event_id;
  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, previous_state, next_state, reason,
    idempotency_key, metadata
  ) VALUES (
    p_event_id, actor_id, 'event_cancelled', event_row.outcome_status, 'cancelled',
    left(btrim(p_reason), 500), p_idempotency_key,
    jsonb_build_object('admin_override', public.has_role(actor_id, 'admin'::public.app_role))
  ) ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'cancelled', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_event_atomic(
  p_event_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id uuid := auth.uid(); event_row public.events%ROWTYPE; occurrence_id uuid;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_start_at <= now() + interval '15 minutes'
     OR p_end_at <= p_start_at OR p_end_at > p_start_at + interval '24 hours'
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_RESCHEDULE' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('event-reschedule:' || p_event_id::text, 0));
  SELECT * INTO event_row FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF event_row.outcome_status IN ('started', 'completed', 'held', 'cancelled', 'archived') THEN
    RAISE EXCEPTION 'EVENT_NOT_RESCHEDULABLE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_operation_audits
    WHERE actor_user_id = actor_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', event_row.outcome_status,
      'start_at', event_row.start_time, 'replayed', true);
  END IF;
  UPDATE public.events SET
    event_date = (p_start_at AT TIME ZONE 'Europe/Budapest')::date,
    event_time = (p_start_at AT TIME ZONE 'Europe/Budapest')::time,
    start_time = p_start_at,
    end_time = p_end_at,
    expected_end_at = p_end_at,
    reschedule_version = reschedule_version + 1,
    updated_at = now()
  WHERE id = p_event_id;
  UPDATE public.event_series_occurrences SET
    occurrence_start = p_start_at, occurrence_state = 'rescheduled',
    exception_reason = left(btrim(p_reason), 500), updated_at = now()
  WHERE event_id = p_event_id RETURNING id INTO occurrence_id;
  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, previous_state, next_state, reason,
    idempotency_key, metadata
  ) VALUES (
    p_event_id, actor_id, 'event_rescheduled', event_row.outcome_status, event_row.outcome_status,
    left(btrim(p_reason), 500), p_idempotency_key,
    jsonb_build_object('previous_start', event_row.start_time, 'next_start', p_start_at,
      'previous_end', event_row.end_time, 'next_end', p_end_at,
      'series_occurrence_id', occurrence_id,
      'admin_override', public.has_role(actor_id, 'admin'::public.app_role))
  );
  RETURN jsonb_build_object('event_id', p_event_id, 'status', event_row.outcome_status,
    'start_at', p_start_at, 'end_at', p_end_at, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.organizer_send_event_message_atomic(
  p_event_id uuid,
  p_message_type text,
  p_audience_filter text,
  p_subject text,
  p_body text,
  p_scheduled_for timestamptz,
  p_selected_participation_ids uuid[],
  p_idempotency_key uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  message_id uuid;
  event_title text;
  recipient record;
  recipient_count integer := 0;
  selected_count integer := COALESCE(cardinality(p_selected_participation_ids), 0);
  scheduled_at timestamptz := COALESCE(p_scheduled_for, now());
  delivery_state text;
BEGIN
  IF actor_id IS NULL OR NOT public.is_event_operator(p_event_id, 'message') THEN
    RAISE EXCEPTION 'EVENT_MESSAGING_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(COALESCE(p_request_id, ''))) NOT BETWEEN 8 AND 200
     OR p_message_type NOT IN ('reminder','logistics_update','event_update','cancellation','custom_message')
     OR p_audience_filter NOT IN ('all','going','waitlist','checked_in','selected')
     OR length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 4000
     OR length(btrim(COALESCE(p_subject, ''))) > 160
     OR scheduled_at < now() - interval '5 minutes'
     OR scheduled_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'INVALID_ORGANIZER_MESSAGE' USING ERRCODE = '22023';
  END IF;
  IF (p_audience_filter = 'selected' AND selected_count NOT BETWEEN 1 AND 500)
     OR (p_audience_filter <> 'selected' AND selected_count <> 0) THEN
    RAISE EXCEPTION 'INVALID_SELECTED_AUDIENCE' USING ERRCODE = '22023';
  END IF;
  SELECT m.id INTO message_id FROM public.event_messages m
  WHERE m.actor_user_id = actor_id AND m.idempotency_key = p_idempotency_key;
  IF message_id IS NOT NULL THEN
    RETURN jsonb_build_object('message_id', message_id, 'replayed', true);
  END IF;
  IF (
    SELECT count(*) FROM public.event_messages m
    WHERE m.actor_user_id = actor_id AND m.created_at >= now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'ORGANIZER_MESSAGE_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  SELECT e.title INTO event_title FROM public.events e WHERE e.id = p_event_id FOR UPDATE;
  IF event_title IS NULL THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_audience_filter = 'selected' AND EXISTS (
    SELECT 1 FROM unnest(p_selected_participation_ids) selected_id
    LEFT JOIN public.event_participants ep ON ep.id = selected_id AND ep.event_id = p_event_id
    WHERE ep.id IS NULL OR ep.status NOT IN ('going','waitlist','checked_in')
  ) THEN
    RAISE EXCEPTION 'SELECTED_AUDIENCE_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  delivery_state := CASE WHEN scheduled_at > now() + interval '5 seconds' THEN 'scheduled' ELSE 'sent' END;
  INSERT INTO public.event_messages (
    event_id, actor_user_id, message_type, audience_filter, subject, body,
    delivery_state, scheduled_for, idempotency_key, request_id
  ) VALUES (
    p_event_id, actor_id, p_message_type, p_audience_filter,
    NULLIF(btrim(COALESCE(p_subject, '')), ''), btrim(p_body), delivery_state,
    CASE WHEN delivery_state = 'scheduled' THEN scheduled_at ELSE NULL END,
    p_idempotency_key, btrim(p_request_id)
  ) RETURNING id INTO message_id;

  FOR recipient IN
    SELECT ep.id participation_id, ep.user_id
    FROM public.event_participants ep
    WHERE ep.event_id = p_event_id
      AND ep.status IN ('going','waitlist','checked_in')
      AND (
        p_audience_filter = 'all'
        OR p_audience_filter = ep.status
        OR (p_audience_filter = 'selected' AND ep.id = ANY(p_selected_participation_ids))
      )
    ORDER BY ep.joined_at, ep.id
    LIMIT 5000
  LOOP
    INSERT INTO public.event_message_recipients (
      message_id, participation_id, recipient_user_id, selection_source
    ) VALUES (message_id, recipient.participation_id, recipient.user_id, p_audience_filter);
    PERFORM public.enqueue_notification(
      recipient.user_id, 'organizer_message',
      COALESCE(NULLIF(btrim(COALESCE(p_subject, '')), ''), 'Üzenet a szervezőtől'), btrim(p_body),
      jsonb_build_object('event_id', p_event_id, 'message_id', message_id,
        'event_title', event_title, 'deep_link', '/events/' || p_event_id::text,
        'source_type', 'organizer_message', 'source_id', message_id),
      'organizer-message:' || p_event_id::text,
      'organizer-message:' || message_id::text || ':' || recipient.user_id::text || ':in_app',
      actor_id, NULL, 1, scheduled_at, NULL, gen_random_uuid(), 'in_app'
    );
    PERFORM public.enqueue_notification(
      recipient.user_id, 'organizer_message',
      COALESCE(NULLIF(btrim(COALESCE(p_subject, '')), ''), 'Üzenet a szervezőtől'), btrim(p_body),
      jsonb_build_object('event_id', p_event_id, 'message_id', message_id,
        'event_title', event_title, 'deep_link', '/events/' || p_event_id::text,
        'source_type', 'organizer_message', 'source_id', message_id),
      'organizer-message:' || p_event_id::text,
      'organizer-message:' || message_id::text || ':' || recipient.user_id::text || ':email',
      actor_id, NULL, 1, scheduled_at, NULL, gen_random_uuid(), 'email'
    );
    PERFORM public.enqueue_notification(
      recipient.user_id, 'organizer_message',
      COALESCE(NULLIF(btrim(COALESCE(p_subject, '')), ''), 'Üzenet a szervezőtől'), btrim(p_body),
      jsonb_build_object('event_id', p_event_id, 'message_id', message_id,
        'event_title', event_title, 'deep_link', '/events/' || p_event_id::text,
        'source_type', 'organizer_message', 'source_id', message_id),
      'organizer-message:' || p_event_id::text,
      'organizer-message:' || message_id::text || ':' || recipient.user_id::text || ':push',
      actor_id, NULL, 1, scheduled_at, NULL, gen_random_uuid(), 'push'
    );
    recipient_count := recipient_count + 1;
  END LOOP;
  IF recipient_count = 0 THEN
    RAISE EXCEPTION 'ORGANIZER_MESSAGE_EMPTY_AUDIENCE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.event_messages SET audience_count = recipient_count WHERE id = message_id;
  INSERT INTO public.event_operation_audits (
    event_id, actor_user_id, action, idempotency_key, request_id, metadata
  ) VALUES (
    p_event_id, actor_id, 'organizer_message_' || delivery_state,
    p_idempotency_key, btrim(p_request_id),
    jsonb_build_object('message_id', message_id, 'message_type', p_message_type,
      'audience_filter', p_audience_filter, 'audience_count', recipient_count,
      'scheduled_for', CASE WHEN delivery_state = 'scheduled' THEN scheduled_at ELSE NULL END)
  );
  RETURN jsonb_build_object('message_id', message_id, 'delivery_state', delivery_state,
    'audience_count', recipient_count, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_event_series_atomic(
  p_action text,
  p_series_id uuid,
  p_title text,
  p_recurrence_rule text,
  p_timezone text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id uuid := auth.uid(); series_id uuid := p_series_id; before_row public.event_series%ROWTYPE; after_row public.event_series%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('create','update','deactivate') OR p_idempotency_key IS NULL
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_SERIES_MUTATION' USING ERRCODE = '22023';
  END IF;
  SELECT a.series_id INTO series_id FROM public.event_series_audit_events a
  WHERE a.actor_user_id = actor_id AND a.idempotency_key = p_idempotency_key;
  IF series_id IS NOT NULL THEN RETURN series_id; END IF;
  IF p_action = 'create' THEN
    IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 160
       OR length(btrim(COALESCE(p_recurrence_rule, ''))) NOT BETWEEN 1 AND 500
       OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
      RAISE EXCEPTION 'INVALID_SERIES_CONTRACT' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.event_series (owner_user_id, title, recurrence_rule, timezone)
    VALUES (actor_id, btrim(p_title), btrim(p_recurrence_rule), p_timezone)
    RETURNING * INTO after_row;
    series_id := after_row.id;
  ELSE
    SELECT * INTO before_row FROM public.event_series WHERE id = p_series_id FOR UPDATE;
    IF NOT FOUND OR (before_row.owner_user_id <> actor_id AND NOT public.has_role(actor_id, 'admin'::public.app_role)) THEN
      RAISE EXCEPTION 'SERIES_OWNER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_action = 'deactivate' THEN
      UPDATE public.event_series SET is_active = false, updated_at = now()
      WHERE id = p_series_id RETURNING * INTO after_row;
    ELSE
      IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 160
         OR length(btrim(COALESCE(p_recurrence_rule, ''))) NOT BETWEEN 1 AND 500
         OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
        RAISE EXCEPTION 'INVALID_SERIES_CONTRACT' USING ERRCODE = '22023';
      END IF;
      UPDATE public.event_series SET title = btrim(p_title), recurrence_rule = btrim(p_recurrence_rule),
        timezone = p_timezone, updated_at = now()
      WHERE id = p_series_id RETURNING * INTO after_row;
    END IF;
    series_id := p_series_id;
  END IF;
  INSERT INTO public.event_series_audit_events (
    series_id, actor_user_id, action, reason, before_state, after_state, idempotency_key
  ) VALUES (
    series_id, actor_id, 'series_' || p_action, left(btrim(p_reason), 500),
    CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) - ARRAY['owner_user_id']::text[] END,
    to_jsonb(after_row) - ARRAY['owner_user_id']::text[], p_idempotency_key
  );
  RETURN series_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_event_series_occurrence_atomic(
  p_series_id uuid,
  p_occurrence_id uuid,
  p_event_id uuid,
  p_original_start timestamptz,
  p_occurrence_start timestamptz,
  p_occurrence_state text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id uuid := auth.uid(); occurrence_id uuid := p_occurrence_id; owner_id uuid; before_row public.event_series_occurrences%ROWTYPE; after_row public.event_series_occurrences%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR p_idempotency_key IS NULL
     OR p_occurrence_state NOT IN ('scheduled','skipped','rescheduled','cancelled')
     OR p_original_start IS NULL OR p_occurrence_start IS NULL
     OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_OCCURRENCE_MUTATION' USING ERRCODE = '22023';
  END IF;
  SELECT owner_user_id INTO owner_id FROM public.event_series WHERE id = p_series_id FOR UPDATE;
  IF owner_id IS NULL OR (owner_id <> actor_id AND NOT public.has_role(actor_id, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'SERIES_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT a.occurrence_id INTO occurrence_id FROM public.event_series_audit_events a
  WHERE a.actor_user_id = actor_id AND a.idempotency_key = p_idempotency_key;
  IF occurrence_id IS NOT NULL THEN RETURN occurrence_id; END IF;
  IF p_event_id IS NOT NULL AND NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_occurrence_id IS NOT NULL THEN
    SELECT * INTO before_row FROM public.event_series_occurrences
    WHERE id = p_occurrence_id AND series_id = p_series_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OCCURRENCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.event_series_occurrences SET
      event_id = COALESCE(p_event_id, event_id), occurrence_start = p_occurrence_start,
      occurrence_state = p_occurrence_state, exception_reason = left(btrim(p_reason), 500),
      updated_at = now()
    WHERE id = p_occurrence_id RETURNING * INTO after_row;
  ELSE
    INSERT INTO public.event_series_occurrences (
      series_id, event_id, original_start, occurrence_start, occurrence_state, exception_reason
    ) VALUES (
      p_series_id, p_event_id, p_original_start, p_occurrence_start,
      p_occurrence_state, left(btrim(p_reason), 500)
    ) RETURNING * INTO after_row;
  END IF;
  occurrence_id := after_row.id;
  INSERT INTO public.event_series_audit_events (
    series_id, occurrence_id, actor_user_id, action, reason, before_state, after_state, idempotency_key
  ) VALUES (
    p_series_id, occurrence_id, actor_id, 'occurrence_' || p_occurrence_state,
    left(btrim(p_reason), 500),
    CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) - 'event_id' END,
    to_jsonb(after_row) - 'event_id', p_idempotency_key
  );
  RETURN occurrence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_event_crew_role_atomic(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_organizer_readiness_assessment_atomic(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_event_with_readiness_atomic(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_event_atomic(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_event_atomic(uuid, timestamptz, timestamptz, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_send_event_message_atomic(uuid, text, text, text, text, timestamptz, uuid[], uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_event_series_atomic(text, uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_event_series_occurrence_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_event_crew_role_atomic(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_organizer_readiness_assessment_atomic(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_event_with_readiness_atomic(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_atomic(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_event_atomic(uuid, timestamptz, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_send_event_message_atomic(uuid, text, text, text, text, timestamptz, uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_event_series_atomic(text, uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_event_series_occurrence_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) TO authenticated;

COMMENT ON TABLE public.event_message_recipients IS
  'Immutable event-scoped recipient evidence; supports selected-audience delivery without arbitrary user-id fanout.';
COMMENT ON FUNCTION public.publish_event_with_readiness_atomic(uuid, text, uuid) IS
  'Progressive enforcement: only events marked by the disabled-by-default readiness flag require the v2 blocking checklist.';

COMMIT;
