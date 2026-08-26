-- A rule instead of a script.
--
-- For sites with no structured data the collector is taught by a DECLARATIVE
-- RULE: which element repeats, and which selector inside it holds the title,
-- the date and the link. The rule is data — readable, versionable, correctable
-- by hand, and safe to accept from a language model, because nothing it says is
-- ever executed. A generated scraper script that the server runs would be
-- remote code execution by design; this is not.
--
-- The interpreter lives in scraper-worker/src/sources/recipes.mjs and runs in
-- both the admin preview and the production worker, so a rule that tests green
-- extracts the same programs when it runs for real.

ALTER TABLE public.external_event_feed_sources
  ADD COLUMN IF NOT EXISTS scrape_rule jsonb;

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_scrape_rule_shape;

ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_scrape_rule_shape CHECK (
    scrape_rule IS NULL
    OR (
      jsonb_typeof(scrape_rule) = 'object'
      AND jsonb_typeof(scrape_rule -> 'container') = 'string'
      AND jsonb_typeof(scrape_rule -> 'fields') = 'object'
      AND pg_column_size(scrape_rule) <= 8192
    )
  );

-- A 'selector' source without a rule would collect nothing for ever.
ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_selector_needs_rule;

ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_selector_needs_rule CHECK (
    scrape_strategy <> 'selector' OR scrape_rule IS NOT NULL
  );

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_scrape_strategy_check;

ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_scrape_strategy_check
  CHECK (scrape_strategy = ANY (ARRAY[
    'render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld',
    'wp-posts', 'page-prose', 'selector'
  ]));

-- The worker needs the rule alongside the other target fields.
DROP FUNCTION IF EXISTS public.list_scraper_targets(integer);
CREATE FUNCTION public.list_scraper_targets(p_limit integer DEFAULT 25)
RETURNS TABLE(
  source_id text, publisher_name text, endpoint_url text, city text,
  categories text[], scrape_priority integer, timezone text,
  scrape_strategy text, scrape_feed_url text, scrape_rule jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT t.source_id, t.publisher_name, t.endpoint_url, t.city, t.categories,
         t.scrape_priority, t.timezone, t.scrape_strategy, t.scrape_feed_url, t.scrape_rule
  FROM (
    SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
           s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url,
           s.scrape_rule, s.scrape_last_run_at
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
  scrape_strategy text, scrape_feed_url text, scrape_rule jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
         s.scrape_priority, s.timezone, s.scrape_strategy, s.scrape_feed_url, s.scrape_rule
  FROM public.external_event_feed_sources s
  WHERE COALESCE(auth.role(), '') = 'service_role'
    AND s.endpoint_url IS NOT NULL
    AND s.source_id = ANY(COALESCE(p_ids, '{}'::text[]))
  ORDER BY s.scrape_priority ASC
  LIMIT 100;
$fn$;

REVOKE ALL ON FUNCTION public.list_scraper_targets_by_ids(text[]) FROM public, anon, authenticated;

-- Admin write path carries the rule.
CREATE OR REPLACE FUNCTION public.admin_upsert_scraper_source(
  p_endpoint_url text,
  p_publisher_name text,
  p_strategy text DEFAULT 'render',
  p_homepage_url text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_categories text[] DEFAULT '{}',
  p_scrape_enabled boolean DEFAULT true,
  p_note text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_rule jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_source_id text;
  v_host text;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_endpoint_url IS NULL OR p_endpoint_url !~ '^https?://' THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_URL' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_publisher_name, ''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_PUBLISHER_NAME' USING ERRCODE = '22023';
  END IF;
  IF p_strategy IS NULL OR p_strategy NOT IN (
    'render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld',
    'wp-posts', 'page-prose', 'selector'
  ) THEN
    RAISE EXCEPTION 'INVALID_STRATEGY' USING ERRCODE = '22023';
  END IF;
  IF p_strategy = 'selector' AND p_rule IS NULL THEN
    RAISE EXCEPTION 'RULE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_host := public.event_feed_url_host(p_endpoint_url);
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_HOST' USING ERRCODE = '22023';
  END IF;

  v_source_id := COALESCE(NULLIF(btrim(coalesce(p_source_id, '')), ''),
                          'src_' || substr(md5(lower(btrim(p_endpoint_url))), 1, 8));

  INSERT INTO public.external_event_feed_sources AS s (
    source_id, publisher_name, publisher_type, homepage_url, endpoint_url,
    original_endpoint_url, city, country_code, categories, fetch_hosts,
    review_state, legal_review_status, scrape_enabled, scrape_strategy,
    scrape_priority, scrape_note, timezone, scrape_rule
  ) VALUES (
    v_source_id, btrim(p_publisher_name), 'venue',
    COALESCE(p_homepage_url, 'https://' || v_host), btrim(p_endpoint_url),
    btrim(p_endpoint_url), NULLIF(btrim(coalesce(p_city, '')), ''), 'HU',
    COALESCE(p_categories, '{}'), ARRAY[v_host],
    'approved', 'pending', COALESCE(p_scrape_enabled, true), p_strategy,
    150, p_note, 'Europe/Budapest', p_rule
  )
  ON CONFLICT (source_id) DO UPDATE SET
    publisher_name = EXCLUDED.publisher_name,
    homepage_url = COALESCE(EXCLUDED.homepage_url, s.homepage_url),
    endpoint_url = EXCLUDED.endpoint_url,
    city = COALESCE(EXCLUDED.city, s.city),
    categories = EXCLUDED.categories,
    fetch_hosts = EXCLUDED.fetch_hosts,
    scrape_enabled = EXCLUDED.scrape_enabled,
    scrape_strategy = EXCLUDED.scrape_strategy,
    scrape_rule = COALESCE(EXCLUDED.scrape_rule, s.scrape_rule),
    scrape_note = COALESCE(EXCLUDED.scrape_note, s.scrape_note),
    updated_at = now();

  RETURN v_source_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text);
