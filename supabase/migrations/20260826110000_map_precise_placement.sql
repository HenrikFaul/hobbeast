-- Precise map placement, part 2: the placement view and the marker API.
--
-- event_map_placements resolves every active program to the best position we
-- actually know, and records HOW precisely it is known:
--   venue    — geocoded and name-verified venue, or coordinates from the source
--   district — Budapest district derived from a postal code or "N. kerület"
--   city     — settlement centroid (the old behaviour)
--   none     — no usable location; counted separately, never silently dropped
--
-- map_markers() then serves whichever granularity the current zoom needs, and
-- map_events_list() serves the cards for one marker. Both are additive: the
-- previous map_event_clusters / map_events_at functions stay untouched so a
-- browser holding an older bundle keeps working through a deploy.

CREATE OR REPLACE VIEW public.event_map_placements AS
WITH base AS (
  SELECT
    e.id, e.title, e.category, e.event_date, e.event_time, e.image_url, e.external_url,
    e.location_address, e.location_city, e.price_min, e.currency, e.organizer_name,
    e.location_lat, e.location_lon,
    public.hu_fold(btrim(coalesce(e.location_address, ''))) AS addr_key,
    public.hu_fold(btrim(coalesce(e.location_city, ''))) AS city_key
  FROM public.external_events e
  WHERE e.is_active AND e.event_date >= current_date
),
resolved AS (
  SELECT
    b.*,
    g.lat AS venue_lat, g.lon AS venue_lon, g.raw_name AS venue_name,
    g.city AS venue_city, g.place_key AS venue_key,
    s.display_name AS settlement_city, s.county AS settlement_county,
    s.lat AS settlement_lat, s.lon AS settlement_lon,
    -- The gazetteer's district wins; only when it has none do we pay for the
    -- text parse, and only for rows that could plausibly be in Budapest.
    COALESCE(
      g.district,
      CASE
        WHEN b.city_key = 'budapest' OR b.addr_key LIKE '%budapest%'
        THEN public.hu_district_from_text(concat_ws(' ', b.location_address, b.location_city))
      END
    ) AS district
  FROM base b
  LEFT JOIN public.geo_places g
    ON g.place_key = b.addr_key AND g.lat IS NOT NULL
  LEFT JOIN public.hu_settlements s
    ON s.name_normalized = b.city_key
)
SELECT
  r.id, r.title, r.category, r.event_date, r.event_time, r.image_url, r.external_url,
  r.location_address, r.price_min, r.currency, r.organizer_name,
  CASE
    WHEN r.location_lat IS NOT NULL AND r.location_lon IS NOT NULL THEN 'venue'
    WHEN r.venue_lat IS NOT NULL THEN 'venue'
    WHEN r.district IS NOT NULL THEN 'district'
    WHEN r.settlement_lat IS NOT NULL THEN 'city'
    ELSE 'none'
  END AS placement,
  COALESCE(r.location_lat, r.venue_lat, d.lat, r.settlement_lat) AS lat,
  COALESCE(r.location_lon, r.venue_lon, d.lon, r.settlement_lon) AS lon,
  COALESCE(r.settlement_city, r.venue_city,
           CASE WHEN r.district IS NOT NULL THEN 'Budapest' END) AS city,
  COALESCE(r.settlement_county,
           CASE WHEN r.district IS NOT NULL THEN 'Budapest' END) AS county,
  r.district,
  d.name AS district_name,
  CASE
    WHEN r.location_lat IS NOT NULL AND r.location_lon IS NOT NULL THEN 'evt:' || r.id::text
    WHEN r.venue_lat IS NOT NULL THEN r.venue_key
  END AS place_key,
  COALESCE(r.venue_name, NULLIF(btrim(coalesce(r.location_address, '')), '')) AS venue_label
FROM resolved r
LEFT JOIN public.hu_districts d ON d.district = r.district;

REVOKE ALL ON public.event_map_placements FROM public, anon, authenticated;

-- Markers for the current zoom level ----------------------------------------

