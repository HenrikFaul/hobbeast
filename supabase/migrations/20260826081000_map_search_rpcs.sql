-- Map search RPCs.
--
-- Programs are placed on the map through their city name (only 2 of 1441 carry
-- coordinates), matched accent-insensitively against hu_settlements. Anything
-- that cannot be placed — "Országos" and unknown cities — is counted separately
-- so the UI can say so honestly instead of silently dropping it.

-- Aggregates for the map: county bubbles at low zoom, city pins at high zoom.
CREATE OR REPLACE FUNCTION public.map_event_clusters(
  p_category text DEFAULT NULL,
  p_county text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  WITH placed AS (
    SELECT e.id, e.category, s.display_name AS city, s.county, s.lat, s.lon
    FROM public.external_events e
    JOIN public.hu_settlements s
      ON s.name_normalized = public.hu_fold(btrim(e.location_city))
    WHERE e.is_active
      AND e.event_date >= current_date
      AND (p_category IS NULL OR e.category = p_category)
      AND (p_county IS NULL OR s.county = p_county)
  ),
  unplaced AS (
    SELECT count(*) AS cnt
    FROM public.external_events e
    WHERE e.is_active
      AND e.event_date >= current_date
      AND (p_category IS NULL OR e.category = p_category)
      AND NOT EXISTS (
        SELECT 1 FROM public.hu_settlements s
        WHERE s.name_normalized = public.hu_fold(btrim(coalesce(e.location_city, '')))
      )
  )
  SELECT jsonb_build_object(
    'counties', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'county', county, 'events', events, 'lat', lat, 'lon', lon
      ) ORDER BY events DESC)
      FROM (
        SELECT county, count(*) AS events, avg(lat) AS lat, avg(lon) AS lon
        FROM placed GROUP BY county
      ) c
    ), '[]'::jsonb),
    'cities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'city', city, 'county', county, 'events', events, 'lat', lat, 'lon', lon
      ) ORDER BY events DESC)
      FROM (
        SELECT city, county, count(*) AS events, min(lat) AS lat, min(lon) AS lon
        FROM placed GROUP BY city, county
      ) t
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', category, 'events', events) ORDER BY events DESC)
      FROM (
        SELECT COALESCE(category, 'Program') AS category, count(*) AS events
        FROM placed GROUP BY 1
      ) k
    ), '[]'::jsonb),
    'placed_total', (SELECT count(*) FROM placed),
    'unplaced_total', (SELECT cnt FROM unplaced)
  );
$$;

REVOKE ALL ON FUNCTION public.map_event_clusters(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.map_event_clusters(text, text) TO anon, authenticated;

-- Programs of one area, for the sidebar list and the map popups.
CREATE OR REPLACE FUNCTION public.map_events_at(
  p_city text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'event_date'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'external_event_id', e.id,
      'title', e.title,
      'event_date', e.event_date,
      'event_time', e.event_time,
      'category', e.category,
      'city', s.display_name,
      'county', s.county,
      'location_address', e.location_address,
      'image_url', e.image_url,
      'external_url', e.external_url,
      'price_min', e.price_min,
      'currency', e.currency,
      'organizer_name', e.organizer_name,
      'lat', s.lat,
      'lon', s.lon
    ) AS row
    FROM public.external_events e
    JOIN public.hu_settlements s
      ON s.name_normalized = public.hu_fold(btrim(e.location_city))
    WHERE e.is_active
      AND e.event_date >= current_date
      AND (p_city IS NULL OR s.display_name = p_city)
      AND (p_county IS NULL OR s.county = p_county)
      AND (p_category IS NULL OR e.category = p_category)
    ORDER BY e.event_date
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 200))
  ) rows;
$$;

REVOKE ALL ON FUNCTION public.map_events_at(text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.map_events_at(text, text, text, integer) TO anon, authenticated;
