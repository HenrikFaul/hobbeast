-- Prompt 05 completion: explainable qualification, host assignment, approval
-- resolution, attendance consumption, welcome DTO and reactivation lifecycle.

ALTER TABLE public.virtual_hubs
  ADD COLUMN IF NOT EXISTS qualification_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recent_real_member_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS availability_overlap_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS organizer_presence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upcoming_event_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beginner_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS host_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_eligible_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'virtual_hubs_qualification_score_check'
  ) THEN
    ALTER TABLE public.virtual_hubs
      ADD CONSTRAINT virtual_hubs_qualification_score_check
      CHECK (qualification_score BETWEEN 0 AND 100);
  END IF;
END;
$$;

ALTER TABLE public.virtual_hub_moderation_items
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_key text;

CREATE UNIQUE INDEX IF NOT EXISTS virtual_hub_moderation_resolution_key_uidx
  ON public.virtual_hub_moderation_items (resolution_key)
  WHERE resolution_key IS NOT NULL;

ALTER TABLE public.virtual_hub_admin_audit_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS virtual_hub_admin_audit_idempotency_uidx
  ON public.virtual_hub_admin_audit_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.virtual_hub_activity_consumption_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participation_status text,
  error_code text NOT NULL,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS virtual_hub_activity_failures_time_idx
  ON public.virtual_hub_activity_consumption_failures (created_at DESC);

ALTER TABLE public.virtual_hub_activity_consumption_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view hub activity consumption failures"
  ON public.virtual_hub_activity_consumption_failures;
