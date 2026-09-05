-- Country becomes a first-class filter for the listing, and the city chips stop
-- lying about how many places there are.
--
-- list_event_countries() is new: it answers "which countries do we have
-- programmes in, and how many", which is what the UI needs to put country
-- buttons where the capital-city chips used to be.
--
-- list_event_cities() now canonicalises, so Warszawa+Warsaw is ONE entry, and
-- takes a country filter so the city list follows the country selection. Its
-- old two-argument signature is dropped rather than left beside the new one:
-- PostgREST resolves by argument NAMES, and two overloads that can both accept
-- {p_from_date, p_limit} are ambiguous — an error that would only surface at
-- runtime. The added parameter defaults to NULL, so existing callers are
-- unaffected.

CREATE OR REPLACE FUNCTION public.list_event_countries(p_from_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'country_code', t.cc,
           'events', t.events,
           'cities', t.cities
         ) ORDER BY t.events DESC, t.cc), '[]'::jsonb)
  FROM (
    SELECT cc, sum(events)::bigint AS events, count(DISTINCT city) AS cities
    FROM (
      SELECT e.country_code AS cc,
             public.canonical_city(e.location_city, e.country_code) AS city,
             count(*) AS events
      FROM public.external_events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
        AND e.import_state = 'active'
        AND e.freshness_state IN ('fresh', 'aging')
        AND e.country_code IS NOT NULL
      GROUP BY 1, 2
      UNION ALL
      -- Member-created events are Hungarian by construction: the product runs on
      -- a Hungarian settlement gazetteer and has no country field for them.
      SELECT 'HU', e.location_city, count(*)
      FROM public.events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
      GROUP BY 1, 2
    ) merged
    GROUP BY cc
  ) t;
$function$;

DROP FUNCTION IF EXISTS public.list_event_cities(date, integer);

CREATE OR REPLACE FUNCTION public.list_event_cities(
  p_from_date date DEFAULT CURRENT_DATE,
  p_limit integer DEFAULT 60,
  p_countries text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'city', t.city, 'events', t.events, 'country_code', t.cc)
                  ORDER BY t.events DESC, t.city), '[]'::jsonb)
  FROM (
    SELECT city, cc, sum(events) AS events
    FROM (
      -- canonical_city() returns NULL for a nationwide marker such as
      -- "Országos" or "cała Polska", which is exactly right here: those are not
      -- cities and must not appear in a city list. The programmes behind them
      -- are still reachable through the country filter.
      SELECT public.canonical_city(e.location_city, e.country_code) AS city,
             e.country_code AS cc, count(*) AS events
      FROM public.external_events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
        AND e.import_state = 'active'
        AND e.freshness_state IN ('fresh', 'aging')
        AND (p_countries IS NULL OR array_length(p_countries, 1) IS NULL
             OR e.country_code = ANY (p_countries))
      GROUP BY 1, 2
      UNION ALL
      SELECT e.location_city, 'HU', count(*)
      FROM public.events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
        AND e.location_city IS NOT NULL
        AND btrim(e.location_city) <> ''
        AND (p_countries IS NULL OR array_length(p_countries, 1) IS NULL
             OR 'HU' = ANY (p_countries))
      GROUP BY 1, 2
    ) merged
    WHERE city IS NOT NULL AND btrim(city) <> ''
    GROUP BY city, cc
    ORDER BY sum(events) DESC, city
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 200))
  ) t;
$function$;

REVOKE ALL ON FUNCTION public.list_event_countries(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_countries(date) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_event_cities(date, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_cities(date, integer, text[]) TO anon, authenticated, service_role;
