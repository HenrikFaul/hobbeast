-- A companion plan is an EXTENSION of an external program, never a second event.
--
-- Clicking a program's internal link used to end on "Az esemény nem található",
-- because /events/:id only ever looked in public.events. External programs are
-- real rows in public.external_events; they simply had no page of their own.
--
-- The fix has two halves:
--   1. get_external_event_safe() resolves one external program by id, through
--      exactly the same availability gate the list uses, so a shared or
--      bookmarked link works.
--   2. A companion plan ("menjünk együtt") hangs off that program: a couple of
--      rows, a host and the people joining them. It never creates a row in
--      public.events, so a program can never appear twice in the catalogue.
--
-- One open plan per program, enforced by a partial unique index. A second
-- person cannot start a rival plan for the same program — they join the one
-- that already exists. That is the whole anti-duplication design.

CREATE TABLE IF NOT EXISTS public.external_event_companion_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_point text,
  meet_time time without time zone,
  note text,
  max_companions smallint,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_event_companion_plans_status_check
    CHECK (status IN ('open', 'cancelled')),
  CONSTRAINT external_event_companion_plans_meeting_point_len
    CHECK (meeting_point IS NULL OR char_length(meeting_point) <= 160),
  CONSTRAINT external_event_companion_plans_note_len
    CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT external_event_companion_plans_max_companions_range
    CHECK (max_companions IS NULL OR (max_companions >= 2 AND max_companions <= 200))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_event_companion_plans_one_open
  ON public.external_event_companion_plans (external_event_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS external_event_companion_plans_host_idx
  ON public.external_event_companion_plans (host_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.external_event_companion_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.external_event_companion_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'joined',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_event_companion_members_status_check
    CHECK (status IN ('joined', 'left')),
  CONSTRAINT external_event_companion_members_unique UNIQUE (plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS external_event_companion_members_plan_idx
  ON public.external_event_companion_members (plan_id) WHERE status = 'joined';

ALTER TABLE public.external_event_companion_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_companion_members ENABLE ROW LEVEL SECURITY;

-- Everything readable goes through the SECURITY DEFINER functions below, which
-- return an aggregate plus the caller's own row. Direct table reads are limited
-- to what a member already knows: their own participation.
DROP POLICY IF EXISTS "Hosts read own companion plans" ON public.external_event_companion_plans;
CREATE POLICY "Hosts read own companion plans"
  ON public.external_event_companion_plans FOR SELECT TO authenticated
  USING (host_id = auth.uid());

DROP POLICY IF EXISTS "Members read own companion membership" ON public.external_event_companion_members;
CREATE POLICY "Members read own companion membership"
  ON public.external_event_companion_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.feature_flags (key, enabled, rollout_percentage, cohorts, eligibility_rule, owner, expires_at, description)
VALUES (
  'external_event_companion',
  true, 100, '{}', '{}'::jsonb, 'product',
  timestamptz '2027-12-31 23:59:59+00',
  'Joint-visit companion plans attached to an external program (never a separate event).'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Reading one external program by id — the same gate as the list, one row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_external_event_safe(p_external_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT jsonb_build_object(
    'id', e.id,
    'external_source', e.external_source,
    'external_id', e.external_id,
    'external_url', e.external_url,
    'title', e.title,
    'category', e.category,
    'subcategory', e.subcategory,
    'tags', e.tags,
    'description', e.description,
    'event_date', e.event_date,
    'event_time', e.event_time,
    'location_type', e.location_type,
    'location_city', e.location_city,
    'location_address', e.location_address,
    'location_free_text', e.location_free_text,
    'location_lat', e.location_lat,
    'location_lon', e.location_lon,
    'price_min', e.price_min,
    'price_max', e.price_max,
    'currency', e.currency,
    'is_free', e.is_free,
    'max_attendees', e.max_attendees,
    'image_url', e.image_url,
    'organizer_name', e.organizer_name,
    'freshness_state', e.freshness_state,
    'import_state', e.import_state,
    'normalization_version', e.normalization_version
  )
  FROM public.external_events e
  WHERE e.id = p_external_event_id
    AND public.external_event_is_publicly_available(e.id);
$fn$;

REVOKE ALL ON FUNCTION public.get_external_event_safe(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_external_event_safe(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- The companion plan attached to a program.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_external_event_companion_plan(p_external_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_enabled boolean;
  v_available boolean;
  v_plan public.external_event_companion_plans%ROWTYPE;
  v_count integer := 0;
  v_host_name text;
  v_joined boolean := false;
BEGIN
  v_enabled := public.evaluate_feature_flag(
    'external_event_companion',
    COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NULL
  );
  v_available := public.external_event_is_publicly_available(p_external_event_id);

  IF NOT v_enabled OR NOT v_available THEN
    RETURN jsonb_build_object(
      'feature_enabled', v_enabled,
      'available', v_available,
      'plan', NULL
    );
  END IF;

  SELECT * INTO v_plan
  FROM public.external_event_companion_plans
  WHERE external_event_id = p_external_event_id AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('feature_enabled', true, 'available', true, 'plan', NULL);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.external_event_companion_members m
  JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.plan_id = v_plan.id AND m.status = 'joined' AND p.is_active = true;

  SELECT NULLIF(btrim(coalesce(p.display_name, '')), '') INTO v_host_name
  FROM public.profiles p WHERE p.user_id = v_plan.host_id;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.external_event_companion_members m
      WHERE m.plan_id = v_plan.id AND m.user_id = v_user_id AND m.status = 'joined'
    ) INTO v_joined;
  END IF;

  RETURN jsonb_build_object(
    'feature_enabled', true,
    'available', true,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'host_name', COALESCE(v_host_name, 'Hobbeast tag'),
      'is_host', v_user_id IS NOT NULL AND v_plan.host_id = v_user_id,
      'meeting_point', v_plan.meeting_point,
      'meet_time', v_plan.meet_time,
      'note', v_plan.note,
      'max_companions', v_plan.max_companions,
      'companion_count', v_count,
      'spots_left', CASE WHEN v_plan.max_companions IS NULL THEN NULL
                         ELSE GREATEST(0, v_plan.max_companions - v_count) END,
      'i_joined', v_joined,
      'created_at', v_plan.created_at
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_external_event_companion_plan(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_external_event_companion_plan(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Creating a plan. Idempotent by design: if one is already open for the
-- program, the caller joins it instead of starting a duplicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_external_event_companion_plan(
  p_external_event_id uuid,
  p_meeting_point text DEFAULT NULL,
  p_meet_time time without time zone DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_max_companions integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.external_event_companion_plans%ROWTYPE;
  v_meeting_point text := NULLIF(btrim(coalesce(p_meeting_point, '')), '');
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_max smallint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.evaluate_feature_flag('external_event_companion', v_user_id, NULL) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '22023';
  END IF;
  IF NOT public.external_event_is_publicly_available(p_external_event_id) THEN
    RAISE EXCEPTION 'EXTERNAL_EVENT_NOT_AVAILABLE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = v_user_id AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
  END IF;

  IF char_length(coalesce(v_meeting_point, '')) > 160 THEN
    v_meeting_point := left(v_meeting_point, 160);
  END IF;
  IF char_length(coalesce(v_note, '')) > 500 THEN
    v_note := left(v_note, 500);
  END IF;
  v_max := CASE
    WHEN p_max_companions IS NULL THEN NULL
    ELSE LEAST(200, GREATEST(2, p_max_companions))::smallint
  END;

  SELECT * INTO v_plan
  FROM public.external_event_companion_plans
  WHERE external_event_id = p_external_event_id AND status = 'open';

  IF NOT FOUND THEN
    -- Two people pressing "igen" in the same second must not produce two plans.
    INSERT INTO public.external_event_companion_plans (
      external_event_id, host_id, meeting_point, meet_time, note, max_companions
    ) VALUES (
      p_external_event_id, v_user_id, v_meeting_point, p_meet_time, v_note, v_max
    )
    ON CONFLICT (external_event_id) WHERE status = 'open' DO NOTHING
    RETURNING * INTO v_plan;

    IF v_plan.id IS NULL THEN
      SELECT * INTO v_plan
      FROM public.external_event_companion_plans
      WHERE external_event_id = p_external_event_id AND status = 'open';
    END IF;
  END IF;

  INSERT INTO public.external_event_companion_members (plan_id, user_id, status)
  VALUES (v_plan.id, v_user_id, 'joined')
  ON CONFLICT (plan_id, user_id) DO UPDATE
    SET status = 'joined', updated_at = now();

  RETURN public.get_external_event_companion_plan(p_external_event_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_external_event_companion_plan(uuid, text, time without time zone, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_external_event_companion_plan(uuid, text, time without time zone, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Joining or leaving. The host leaving cancels the plan, so nobody is left
-- waiting at a meeting point for somebody who is not coming.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_external_event_companion_membership(
  p_plan_id uuid,
  p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.external_event_companion_plans%ROWTYPE;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan
  FROM public.external_event_companion_plans
  WHERE id = p_plan_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANION_PLAN_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF p_active THEN
    IF NOT public.external_event_is_publicly_available(v_plan.external_event_id) THEN
      RAISE EXCEPTION 'EXTERNAL_EVENT_NOT_AVAILABLE' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id = v_user_id AND p.is_active = true
    ) THEN
      RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
    END IF;

    IF v_plan.max_companions IS NOT NULL THEN
      SELECT count(*) INTO v_count
      FROM public.external_event_companion_members m
      WHERE m.plan_id = v_plan.id AND m.status = 'joined' AND m.user_id <> v_user_id;
      IF v_count >= v_plan.max_companions THEN
        RAISE EXCEPTION 'COMPANION_PLAN_FULL' USING ERRCODE = '22023';
      END IF;
    END IF;

    INSERT INTO public.external_event_companion_members (plan_id, user_id, status)
    VALUES (v_plan.id, v_user_id, 'joined')
    ON CONFLICT (plan_id, user_id) DO UPDATE
      SET status = 'joined', updated_at = now();
  ELSE
    UPDATE public.external_event_companion_members
      SET status = 'left', updated_at = now()
      WHERE plan_id = v_plan.id AND user_id = v_user_id;

    IF v_plan.host_id = v_user_id THEN
      UPDATE public.external_event_companion_plans
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_plan.id;
    END IF;
  END IF;

  RETURN public.get_external_event_companion_plan(v_plan.external_event_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_external_event_companion_membership(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_external_event_companion_membership(uuid, boolean) TO authenticated;