CREATE POLICY "Admins view hub activity consumption failures"
  ON public.virtual_hub_activity_consumption_failures
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.virtual_hub_activity_consumption_failures
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_virtual_hub_qualification(_hub_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  real_count integer := 0;
  recent_count integer := 0;
  availability_count integer := 0;
  organizer_count integer := 0;
  proposed_event_count integer := 0;
  beginner_count integer := 0;
  score integer := 0;
  reasons jsonb := '[]'::jsonb;
  hub_row public.virtual_hubs%ROWTYPE;
BEGIN
  IF _hub_id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    count(*) FILTER (WHERE profile.user_origin = 'real')::integer,
    count(*) FILTER (
      WHERE profile.user_origin = 'real'
        AND (
          coalesce(member.joined_at, member.updated_at) > now() - interval '120 days'
          OR EXISTS (
            SELECT 1 FROM public.virtual_hub_activation_events activation
            WHERE activation.hub_id = member.hub_id
              AND activation.user_id = member.user_id
              AND activation.occurred_at > now() - interval '120 days'
              AND activation.stage IN ('joined', 'first_activity', 'first_attendance', 'repeat_activity')
          )
        )
    )::integer,
    count(*) FILTER (
      WHERE profile.user_origin = 'real'
        AND jsonb_typeof(profile.availability_window->'days') = 'array'
        AND EXISTS (
          SELECT 1
          FROM public.virtual_hub_members peer_member
          JOIN public.profiles peer_profile ON peer_profile.user_id = peer_member.user_id
          WHERE peer_member.hub_id = member.hub_id
            AND peer_member.user_id <> member.user_id
            AND peer_member.membership_status = 'active'
            AND peer_profile.user_origin = 'real'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(profile.availability_window->'days') own_day(value)
              WHERE coalesce(peer_profile.availability_window->'days', '[]'::jsonb) ? own_day.value
            )
        )
    )::integer,
    count(*) FILTER (
      WHERE profile.user_origin = 'real'
        AND profile.beginner_friendly_preference IS TRUE
    )::integer,
    count(DISTINCT member.user_id) FILTER (
      WHERE profile.user_origin = 'real'
        AND EXISTS (
          SELECT 1 FROM public.events organized
          WHERE organized.created_by = member.user_id
            AND organized.outcome_status IN ('completed', 'held')
            AND (hub_row.city IS NULL OR lower(btrim(hub_row.city)) = lower(btrim(coalesce(organized.location_city, organized.place_city, ''))))
            AND (
              lower(btrim(organized.category)) IN (
                lower(btrim(hub_row.hobby_category)),
                lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
              )
              OR EXISTS (
                SELECT 1 FROM unnest(coalesce(organized.tags, '{}'::text[])) tag
                WHERE lower(btrim(tag)) IN (
                  lower(btrim(hub_row.hobby_category)),
                  lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
                )
              )
            )
        )
    )::integer
  INTO real_count, recent_count, availability_count, beginner_count, organizer_count
  FROM public.virtual_hub_members member
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE member.hub_id = _hub_id AND member.membership_status = 'active';

  SELECT count(*)::integer INTO proposed_event_count
  FROM (
    SELECT 'event:' || event.id::text AS supply_key
    FROM public.events event
    WHERE event.is_active
      AND coalesce(event.outcome_status, 'scheduled') NOT IN ('cancelled', 'completed', 'held')
      AND (event.start_time > now() OR (event.start_time IS NULL AND event.event_date >= current_date))
      AND (hub_row.city IS NULL OR lower(btrim(hub_row.city)) = lower(btrim(coalesce(event.location_city, event.place_city, ''))))
      AND (
        lower(btrim(event.category)) IN (
          lower(btrim(hub_row.hobby_category)),
          lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
        )
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(event.tags, '{}'::text[])) tag
          WHERE lower(btrim(tag)) IN (
            lower(btrim(hub_row.hobby_category)),
            lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
          )
        )
      )
    UNION ALL
    SELECT 'proposal:' || proposal.id::text
    FROM public.ai_event_proposals proposal
    WHERE proposal.hub_id = _hub_id
      AND proposal.status IN ('review', 'approved')
      AND proposal.suggested_start > now()
      AND proposal.published_event_id IS NULL
  ) supply;

  score := least(100,
    least(real_count, 4) * 10
    + CASE WHEN recent_count >= 3 THEN 20 WHEN recent_count >= 1 THEN 10 ELSE 0 END
    + CASE WHEN availability_count >= 2 THEN 15 WHEN availability_count = 1 THEN 5 ELSE 0 END
    + CASE WHEN organizer_count >= 1 THEN 15 ELSE 0 END
    + CASE WHEN proposed_event_count BETWEEN 1 AND 2 THEN 10
           WHEN proposed_event_count >= 3 THEN 5 ELSE 0 END
  );

  reasons := jsonb_build_array(
    format('%s verified real member(s)', real_count),
    format('%s recently active real member(s)', recent_count),
    format('%s member(s) shared an optional availability window', availability_count),
    format('%s experienced organizer(s) in the segment', organizer_count),
    format('%s upcoming reviewed/published event proposal(s)', proposed_event_count),
    CASE WHEN real_count < 3 THEN 'below the minimum real-demand threshold'
         WHEN proposed_event_count >= 3 THEN 'existing event supply reduces urgency'
         ELSE 'real demand is eligible for human-led activation' END
  );

  UPDATE public.virtual_hubs
  SET real_member_count = real_count,
      recent_real_member_count = recent_count,
      availability_overlap_count = availability_count,
      organizer_presence_count = organizer_count,
      upcoming_event_count = proposed_event_count,
      beginner_friendly = beginner_count > 0,
      qualification_score = score,
      qualification_reasons = reasons,
      last_reconciled_at = now(),
      updated_at = now()
  WHERE id = _hub_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_virtual_hub_qualification_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_virtual_hub_qualification(OLD.hub_id);
  ELSE
    PERFORM public.refresh_virtual_hub_qualification(NEW.hub_id);
    IF TG_OP = 'UPDATE' AND OLD.hub_id IS DISTINCT FROM NEW.hub_id THEN
      PERFORM public.refresh_virtual_hub_qualification(OLD.hub_id);
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS virtual_hub_members_refresh_qualification
  ON public.virtual_hub_members;
CREATE TRIGGER virtual_hub_members_refresh_qualification
  AFTER INSERT OR UPDATE OF membership_status, hub_id OR DELETE
  ON public.virtual_hub_members
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_virtual_hub_qualification_from_membership();

