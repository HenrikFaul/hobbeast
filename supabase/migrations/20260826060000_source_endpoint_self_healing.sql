-- Self-healing entry points.
--
-- 97 of the registered sources point at a home page instead of the event
-- calendar, so they scrape nothing. When the worker discovers a working event
-- hub on such a site, it reports the URL here and the registry is corrected
-- permanently. Service-role only, and it never overwrites a source that is
-- already producing.
CREATE OR REPLACE FUNCTION public.record_discovered_endpoint(
  p_source_id text,
  p_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_url IS NULL OR p_url !~* '^https?://' THEN
    RETURN false;
  END IF;

  UPDATE public.external_event_feed_sources
  SET endpoint_url = p_url,
      scrape_note = COALESCE(scrape_note || ' | ', '')
                    || 'Automatikusan javitott belepesi pont: a fooldal helyett az esemenynaptar',
      updated_at = now()
  WHERE source_id = p_source_id
    AND COALESCE(scrape_total_event_count, 0) = 0
    AND endpoint_url IS DISTINCT FROM p_url;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_discovered_endpoint(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_discovered_endpoint(text, text) TO service_role;
