-- Rotation fix: selection must be least-recently-scraped (never-run first) so all
-- 354 sources actually rotate through; scrape_priority only orders WITHIN the
-- selected batch (masters still run first for first-wins dedup). The previous
-- ORDER BY priority-first meant the ~37 low-priority-number sources were picked
-- every run and the 300+ venue sources were never reached.

CREATE OR REPLACE FUNCTION public.list_scraper_targets(p_limit integer DEFAULT 25)
RETURNS TABLE(source_id text, publisher_name text, endpoint_url text, city text, categories text[], scrape_priority integer, timezone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT t.source_id, t.publisher_name, t.endpoint_url, t.city, t.categories,
         t.scrape_priority, t.timezone
  FROM (
    SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
           s.scrape_priority, s.timezone, s.scrape_last_run_at
    FROM public.external_event_feed_sources s
    WHERE s.scrape_enabled = true
      AND s.endpoint_url IS NOT NULL
      AND COALESCE(auth.role(), '') = 'service_role'
    ORDER BY s.scrape_last_run_at ASC NULLS FIRST, s.scrape_priority ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  ) t
  ORDER BY t.scrape_priority ASC, t.scrape_last_run_at ASC NULLS FIRST;
$$;