CREATE OR REPLACE FUNCTION public.resolve_virtual_hub_join_request(
  _moderation_item_id uuid,
  _approve boolean,
  _reason text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item_row public.virtual_hub_moderation_items%ROWTYPE;
  hub_row public.virtual_hubs%ROWTYPE;
  member_row public.virtual_hub_members%ROWTYPE;
  next_status text := CASE WHEN _approve THEN 'active' ELSE 'removed' END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key, ''))) < 8
    OR length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Resolution key and reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO item_row
  FROM public.virtual_hub_moderation_items
  WHERE id = _moderation_item_id
  FOR UPDATE;
  IF NOT FOUND OR item_row.item_type <> 'join_request' THEN
    RAISE EXCEPTION 'Join request not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO hub_row
  FROM public.virtual_hubs
  WHERE id = item_row.hub_id
    AND (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;
  IF item_row.subject_user_id IS NULL OR item_row.subject_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Self approval is not allowed' USING ERRCODE = '42501';
  END IF;
  IF item_row.resolution_key = _idempotency_key AND item_row.status IN ('resolved', 'dismissed') THEN
    SELECT membership_status INTO next_status
    FROM public.virtual_hub_members
    WHERE hub_id = item_row.hub_id AND user_id = item_row.subject_user_id;
    RETURN jsonb_build_object('status', next_status, 'idempotent_replay', true);
  END IF;
  IF item_row.status NOT IN ('open', 'in_review') THEN
    RAISE EXCEPTION 'Join request is already resolved' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO member_row
  FROM public.virtual_hub_members
  WHERE hub_id = item_row.hub_id AND user_id = item_row.subject_user_id
  FOR UPDATE;
  IF NOT FOUND OR member_row.membership_status <> 'pending' THEN
    RAISE EXCEPTION 'Pending membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF _approve AND member_row.policy_acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'Community policy has not been acknowledged' USING ERRCODE = '22023';
  END IF;
  IF _approve AND public.is_blocked_between(hub_row.host_id, item_row.subject_user_id) THEN
    RAISE EXCEPTION 'Hub membership is unavailable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.virtual_hub_members
  SET membership_status = next_status,
      join_source = CASE WHEN _approve THEN 'approved' ELSE join_source END,
      joined_at = CASE WHEN _approve THEN coalesce(joined_at, now()) ELSE joined_at END,
      left_at = CASE WHEN _approve THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = member_row.id;

  UPDATE public.virtual_hub_moderation_items
  SET status = CASE WHEN _approve THEN 'resolved' ELSE 'dismissed' END,
      assigned_to = auth.uid(),
      resolution_note = btrim(_reason),
      resolution_key = _idempotency_key,
      resolved_at = now(),
      updated_at = now()
  WHERE id = item_row.id;

  IF _approve THEN
    INSERT INTO public.virtual_hub_activation_events (
      hub_id, user_id, stage, source, dedupe_key, metadata
    ) VALUES (
      item_row.hub_id, item_row.subject_user_id, 'joined', 'host_approval',
      'hub-approval:' || _idempotency_key,
      jsonb_build_object('moderation_item_id', item_row.id)
    ) ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, hub_id, action, reason, after_state, idempotency_key
  ) VALUES (
    auth.uid(), item_row.hub_id,
    CASE WHEN _approve THEN 'join_request_approved' ELSE 'join_request_declined' END,
    btrim(_reason),
    jsonb_build_object('subject_user_id', item_row.subject_user_id, 'status', next_status),
    _idempotency_key
  ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  PERFORM public.refresh_virtual_hub_qualification(item_row.hub_id);
  RETURN jsonb_build_object('status', next_status, 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_virtual_hub_host(
  _hub_id uuid,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Idempotency key required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.feature_enabled_for_subject('hub2', auth.uid()) THEN
    RAISE EXCEPTION 'Hub feature is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id FOR UPDATE;
  IF NOT FOUND OR hub_row.lifecycle_state = 'archived' THEN
    RAISE EXCEPTION 'Hub not found' USING ERRCODE = 'P0002';
  END IF;
  IF hub_row.host_id = auth.uid() THEN
    RETURN jsonb_build_object('status', 'host', 'idempotent_replay', true);
  END IF;
  IF hub_row.host_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hub already has a host' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members member
    JOIN public.profiles profile ON profile.user_id = member.user_id
    WHERE member.hub_id = _hub_id
      AND member.user_id = auth.uid()
      AND member.membership_status = 'active'
      AND profile.user_origin = 'real'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.events event
    WHERE event.created_by = auth.uid()
      AND event.outcome_status IN ('completed', 'held')
  ) THEN
    RAISE EXCEPTION 'Verified organizer experience is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.virtual_hubs
  SET host_id = auth.uid(),
      host_claimed_at = now(),
      lifecycle_state = CASE
        WHEN lifecycle_state IN ('latent', 'inactive') THEN 'recruiting'
        ELSE lifecycle_state
      END,
      is_discoverable = true,
      reactivation_requested_at = CASE
        WHEN lifecycle_state = 'inactive' THEN now() ELSE reactivation_requested_at
      END,
      archive_eligible_at = NULL,
      updated_at = now()
  WHERE id = _hub_id;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, hub_id, action, reason, after_state, idempotency_key
  ) VALUES (
    auth.uid(), _hub_id, 'host_claimed', 'Eligible active member accepted host ownership',
    jsonb_build_object('host_id', auth.uid()), _idempotency_key
  ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('status', 'host', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_virtual_hub_host(
  _hub_id uuid,
  _host_id uuid,
  _reason text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  prior_audit public.virtual_hub_admin_audit_events%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF _host_id IS NULL OR length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 500
    OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Host, reason and idempotency key are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior_audit
  FROM public.virtual_hub_admin_audit_events
  WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF prior_audit.hub_id IS DISTINCT FROM _hub_id
      OR prior_audit.after_state->>'host_id' IS DISTINCT FROM _host_id::text THEN
      RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('host_id', _host_id, 'idempotent_replay', true);
  END IF;
  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id FOR UPDATE;
  IF NOT FOUND OR hub_row.lifecycle_state = 'archived' THEN
    RAISE EXCEPTION 'Hub not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = _hub_id AND user_id = _host_id AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Host must be an active Hub member' USING ERRCODE = '22023';
  END IF;

  UPDATE public.virtual_hubs
  SET host_id = _host_id, host_claimed_at = now(), updated_at = now()
  WHERE id = _hub_id;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, hub_id, action, before_state, after_state, reason, idempotency_key
  ) VALUES (
    auth.uid(), _hub_id, 'host_assigned',
    jsonb_build_object('host_id', hub_row.host_id),
    jsonb_build_object('host_id', _host_id), btrim(_reason), _idempotency_key
  ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  RETURN jsonb_build_object('host_id', _host_id, 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_virtual_hub_reactivation(
  _hub_id uuid,
  _reason text,
  _idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  is_host boolean;
  existing_activation public.virtual_hub_activation_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 500
    OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Reactivation reason and key are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO existing_activation
  FROM public.virtual_hub_activation_events
  WHERE dedupe_key = _idempotency_key;
  IF FOUND THEN
    IF existing_activation.hub_id IS DISTINCT FROM _hub_id
      OR existing_activation.user_id IS DISTINCT FROM auth.uid()
      OR existing_activation.stage <> 'reactivation' THEN
      RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE = '23505';
    END IF;
    RETURN CASE WHEN coalesce((existing_activation.metadata->>'host_request')::boolean, false)
      THEN 'recruiting' ELSE 'review_requested' END;
  END IF;
  IF hub_row.lifecycle_state NOT IN ('latent', 'inactive') THEN
    RAISE EXCEPTION 'Hub is not eligible for reactivation' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = _hub_id AND user_id = auth.uid() AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active Hub membership required' USING ERRCODE = '42501';
  END IF;
  is_host := hub_row.host_id = auth.uid();

  UPDATE public.virtual_hubs
  SET reactivation_requested_at = now(),
      lifecycle_state = CASE WHEN is_host THEN 'recruiting' ELSE lifecycle_state END,
      is_discoverable = CASE WHEN is_host THEN true ELSE is_discoverable END,
      archive_eligible_at = NULL,
      updated_at = now()
  WHERE id = _hub_id;

  INSERT INTO public.virtual_hub_activation_events (
    hub_id, user_id, stage, source, dedupe_key, metadata
  ) VALUES (
    _hub_id, auth.uid(), 'reactivation', 'community_workspace', _idempotency_key,
    jsonb_build_object('reason', left(btrim(_reason), 500), 'host_request', is_host)
  ) ON CONFLICT (dedupe_key) DO NOTHING;

  IF NOT is_host THEN
    INSERT INTO public.virtual_hub_moderation_items (
      hub_id, item_type, subject_user_id, resolution_note
    )
    SELECT _hub_id, 'reactivation_review', auth.uid(), left(btrim(_reason), 500)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.virtual_hub_moderation_items
      WHERE hub_id = _hub_id AND item_type = 'reactivation_review'
        AND subject_user_id = auth.uid() AND status IN ('open', 'in_review')
    );
  END IF;

  RETURN CASE WHEN is_host THEN 'recruiting' ELSE 'review_requested' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_virtual_hub_activation(
  _hub_id uuid,
  _stage text,
  _dedupe_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  active_member boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- Attendance and reactivation stages are server-owned. The public RPC can
  -- only record low-trust discovery/preview intent.
  IF _stage NOT IN ('discovery', 'preview')
    OR length(btrim(coalesce(_dedupe_key, ''))) NOT BETWEEN 8 AND 240 THEN
    RAISE EXCEPTION 'Unsupported activation event' USING ERRCODE = '22023';
  END IF;
  IF NOT public.feature_enabled_for_subject('hub2', auth.uid()) THEN
    RAISE EXCEPTION 'Hub feature is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id;
  IF NOT FOUND OR hub_row.lifecycle_state = 'archived'
    OR public.is_blocked_between(auth.uid(), hub_row.host_id) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.virtual_hub_members
    WHERE hub_id = _hub_id AND user_id = auth.uid() AND membership_status = 'active'
  ) INTO active_member;
  IF _stage IN ('discovery', 'preview')
    AND NOT active_member
    AND hub_row.host_id IS DISTINCT FROM auth.uid()
    AND NOT (hub_row.is_discoverable AND hub_row.lifecycle_state IN ('recruiting', 'active')) THEN
    RAISE EXCEPTION 'Hub is not discoverable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.virtual_hub_activation_events (
    hub_id, user_id, stage, source, dedupe_key
  ) VALUES (_hub_id, auth.uid(), _stage, 'community_workspace', _dedupe_key)
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_virtual_hub_participation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  matched_hub record;
  stage_name text;
  inserted_count integer := 0;
BEGIN
  IF NEW.status NOT IN ('going', 'checked_in', 'completed') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('checked_in', 'completed') AND NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.status = NEW.status
    AND OLD.checked_in_at IS NOT DISTINCT FROM NEW.checked_in_at THEN
    RETURN NEW;
  END IF;
  IF NOT public.feature_enabled_for_subject('hub2', NEW.user_id) THEN
    RETURN NEW;
  END IF;

  FOR matched_hub IN
    SELECT hub.id, member.first_activity_at, member.first_attendance_at
    FROM public.virtual_hub_members member
    JOIN public.virtual_hubs hub ON hub.id = member.hub_id
    JOIN public.events event ON event.id = NEW.event_id
    WHERE member.user_id = NEW.user_id
      AND member.membership_status = 'active'
      AND hub.lifecycle_state <> 'archived'
      AND (hub.city IS NULL OR lower(btrim(hub.city)) = lower(btrim(coalesce(event.location_city, event.place_city, ''))))
      AND (
        lower(btrim(event.category)) IN (
          lower(btrim(hub.hobby_category)),
          lower(btrim(coalesce(hub.hobby_activity, hub.hobby_category)))
        )
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(event.tags, '{}'::text[])) tag
          WHERE lower(btrim(tag)) IN (
            lower(btrim(hub.hobby_category)),
            lower(btrim(coalesce(hub.hobby_activity, hub.hobby_category)))
          )
        )
      )
  LOOP
    IF matched_hub.first_activity_at IS NULL THEN
      INSERT INTO public.virtual_hub_activation_events (
        hub_id, user_id, stage, source, dedupe_key, metadata
      ) VALUES (
        matched_hub.id, NEW.user_id, 'first_activity', 'event_participation',
        'hub-first-activity:' || matched_hub.id::text || ':' || NEW.user_id::text || ':' || NEW.event_id::text,
        jsonb_build_object('event_id', NEW.event_id, 'participation_status', NEW.status)
      ) ON CONFLICT (dedupe_key) DO NOTHING;
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
      IF inserted_count = 1 THEN
        UPDATE public.virtual_hub_members
        SET first_activity_at = coalesce(first_activity_at, now()), updated_at = now()
        WHERE hub_id = matched_hub.id AND user_id = NEW.user_id;
      END IF;
    END IF;

    IF NEW.status IN ('checked_in', 'completed') THEN
      stage_name := CASE
        WHEN matched_hub.first_attendance_at IS NULL THEN 'first_attendance'
        ELSE 'repeat_activity'
      END;
      INSERT INTO public.virtual_hub_activation_events (
        hub_id, user_id, stage, source, dedupe_key, metadata
      ) VALUES (
        matched_hub.id, NEW.user_id, stage_name, 'verified_event_attendance',
        'hub-attendance:' || matched_hub.id::text || ':' || NEW.user_id::text || ':' || NEW.event_id::text,
        jsonb_build_object('event_id', NEW.event_id, 'participation_status', NEW.status)
      ) ON CONFLICT (dedupe_key) DO NOTHING;
      GET DIAGNOSTICS inserted_count = ROW_COUNT;

      IF inserted_count = 1 THEN
        UPDATE public.virtual_hub_members
        SET first_activity_at = coalesce(first_activity_at, now()),
            first_attendance_at = coalesce(first_attendance_at, now()),
            repeat_activity_at = CASE
              WHEN matched_hub.first_attendance_at IS NOT NULL THEN coalesce(repeat_activity_at, now())
              ELSE repeat_activity_at END,
            updated_at = now()
        WHERE hub_id = matched_hub.id AND user_id = NEW.user_id;
        UPDATE public.virtual_hubs
        SET activity_freshness_at = now(), archive_eligible_at = NULL, updated_at = now()
        WHERE id = matched_hub.id;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.virtual_hub_activity_consumption_failures (
    event_id, user_id, participation_status, error_code, error_message
  ) VALUES (NEW.event_id, NEW.user_id, NEW.status, SQLSTATE, left(SQLERRM, 500));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_participation_consume_virtual_hub_activation
  ON public.event_participants;
CREATE TRIGGER event_participation_consume_virtual_hub_activation
  AFTER INSERT OR UPDATE OF status, checked_in_at
  ON public.event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.consume_virtual_hub_participation();

CREATE OR REPLACE FUNCTION public.evaluate_virtual_hub_lifecycle(
  _limit integer,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stale_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Service or admin access required' USING ERRCODE = '42501';
  END IF;
  IF _limit NOT BETWEEN 1 AND 1000 OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Invalid lifecycle evaluation arguments' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.virtual_hub_admin_audit_events
    WHERE idempotency_key = _idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'idempotent_replay');
  END IF;

  WITH candidates AS (
    SELECT id FROM public.virtual_hubs
    WHERE lifecycle_state IN ('recruiting', 'active')
      AND coalesce(activity_freshness_at, updated_at) < now() - interval '120 days'
    ORDER BY coalesce(activity_freshness_at, updated_at)
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  ), transitioned AS (
    UPDATE public.virtual_hubs hub
    SET lifecycle_state = 'inactive',
        is_discoverable = false,
        archive_eligible_at = now() + interval '245 days',
        updated_at = now()
    FROM candidates
    WHERE hub.id = candidates.id
    RETURNING hub.id
  ), queued AS (
    INSERT INTO public.virtual_hub_moderation_items (hub_id, item_type)
    SELECT id, 'reactivation_review' FROM transitioned
    WHERE NOT EXISTS (
      SELECT 1 FROM public.virtual_hub_moderation_items item
      WHERE item.hub_id = transitioned.id
        AND item.item_type = 'reactivation_review'
        AND item.status IN ('open', 'in_review')
    )
    RETURNING hub_id
  )
  SELECT count(*) INTO stale_count FROM transitioned;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, action, reason, after_state, idempotency_key
  ) VALUES (
    auth.uid(), 'lifecycle_evaluated', '120-day inactivity policy',
    jsonb_build_object('hubs_marked_inactive', stale_count), _idempotency_key
  );
  RETURN jsonb_build_object('status', 'completed', 'hubs_marked_inactive', stale_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_virtual_hub_cards()
RETURNS TABLE (
  id uuid,
  hobby_category text,
  city text,
  purpose text,
  host_id uuid,
  host_display_name text,
  host_avatar_url text,
  join_policy text,
  lifecycle_state text,
  member_count integer,
  membership_status text,
  pending_join_count integer,
  qualification_score integer,
  qualification_reasons jsonb,
  beginner_friendly boolean,
  welcome_message text,
  community_rules text,
  activity_freshness_at timestamptz,
  can_claim_host boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    hub.id,
    hub.hobby_category,
    hub.city,
    hub.purpose,
    hub.host_id,
    CASE WHEN hub.host_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR host_profile.profile_visibility IN ('members', 'public')
      THEN nullif(btrim(host_profile.display_name), '') END,
    CASE WHEN hub.host_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR host_profile.profile_visibility IN ('members', 'public')
      THEN host_profile.avatar_url END,
    hub.join_policy,
    hub.lifecycle_state,
    hub.real_member_count,
    own_membership.membership_status,
    CASE WHEN hub.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
      THEN (
        SELECT count(*)::integer
        FROM public.virtual_hub_members pending
        WHERE pending.hub_id = hub.id AND pending.membership_status = 'pending'
      ) ELSE 0 END,
    hub.qualification_score,
    hub.qualification_reasons,
    hub.beginner_friendly,
    hub.welcome_message,
    hub.community_rules,
    hub.activity_freshness_at,
    hub.host_id IS NULL
      AND own_membership.membership_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.profiles own_profile
        WHERE own_profile.user_id = auth.uid() AND own_profile.user_origin = 'real'
      )
      AND EXISTS (
        SELECT 1 FROM public.events organized
        WHERE organized.created_by = auth.uid()
          AND organized.outcome_status IN ('completed', 'held')
      )
  FROM public.virtual_hubs hub
  LEFT JOIN public.virtual_hub_members own_membership
    ON own_membership.hub_id = hub.id AND own_membership.user_id = auth.uid()
  LEFT JOIN public.profiles host_profile ON host_profile.user_id = hub.host_id
  WHERE public.feature_enabled_for_subject('hub2', auth.uid())
    AND hub.lifecycle_state <> 'archived'
    AND NOT public.is_blocked_between(auth.uid(), hub.host_id)
    AND (
      (hub.is_discoverable AND hub.lifecycle_state IN ('recruiting', 'active'))
      OR hub.host_id = auth.uid()
      OR own_membership.membership_status IN ('pending', 'active')
      OR public.has_role(auth.uid(), 'admin')
    )
  ORDER BY
    (own_membership.membership_status = 'active') DESC,
    hub.qualification_score DESC,
    hub.real_member_count DESC,
    hub.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_pending_requests(_hub_id uuid)
RETURNS TABLE (
  moderation_item_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  requested_at timestamptz,
  policy_acknowledged boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = _hub_id AND (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    item.id,
    member.user_id,
    nullif(btrim(profile.display_name), ''),
    profile.avatar_url,
    CASE WHEN profile.location_precision = 'city' THEN profile.city END,
    item.created_at,
    member.policy_acknowledged_at IS NOT NULL
  FROM public.virtual_hub_moderation_items item
  JOIN public.virtual_hub_members member
    ON member.hub_id = item.hub_id AND member.user_id = item.subject_user_id
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE item.hub_id = _hub_id
    AND item.item_type = 'join_request'
    AND item.status IN ('open', 'in_review')
    AND member.membership_status = 'pending'
    AND NOT public.is_blocked_between(auth.uid(), member.user_id)
  ORDER BY item.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_welcome(_hub_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  host_card jsonb;
  next_event jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id;
  IF NOT FOUND OR hub_row.lifecycle_state = 'archived'
    OR public.is_blocked_between(auth.uid(), hub_row.host_id)
    OR NOT (
      hub_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.virtual_hub_members
        WHERE hub_id = _hub_id AND user_id = auth.uid()
          AND membership_status IN ('pending', 'active')
      )
      OR (hub_row.is_discoverable AND hub_row.lifecycle_state IN ('recruiting', 'active'))
    ) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'user_id', profile.user_id,
    'display_name', nullif(btrim(profile.display_name), ''),
    'avatar_url', profile.avatar_url,
    'city', CASE WHEN profile.location_precision = 'city' THEN profile.city END
  ) INTO host_card
  FROM public.profiles profile
  WHERE profile.user_id = hub_row.host_id
    AND (
      profile.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR profile.profile_visibility IN ('members', 'public')
    );

  SELECT jsonb_build_object(
    'event_id', event.id,
    'title', event.title,
    'start_at', coalesce(
      event.start_time,
      (event.event_date + coalesce(event.event_time, time '00:00'))::timestamptz
    ),
    'city', coalesce(event.location_city, event.place_city),
    'beginner_friendly', event.beginner_friendly
  ) INTO next_event
  FROM public.events event
  WHERE event.is_active
    AND event.beginner_friendly IS TRUE
    AND (event.start_time > now() OR (event.start_time IS NULL AND event.event_date >= current_date))
    AND (hub_row.city IS NULL OR lower(btrim(hub_row.city)) = lower(btrim(coalesce(event.location_city, event.place_city, ''))))
    AND (
      lower(btrim(event.category)) IN (
        lower(btrim(hub_row.hobby_category)),
        lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
      )
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(event.tags, '{}'::text[])) tag
        WHERE lower(btrim(tag)) IN (
          lower(btrim(hub_row.hobby_category)),
          lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
        )
      )
    )
    AND (
      coalesce(event.visibility_type, 'public') = 'public'
      OR hub_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.virtual_hub_members member
        WHERE member.hub_id = _hub_id AND member.user_id = auth.uid()
          AND member.membership_status = 'active'
      )
    )
  ORDER BY coalesce(
    event.start_time,
    (event.event_date + coalesce(event.event_time, time '00:00'))::timestamptz
  )
  LIMIT 1;

  RETURN jsonb_build_object(
    'hub_id', hub_row.id,
    'purpose', hub_row.purpose,
    'welcome_message', hub_row.welcome_message,
    'community_rules', hub_row.community_rules,
    'host', host_card,
    'next_beginner_event', next_event,
    'privacy_note', 'Only a coarse city and explicitly public host card are shown.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_virtual_hub_qualification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_virtual_hub_qualification_from_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_virtual_hub_join_request(uuid, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_virtual_hub_host(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_virtual_hub_host(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_virtual_hub_reactivation(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_virtual_hub_activation(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_virtual_hub_participation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_virtual_hub_lifecycle(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_virtual_hub_cards() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_virtual_hub_pending_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_virtual_hub_welcome(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_virtual_hub_join_request(uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_virtual_hub_host(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_virtual_hub_host(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_virtual_hub_reactivation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_virtual_hub_activation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_virtual_hub_lifecycle(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_virtual_hub_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_pending_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_welcome(uuid) TO authenticated;

COMMENT ON FUNCTION public.consume_virtual_hub_participation() IS
  'Fail-open Hub funnel consumer. Matching RSVP records first activity; only verified attendance advances attendance/repeat stages.';
COMMENT ON FUNCTION public.evaluate_virtual_hub_lifecycle(integer, text) IS
  'Idempotent inactivity evaluator. It marks stale hubs inactive; archival remains a reviewed action.';
