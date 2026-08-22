-- Prompt 04 + Premium Addendum: attendance-bound encounters, private mutual
-- reconnection, revocable connections and consent-driven recurring circles.

CREATE TABLE IF NOT EXISTS public.event_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_low_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confidence_status text NOT NULL DEFAULT 'eligible'
    CHECK (confidence_status IN ('eligible', 'suggested', 'mutual', 'connected', 'blocked', 'expired')),
  attendance_verified boolean NOT NULL DEFAULT true,
  eligible_at timestamptz NOT NULL DEFAULT now(),
  suggested_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_low_id, user_high_id),
  CHECK (user_low_id <> user_high_id),
  CHECK (user_low_id::text < user_high_id::text)
);

CREATE INDEX IF NOT EXISTS event_encounters_low_status_idx
  ON public.event_encounters (user_low_id, confidence_status, eligible_at DESC);
CREATE INDEX IF NOT EXISTS event_encounters_high_status_idx
  ON public.event_encounters (user_high_id, confidence_status, eligible_at DESC);

CREATE TABLE IF NOT EXISTS public.reconnection_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.event_encounters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('interested', 'pass')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_encounter_id uuid REFERENCES public.event_encounters(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'blocked')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id <> user_high_id),
  CHECK (user_low_id::text < user_high_id::text)
);

CREATE INDEX IF NOT EXISTS connections_low_status_idx ON public.connections (user_low_id, status);
CREATE INDEX IF NOT EXISTS connections_high_status_idx ON public.connections (user_high_id, status);

CREATE TABLE IF NOT EXISTS public.social_circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 80),
  purpose text NOT NULL CHECK (char_length(btrim(purpose)) BETWEEN 3 AND 500),
  cadence text NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'flexible')),
  capacity smallint NOT NULL DEFAULT 12 CHECK (capacity BETWEEN 2 AND 50),
  membership_policy text NOT NULL DEFAULT 'approval'
    CHECK (membership_policy IN ('invite_only', 'approval', 'open')),
  visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('private', 'members', 'public')),
  venue_preference text,
  safety_rules text,
  lifecycle_state text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_state IN ('draft', 'recruiting', 'active', 'paused', 'archived')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lifecycle_state = 'archived' AND archived_at IS NOT NULL) OR lifecycle_state <> 'archived')
);

CREATE TABLE IF NOT EXISTS public.social_circle_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.social_circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'guardian', 'member')),
  membership_status text NOT NULL DEFAULT 'invited'
    CHECK (membership_status IN ('invited', 'requested', 'active', 'declined', 'left', 'removed')),
  rules_consented_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id),
  CHECK (membership_status <> 'active' OR rules_consented_at IS NOT NULL)
);

ALTER TABLE public.social_circles ADD COLUMN IF NOT EXISTS creation_key text;
CREATE UNIQUE INDEX IF NOT EXISTS social_circles_creation_key_uidx
  ON public.social_circles (created_by, creation_key)
  WHERE creation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_circle_members_user_status_idx
  ON public.social_circle_members (user_id, membership_status);

CREATE TABLE IF NOT EXISTS public.social_circle_events (
  circle_id uuid NOT NULL REFERENCES public.social_circles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.circle_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_label text NOT NULL,
  city text,
  evidence_connection_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  suggested_member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'inviting', 'accepted', 'declined', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_graph_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('encounter', 'preference', 'connection', 'circle', 'membership')),
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconnection_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_circle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_graph_audit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_circle_member(_circle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.social_circle_members m
    WHERE m.circle_id = _circle_id
      AND m.user_id = auth.uid()
      AND m.membership_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_circle_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_circle_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Encounter participants can view safe encounters" ON public.event_encounters;
CREATE POLICY "Encounter participants can view safe encounters" ON public.event_encounters
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (user_low_id, user_high_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (user_low_id, user_high_id))
         OR (b.blocked_id = auth.uid() AND b.blocker_id IN (user_low_id, user_high_id))
    )
  );

DROP POLICY IF EXISTS "Users view own reconnection preference" ON public.reconnection_preferences;
CREATE POLICY "Users view own reconnection preference" ON public.reconnection_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Connection participants can view active relationships" ON public.connections;
CREATE POLICY "Connection participants can view active relationships" ON public.connections
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (user_low_id, user_high_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (user_low_id, user_high_id))
         OR (b.blocked_id = auth.uid() AND b.blocker_id IN (user_low_id, user_high_id))
    )
  );

