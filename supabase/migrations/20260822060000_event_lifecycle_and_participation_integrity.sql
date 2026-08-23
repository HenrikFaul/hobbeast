-- Prompt 06: canonical event lifecycle + atomic participation integrity.
-- Rollback: revoke the RPCs first, restore the previous participant policies,
-- drop the new tables/columns only after exporting audit/feedback rows. Existing
-- outcome_status values remain backward compatible (`scheduled`, `held`).

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS meeting_instructions text,
  ADD COLUMN IF NOT EXISTS expected_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS beginner_friendly boolean,
  ADD COLUMN IF NOT EXISTS activity_intensity text,
  ADD COLUMN IF NOT EXISTS equipment_required text,
  ADD COLUMN IF NOT EXISTS accessibility_info text,
  ADD COLUMN IF NOT EXISTS cost_details text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS private_location_reveal_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS venue_validation_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS host_responsibility_accepted_at timestamptz;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_outcome_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_outcome_status_check
  CHECK (outcome_status IN (
    'scheduled', 'held',
    'draft', 'published', 'full', 'started', 'completed', 'cancelled', 'archived'
  ));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_private_location_reveal_hours_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_private_location_reveal_hours_check
  CHECK (private_location_reveal_hours BETWEEN 0 AND 168);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_venue_validation_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_venue_validation_status_check
  CHECK (venue_validation_status IN ('unverified', 'verified', 'rejected'));

ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS arriving_alone boolean,
  ADD COLUMN IF NOT EXISTS first_hobbeast_event boolean,
  ADD COLUMN IF NOT EXISTS arrival_visibility text NOT NULL DEFAULT 'host_only',
  ADD COLUMN IF NOT EXISTS last_mutation_key uuid;

ALTER TABLE public.event_participants DROP CONSTRAINT IF EXISTS event_participants_arrival_visibility_check;
ALTER TABLE public.event_participants
  ADD CONSTRAINT event_participants_arrival_visibility_check
  CHECK (arrival_visibility IN ('host_only', 'buddy_opt_in'));

-- NOT VALID protects legacy data while every new mutation is forced through a
-- validated RPC. A later data-quality release can validate after inventory.
ALTER TABLE public.event_participants DROP CONSTRAINT IF EXISTS event_participants_status_contract_check;
ALTER TABLE public.event_participants
  ADD CONSTRAINT event_participants_status_contract_check
  CHECK (status IN ('invited', 'interested', 'going', 'waitlist', 'checked_in', 'completed', 'cancelled', 'no_show'))
  NOT VALID;

CREATE TABLE IF NOT EXISTS public.event_crew_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_check_in boolean NOT NULL DEFAULT false,
  can_message_attendees boolean NOT NULL DEFAULT false,
  can_edit_event boolean NOT NULL DEFAULT false,
  can_view_finance boolean NOT NULL DEFAULT false,
  can_moderate boolean NOT NULL DEFAULT false,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.event_operation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participation_id uuid REFERENCES public.event_participants(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_state text,
  next_state text,
  reason text,
  idempotency_key uuid NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS event_operation_audits_event_created_idx
  ON public.event_operation_audits (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_event_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description_accuracy smallint,
  felt_safe boolean,
  would_return boolean,
  private_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id),
  CHECK (description_accuracy IS NULL OR description_accuracy BETWEEN 1 AND 5),
  CHECK (private_note IS NULL OR char_length(private_note) <= 1000)
);

