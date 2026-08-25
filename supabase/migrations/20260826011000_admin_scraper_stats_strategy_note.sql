-- Surface the per-source extraction strategy and the recon note on the admin
-- Programgyujto tab (owner request: mark which sites need different scraping).
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
        'scrape_strategy', s.scrape_strategy, 'scrape_note', s.scrape_note
      ) ORDER BY s.scrape_priority, s.publisher_name), '[]'::jsonb)
      FROM public.external_event_feed_sources s
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