DROP POLICY IF EXISTS "Circles respect configured visibility" ON public.social_circles;
CREATE POLICY "Circles respect configured visibility" ON public.social_circles
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR host_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'members' AND auth.uid() IS NOT NULL)
    OR public.is_circle_member(id)
    OR EXISTS (
      SELECT 1 FROM public.social_circle_members own_membership
      WHERE own_membership.circle_id = id AND own_membership.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users create circles they host" ON public.social_circles;
CREATE POLICY "Users create circles they host" ON public.social_circles
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND host_id = auth.uid());
DROP POLICY IF EXISTS "Hosts update circles" ON public.social_circles;
CREATE POLICY "Hosts update circles" ON public.social_circles
  FOR UPDATE TO authenticated USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Circle members view memberships" ON public.social_circle_members;
CREATE POLICY "Circle members view memberships" ON public.social_circle_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_circle_member(circle_id));

DROP POLICY IF EXISTS "Circle members view linked events" ON public.social_circle_events;
CREATE POLICY "Circle members view linked events" ON public.social_circle_events
  FOR SELECT TO authenticated USING (public.is_circle_member(circle_id));
DROP POLICY IF EXISTS "Circle hosts link events" ON public.social_circle_events;
CREATE POLICY "Circle hosts link events" ON public.social_circle_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.social_circles c WHERE c.id = circle_id AND c.host_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own circle suggestions" ON public.circle_suggestions;
CREATE POLICY "Users manage own circle suggestions" ON public.circle_suggestions
  FOR ALL TO authenticated
  USING (suggested_by = auth.uid())
  WITH CHECK (suggested_by = auth.uid());