CREATE OR REPLACE FUNCTION public.map_markers(
  p_level text DEFAULT 'county',           -- county | city | venue
  p_category text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.event_map_placements p
    WHERE (p_category IS NULL OR p.category = p_category)
      AND (p_county IS NULL OR p.county = p_county)
      AND (p_city IS NULL OR p.city = p_city)
      AND (p_district IS NULL OR p.district = p_district)
  ),
  placed AS (SELECT * FROM scoped WHERE placement <> 'none'),
  county_markers AS (
    SELECT 'county' AS kind, county AS key, county AS label,
           NULL::text AS sublabel, count(*)::int AS events,
           avg(lat) AS lat, avg(lon) AS lon, county, NULL::text AS city, NULL::text AS district
    FROM placed WHERE county IS NOT NULL GROUP BY county
  ),
  city_markers AS (
    -- Budapest is split into districts at this level: one pin for the whole
    -- capital would hide 500 programs behind a single dot.
    SELECT 'district' AS kind, 'Budapest|' || district AS key,
           district || '. kerület' AS label, district_name AS sublabel,
           count(*)::int AS events, avg(lat) AS lat, avg(lon) AS lon,
           county, city, district
    FROM placed WHERE district IS NOT NULL GROUP BY district, district_name, county, city
    UNION ALL
    SELECT 'city' AS kind, city AS key, city AS label, NULL::text AS sublabel,
           count(*)::int AS events, avg(lat) AS lat, avg(lon) AS lon,
           county, city, NULL::text AS district
    FROM placed WHERE city IS NOT NULL AND district IS NULL GROUP BY city, county
  ),
  venue_markers AS (
    SELECT 'venue' AS kind, place_key AS key, max(venue_label) AS label,
           max(city) AS sublabel, count(*)::int AS events,
           avg(lat) AS lat, avg(lon) AS lon,
           max(county) AS county, max(city) AS city, max(district) AS district
    FROM placed WHERE placement = 'venue' AND place_key IS NOT NULL GROUP BY place_key
    UNION ALL
    -- Programs known only to a district or a city still need a pin at venue
    -- zoom, otherwise they vanish the moment the user zooms in.
    SELECT 'district' AS kind, 'Budapest|' || district AS key,
           district || '. kerület' AS label, district_name AS sublabel,
           count(*)::int AS events, avg(lat) AS lat, avg(lon) AS lon,
           max(county) AS county, max(city) AS city, district
    FROM placed WHERE placement = 'district' AND district IS NOT NULL
    GROUP BY district, district_name
    UNION ALL
    SELECT 'city' AS kind, city AS key, city AS label, NULL::text AS sublabel,
           count(*)::int AS events, avg(lat) AS lat, avg(lon) AS lon,
           max(county) AS county, city, NULL::text AS district
    FROM placed WHERE placement = 'city' AND city IS NOT NULL GROUP BY city
  ),
  chosen AS (
    SELECT * FROM county_markers WHERE p_level = 'county'
    UNION ALL SELECT * FROM city_markers WHERE p_level = 'city'
    UNION ALL SELECT * FROM venue_markers WHERE p_level = 'venue'
  )
  SELECT jsonb_build_object(
    'level', p_level,
    'markers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', kind, 'key', key, 'label', label, 'sublabel', sublabel,
        'events', events, 'lat', lat, 'lon', lon,
        'county', county, 'city', city, 'district', district
      ) ORDER BY events DESC) FROM chosen WHERE lat IS NOT NULL
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', category, 'events', events) ORDER BY events DESC)
      FROM (
        SELECT COALESCE(category, 'Program') AS category, count(*)::int AS events
        FROM placed GROUP BY 1
      ) k
    ), '[]'::jsonb),
    'counties', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('county', county, 'events', events) ORDER BY county)
      FROM (
        SELECT county, count(*)::int AS events
        FROM public.event_map_placements
        WHERE county IS NOT NULL AND (p_category IS NULL OR category = p_category)
        GROUP BY county
      ) c
    ), '[]'::jsonb),
    'placed_total', (SELECT count(*)::int FROM placed),
    'exact_total', (SELECT count(*)::int FROM placed WHERE placement = 'venue'),
    'unplaced_total', (
      SELECT count(*)::int FROM public.event_map_placements
      WHERE placement = 'none' AND (p_category IS NULL OR category = p_category)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.map_markers(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.map_markers(text, text, text, text, text) TO anon, authenticated;

-- Cards behind one marker ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.map_events_list(
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_place_key text DEFAULT NULL,
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
      'external_event_id', p.id,
      'title', p.title,
      'event_date', p.event_date,
      'event_time', p.event_time,
      'category', p.category,
      'city', p.city,
      'county', p.county,
      'district', p.district,
      'venue', p.venue_label,
      'location_address', p.location_address,
      'image_url', p.image_url,
      'external_url', p.external_url,
      'price_min', p.price_min,
      'currency', p.currency,
      'organizer_name', p.organizer_name,
      'placement', p.placement,
      'lat', p.lat,
      'lon', p.lon
    ) AS row
    FROM public.event_map_placements p
    WHERE p.placement <> 'none'
      AND (p_county IS NULL OR p.county = p_county)
      AND (p_city IS NULL OR p.city = p_city)
      AND (p_district IS NULL OR p.district = p_district)
      AND (p_place_key IS NULL OR p.place_key = p_place_key)
      AND (p_category IS NULL OR p.category = p_category)
    ORDER BY p.event_date
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 200))
  ) rows;
$$;

REVOKE ALL ON FUNCTION public.map_events_list(text, text, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.map_events_list(text, text, text, text, text, integer) TO anon, authenticated;

-- Geocoder write-back --------------------------------------------------------
-- Service-role only: scripts/geocode-places.mjs is the sole caller.

CREATE OR REPLACE FUNCTION public.resolve_geo_place(
  p_place_key text,
  p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_postcode text DEFAULT NULL,
  p_precision text DEFAULT 'unresolvable',
  p_provider text DEFAULT NULL,
  p_matched_name text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  UPDATE public.geo_places
  SET lat = p_lat,
      lon = p_lon,
      city = COALESCE(p_city, city),
      county = COALESCE(p_county, county),
      district = COALESCE(p_district, district),
      postcode = COALESCE(p_postcode, postcode),
      geo_precision = CASE
        WHEN p_precision IN ('exact', 'district', 'city', 'unresolvable') THEN p_precision
        ELSE 'unresolvable'
      END,
      provider = p_provider,
      matched_name = p_matched_name,
      last_error = p_error,
      attempts = attempts + 1,
      resolved_at = now(),
      updated_at = now()
  WHERE place_key = p_place_key;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_geo_place(text, double precision, double precision, text, text, text, text, text, text, text, text)
  FROM public, anon, authenticated;
