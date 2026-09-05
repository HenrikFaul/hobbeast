-- Hand the scraper worker each target's country_code.
--
-- v1.56.0 put fourteen AT/CZ/PL/SI/SK sources live, and twelve of them collected
-- nothing. The cause was not the sites: the generic extractor's event-link
-- vocabulary, month names and navigation words are Hungarian, so /akce/,
-- /udalost/, /repertuar/ and "6. září 2026" were invisible to it. The worker
-- now carries a per-country vocabulary, but it can only pick one if it knows
-- which country the source is in — and neither target RPC returned that column.
--
-- Additive in the strict sense: one column is APPENDED to each RETURNS TABLE.
-- The row set, the filters, the ordering, the limits, the security model and
-- every pre-existing column keep their exact definitions, so a caller that
-- ignores country_code cannot observe this change. RETURNS TABLE signatures
-- cannot be widened in place, hence the DROP/CREATE pair.

DROP FUNCTION IF EXISTS public.list_scraper_targets(integer);
CREATE FUNCTION public.list_scraper_targets(p_limit integer DEFAULT 25)
RETURNS TABLE(
  source_id text, publisher_name text, endpoint_url text, city text,
  categories text[], scrape_priority integer, timezone text,
  scrape_strategy text, scrape_feed_url text, scrape_rule jsonb,
  country_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT t.source_id, t.publisher_name, t.endpoint_url, t.city, t.categories,
         t.scrape_priority, t.timezone, t.scrape_strategy, t.scrape_feed_url,
         t.scrape_rule, t.country_code
  FROM (
    SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
           s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url,
           s.scrape_rule, s.country_code, s.scrape_last_run_at
    FROM public.external_event_feed_sources s
    WHERE s.scrape_enabled = true
      AND s.endpoint_url IS NOT NULL
      AND COALESCE(auth.role(), '') = 'service_role'
    ORDER BY s.scrape_last_run_at ASC NULLS FIRST, s.scrape_priority ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  ) t
  ORDER BY t.scrape_priority ASC, t.scrape_last_run_at ASC NULLS FIRST;
$fn$;

REVOKE ALL ON FUNCTION public.list_scraper_targets(integer) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS public.list_scraper_targets_by_ids(text[]);
CREATE FUNCTION public.list_scraper_targets_by_ids(p_ids text[])
RETURNS TABLE(
  source_id text, publisher_name text, endpoint_url text, city text,
  categories text[], scrape_priority integer, timezone text,
  scrape_strategy text, scrape_feed_url text, scrape_rule jsonb,
  country_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
         s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url,
         s.scrape_rule, s.country_code
  FROM public.external_event_feed_sources s
  WHERE COALESCE(auth.role(), '') = 'service_role'
    AND s.endpoint_url IS NOT NULL
    AND s.source_id = ANY(COALESCE(p_ids, '{}'::text[]))
  ORDER BY s.scrape_priority ASC
  LIMIT 100;
$fn$;

REVOKE ALL ON FUNCTION public.list_scraper_targets_by_ids(text[]) FROM public, anon, authenticated;
