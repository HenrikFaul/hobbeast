-- Top-5 competitor-benchmarked features, data layer.
--
-- 1. saved_events      — "Save" (Meetup/Eventbrite/Facebook): the missing basic.
--                        Without it an interesting program is either acted on
--                        immediately or lost forever.
-- 3. hobby_alerts      — "Track artist" (Bandsintown/Songkick) applied to hobbies:
--                        the member follows a hobby, we surface new matching
--                        programs. Drives the North Star (returning members).

CREATE TABLE IF NOT EXISTS public.saved_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_event_id uuid REFERENCES public.external_events(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one target, so a saved row always points at a real program.
  CONSTRAINT saved_events_one_target CHECK (
    (external_event_id IS NOT NULL AND event_id IS NULL)
    OR (external_event_id IS NULL AND event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_events_user_external_idx
  ON public.saved_events (user_id, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS saved_events_user_internal_idx
  ON public.saved_events (user_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS saved_events_user_idx ON public.saved_events (user_id, created_at DESC);

ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage their own saved programs" ON public.saved_events;
CREATE POLICY "Members manage their own saved programs"
  ON public.saved_events
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.saved_events TO authenticated;

-- Toggle a save. Returns the resulting state so the UI can reflect it directly.
CREATE OR REPLACE FUNCTION public.toggle_saved_event(
  p_external_event_id uuid DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF (p_external_event_id IS NULL) = (p_event_id IS NULL) THEN
    RAISE EXCEPTION 'EXACTLY_ONE_TARGET_REQUIRED' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.saved_events
  WHERE user_id = v_user
    AND external_event_id IS NOT DISTINCT FROM p_external_event_id
    AND event_id IS NOT DISTINCT FROM p_event_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.saved_events (user_id, external_event_id, event_id)
  VALUES (v_user, p_external_event_id, p_event_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_saved_event(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toggle_saved_event(uuid, uuid) TO authenticated;

-- The member's saved programs, newest event first, past programs dropped.
CREATE OR REPLACE FUNCTION public.list_saved_events()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'event_date'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'saved_id', s.id,
      'external_event_id', s.external_event_id,
      'event_id', s.event_id,
      'title', COALESCE(x.title, e.title),
      'event_date', COALESCE(x.event_date, e.event_date),
      'event_time', COALESCE(x.event_time, e.event_time),
      'location_city', COALESCE(x.location_city, e.location_city),
      'location_address', COALESCE(x.location_address, e.location_address),
      'image_url', x.image_url,
      'external_url', x.external_url,
      'price_min', x.price_min,
      'currency', x.currency,
      'category', COALESCE(x.category, e.category)
    ) AS row
    FROM public.saved_events s
    LEFT JOIN public.external_events x ON x.id = s.external_event_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.user_id = auth.uid()
      AND COALESCE(x.event_date, e.event_date) >= current_date
  ) saved;
$$;

REVOKE ALL ON FUNCTION public.list_saved_events() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_saved_events() TO authenticated;

-- Hobby alerts: new upcoming programs matching the member's favourite hobbies
-- that they have not saved yet. Uses hu_fold() so accents never hide a match.
CREATE OR REPLACE FUNCTION public.list_hobby_alerts(p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_hobbies text[];
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 12), 50));
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT hobbies INTO v_hobbies FROM public.profiles WHERE user_id = v_user;
  IF v_hobbies IS NULL OR array_length(v_hobbies, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY row->>'event_date')
    FROM (
      SELECT jsonb_build_object(
        'external_event_id', x.id,
        'title', x.title,
        'event_date', x.event_date,
        'event_time', x.event_time,
        'location_city', x.location_city,
        'image_url', x.image_url,
        'external_url', x.external_url,
        'price_min', x.price_min,
        'currency', x.currency,
        'matched_hobby', h.hobby
      ) AS row
      FROM public.external_events x
      JOIN LATERAL (
        SELECT hobby FROM unnest(v_hobbies) AS hobby
        WHERE public.hu_fold(
                x.title || ' ' || COALESCE(x.category, '') || ' '
                || COALESCE(array_to_string(x.tags, ' '), '')
              ) LIKE '%' || public.hu_fold(hobby) || '%'
        LIMIT 1
      ) h ON true
      WHERE x.is_active
        AND x.event_date >= current_date
        AND NOT EXISTS (
          SELECT 1 FROM public.saved_events s
          WHERE s.user_id = v_user AND s.external_event_id = x.id
        )
      ORDER BY x.event_date
      LIMIT v_limit
    ) alerts
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_hobby_alerts(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_hobby_alerts(integer) TO authenticated;
