-- Two things that were quietly wrong about the collector registry.
--
-- 1. 276 of 361 sources were stored without a scheme ("durerkert.com/events").
--    The worker copes, but event_feed_url_host() returns NULL for them, so
--    fetch_hosts stayed empty; and admin_upsert_scraper_source derives the
--    source_id FROM the URL, so re-saving one from the wizard with a proper
--    https:// address would have created a SECOND row for the same site
--    instead of updating it.
--
-- 2. The wizard could not save at all. source-manager verified the caller's
--    providers.manage capability and then called the RPC as the SERVICE ROLE,
--    where auth.uid() is NULL - so the RPC own capability check refused every
--    save with CAPABILITY_REQUIRED. Fixed on the edge side by calling as the
--    user, which keeps the database the authority.
--
-- Applied via the Supabase MCP; this file is the record.
UPDATE public.external_event_feed_sources
SET endpoint_url = 'https://' || btrim(endpoint_url), updated_at = now()
WHERE endpoint_url !~ '^https?://' AND btrim(endpoint_url) ~ '^[a-z0-9]';

UPDATE public.external_event_feed_sources
SET homepage_url = 'https://' || btrim(homepage_url), updated_at = now()
WHERE homepage_url IS NOT NULL AND homepage_url !~ '^https?://'
  AND btrim(homepage_url) ~ '^[a-z0-9]';

UPDATE public.external_event_feed_sources
SET fetch_hosts = ARRAY[public.event_feed_url_host(endpoint_url)], updated_at = now()
WHERE (fetch_hosts IS NULL OR array_length(fetch_hosts, 1) IS NULL)
  AND public.event_feed_url_host(endpoint_url) IS NOT NULL;

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_endpoint_scheme;
ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_endpoint_scheme
  CHECK (endpoint_url IS NULL OR endpoint_url ~ '^https?://');
