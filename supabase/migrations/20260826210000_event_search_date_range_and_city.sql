-- Date range and city on the event search.
--
-- Both were possible to do in the browser, and both would have been wrong
-- there: the list is paginated, so a client-side filter only ever sees the
-- pages already fetched. Ask for "December 12–14 in Debrecen" and the answer
-- would be whatever happened to be in the first 48 rows — confidently, and
-- silently, incomplete.
--
-- So the bounds move to where the rows are. The parameters are appended with
-- NULL defaults and NULL means exactly the old behaviour, so every existing
-- call keeps returning what it returns today.
--
-- The functions are DROPped first rather than CREATE OR REPLACEd: adding
-- parameters would create a second overload, and a call naming only the
-- original arguments would then match both and fail as ambiguous. One
-- function, one signature.

DROP FUNCTION IF EXISTS public.list_external_events_safe_page(date, integer, integer);

CREATE FUNCTION public.list_external_events_safe_page(
  p_from_date date DEFAULT CURRENT_DATE,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0,
  p_to_date date DEFAULT NULL,
  p_city text DEFAULT NULL
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
      AND (p_to_date IS NULL OR e.event_date <= p_to_date)
      AND (
        p_city IS NULL OR btrim(p_city) = ''
        OR public.unaccent_fallback(lower(coalesce(e.location_city, '')))
           = public.unaccent_fallback(lower(btrim(p_city)))
      )
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

REVOKE ALL ON FUNCTION public.list_external_events_safe_page(date, integer, integer, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_external_events_safe_page(date, integer, integer, date, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.list_discoverable_events_safe_page(date, uuid, integer, integer);

CREATE FUNCTION public.list_discoverable_events_safe_page(
  p_from_date date DEFAULT CURRENT_DATE,
  p_requester_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0,
  p_to_date date DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
  v_ids uuid[];
  v_event_id uuid;
  v_payload jsonb;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean;
BEGIN
  SELECT COALESCE(array_agg(candidate.id ORDER BY candidate.event_date, candidate.event_time NULLS LAST, candidate.id), '{}'::uuid[])
  INTO v_ids
  FROM (
    SELECT e.id, e.event_date, e.event_time
    FROM public.events e
    WHERE e.is_active = true
      AND e.event_date >= COALESCE(p_from_date, current_date)
      AND (p_to_date IS NULL OR e.event_date <= p_to_date)
      AND (
        p_city IS NULL OR btrim(p_city) = ''
        OR public.unaccent_fallback(lower(coalesce(e.location_city, '')))
           = public.unaccent_fallback(lower(btrim(p_city)))
      )
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET v_offset
    LIMIT v_limit + 1
  ) candidate;

  v_has_more := COALESCE(array_length(v_ids, 1), 0) > v_limit;
  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    FOREACH v_event_id IN ARRAY v_ids[1:LEAST(array_length(v_ids, 1), v_limit)]
    LOOP
      v_payload := public.event_safe_payload(v_event_id, p_requester_id);
      IF v_payload IS NOT NULL THEN v_items := v_items || jsonb_build_array(v_payload); END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'offset', v_offset,
    'next_offset', CASE WHEN v_has_more THEN v_offset + v_limit ELSE NULL END,
    'has_more', v_has_more
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_discoverable_events_safe_page(date, uuid, integer, integer, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_discoverable_events_safe_page(date, uuid, integer, integer, date, text) TO anon, authenticated;

-- The cities the catalogue actually has programmes in, so the filter offers
-- real choices instead of a free-text box that mostly returns nothing.
CREATE OR REPLACE FUNCTION public.list_event_cities(p_from_date date DEFAULT CURRENT_DATE, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('city', t.city, 'events', t.events)
                            ORDER BY t.events DESC, t.city), '[]'::jsonb)
  FROM (
    SELECT city, sum(events) AS events
    FROM (
      SELECT e.location_city AS city, count(*) AS events
      FROM public.external_events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
        AND e.import_state = 'active'
        AND e.freshness_state IN ('fresh', 'aging')
        AND e.location_city IS NOT NULL
        AND btrim(e.location_city) <> ''
      GROUP BY e.location_city
      UNION ALL
      SELECT e.location_city, count(*)
      FROM public.events e
      WHERE e.is_active = true
        AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
        AND e.location_city IS NOT NULL
        AND btrim(e.location_city) <> ''
      GROUP BY e.location_city
    ) merged
    GROUP BY city
    ORDER BY sum(events) DESC, city
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 200))
  ) t;
$fn$;

REVOKE ALL ON FUNCTION public.list_event_cities(date, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.list_event_cities(date, integer) TO anon, authenticated;
