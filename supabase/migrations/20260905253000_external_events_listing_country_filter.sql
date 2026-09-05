-- The listing gains a country filter, and its city filter learns the aliases.
--
-- Dropping the old five-argument signature instead of leaving it beside the new
-- one is deliberate: PostgREST resolves by argument NAMES, and two overloads
-- that can both accept {p_from_date,p_limit,p_offset,p_to_date,p_city} are
-- ambiguous — an error that would only appear at runtime. The added parameter
-- defaults to NULL, so every existing caller behaves exactly as before.
--
-- The city predicate is now a UNION of the old exact match and a canonical
-- match, never a replacement: filtering on "Warszawa" additionally returns the
-- rows Ticketmaster filed under "Warsaw" (verified live: 10 such rows come back
-- where none did before), and nothing that matched before stops matching.
--
-- Two fields are added to each item so the client can group and label without a
-- second round trip: country_code, and location_city_canonical.

DROP FUNCTION IF EXISTS public.list_external_events_safe_page(date, integer, integer, date, text);

CREATE OR REPLACE FUNCTION public.list_external_events_safe_page(
  p_from_date date DEFAULT CURRENT_DATE,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0,
  p_to_date date DEFAULT NULL::date,
  p_city text DEFAULT NULL::text,
  p_countries text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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
        p_countries IS NULL OR array_length(p_countries, 1) IS NULL
        OR e.country_code = ANY (p_countries)
      )
      AND (
        p_city IS NULL OR btrim(p_city) = ''
        OR public.unaccent_fallback(lower(coalesce(e.location_city, '')))
           = public.unaccent_fallback(lower(btrim(p_city)))
        OR public.fold_city_label(coalesce(public.canonical_city(e.location_city, e.country_code), ''))
           = public.fold_city_label(btrim(p_city))
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
      'location_city_canonical', public.canonical_city(p.location_city, p.country_code),
      'country_code', p.country_code,
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
$function$;

REVOKE ALL ON FUNCTION public.list_external_events_safe_page(date, integer, integer, date, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_external_events_safe_page(date, integer, integer, date, text, text[])
  TO anon, authenticated, service_role;
