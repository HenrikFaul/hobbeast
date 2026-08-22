-- Prompt 04 completion: explicit leave/approval flows, durable expiry audit,
-- repeat-encounter Circle suggestions and a privacy-minimized Circle detail DTO.

ALTER TABLE public.circle_suggestions
  ADD COLUMN IF NOT EXISTS generation_key text,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS circle_suggestions_generation_key_uidx
  ON public.circle_suggestions (suggested_by, generation_key)
  WHERE generation_key IS NOT NULL;

ALTER TABLE public.social_graph_audit_events
  DROP CONSTRAINT IF EXISTS social_graph_audit_events_entity_type_check;
ALTER TABLE public.social_graph_audit_events
  ADD CONSTRAINT social_graph_audit_events_entity_type_check
  CHECK (entity_type IN ('encounter', 'preference', 'connection', 'circle', 'membership', 'suggestion'));

-- Preserve the legacy uuid/null response contract while making a mutual
-- transition genuinely idempotent. Repeated interested writes no longer reset
-- connected_at or create duplicate outcome analytics/audit signals.
CREATE OR REPLACE FUNCTION public.set_reconnection_preference(
  _encounter_id uuid,
  _decision text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  encounter_row public.event_encounters%ROWTYPE;
  low_user uuid;
  high_user uuid;
  connection_id uuid;
  connection_status text;
  mutual_count integer;
  connection_transitioned boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('interested', 'pass') THEN
    RAISE EXCEPTION 'Invalid reconnection decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO encounter_row
  FROM public.event_encounters
  WHERE id = _encounter_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (encounter_row.user_low_id, encounter_row.user_high_id) THEN
    RAISE EXCEPTION 'Encounter not found' USING ERRCODE = 'P0002';
  END IF;
  IF encounter_row.expires_at <= now() OR encounter_row.confidence_status IN ('blocked', 'expired') THEN
    RAISE EXCEPTION 'Encounter is not actionable' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks block
    WHERE (block.blocker_id = encounter_row.user_low_id AND block.blocked_id = encounter_row.user_high_id)
       OR (block.blocker_id = encounter_row.user_high_id AND block.blocked_id = encounter_row.user_low_id)
  ) THEN
    RAISE EXCEPTION 'Encounter is unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.reconnection_preferences (encounter_id, user_id, decision, decided_at, revoked_at)
  VALUES (_encounter_id, auth.uid(), _decision, now(), NULL)
  ON CONFLICT (encounter_id, user_id)
  DO UPDATE SET decision = EXCLUDED.decision, decided_at = now(), revoked_at = NULL, updated_at = now();

  UPDATE public.event_encounters
  SET confidence_status = CASE WHEN confidence_status = 'eligible' THEN 'suggested' ELSE confidence_status END,
      suggested_at = coalesce(suggested_at, now()), updated_at = now()
  WHERE id = _encounter_id;

  SELECT count(*) INTO mutual_count
  FROM public.reconnection_preferences
  WHERE encounter_id = _encounter_id AND decision = 'interested' AND revoked_at IS NULL;

  IF mutual_count = 2 THEN
    low_user := encounter_row.user_low_id;
    high_user := encounter_row.user_high_id;
    SELECT connection.id, connection.status
    INTO connection_id, connection_status
    FROM public.connections connection
    WHERE connection.user_low_id = low_user AND connection.user_high_id = high_user
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.connections (user_low_id, user_high_id, source_encounter_id, status, connected_at)
      VALUES (low_user, high_user, _encounter_id, 'active', now())
      RETURNING id INTO connection_id;
      connection_transitioned := true;
    ELSIF connection_status = 'blocked' THEN
      RAISE EXCEPTION 'Connection is blocked' USING ERRCODE = '42501';
    ELSIF connection_status <> 'active' THEN
      UPDATE public.connections
      SET status = 'active', source_encounter_id = _encounter_id,
          connected_at = now(), ended_at = NULL, updated_at = now()
      WHERE id = connection_id;
      connection_transitioned := true;
    END IF;

    UPDATE public.event_encounters
    SET confidence_status = 'connected', updated_at = now()
    WHERE id = _encounter_id;

    IF connection_transitioned THEN
      INSERT INTO public.social_graph_audit_events (
        actor_id, entity_type, entity_id, event_type
      ) VALUES (auth.uid(), 'connection', connection_id, 'mutual_reconnection_created');
    ELSE
      connection_id := NULL;
    END IF;
  END IF;

  RETURN connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_circle_membership(
  _circle_id uuid,
  _accept boolean,
  _acknowledge_rules boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _accept AND NOT _acknowledge_rules THEN
    RAISE EXCEPTION 'Circle rules must be acknowledged' USING ERRCODE = '22023';
  END IF;

  -- This endpoint is only for an invitee. Approval-based requests must be
  -- resolved by the host through resolve_circle_membership_request().
  UPDATE public.social_circle_members
  SET membership_status = CASE WHEN _accept THEN 'active' ELSE 'declined' END,
      rules_consented_at = CASE WHEN _accept THEN now() ELSE rules_consented_at END,
      joined_at = CASE WHEN _accept THEN coalesce(joined_at, now()) ELSE joined_at END,
      left_at = CASE WHEN _accept THEN NULL ELSE now() END,
      updated_at = now()
  WHERE circle_id = _circle_id
    AND user_id = auth.uid()
    AND membership_status = 'invited';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count = 0 THEN
    RAISE EXCEPTION 'Circle invitation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.social_graph_audit_events (
    actor_id, subject_user_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(), auth.uid(),
    CASE WHEN _accept THEN 'circle_invite_accepted' ELSE 'circle_invite_declined' END,
    'membership', _circle_id, jsonb_build_object('decision', _accept)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_circle_membership_request(
  _circle_id uuid,
  _user_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  circle_row public.social_circles%ROWTYPE;
  member_row public.social_circle_members%ROWTYPE;
  next_status text := CASE WHEN _approve THEN 'active' ELSE 'declined' END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid membership subject' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Resolution reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO circle_row
  FROM public.social_circles
  WHERE id = _circle_id
    AND (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle host access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO member_row
  FROM public.social_circle_members
  WHERE circle_id = _circle_id AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND OR member_row.membership_status <> 'requested' THEN
    RAISE EXCEPTION 'Pending Circle request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _approve AND member_row.rules_consented_at IS NULL THEN
    RAISE EXCEPTION 'Member has not acknowledged the Circle rules' USING ERRCODE = '22023';
  END IF;
  IF _approve AND public.is_blocked_between(circle_row.host_id, _user_id) THEN
    RAISE EXCEPTION 'Circle membership is unavailable' USING ERRCODE = '42501';
  END IF;
  IF _approve AND (
    SELECT count(*) FROM public.social_circle_members
    WHERE circle_id = _circle_id AND membership_status = 'active'
  ) >= circle_row.capacity THEN
    RAISE EXCEPTION 'Circle is full' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.social_circle_members
  SET membership_status = next_status,
      joined_at = CASE WHEN _approve THEN coalesce(joined_at, now()) ELSE joined_at END,
      left_at = CASE WHEN _approve THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = member_row.id;

  INSERT INTO public.social_graph_audit_events (
    actor_id, subject_user_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(), _user_id,
    CASE WHEN _approve THEN 'circle_request_approved' ELSE 'circle_request_declined' END,
    'membership', member_row.id,
    jsonb_build_object('circle_id', _circle_id, 'reason', left(coalesce(_reason, ''), 500))
  );
  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_social_circle(
  _circle_id uuid,
  _reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_row public.social_circle_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(coalesce(_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Leave reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO member_row
  FROM public.social_circle_members
  WHERE circle_id = _circle_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND OR member_row.membership_status NOT IN ('active', 'invited', 'requested') THEN
    RAISE EXCEPTION 'Active Circle membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF member_row.role = 'host' THEN
    RAISE EXCEPTION 'Assign another host before leaving this Circle' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_circle_members
  SET membership_status = 'left', left_at = now(), updated_at = now()
  WHERE id = member_row.id;

  INSERT INTO public.social_graph_audit_events (
    actor_id, subject_user_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(), auth.uid(), 'circle_left', 'membership', member_row.id,
    jsonb_build_object('circle_id', _circle_id, 'reason', left(coalesce(_reason, ''), 500))
  );
  RETURN 'left';
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_my_social_graph_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_encounters integer := 0;
  expired_suggestions integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  WITH expired AS (
    UPDATE public.event_encounters
    SET confidence_status = 'expired', updated_at = now()
    WHERE auth.uid() IN (user_low_id, user_high_id)
      AND expires_at <= now()
      AND confidence_status IN ('eligible', 'suggested', 'mutual')
    RETURNING id
  ), audited AS (
    INSERT INTO public.social_graph_audit_events (
      actor_id, event_type, entity_type, entity_id, metadata
    )
    SELECT auth.uid(), 'encounter_expired', 'encounter', id,
      jsonb_build_object('source', 'member_runtime')
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO expired_encounters FROM audited;

  WITH expired AS (
    UPDATE public.circle_suggestions
    SET status = 'expired', updated_at = now(), last_evaluated_at = now()
    WHERE suggested_by = auth.uid()
      AND expires_at <= now()
      AND status IN ('draft', 'inviting')
    RETURNING id
  ), audited AS (
    INSERT INTO public.social_graph_audit_events (
      actor_id, event_type, entity_type, entity_id, metadata
    )
    SELECT auth.uid(), 'circle_suggestion_expired', 'suggestion', id,
      jsonb_build_object('source', 'member_runtime')
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO expired_suggestions FROM audited;

  RETURN jsonb_build_object(
    'expired_encounters', expired_encounters,
    'expired_suggestions', expired_suggestions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_social_graph_records(_batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_encounters integer := 0;
  expired_suggestions integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Service or admin access required' USING ERRCODE = '42501';
  END IF;
  IF _batch_size NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Invalid expiry batch size' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT id FROM public.event_encounters
    WHERE expires_at <= now() AND confidence_status IN ('eligible', 'suggested', 'mutual')
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT _batch_size
  ), expired AS (
    UPDATE public.event_encounters encounter
    SET confidence_status = 'expired', updated_at = now()
    FROM candidates
    WHERE encounter.id = candidates.id
    RETURNING encounter.id
  ), audited AS (
    INSERT INTO public.social_graph_audit_events (
      actor_id, event_type, entity_type, entity_id, metadata
    )
    SELECT auth.uid(), 'encounter_expired', 'encounter', id,
      jsonb_build_object('source', 'scheduled_expiry')
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO expired_encounters FROM audited;

  WITH candidates AS (
    SELECT id FROM public.circle_suggestions
    WHERE expires_at <= now() AND status IN ('draft', 'inviting')
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT _batch_size
  ), expired AS (
    UPDATE public.circle_suggestions suggestion
    SET status = 'expired', updated_at = now(), last_evaluated_at = now()
    FROM candidates
    WHERE suggestion.id = candidates.id
    RETURNING suggestion.id
  ), audited AS (
    INSERT INTO public.social_graph_audit_events (
      actor_id, event_type, entity_type, entity_id, metadata
    )
    SELECT auth.uid(), 'circle_suggestion_expired', 'suggestion', id,
      jsonb_build_object('source', 'scheduled_expiry')
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO expired_suggestions FROM audited;

  RETURN jsonb_build_object(
    'expired_encounters', expired_encounters,
    'expired_suggestions', expired_suggestions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_my_circle_suggestions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evidence_connection_ids uuid[] := '{}'::uuid[];
  suggested_member_ids uuid[] := '{}'::uuid[];
  activity_label text := 'Közös program';
  coarse_city text;
  suggestion_key text;
  suggestion_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.feature_enabled_for_subject('circles', auth.uid()) THEN
    RETURN jsonb_build_object('status', 'feature_disabled');
  END IF;

  PERFORM public.expire_my_social_graph_records();

  WITH repeated_connections AS (
    SELECT
      connection.id AS connection_id,
      CASE WHEN connection.user_low_id = auth.uid()
        THEN connection.user_high_id ELSE connection.user_low_id END AS other_user_id,
      count(DISTINCT encounter.event_id) AS verified_encounters
    FROM public.connections connection
    JOIN public.event_encounters encounter
      ON encounter.user_low_id = connection.user_low_id
      AND encounter.user_high_id = connection.user_high_id
      AND encounter.attendance_verified
      AND encounter.confidence_status <> 'blocked'
    WHERE connection.status = 'active'
      AND auth.uid() IN (connection.user_low_id, connection.user_high_id)
      AND NOT public.is_blocked_between(connection.user_low_id, connection.user_high_id)
    GROUP BY connection.id, connection.user_low_id, connection.user_high_id
    HAVING count(DISTINCT encounter.event_id) >= 2
    ORDER BY count(DISTINCT encounter.event_id) DESC, connection.id
    LIMIT 8
  )
  SELECT
    coalesce(array_agg(connection_id ORDER BY connection_id), '{}'::uuid[]),
    coalesce(array_agg(other_user_id ORDER BY connection_id), '{}'::uuid[])
  INTO evidence_connection_ids, suggested_member_ids
  FROM repeated_connections;

  IF cardinality(suggested_member_ids) < 2 THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_repeat_evidence',
      'eligible_connection_count', cardinality(suggested_member_ids)
    );
  END IF;

  SELECT p.city INTO coarse_city FROM public.profiles p WHERE p.user_id = auth.uid();
  SELECT mine.hobby INTO activity_label
  FROM public.profiles me
  CROSS JOIN LATERAL unnest(coalesce(me.hobbies, '{}'::text[])) mine(hobby)
  JOIN public.profiles peer ON peer.user_id = ANY (suggested_member_ids)
  CROSS JOIN LATERAL unnest(coalesce(peer.hobbies, '{}'::text[])) peer_hobby(hobby)
  WHERE me.user_id = auth.uid()
    AND lower(btrim(peer_hobby.hobby)) = lower(btrim(mine.hobby))
  GROUP BY mine.hobby
  ORDER BY count(DISTINCT peer.user_id) DESC, mine.hobby
  LIMIT 1;
  activity_label := coalesce(nullif(btrim(activity_label), ''), 'Közös program');

  suggestion_key := auth.uid()::text || ':' || md5(array_to_string(evidence_connection_ids, ','));
  INSERT INTO public.circle_suggestions (
    suggested_by, activity_label, city, evidence_connection_ids,
    suggested_member_ids, status, expires_at, generation_key, last_evaluated_at
  ) VALUES (
    auth.uid(), activity_label, nullif(btrim(coarse_city), ''), evidence_connection_ids,
    suggested_member_ids, 'draft', now() + interval '14 days', suggestion_key, now()
  )
  ON CONFLICT (suggested_by, generation_key) WHERE generation_key IS NOT NULL
  DO UPDATE SET
    evidence_connection_ids = EXCLUDED.evidence_connection_ids,
    suggested_member_ids = EXCLUDED.suggested_member_ids,
    activity_label = EXCLUDED.activity_label,
    city = EXCLUDED.city,
    last_evaluated_at = now(),
    updated_at = now()
  RETURNING id INTO suggestion_id;

  INSERT INTO public.social_graph_audit_events (
    actor_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(), 'circle_suggestion_refreshed', 'suggestion', suggestion_id,
    jsonb_build_object(
      'repeat_connection_count', cardinality(evidence_connection_ids),
      'shared_interest_matched', activity_label <> 'Közös program'
    )
  );

  RETURN jsonb_build_object(
    'status', 'ready',
    'suggestion_id', suggestion_id,
    'suggested_member_count', cardinality(suggested_member_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_circle_suggestion_cards()
RETURNS TABLE (
  suggestion_id uuid,
  activity_label text,
  city text,
  suggested_member_count integer,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    suggestion.id,
    suggestion.activity_label,
    suggestion.city,
    cardinality(suggestion.suggested_member_ids),
    suggestion.status,
    suggestion.expires_at
  FROM public.circle_suggestions suggestion
  WHERE suggestion.suggested_by = auth.uid()
    AND suggestion.status IN ('draft', 'inviting')
    AND suggestion.expires_at > now()
  ORDER BY suggestion.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.accept_circle_suggestion(
  _suggestion_id uuid,
  _name text,
  _purpose text,
  _creation_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  suggestion_row public.circle_suggestions%ROWTYPE;
  created_circle_id uuid;
  invited_user_id uuid;
  low_user uuid;
  high_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_name, ''))) NOT BETWEEN 3 AND 80
    OR length(btrim(coalesce(_purpose, ''))) NOT BETWEEN 3 AND 500
    OR length(btrim(coalesce(_creation_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Invalid Circle details' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO suggestion_row
  FROM public.circle_suggestions
  WHERE id = _suggestion_id AND suggested_by = auth.uid()
  FOR UPDATE;
  IF NOT FOUND OR suggestion_row.status NOT IN ('draft', 'inviting')
    OR suggestion_row.expires_at <= now() THEN
    IF suggestion_row.status = 'accepted' THEN
      SELECT id INTO created_circle_id
      FROM public.social_circles
      WHERE created_by = auth.uid() AND creation_key = _creation_key;
      IF created_circle_id IS NOT NULL THEN
        RETURN created_circle_id;
      END IF;
    END IF;
    RAISE EXCEPTION 'Circle suggestion is unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO created_circle_id
  FROM public.social_circles
  WHERE created_by = auth.uid() AND creation_key = _creation_key;

  IF created_circle_id IS NULL THEN
    INSERT INTO public.social_circles (
      created_by, host_id, name, purpose, cadence, capacity,
      membership_policy, visibility, lifecycle_state, creation_key
    ) VALUES (
      auth.uid(), auth.uid(), btrim(_name), btrim(_purpose), 'monthly',
      least(50, greatest(3, cardinality(suggestion_row.suggested_member_ids) + 1)),
      'invite_only', 'members', 'recruiting', _creation_key
    ) RETURNING id INTO created_circle_id;

    INSERT INTO public.social_circle_members (
      circle_id, user_id, role, membership_status, rules_consented_at, joined_at
    ) VALUES (created_circle_id, auth.uid(), 'host', 'active', now(), now());
  END IF;

  FOREACH invited_user_id IN ARRAY suggestion_row.suggested_member_ids
  LOOP
    low_user := CASE WHEN auth.uid()::text < invited_user_id::text THEN auth.uid() ELSE invited_user_id END;
    high_user := CASE WHEN auth.uid()::text < invited_user_id::text THEN invited_user_id ELSE auth.uid() END;
    IF EXISTS (
      SELECT 1 FROM public.connections connection
      WHERE connection.user_low_id = low_user
        AND connection.user_high_id = high_user
        AND connection.status = 'active'
    ) AND NOT public.is_blocked_between(auth.uid(), invited_user_id) THEN
      INSERT INTO public.social_circle_members (
        circle_id, user_id, role, membership_status
      ) VALUES (created_circle_id, invited_user_id, 'member', 'invited')
      ON CONFLICT (circle_id, user_id)
      DO UPDATE SET
        membership_status = CASE
          WHEN public.social_circle_members.membership_status = 'active' THEN 'active'
          ELSE 'invited'
        END,
        left_at = NULL,
        updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.circle_suggestions
  SET status = 'accepted', updated_at = now(), last_evaluated_at = now()
  WHERE id = _suggestion_id;

  INSERT INTO public.social_graph_audit_events (
    actor_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(), 'circle_suggestion_accepted', 'suggestion', _suggestion_id,
    jsonb_build_object('circle_id', created_circle_id)
  );
  RETURN created_circle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_circle_detail(_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  circle_row public.social_circles%ROWTYPE;
  member_cards jsonb := '[]'::jsonb;
  shared_interest_cards jsonb := '[]'::jsonb;
  pending_cards jsonb := '[]'::jsonb;
  next_event jsonb;
  can_view_members boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO circle_row FROM public.social_circles WHERE id = _circle_id;
  IF NOT FOUND
    OR public.is_blocked_between(auth.uid(), circle_row.host_id)
    OR NOT (
      circle_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_circle_member(_circle_id)
      OR (public.feature_enabled_for_subject('circles', auth.uid()) AND circle_row.visibility IN ('members', 'public'))
    ) THEN
    RAISE EXCEPTION 'Circle is unavailable' USING ERRCODE = '42501';
  END IF;
  can_view_members := circle_row.host_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_circle_member(_circle_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'display_name', nullif(btrim(profile.display_name), ''),
    'avatar_url', profile.avatar_url,
    'city', CASE WHEN profile.location_precision = 'city' THEN profile.city END,
    'role', member.role,
    'joined_at', member.joined_at
  ) ORDER BY member.role, profile.display_name), '[]'::jsonb)
  INTO member_cards
  FROM public.social_circle_members member
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE member.circle_id = _circle_id
    AND member.membership_status = 'active'
    AND can_view_members
    AND (profile.user_id = auth.uid() OR profile.profile_visibility IN ('members', 'public'))
    AND NOT public.is_blocked_between(auth.uid(), member.user_id);

  IF can_view_members THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', shared.label,
      'member_count', shared.member_count
    ) ORDER BY shared.member_count DESC, shared.label), '[]'::jsonb)
    INTO shared_interest_cards
    FROM (
      SELECT min(btrim(hobby.hobby)) AS label,
        count(DISTINCT member.user_id)::integer AS member_count
      FROM public.social_circle_members member
      JOIN public.profiles profile ON profile.user_id = member.user_id
      CROSS JOIN LATERAL unnest(coalesce(profile.hobbies, '{}'::text[])) hobby(hobby)
      WHERE member.circle_id = _circle_id
        AND member.membership_status = 'active'
        AND profile.interests_visibility IN ('members', 'public')
        AND (profile.user_id = auth.uid() OR profile.profile_visibility IN ('members', 'public'))
        AND NOT public.is_blocked_between(auth.uid(), member.user_id)
        AND btrim(hobby.hobby) <> ''
      GROUP BY lower(btrim(hobby.hobby))
      HAVING count(DISTINCT member.user_id) >= 2
      ORDER BY count(DISTINCT member.user_id) DESC, min(btrim(hobby.hobby))
      LIMIT 8
    ) shared;
  END IF;

  IF circle_row.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'user_id', member.user_id,
      'display_name', nullif(btrim(profile.display_name), ''),
      'avatar_url', profile.avatar_url,
      'requested_at', member.updated_at,
      'rules_acknowledged', member.rules_consented_at IS NOT NULL
    ) ORDER BY member.updated_at), '[]'::jsonb)
    INTO pending_cards
    FROM public.social_circle_members member
    JOIN public.profiles profile ON profile.user_id = member.user_id
    WHERE member.circle_id = _circle_id
      AND member.membership_status = 'requested'
      AND NOT public.is_blocked_between(circle_row.host_id, member.user_id);
  END IF;

  SELECT jsonb_build_object(
    'event_id', event.id,
    'title', event.title,
    'event_date', event.event_date,
    'event_time', event.event_time,
    'city', event.location_city
  ) INTO next_event
  FROM public.social_circle_events linked
  JOIN public.events event ON event.id = linked.event_id
  WHERE linked.circle_id = _circle_id
    AND event.is_active
    AND (event.event_date IS NULL OR event.event_date >= current_date)
    AND (can_view_members OR coalesce(event.visibility_type, 'public') = 'public')
  ORDER BY event.event_date NULLS LAST, event.event_time NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'circle_id', circle_row.id,
    'name', circle_row.name,
    'purpose', circle_row.purpose,
    'cadence', circle_row.cadence,
    'capacity', circle_row.capacity,
    'membership_policy', circle_row.membership_policy,
    'lifecycle_state', circle_row.lifecycle_state,
    'venue_preference', circle_row.venue_preference,
    'safety_rules', circle_row.safety_rules,
    'host_id', circle_row.host_id,
    'members', member_cards,
    'shared_interests', shared_interest_cards,
    'pending_requests', pending_cards,
    'next_event', next_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_circle_membership(uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_reconnection_preference(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_circle_membership_request(uuid, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_social_circle(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_my_social_graph_records() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_social_graph_records(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_my_circle_suggestions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_circle_suggestion_cards() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_circle_suggestion(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_circle_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_circle_membership(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reconnection_preference(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_circle_membership_request(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_social_circle(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_my_social_graph_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_social_graph_records(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_my_circle_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_circle_suggestion_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_circle_suggestion(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_circle_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.resolve_circle_membership_request(uuid, uuid, boolean, text) IS
  'Host/admin approval boundary for approval-policy Circle requests; self-approval is impossible.';
COMMENT ON FUNCTION public.expire_social_graph_records(integer) IS
  'Bounded service/admin maintenance entrypoint for encounter and suggestion lifecycle expiry.';
