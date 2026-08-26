-- Keeps the venue gazetteer's queue fed.
--
-- A source added through the admin wizard brings venue strings nobody has ever
-- geocoded. Rather than reach into the ingest RPC, the geocoder tops the queue
-- up itself before draining it, so a new source places itself on the map on the
-- next scheduled geocode run without any code change.

CREATE OR REPLACE FUNCTION public.enqueue_missing_geo_places()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE v_rows integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.geo_places (place_key, raw_name, city_hint)
  SELECT DISTINCT ON (public.hu_fold(btrim(e.location_address)))
         public.hu_fold(btrim(e.location_address)),
         btrim(e.location_address),
         NULLIF(btrim(coalesce(e.location_city, '')), '')
  FROM public.external_events e
  WHERE e.is_active
    AND e.event_date >= current_date
    AND e.location_address IS NOT NULL
    AND btrim(e.location_address) <> ''
    AND char_length(btrim(e.location_address)) <= 160
    AND public.hu_fold(btrim(e.location_address)) <> ''
  ORDER BY public.hu_fold(btrim(e.location_address)), e.updated_at DESC
  ON CONFLICT (place_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_missing_geo_places() FROM public, anon, authenticated;
