-- Multi-strategy scraping: each source carries the extraction strategy the
-- 2026-08-25 source audit determined for it.
--   render (default) - Playwright listing render -> detail JSON-LD/microdata
--   rss              - RSS/Atom feed items -> detail enrich (scrape_feed_url)
--   tribe            - WordPress "The Events Calendar" REST API (JSON)
-- list_scraper_targets returns the strategy + feed URL for the worker.

ALTER TABLE public.external_event_feed_sources
  ADD COLUMN IF NOT EXISTS scrape_strategy text NOT NULL DEFAULT 'render'
    CHECK (scrape_strategy IN ('render', 'rss', 'tribe')),
  ADD COLUMN IF NOT EXISTS scrape_feed_url text;

DROP FUNCTION IF EXISTS public.list_scraper_targets(integer);
CREATE FUNCTION public.list_scraper_targets(p_limit integer DEFAULT 25)
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
  SELECT t.source_id, t.publisher_name, t.endpoint_url, t.city, t.categories,
         t.scrape_priority, t.timezone, t.scrape_strategy, t.scrape_feed_url
  FROM (
    SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
           s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url,
           s.scrape_last_run_at
    FROM public.external_event_feed_sources s
    WHERE s.scrape_enabled = true
      AND s.endpoint_url IS NOT NULL
      AND COALESCE(auth.role(), '') = 'service_role'
    ORDER BY s.scrape_last_run_at ASC NULLS FIRST, s.scrape_priority ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  ) t
  ORDER BY t.scrape_priority ASC, t.scrape_last_run_at ASC NULLS FIRST;
$$;
