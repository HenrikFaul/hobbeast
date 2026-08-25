-- Programgyujto dashboard (owner request):
--   * per-source categories, access model, active vs expired imported counts
--   * targeted run support: list_scraper_targets_by_ids (service role, --only flag)
--   * admin_recent_scraper_runs for the manual-run progress indicator

-- Targeted list for manual runs (worker --only src_a,src_b).
CREATE OR REPLACE FUNCTION public.list_scraper_targets_by_ids(p_ids text[])
RETURNS TABLE(
  source_id text, publisher_name text, endpoint_url text, city text,
  categories text[], scrape_priority integer, timezone text,
  scrape_strategy text, scrape_feed_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
         s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url
  FROM public.external_event_feed_sources s
  WHERE COALESCE(auth.role(), '') = 'service_role'
    AND s.endpoint_url IS NOT NULL
    AND s.source_id = ANY(COALESCE(p_ids, '{}'::text[]))
  ORDER BY s.scrape_priority ASC
  LIMIT 100;
$$;

-- Progress feed for the admin manual-run panel.
CREATE OR REPLACE FUNCTION public.admin_recent_scraper_runs(p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT CASE WHEN public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'source_id', r.source_id,
      'publisher_name', s.publisher_name,
      'run_started_at', r.run_started_at,
      'discovered', r.discovered, 'inserted', r.inserted, 'updated', r.updated,
      'duplicates', r.duplicates, 'skipped', r.skipped,
      'status', r.status, 'http_status', r.http_status
    ) ORDER BY r.run_started_at DESC)
    FROM public.scraper_runs r
    JOIN public.external_event_feed_sources s USING (source_id)
    WHERE r.run_started_at >= COALESCE(p_since, now() - interval '2 hours')), '[]'::jsonb)
  ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.admin_recent_scraper_runs(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_scraper_runs(timestamptz) TO authenticated;

-- Dashboard stats v3: categories, access model, active/expired imported counts.
CREATE OR REPLACE FUNCTION public.admin_scraper_stats(p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_days int := GREATEST(1, LEAST(COALESCE(p_days, 14), 90));
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'destinations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_id', s.source_id, 'publisher_name', s.publisher_name,
        'endpoint_url', s.endpoint_url, 'city', s.city,
        'scrape_enabled', s.scrape_enabled, 'scrape_priority', s.scrape_priority,
        'last_run_at', s.scrape_last_run_at, 'last_events', s.scrape_last_event_count,
        'total_events', s.scrape_total_event_count,
        'scrape_strategy', s.scrape_strategy, 'scrape_note', s.scrape_note,
        'categories', s.categories,
        'access', CASE
          WHEN s.attribution_required IS TRUE THEN 'ingyenes (forrasmegjeloles)'
          ELSE 'ingyenes' END,
        'active_events', ev.active_cnt,
        'expired_events', ev.expired_cnt
      ) ORDER BY s.scrape_priority, s.publisher_name), '[]'::jsonb)
      FROM public.external_event_feed_sources s
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE e.event_date >= current_date AND e.is_active) AS active_cnt,
               count(*) FILTER (WHERE e.event_date < current_date) AS expired_cnt
        FROM public.external_events e
        WHERE e.external_source = 'scraper'
          AND e.external_id LIKE s.source_id || ':%'
      ) ev
      WHERE s.scrape_enabled = true
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', d.day, 'runs', d.runs, 'sources', d.sources,
        'discovered', d.discovered, 'inserted', d.inserted,
        'updated', d.updated, 'duplicates', d.duplicates
      ) ORDER BY d.day DESC), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', run_started_at)::date AS day,
               count(*) AS runs, count(DISTINCT source_id) AS sources,
               sum(discovered) AS discovered, sum(inserted) AS inserted,
               sum(updated) AS updated, sum(duplicates) AS duplicates
        FROM public.scraper_runs
        WHERE run_started_at >= current_date - (v_days || ' days')::interval
        GROUP BY 1
      ) d
    ),
    'totals', (
      SELECT jsonb_build_object(
        'total_scraper_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND is_active),
        'active_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND is_active AND event_date >= current_date),
        'expired_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND event_date < current_date),
        'enabled_sources', (SELECT count(*) FROM public.external_event_feed_sources WHERE scrape_enabled),
        'registered_sources', (SELECT count(*) FROM public.external_event_feed_sources),
        'runs_total', (SELECT count(*) FROM public.scraper_runs),
        'inserted_total', (SELECT COALESCE(sum(inserted),0) FROM public.scraper_runs),
        'duplicates_total', (SELECT COALESCE(sum(duplicates),0) FROM public.scraper_runs)
      )
    )
  );
END;
$function$;
