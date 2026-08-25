-- Explore activity tiles: aggregate counts per activity name.
-- hu_fold: lowercase + Hungarian accent folding (U&'' escapes keep this file ASCII-safe).
-- explore_activity_stats: for each requested activity name returns
--   upcoming_events   = future-dated internal events + active future external events
--                       whose title/category/tags mention the activity
--   interested_people = profiles whose hobbies array contains the activity (folded equality)
-- Aggregate counts only; no user identities are exposed.

CREATE OR REPLACE FUNCTION public.hu_fold(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT translate(
    lower(coalesce(p_text, '')),
    U&'\00E1\00E9\00ED\00F3\00F6\0151\00FA\00FC\0171',
    'aeiooouuu'
  );
$$;

CREATE OR REPLACE FUNCTION public.explore_activity_stats(p_names text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_names IS NULL OR coalesce(array_length(p_names, 1), 0) = 0
     OR array_length(p_names, 1) > 60 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'name', n.name,
    'upcoming_events',
      (SELECT count(*)
         FROM public.events e
        WHERE e.event_date >= current_date
          AND hu_fold(e.title || ' ' || coalesce(e.category, '') || ' '
              || coalesce(array_to_string(e.tags, ' '), ''))
              LIKE '%' || hu_fold(n.name) || '%')
      +
      (SELECT count(*)
         FROM public.external_events x
        WHERE x.is_active
          AND x.event_date >= current_date
          AND hu_fold(x.title || ' ' || coalesce(x.category, '') || ' '
              || coalesce(array_to_string(x.tags, ' '), ''))
              LIKE '%' || hu_fold(n.name) || '%'),
    'interested_people',
      (SELECT count(*)
         FROM public.profiles p
        WHERE EXISTS (
          SELECT 1 FROM unnest(coalesce(p.hobbies, '{}'::text[])) AS h
          WHERE hu_fold(h) = hu_fold(n.name)
        ))
  ))
  INTO v_result
  FROM unnest(p_names) AS n(name)
  WHERE btrim(n.name) <> '';

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.explore_activity_stats(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.explore_activity_stats(text[]) TO anon, authenticated;
