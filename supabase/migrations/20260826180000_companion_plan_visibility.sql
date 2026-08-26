-- Companion plans have to be visible where people browse, not only on the
-- program's own page — otherwise nobody discovers that a joint visit already
-- exists and a second person starts a parallel one.
--
-- Both listings therefore carry a count. It is a scalar lookup on a tiny,
-- indexed table over at most a page of rows; the placements materialized view
-- is deliberately left alone, because a plan created now must show up now, not
-- after the next refresh.

CREATE OR REPLACE FUNCTION public.map_events_list(
  p_county text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_district text DEFAULT NULL::text,
  p_place_key text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
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
      'lon', p.lon,
      'companion_count', COALESCE((
        SELECT count(*)
        FROM public.external_event_companion_plans c
        JOIN public.external_event_companion_members m
          ON m.plan_id = c.id AND m.status = 'joined'
        JOIN public.profiles pr
          ON pr.user_id = m.user_id AND pr.is_active = true
        WHERE c.external_event_id = p.id AND c.status = 'open'
      ), 0)
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
$fn$;

CREATE OR REPLACE FUNCTION public.list_external_events_safe_page(
  p_from_date date DEFAULT CURRENT_DATE,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100) AS page_limit,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS page_offset
  ), candidates AS (
    SELECT e.*
    FROM public.external_events e, bounds b
    WHERE e.is_active = true
      AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
      AND e.import_state = 'active'
      AND e.freshness_state IN ('fresh', 'aging')
      AND e.external_url ~ '^https://[^[:space:]]+$'
      AND (
        e.external_source <> 'feed'
        OR EXISTS (
          SELECT 1
          FROM public.external_event_feed_sources s
          WHERE s.source_id = e.source_payload ->> 'feed_source_id'
            AND s.enabled = true
            AND s.review_state = 'approved'
            AND s.legal_review_status = 'approved'
            AND s.robots_allowed IS TRUE
            AND public.event_feed_url_host(s.endpoint_url) = ANY(s.fetch_hosts)
            AND e.last_verified_at IS NOT NULL
            AND e.last_verified_at >= now() - GREATEST(
              interval '72 hours',
              make_interval(mins => 2 * s.poll_interval_minutes)
            )
        )
      )
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET (SELECT page_offset FROM bounds)
    LIMIT (SELECT page_limit + 1 FROM bounds)
  ), numbered AS (
    SELECT c.*, row_number() OVER (
      ORDER BY c.event_date, c.event_time NULLS LAST, c.id
    ) AS row_number
    FROM candidates c
  ), page AS (
    SELECT n.* FROM numbered n, bounds b WHERE n.row_number <= b.page_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'external_source', p.external_source,
      'external_id', p.external_id,
      'external_url', p.external_url,
      'title', p.title,
      'category', p.category,
      'subcategory', p.subcategory,
      'tags', p.tags,
      'description', p.description,
      'event_date', p.event_date,
      'event_time', p.event_time,
      'location_type', p.location_type,
      'location_city', p.location_city,
      'location_address', p.location_address,
      'location_free_text', p.location_free_text,
      'location_lat', p.location_lat,
      'location_lon', p.location_lon,
      'max_attendees', p.max_attendees,
      'image_url', p.image_url,
      'source_last_synced_at', p.source_last_synced_at,
      'first_seen_at', p.first_seen_at,
      'last_verified_at', p.last_verified_at,
      'freshness_state', p.freshness_state,
      'normalization_version', p.normalization_version,
      'dedupe_confidence', p.dedupe_confidence,
      'canonical_fingerprint', p.canonical_fingerprint,
      'import_state', p.import_state,
      'companion_count', COALESCE((
        SELECT count(*)
        FROM public.external_event_companion_plans c
        JOIN public.external_event_companion_members m
          ON m.plan_id = c.id AND m.status = 'joined'
        JOIN public.profiles pr
          ON pr.user_id = m.user_id AND pr.is_active = true
        WHERE c.external_event_id = p.id AND c.status = 'open'
      ), 0)
    ) ORDER BY p.event_date, p.event_time NULLS LAST, p.id), '[]'::jsonb),
    'offset', (SELECT page_offset FROM bounds),
    'next_offset', CASE
      WHEN (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
      THEN (SELECT page_offset + page_limit FROM bounds)
      ELSE NULL
    END,
    'has_more', (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
  )
  FROM page p;
$fn$;