ALTER TABLE public.event_crew_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_operation_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_event_feedback ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_event_operator(p_event_id uuid, p_capability text DEFAULT 'view_participants')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id
        AND (e.created_by = auth.uid() OR e.organizer_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.event_crew_roles c
      WHERE c.event_id = p_event_id
        AND c.user_id = auth.uid()
        AND p_capability <> 'manage_crew'
        AND CASE p_capability
          WHEN 'check_in' THEN c.can_check_in
          WHEN 'message' THEN c.can_message_attendees
          WHEN 'edit' THEN c.can_edit_event
          WHEN 'finance' THEN c.can_view_finance
          WHEN 'moderate' THEN c.can_moderate
          WHEN 'view_participants' THEN c.can_check_in OR c.can_message_attendees OR c.can_moderate
          ELSE false
        END
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_event_operator(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_operator(uuid, text) TO authenticated;

-- Exact location is a server-side decision, not a CSS/UI convention. A
-- service-role caller may pass the already authenticated requester id; direct
-- authenticated callers cannot spoof it because auth.uid() wins.
CREATE OR REPLACE FUNCTION public.event_location_precision(
  p_event_id uuid,
  p_requester_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_requester uuid;
  v_safety_visibility text;
  v_private boolean;
  v_active_participant boolean := false;
  v_start timestamptz;
BEGIN
  v_requester := CASE WHEN auth.role() = 'service_role' THEN p_requester_id ELSE auth.uid() END;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN 'coarse'; END IF;
  IF v_requester = v_event.created_by OR v_requester = v_event.organizer_id THEN RETURN 'full'; END IF;

  IF to_regclass('public.event_safety_profiles') IS NOT NULL THEN
    EXECUTE 'SELECT venue_visibility FROM public.event_safety_profiles WHERE event_id = $1'
      INTO v_safety_visibility USING p_event_id;
  END IF;
  v_private := COALESCE(v_event.visibility_type, 'public') <> 'public'
    OR COALESCE(v_safety_visibility, '') IN ('participant_only', 'private_exact_after_join');
  IF NOT v_private THEN RETURN 'full'; END IF;

  IF v_requester IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = p_event_id AND ep.user_id = v_requester
        AND ep.status IN ('going', 'checked_in', 'completed')
    ) INTO v_active_participant;
  END IF;
  IF NOT v_active_participant THEN RETURN 'coarse'; END IF;

  v_start := v_event.start_time;
  IF v_start IS NULL AND v_event.event_date IS NOT NULL THEN
    v_start := (v_event.event_date::text || ' ' || COALESCE(v_event.event_time::text, '00:00:00'))::timestamp AT TIME ZONE 'UTC';
  END IF;
  IF v_start IS NULL THEN RETURN 'rsvp_detail'; END IF;
  IF now() >= v_start - make_interval(hours => COALESCE(v_event.private_location_reveal_hours, 24)) THEN
    RETURN 'full';
  END IF;
  RETURN 'rsvp_detail';
END;
$$;

CREATE OR REPLACE FUNCTION public.event_safe_payload(p_event_id uuid, p_requester_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_requester uuid;
  v_precision text;
  v_payload jsonb;
  v_is_participant boolean := false;
  v_is_reviewer boolean := false;
  v_removed boolean := false;
  v_suspended boolean := false;
  v_blocked boolean := false;
BEGIN
  v_requester := CASE WHEN auth.role() = 'service_role' THEN p_requester_id ELSE auth.uid() END;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_requester IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = p_event_id AND ep.user_id = v_requester
        AND ep.status IN ('going', 'waitlist', 'checked_in', 'completed')
    ) INTO v_is_participant;
  END IF;

  -- Prompt 13 functions are installed later; dynamic calls preserve migration
  -- ordering while enforcing their removal/suspension/block rules at runtime.
  IF to_regprocedure('public.is_resource_removed(text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_resource_removed(''event'', $1)' INTO v_removed USING p_event_id::text;
  END IF;
  IF to_regprocedure('public.is_user_suspended(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_user_suspended($1)' INTO v_suspended USING v_event.created_by;
  END IF;
  IF v_requester IS NOT NULL AND to_regprocedure('public.is_safety_reviewer(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_safety_reviewer($1)' INTO v_is_reviewer USING v_requester;
  END IF;
  IF v_requester IS NOT NULL AND to_regprocedure('public.is_blocked_between(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_blocked_between($1, $2)' INTO v_blocked USING v_requester, v_event.created_by;
  END IF;

  IF (v_removed OR v_suspended OR v_blocked)
    AND v_requester IS DISTINCT FROM v_event.created_by
    AND NOT v_is_reviewer
    AND NOT v_is_participant THEN
    RETURN NULL;
  END IF;
  IF NOT v_event.is_active
    AND v_requester IS DISTINCT FROM v_event.created_by
    AND NOT v_is_reviewer
    AND NOT v_is_participant THEN
    RETURN NULL;
  END IF;

  v_precision := public.event_location_precision(p_event_id, v_requester);
  v_payload := to_jsonb(v_event) || jsonb_build_object('_location_precision', v_precision, '_exact_location_visible', v_precision = 'full');
  IF v_precision <> 'full' THEN
    v_payload := v_payload || jsonb_build_object(
      'location_address', NULL, 'location_free_text', NULL,
      'location_lat', NULL, 'location_lon', NULL,
      'place_address', NULL, 'place_postcode', NULL,
      'place_lat', NULL, 'place_lon', NULL,
      'place_details', NULL, 'place_diagnostics', NULL,
      'place_source_ids', NULL, 'meeting_instructions', NULL
    );
  END IF;
  IF v_precision = 'coarse' THEN
    v_payload := v_payload || jsonb_build_object('place_name', NULL);
  END IF;
  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_discoverable_events_safe(
  p_from_date date,
  p_requester_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_id uuid;
  v_payload jsonb;
BEGIN
  FOR v_event_id IN
    SELECT e.id FROM public.events e
    WHERE e.is_active = true AND e.event_date >= COALESCE(p_from_date, current_date)
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000)
  LOOP
    v_payload := public.event_safe_payload(v_event_id, p_requester_id);
    IF v_payload IS NOT NULL THEN RETURN NEXT v_payload; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.event_location_precision(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_safe_payload(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_discoverable_events_safe(date, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_location_precision(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_safe_payload(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_discoverable_events_safe(date, uuid, integer) TO anon, authenticated, service_role;

-- Prevent direct PostgREST reads from bypassing the precision decision. Existing
-- safe column queries keep working; exact fields are available only via the
-- payload RPC above after owner/RSVP/time/safety checks.
REVOKE SELECT ON TABLE public.events FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, created_by, organizer_id, title, description, category,
  event_date, event_time, start_time, end_time, max_attendees,
  image_emoji, tags, is_active, created_at, updated_at,
  location_type, location_city, location_district,
  visibility_type, participation_type, waitlist_enabled,
  place_categories, place_city, place_country, place_distance_m,
  place_source, place_category_confidence,
  outcome_status, registrations_count, cancellations_count, attended_count,
  average_rating, rating_count,
  started_at, completed_at, cancelled_at, archived_at, cancellation_reason,
  expected_end_at, beginner_friendly, activity_intensity,
  equipment_required, accessibility_info, cost_details, cancellation_policy,
  private_location_reveal_hours, venue_validation_status, host_responsibility_accepted_at
) ON public.events TO anon, authenticated;

DROP POLICY IF EXISTS "Trip plans are viewable by authenticated users" ON public.event_trip_plans;
DROP POLICY IF EXISTS "Trip plans viewable by authenticated" ON public.event_trip_plans;
CREATE POLICY "Trip plans follow event location precision" ON public.event_trip_plans
  FOR SELECT TO authenticated
  USING (public.event_location_precision(event_id, NULL) = 'full');

DROP POLICY IF EXISTS "Crew can view own event roles" ON public.event_crew_roles;
CREATE POLICY "Crew can view own event roles" ON public.event_crew_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_event_operator(event_id, 'edit'));

DROP POLICY IF EXISTS "Owners manage event crew" ON public.event_crew_roles;
CREATE POLICY "Owners manage event crew" ON public.event_crew_roles
  FOR ALL TO authenticated
  USING (public.is_event_operator(event_id, 'manage_crew'))
  WITH CHECK (public.is_event_operator(event_id, 'manage_crew'));

DROP POLICY IF EXISTS "Event operators read operation audits" ON public.event_operation_audits;
CREATE POLICY "Event operators read operation audits" ON public.event_operation_audits
  FOR SELECT TO authenticated
  USING (public.is_event_operator(event_id, 'view_participants'));

DROP POLICY IF EXISTS "Users manage own post event feedback" ON public.post_event_feedback;
CREATE POLICY "Users manage own post event feedback" ON public.post_event_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = post_event_feedback.event_id
        AND ep.user_id = auth.uid()
        AND ep.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Admins read post event feedback" ON public.post_event_feedback;
CREATE POLICY "Admins read post event feedback" ON public.post_event_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Remove the broad row-level disclosure and every direct mutation route. Event
-- cards consume the aggregate RPC below; users/organizers mutate via audited
-- functions. Service-role maintenance remains unaffected by RLS.
DROP POLICY IF EXISTS "Participants viewable by authenticated" ON public.event_participants;
DROP POLICY IF EXISTS "Participants readable by authenticated" ON public.event_participants;
DROP POLICY IF EXISTS "Users can join events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave own participation" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can update participants" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can manage participant rows" ON public.event_participants;

CREATE POLICY "Participants read own or operated event" ON public.event_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_event_operator(event_id, 'view_participants'));

CREATE OR REPLACE FUNCTION public.public_event_participant_counts(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  total bigint,
  going bigint,
  waitlist bigint,
  checked_in bigint,
  completed bigint,
  cancelled bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(array_length(p_event_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'EVENT_COUNT_LIMIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    ep.event_id,
    count(*) FILTER (WHERE ep.status IN ('going', 'waitlist', 'checked_in', 'completed')),
    count(*) FILTER (WHERE ep.status = 'going'),
    count(*) FILTER (WHERE ep.status = 'waitlist'),
    count(*) FILTER (WHERE ep.status = 'checked_in'),
    count(*) FILTER (WHERE ep.status = 'completed'),
    count(*) FILTER (WHERE ep.status IN ('cancelled', 'no_show'))
  FROM public.event_participants ep
  JOIN public.profiles p ON p.user_id = ep.user_id AND p.user_origin = 'real' AND p.is_active = true
  WHERE ep.event_id = ANY(COALESCE(p_event_ids, ARRAY[]::uuid[]))
  GROUP BY ep.event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_event_participant_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_event_participant_counts(uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.join_event_atomic(p_event_id uuid, p_idempotency_key uuid)
RETURNS TABLE (participation_id uuid, participation_status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_participation public.event_participants%ROWTYPE;
  v_active_count integer;
  v_next_status text;
  v_start timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR NOT v_event.is_active THEN RAISE EXCEPTION 'EVENT_NOT_AVAILABLE' USING ERRCODE = 'P0002'; END IF;
  IF v_event.outcome_status IN ('started', 'completed', 'held', 'cancelled', 'archived') THEN
    RAISE EXCEPTION 'EVENT_NOT_JOINABLE' USING ERRCODE = 'P0001';
  END IF;
  v_start := COALESCE(
    v_event.start_time,
    CASE WHEN v_event.event_date IS NOT NULL THEN
      (v_event.event_date::text || ' ' || COALESCE(v_event.event_time::text, '00:00:00'))::timestamp AT TIME ZONE 'UTC'
    END
  );
  IF v_start IS NOT NULL AND v_start <= now() THEN
    RAISE EXCEPTION 'EVENT_ALREADY_STARTED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (b.blocker_id = v_user_id AND b.blocked_id = COALESCE(v_event.organizer_id, v_event.created_by))
       OR (b.blocked_id = v_user_id AND b.blocker_id = COALESCE(v_event.organizer_id, v_event.created_by))
  ) THEN
    RAISE EXCEPTION 'EVENT_ORGANIZER_BLOCKED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_participation
  FROM public.event_participants
  WHERE event_id = p_event_id AND user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_participation.status IN ('going', 'waitlist', 'checked_in', 'completed') THEN
    RETURN QUERY SELECT v_participation.id, v_participation.status, true;
    RETURN;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.event_participants
  WHERE event_id = p_event_id AND status IN ('going', 'checked_in', 'completed');

  IF v_event.max_attendees IS NULL OR v_active_count < v_event.max_attendees THEN
    v_next_status := 'going';
  ELSIF COALESCE(v_event.waitlist_enabled, false) THEN
    v_next_status := 'waitlist';
  ELSE
    RAISE EXCEPTION 'EVENT_FULL_NO_WAITLIST' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.event_participants (event_id, user_id, status, status_updated_at, last_mutation_key)
  VALUES (p_event_id, v_user_id, v_next_status, now(), p_idempotency_key)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        status_updated_at = now(),
        last_mutation_key = EXCLUDED.last_mutation_key,
        checked_in_at = NULL,
        completed_at = NULL,
        no_show_marked_at = NULL
  RETURNING * INTO v_participation;

  INSERT INTO public.participation_audits (participation_id, event_id, action, actor_user_id, metadata)
  VALUES (v_participation.id, p_event_id, 'joined_atomic', v_user_id,
    jsonb_build_object('status', v_next_status, 'idempotency_key', p_idempotency_key));

  INSERT INTO public.event_operation_audits
    (event_id, participation_id, actor_user_id, action, next_state, idempotency_key)
  VALUES (p_event_id, v_participation.id, v_user_id, 'participant_join', v_next_status, p_idempotency_key)
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT v_participation.id, v_participation.status, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_participation_atomic(p_event_id uuid, p_idempotency_key uuid)
RETURNS TABLE (participation_id uuid, participation_status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participation public.event_participants%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  SELECT * INTO v_participation FROM public.event_participants
  WHERE event_id = p_event_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_participation.status = 'cancelled' THEN
    RETURN QUERY SELECT v_participation.id, v_participation.status, true;
    RETURN;
  END IF;
  IF v_participation.status IN ('checked_in', 'completed') THEN
    RAISE EXCEPTION 'VERIFIED_ATTENDANCE_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_participants
  SET status = 'cancelled', status_updated_at = now(), last_mutation_key = p_idempotency_key
  WHERE id = v_participation.id
  RETURNING * INTO v_participation;

  INSERT INTO public.participation_audits (participation_id, event_id, action, actor_user_id, metadata)
  VALUES (v_participation.id, p_event_id, 'cancelled_by_participant', v_user_id,
    jsonb_build_object('idempotency_key', p_idempotency_key));
  INSERT INTO public.event_operation_audits
    (event_id, participation_id, actor_user_id, action, previous_state, next_state, idempotency_key)
  VALUES (p_event_id, v_participation.id, v_user_id, 'participant_cancel', NULL, 'cancelled', p_idempotency_key)
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT v_participation.id, v_participation.status, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_arrival_confidence_atomic(
  p_event_id uuid,
  p_arriving_alone boolean,
  p_first_hobbeast_event boolean,
  p_arrival_visibility text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  participation_id uuid,
  arriving_alone boolean,
  first_hobbeast_event boolean,
  arrival_visibility text,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participation public.event_participants%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_arrival_visibility NOT IN ('host_only', 'buddy_opt_in') THEN
    RAISE EXCEPTION 'INVALID_ARRIVAL_VISIBILITY' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  SELECT * INTO v_participation
  FROM public.event_participants
  WHERE event_id = p_event_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_participation.status NOT IN ('going', 'waitlist', 'checked_in') THEN
    RAISE EXCEPTION 'ARRIVAL_CONFIDENCE_NOT_EDITABLE' USING ERRCODE = 'P0001';
  END IF;

  IF v_participation.last_mutation_key = p_idempotency_key THEN
    RETURN QUERY SELECT v_participation.id, v_participation.arriving_alone,
      v_participation.first_hobbeast_event, v_participation.arrival_visibility, true;
    RETURN;
  END IF;

  UPDATE public.event_participants
  SET arriving_alone = p_arriving_alone,
      first_hobbeast_event = p_first_hobbeast_event,
      arrival_visibility = p_arrival_visibility,
      last_mutation_key = p_idempotency_key,
      status_updated_at = now()
  WHERE id = v_participation.id
  RETURNING * INTO v_participation;

  INSERT INTO public.participation_audits (participation_id, event_id, action, actor_user_id, metadata)
  VALUES (
    v_participation.id,
    p_event_id,
    'arrival_confidence_updated',
    v_user_id,
    jsonb_build_object('visibility', p_arrival_visibility, 'idempotency_key', p_idempotency_key)
  );

  INSERT INTO public.event_operation_audits
    (event_id, participation_id, actor_user_id, action, previous_state, next_state, idempotency_key, metadata)
  VALUES (
    p_event_id,
    v_participation.id,
    v_user_id,
    'arrival_confidence_updated',
    v_participation.status,
    v_participation.status,
    p_idempotency_key,
    jsonb_build_object('visibility', p_arrival_visibility)
  )
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT v_participation.id, v_participation.arriving_alone,
    v_participation.first_hobbeast_event, v_participation.arrival_visibility, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.organizer_transition_participant_atomic(
  p_participation_id uuid,
  p_next_status text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS TABLE (participation_id uuid, participation_status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.event_participants%ROWTYPE;
  v_previous text;
  v_allowed boolean := false;
  v_max_attendees integer;
  v_active_count integer;
  v_event_outcome text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_next_status NOT IN ('going', 'waitlist', 'checked_in', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_PARTICIPATION_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.event_participants WHERE id = p_participation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_event_operator(v_row.event_id, 'check_in') THEN RAISE EXCEPTION 'EVENT_OPERATOR_REQUIRED' USING ERRCODE = '42501'; END IF;

  IF v_row.status = p_next_status THEN
    RETURN QUERY SELECT v_row.id, v_row.status, true;
    RETURN;
  END IF;

  v_allowed := CASE v_row.status
    WHEN 'invited' THEN p_next_status IN ('going', 'waitlist', 'cancelled')
    WHEN 'interested' THEN p_next_status IN ('going', 'waitlist', 'cancelled')
    WHEN 'going' THEN p_next_status IN ('checked_in', 'cancelled', 'no_show')
    WHEN 'waitlist' THEN p_next_status IN ('going', 'cancelled')
    WHEN 'checked_in' THEN p_next_status IN ('going', 'completed')
    WHEN 'cancelled' THEN p_next_status IN ('going', 'waitlist')
    WHEN 'no_show' THEN p_next_status IN ('going', 'checked_in')
    ELSE false
  END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'INVALID_PARTICIPATION_TRANSITION' USING ERRCODE = 'P0001'; END IF;
  IF p_next_status IN ('cancelled', 'no_show', 'going') AND char_length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'TRANSITION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_next_status IN ('going', 'checked_in') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_row.event_id::text, 0));
    SELECT max_attendees, outcome_status INTO v_max_attendees, v_event_outcome
    FROM public.events WHERE id = v_row.event_id FOR UPDATE;
    IF v_event_outcome IN ('completed', 'held', 'cancelled', 'archived') THEN
      RAISE EXCEPTION 'EVENT_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;
    IF v_row.status = 'waitlist' AND p_next_status = 'going' AND v_max_attendees IS NOT NULL THEN
      SELECT count(*) INTO v_active_count FROM public.event_participants
      WHERE event_id = v_row.event_id AND status IN ('going', 'checked_in', 'completed');
      IF v_active_count >= v_max_attendees THEN RAISE EXCEPTION 'EVENT_FULL' USING ERRCODE = 'P0001'; END IF;
    END IF;
  END IF;

  v_previous := v_row.status;
  UPDATE public.event_participants
  SET status = p_next_status,
      status_updated_at = now(),
      checked_in_at = CASE WHEN p_next_status = 'checked_in' THEN COALESCE(checked_in_at, now()) ELSE checked_in_at END,
      completed_at = CASE WHEN p_next_status = 'completed' THEN now() ELSE NULL END,
      no_show_marked_at = CASE WHEN p_next_status = 'no_show' THEN now() ELSE NULL END,
      last_mutation_key = p_idempotency_key
  WHERE id = p_participation_id
  RETURNING * INTO v_row;

  INSERT INTO public.participation_audits (participation_id, event_id, action, actor_user_id, metadata)
  VALUES (v_row.id, v_row.event_id, 'organizer_transition', v_actor,
    jsonb_build_object('from', v_previous, 'to', p_next_status, 'reason', left(trim(COALESCE(p_reason, '')), 200)));
  INSERT INTO public.event_operation_audits
    (event_id, participation_id, actor_user_id, action, previous_state, next_state, reason, idempotency_key)
  VALUES (v_row.event_id, v_row.id, v_actor, 'organizer_participant_transition', v_previous, p_next_status,
    left(trim(COALESCE(p_reason, '')), 200), p_idempotency_key)
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT v_row.id, v_row.status, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_organizer_note_atomic(
  p_participation_id uuid,
  p_note text,
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.event_participants%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF char_length(COALESCE(p_note, '')) > 2000 THEN RAISE EXCEPTION 'NOTE_TOO_LONG' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_row FROM public.event_participants WHERE id = p_participation_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_event_operator(v_row.event_id, 'view_participants') THEN
    RAISE EXCEPTION 'EVENT_OPERATOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_operation_audits WHERE actor_user_id = v_actor AND idempotency_key = p_idempotency_key) THEN RETURN; END IF;
  UPDATE public.event_participants SET organizer_note = NULLIF(trim(p_note), ''), updated_at = now() WHERE id = p_participation_id;
  INSERT INTO public.event_operation_audits
    (event_id, participation_id, actor_user_id, action, idempotency_key, metadata)
  VALUES (v_row.event_id, v_row.id, v_actor, 'organizer_note_updated', p_idempotency_key,
    jsonb_build_object('note_length', char_length(COALESCE(p_note, ''))));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_event_atomic(p_event_id uuid, p_reason text, p_idempotency_key uuid)
RETURNS TABLE (completed_participants integer, no_show_participants integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_completed integer := 0;
  v_no_show integer := 0;
  v_completion_not_before timestamptz;
BEGIN
  IF v_actor IS NULL OR NOT public.is_event_operator(p_event_id, 'edit') THEN
    RAISE EXCEPTION 'EVENT_OPERATOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'COMPLETION_REASON_REQUIRED' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_event.outcome_status = 'cancelled' THEN RAISE EXCEPTION 'CANCELLED_EVENT_CANNOT_COMPLETE' USING ERRCODE = 'P0001'; END IF;
  IF v_event.outcome_status IN ('completed', 'held') THEN
    RETURN QUERY SELECT
      count(*) FILTER (WHERE status = 'completed')::integer,
      count(*) FILTER (WHERE status = 'no_show')::integer
    FROM public.event_participants WHERE event_id = p_event_id;
    RETURN;
  END IF;
  -- `end_time` and `event_time` are bare `time` columns on the production
  -- schema; they only become comparable to now() when combined with
  -- `event_date`. A bare-time value inside this COALESCE would fail to unify
  -- with the timestamptz branches (proven by the dump-replay harness).
  v_completion_not_before := COALESCE(
    v_event.expected_end_at,
    CASE WHEN v_event.event_date IS NOT NULL AND v_event.end_time IS NOT NULL THEN
      (v_event.event_date::text || ' ' || v_event.end_time::text)::timestamp AT TIME ZONE 'UTC'
    END,
    v_event.start_time,
    CASE WHEN v_event.event_date IS NOT NULL THEN
      (v_event.event_date::text || ' ' || COALESCE(v_event.event_time::text, '00:00:00'))::timestamp AT TIME ZONE 'UTC'
    END
  );
  IF v_completion_not_before IS NOT NULL AND v_completion_not_before > now() THEN
    RAISE EXCEPTION 'FUTURE_EVENT_CANNOT_COMPLETE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.events
  SET outcome_status = 'completed', completed_at = now(), is_active = false, updated_at = now()
  WHERE id = p_event_id;

  UPDATE public.event_participants
  SET status = 'completed', completed_at = now(), status_updated_at = now(), last_mutation_key = p_idempotency_key
  WHERE event_id = p_event_id AND status = 'checked_in';
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  UPDATE public.event_participants
  SET status = 'no_show', no_show_marked_at = now(), status_updated_at = now(), last_mutation_key = p_idempotency_key
  WHERE event_id = p_event_id AND status = 'going';
  GET DIAGNOSTICS v_no_show = ROW_COUNT;

  UPDATE public.event_participants
  SET status = 'cancelled', status_updated_at = now(), last_mutation_key = p_idempotency_key
  WHERE event_id = p_event_id AND status = 'waitlist';

  INSERT INTO public.event_operation_audits
    (event_id, actor_user_id, action, previous_state, next_state, reason, idempotency_key,
     metadata)
  VALUES (p_event_id, v_actor, 'event_completed', v_event.outcome_status, 'completed', left(trim(p_reason), 200),
    p_idempotency_key, jsonb_build_object('completed', v_completed, 'no_show', v_no_show))
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  -- Prompt 04 contract: encounters derive only after this explicit event
  -- completion and only from checked-in/completed attendance. The earlier
  -- 20260822040100 migration provides this idempotent RPC.
  PERFORM public.generate_event_encounters(p_event_id);

  RETURN QUERY SELECT v_completed, v_no_show;
END;
$$;

-- Harden the legacy promotion trigger: one event-scoped lock, active lifecycle
-- guard, capacity counts checked-in/completed seats, and one locked FIFO row.
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next_id uuid;
  v_next_user_id uuid;
  v_max_attendees integer;
  v_active_count integer;
  v_outcome text;
  v_waitlist_enabled boolean;
BEGIN
  IF OLD.status = 'going' AND NEW.status IN ('cancelled', 'no_show') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));
    SELECT max_attendees, outcome_status, COALESCE(waitlist_enabled, false)
      INTO v_max_attendees, v_outcome, v_waitlist_enabled
    FROM public.events WHERE id = NEW.event_id;

    IF NOT v_waitlist_enabled OR v_outcome IN ('started', 'completed', 'held', 'cancelled', 'archived') THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_active_count FROM public.event_participants
    WHERE event_id = NEW.event_id AND status IN ('going', 'checked_in', 'completed');

    IF v_max_attendees IS NULL OR v_active_count < v_max_attendees THEN
      SELECT id, user_id INTO v_next_id, v_next_user_id
      FROM public.event_participants
      WHERE event_id = NEW.event_id AND status = 'waitlist'
      ORDER BY joined_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF v_next_id IS NOT NULL THEN
        UPDATE public.event_participants
        SET status = 'going', status_updated_at = now()
        WHERE id = v_next_id AND status = 'waitlist';
        INSERT INTO public.participation_audits (participation_id, event_id, actor_user_id, action, metadata)
        VALUES (v_next_id, NEW.event_id, NULL, 'auto_promoted_from_waitlist', jsonb_build_object('capacity_released_by', NEW.id));
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (v_next_user_id, 'waitlist_promoted', 'Felkerültél az eseményre!',
          'Egy hely felszabadult és automatikusan beléptettünk.',
          jsonb_build_object('event_id', NEW.event_id, 'participation_id', v_next_id));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_promote_waitlist() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.join_event_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_own_participation_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_arrival_confidence_atomic(uuid, boolean, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organizer_transition_participant_atomic(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_organizer_note_atomic(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_event_atomic(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_event_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_participation_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_arrival_confidence_atomic(uuid, boolean, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_transition_participant_atomic(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_organizer_note_atomic(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_event_atomic(uuid, text, uuid) TO authenticated;

COMMIT;
