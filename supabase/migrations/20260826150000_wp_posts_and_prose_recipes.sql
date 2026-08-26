-- Two recipes for the sites that looked empty.
--
-- funzine.hu is a magazine, not a calendar: its REST namespaces contain no
-- events plugin, and the programs live inside article bodies as dated h2/h3
-- sections of a listicle. 'wp-posts' mines those through wp/v2/posts and turns
-- one article into forty programs.
--
-- sportagvalaszto.hu/nagy-sportagvalaszto/ is one recurring event's own landing
-- page, its date written in prose. 'page-prose' reports that one event instead
-- of reporting nothing.

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_scrape_strategy_check;

ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_scrape_strategy_check
  CHECK (scrape_strategy = ANY (ARRAY[
    'render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld',
    'wp-posts', 'page-prose'
  ]));

-- admin_upsert_scraper_source() repeats the list in its own guard; the body is
-- otherwise unchanged from migration 20260826120000.
CREATE OR REPLACE FUNCTION public.admin_upsert_scraper_source(
  p_endpoint_url text,
  p_publisher_name text,
  p_strategy text DEFAULT 'render',
  p_homepage_url text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_categories text[] DEFAULT '{}',
  p_scrape_enabled boolean DEFAULT true,
  p_note text DEFAULT NULL,
  p_source_id text DEFAULT NULL
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
    'render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld', 'wp-posts', 'page-prose'
  ) THEN
    RAISE EXCEPTION 'INVALID_STRATEGY' USING ERRCODE = '22023';
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
    scrape_priority, scrape_note, timezone
  ) VALUES (
    v_source_id, btrim(p_publisher_name), 'venue',
    COALESCE(p_homepage_url, 'https://' || v_host), btrim(p_endpoint_url),
    btrim(p_endpoint_url), NULLIF(btrim(coalesce(p_city, '')), ''), 'HU',
    COALESCE(p_categories, '{}'), ARRAY[v_host],
    'approved', 'pending', COALESCE(p_scrape_enabled, true), p_strategy,
    150, p_note, 'Europe/Budapest'
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
    scrape_note = COALESCE(EXCLUDED.scrape_note, s.scrape_note),
    updated_at = now();

  RETURN v_source_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text) TO authenticated;