DROP POLICY IF EXISTS "Admins view social audit" ON public.social_graph_audit_events;
CREATE POLICY "Admins view social audit" ON public.social_graph_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.generate_event_encounters(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND e.outcome_status IN ('completed', 'held')
      AND (
        e.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR coalesce(auth.role(), '') = 'service_role'
      )
  ) THEN
    RAISE EXCEPTION 'Completed event organizer access required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_encounters (
    event_id, user_low_id, user_high_id, confidence_status, attendance_verified, eligible_at, expires_at
  )
  SELECT
    _event_id,
    ep1.user_id,
    ep2.user_id,
    'eligible',
    true,
    now(),
    now() + interval '30 days'
  FROM public.event_participants ep1
  JOIN public.event_participants ep2
    ON ep2.event_id = ep1.event_id AND ep1.user_id::text < ep2.user_id::text
  WHERE ep1.event_id = _event_id
    AND ep1.status IN ('checked_in', 'completed')
    AND ep2.status IN ('checked_in', 'completed')
    AND ep1.checked_in_at IS NOT NULL
    AND ep2.checked_in_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = ep1.user_id AND b.blocked_id = ep2.user_id)
         OR (b.blocker_id = ep2.user_id AND b.blocked_id = ep1.user_id)
    )
  ON CONFLICT (event_id, user_low_id, user_high_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_reconnection_candidates()
RETURNS TABLE (
  encounter_id uuid,
  event_id uuid,
  event_title text,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  interests text[],
  confidence_status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ee.id,
    ee.event_id,
    e.title,
    other_profile.user_id,
    NULLIF(btrim(other_profile.display_name), ''),
    other_profile.avatar_url,
    CASE WHEN other_profile.location_precision = 'city' THEN other_profile.city END,
    CASE WHEN other_profile.interests_visibility IN ('members', 'public') THEN other_profile.hobbies ELSE '{}'::text[] END,
    ee.confidence_status,
    ee.expires_at
  FROM public.event_encounters ee
  JOIN public.events e ON e.id = ee.event_id
  JOIN public.profiles other_profile
    ON other_profile.user_id = CASE WHEN ee.user_low_id = auth.uid() THEN ee.user_high_id ELSE ee.user_low_id END
  WHERE auth.uid() IN (ee.user_low_id, ee.user_high_id)
    AND ee.confidence_status NOT IN ('blocked', 'expired')
    AND ee.expires_at > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = other_profile.user_id)
         OR (b.blocked_id = auth.uid() AND b.blocker_id = other_profile.user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_connection_cards()
RETURNS TABLE (
  connection_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  interests text[],
  connected_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    other_profile.user_id,
    NULLIF(btrim(other_profile.display_name), ''),
    other_profile.avatar_url,
    CASE WHEN other_profile.location_precision = 'city' THEN other_profile.city END,
    CASE WHEN other_profile.interests_visibility IN ('members', 'public') THEN other_profile.hobbies ELSE '{}'::text[] END,
    c.connected_at
  FROM public.connections c
  JOIN public.profiles other_profile
    ON other_profile.user_id = CASE WHEN c.user_low_id = auth.uid() THEN c.user_high_id ELSE c.user_low_id END
  WHERE auth.uid() IN (c.user_low_id, c.user_high_id)
    AND c.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = other_profile.user_id)
         OR (b.blocked_id = auth.uid() AND b.blocker_id = other_profile.user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.set_reconnection_preference(_encounter_id uuid, _decision text)
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
  mutual_count integer;
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
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = encounter_row.user_low_id AND b.blocked_id = encounter_row.user_high_id)
       OR (b.blocker_id = encounter_row.user_high_id AND b.blocked_id = encounter_row.user_low_id)
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
    INSERT INTO public.connections (user_low_id, user_high_id, source_encounter_id, status, connected_at)
    VALUES (low_user, high_user, _encounter_id, 'active', now())
    ON CONFLICT (user_low_id, user_high_id)
    DO UPDATE SET status = 'active', source_encounter_id = EXCLUDED.source_encounter_id,
      connected_at = now(), ended_at = NULL, updated_at = now()
    RETURNING id INTO connection_id;

    UPDATE public.event_encounters
    SET confidence_status = 'connected', updated_at = now()
    WHERE id = _encounter_id;

    INSERT INTO public.social_graph_audit_events (actor_id, entity_type, entity_id, event_type)
    VALUES (auth.uid(), 'connection', connection_id, 'mutual_reconnection_created');
  END IF;

  RETURN connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_connection(_connection_id uuid)
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
  UPDATE public.connections
  SET status = 'revoked', ended_at = coalesce(ended_at, now()), updated_at = now()
  WHERE id = _connection_id
    AND auth.uid() IN (user_low_id, user_high_id)
    AND status <> 'blocked';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count = 0 AND NOT EXISTS (
    SELECT 1 FROM public.connections WHERE id = _connection_id AND auth.uid() IN (user_low_id, user_high_id)
  ) THEN
    RAISE EXCEPTION 'Connection not found' USING ERRCODE = 'P0002';
  END IF;
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _accept AND NOT _acknowledge_rules THEN
    RAISE EXCEPTION 'Circle rules must be acknowledged' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_circle_members
  SET membership_status = CASE WHEN _accept THEN 'active' ELSE 'declined' END,
      rules_consented_at = CASE WHEN _accept THEN now() ELSE NULL END,
      joined_at = CASE WHEN _accept THEN coalesce(joined_at, now()) ELSE joined_at END,
      left_at = CASE WHEN _accept THEN NULL ELSE now() END,
      updated_at = now()
  WHERE circle_id = _circle_id
    AND user_id = auth.uid()
    AND membership_status IN ('invited', 'requested', 'declined');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle invitation not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_social_circle(
  _name text,
  _purpose text,
  _cadence text,
  _capacity integer,
  _membership_policy text,
  _visibility text,
  _safety_rules text,
  _creation_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  circle_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_creation_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Creation key required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO circle_id FROM public.social_circles
  WHERE created_by = auth.uid() AND creation_key = _creation_key;
  IF FOUND THEN RETURN circle_id; END IF;

  INSERT INTO public.social_circles (
    created_by, host_id, name, purpose, cadence, capacity,
    membership_policy, visibility, safety_rules, lifecycle_state, creation_key
  ) VALUES (
    auth.uid(), auth.uid(), btrim(_name), btrim(_purpose), _cadence, _capacity,
    _membership_policy, _visibility, NULLIF(btrim(_safety_rules), ''), 'draft', _creation_key
  ) RETURNING id INTO circle_id;

  INSERT INTO public.social_circle_members (
    circle_id, user_id, role, membership_status, rules_consented_at, joined_at
  ) VALUES (circle_id, auth.uid(), 'host', 'active', now(), now());

  INSERT INTO public.social_graph_audit_events (actor_id, entity_type, entity_id, event_type)
  VALUES (auth.uid(), 'circle', circle_id, 'circle_created');
  RETURN circle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_circle_membership(
  _circle_id uuid,
  _acknowledge_rules boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  circle_row public.social_circles%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO circle_row FROM public.social_circles
  WHERE id = _circle_id AND lifecycle_state IN ('recruiting', 'active')
  FOR UPDATE;
  IF NOT FOUND OR circle_row.membership_policy = 'invite_only' THEN
    RAISE EXCEPTION 'Circle does not accept join requests' USING ERRCODE = '22023';
  END IF;
  IF circle_row.safety_rules IS NOT NULL AND NOT _acknowledge_rules THEN
    RAISE EXCEPTION 'Circle rules must be acknowledged' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = circle_row.host_id)
       OR (b.blocked_id = auth.uid() AND b.blocker_id = circle_row.host_id)
  ) THEN
    RAISE EXCEPTION 'Circle is unavailable' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.social_circle_members WHERE circle_id = _circle_id AND membership_status = 'active') >= circle_row.capacity THEN
    RAISE EXCEPTION 'Circle is full' USING ERRCODE = 'P0001';
  END IF;

  next_status := CASE WHEN circle_row.membership_policy = 'open' THEN 'active' ELSE 'requested' END;
  INSERT INTO public.social_circle_members (
    circle_id, user_id, role, membership_status, rules_consented_at, joined_at, left_at
  ) VALUES (
    _circle_id, auth.uid(), 'member', next_status,
    CASE WHEN _acknowledge_rules THEN now() END,
    CASE WHEN next_status = 'active' THEN now() END,
    NULL
  )
  ON CONFLICT (circle_id, user_id)
  DO UPDATE SET membership_status = EXCLUDED.membership_status,
    rules_consented_at = EXCLUDED.rules_consented_at,
    joined_at = coalesce(public.social_circle_members.joined_at, EXCLUDED.joined_at),
    left_at = NULL, updated_at = now();
  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_circle_member(_circle_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  low_user uuid;
  high_user uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.social_circles c WHERE c.id = _circle_id AND c.host_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Circle host access required' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() THEN RETURN; END IF;
  low_user := CASE WHEN auth.uid()::text < _user_id::text THEN auth.uid() ELSE _user_id END;
  high_user := CASE WHEN auth.uid()::text < _user_id::text THEN _user_id ELSE auth.uid() END;
  IF NOT EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.user_low_id = low_user AND c.user_high_id = high_user AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an active mutual connection can be invited' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.social_circle_members (circle_id, user_id, role, membership_status)
  VALUES (_circle_id, _user_id, 'member', 'invited')
  ON CONFLICT (circle_id, user_id)
  DO UPDATE SET membership_status = 'invited', rules_consented_at = NULL, left_at = NULL, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_social_circle(
  _circle_id uuid,
  _next_state text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT lifecycle_state INTO current_state
  FROM public.social_circles
  WHERE id = _circle_id
    AND (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle host access required' USING ERRCODE = '42501';
  END IF;
  IF current_state = _next_state THEN RETURN; END IF;
  IF NOT (
    (current_state = 'draft' AND _next_state IN ('recruiting', 'archived'))
    OR (current_state = 'recruiting' AND _next_state IN ('draft', 'active', 'archived'))
    OR (current_state = 'active' AND _next_state IN ('paused', 'archived'))
    OR (current_state = 'paused' AND _next_state IN ('active', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Invalid Circle lifecycle transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_circles
  SET lifecycle_state = _next_state,
      archived_at = CASE WHEN _next_state = 'archived' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = _circle_id;
  INSERT INTO public.social_graph_audit_events (actor_id, entity_type, entity_id, event_type, metadata)
  VALUES (
    auth.uid(), 'circle', _circle_id, 'circle_state_transitioned',
    jsonb_build_object('from', current_state, 'to', _next_state, 'reason', left(coalesce(_reason, ''), 500))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_block_across_social_graph()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  low_user uuid;
  high_user uuid;
BEGIN
  low_user := CASE WHEN NEW.blocker_id::text < NEW.blocked_id::text THEN NEW.blocker_id ELSE NEW.blocked_id END;
  high_user := CASE WHEN NEW.blocker_id::text < NEW.blocked_id::text THEN NEW.blocked_id ELSE NEW.blocker_id END;

  UPDATE public.event_encounters
  SET confidence_status = 'blocked', updated_at = now()
  WHERE user_low_id = low_user AND user_high_id = high_user;

  UPDATE public.connections
  SET status = 'blocked', ended_at = coalesce(ended_at, now()), updated_at = now()
  WHERE user_low_id = low_user AND user_high_id = high_user;

  UPDATE public.social_circle_members m
  SET membership_status = 'removed', left_at = coalesce(left_at, now()), updated_at = now()
  FROM public.social_circles c
  WHERE c.id = m.circle_id
    AND (
      (c.host_id = NEW.blocker_id AND m.user_id = NEW.blocked_id)
      OR (c.host_id = NEW.blocked_id AND m.user_id = NEW.blocker_id)
    )
    AND m.role = 'member'
    AND m.membership_status IN ('invited', 'requested', 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_blocks_enforce_social_graph ON public.user_blocks;
CREATE TRIGGER user_blocks_enforce_social_graph
  AFTER INSERT OR UPDATE ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_block_across_social_graph();

CREATE OR REPLACE VIEW public.circle_health_dashboard
WITH (security_barrier = true)
AS
SELECT
  c.id AS circle_id,
  c.name,
  c.host_id,
  coalesce(member_stats.active_members, 0) AS active_members,
  coalesce(member_stats.new_members_30d, 0) AS new_members_30d,
  coalesce(event_stats.event_count, 0) AS event_count,
  coalesce(event_stats.returning_attendees, 0) AS returning_attendees,
  coalesce(event_stats.no_show_rate, 0) AS no_show_rate,
  coalesce(report_stats.open_report_count, 0) AS open_report_count,
  greatest(c.updated_at, coalesce(event_stats.last_event_activity_at, c.updated_at)) AS last_activity_at
FROM public.social_circles c
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE m.membership_status = 'active')::integer AS active_members,
    count(*) FILTER (
      WHERE m.membership_status = 'active'
        AND m.joined_at > now() - interval '30 days'
    )::integer AS new_members_30d
  FROM public.social_circle_members m
  WHERE m.circle_id = c.id
) member_stats ON true
LEFT JOIN LATERAL (
  SELECT
    count(DISTINCT ce.event_id)::integer AS event_count,
    count(DISTINCT ep.user_id) FILTER (WHERE ep.status = 'completed')::integer AS returning_attendees,
    coalesce(
      count(*) FILTER (WHERE ep.status = 'no_show')::numeric /
        NULLIF(count(*) FILTER (WHERE ep.status IN ('completed', 'checked_in', 'no_show')), 0),
      0
    ) AS no_show_rate,
    max(e.updated_at) AS last_event_activity_at
  FROM public.social_circle_events ce
  LEFT JOIN public.events e ON e.id = ce.event_id
  LEFT JOIN public.event_participants ep ON ep.event_id = ce.event_id
  WHERE ce.circle_id = c.id
) event_stats ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS open_report_count
  FROM public.user_reports ur
  WHERE ur.context_type = 'circle'
    AND ur.context_id = c.id
    AND ur.status IN ('submitted', 'triaged', 'investigating')
) report_stats ON true
WHERE c.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin');

REVOKE ALL ON public.circle_health_dashboard FROM PUBLIC;
GRANT SELECT ON public.circle_health_dashboard TO authenticated;

REVOKE ALL ON FUNCTION public.generate_event_encounters(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_reconnection_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_connection_cards() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_reconnection_preference(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_connection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_circle_membership(uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_social_circle(text, text, text, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_circle_membership(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_circle_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_social_circle(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_block_across_social_graph() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_event_encounters(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_reconnection_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_connection_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reconnection_preference(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_circle_membership(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_circle(text, text, text, integer, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_circle_membership(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_circle_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_social_circle(uuid, text, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.event_encounters FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reconnection_preferences FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.connections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_circles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_circle_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_graph_audit_events FROM anon, authenticated;

DROP TRIGGER IF EXISTS update_event_encounters_updated_at ON public.event_encounters;
CREATE TRIGGER update_event_encounters_updated_at BEFORE UPDATE ON public.event_encounters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_reconnection_preferences_updated_at ON public.reconnection_preferences;
CREATE TRIGGER update_reconnection_preferences_updated_at BEFORE UPDATE ON public.reconnection_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_connections_updated_at ON public.connections;
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_social_circles_updated_at ON public.social_circles;
CREATE TRIGGER update_social_circles_updated_at BEFORE UPDATE ON public.social_circles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_social_circle_members_updated_at ON public.social_circle_members;
CREATE TRIGGER update_social_circle_members_updated_at BEFORE UPDATE ON public.social_circle_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_circle_suggestions_updated_at ON public.circle_suggestions;
CREATE TRIGGER update_circle_suggestions_updated_at BEFORE UPDATE ON public.circle_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.reconnection_preferences IS
  'Private one-sided choice. A peer can only infer interest after both sides opt in and a connection is created.';
COMMENT ON TABLE public.event_encounters IS
  'Pairwise encounter eligibility derived only from completed/held events and verified check-in rows.';
