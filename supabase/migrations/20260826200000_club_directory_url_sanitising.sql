-- A directory writes links inconsistently. One bare host
-- ("www.facebook.com/Cowbells") aborted a whole 200-club batch on the URL
-- check constraint. The constraint is right; the ingest has to hand it clean
-- data, so it now drops anything that is not already an absolute http(s) URL
-- rather than letting one row take the batch down.
--
-- The harvester normalises too (scripts/harvest-sport-clubs.mjs), so a bare
-- host becomes a usable link there instead of being thrown away. This is the
-- second line of defence, for any other caller.
CREATE OR REPLACE FUNCTION public.club_directory_url(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT CASE
    WHEN btrim(coalesce(p_value, '')) ~ '^https?://[^[:space:]]+$'
      THEN btrim(p_value)
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.ingest_directory_clubs(p_clubs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_item jsonb;
  v_slug text;
  v_suffix integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_clubs, '[]'::jsonb)) LOOP
    v_name := btrim(coalesce(v_item->>'name', ''));
    CONTINUE WHEN char_length(v_name) < 2 OR char_length(v_name) > 160;

    -- Already known by name+city? Fill gaps, never overwrite curated text.
    UPDATE public.clubs SET
      sport = COALESCE(sport, NULLIF(btrim(coalesce(v_item->>'sport', '')), '')),
      postal_code = COALESCE(postal_code, NULLIF(btrim(coalesce(v_item->>'postal_code', '')), '')),
      website_url = COALESCE(website_url, public.club_directory_url(v_item->>'website_url')),
      facebook_url = COALESCE(facebook_url, public.club_directory_url(v_item->>'facebook_url')),
      source_url = COALESCE(source_url, NULLIF(btrim(coalesce(v_item->>'source_url', '')), '')),
      updated_at = now()
    WHERE public.unaccent_fallback(lower(name)) = public.unaccent_fallback(lower(v_name))
      AND COALESCE(public.unaccent_fallback(lower(city)), '')
          = COALESCE(public.unaccent_fallback(lower(NULLIF(btrim(coalesce(v_item->>'city', '')), ''))), '');

    IF FOUND THEN
      v_updated := v_updated + 1;
      CONTINUE;
    END IF;

    v_slug := public.club_slug(v_name, v_item->>'city');
    IF v_slug IS NULL OR v_slug = '' OR char_length(v_slug) < 2 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = v_slug) LOOP
      v_suffix := v_suffix + 1;
      v_slug := left(public.club_slug(v_name, v_item->>'city'), 90) || '-' || v_suffix::text;
    END LOOP;

    INSERT INTO public.clubs (
      slug, name, club_type, sport, city, postal_code,
      website_url, facebook_url, source, source_url, review_state, is_active
    ) VALUES (
      v_slug, v_name, COALESCE(NULLIF(v_item->>'club_type', ''), 'sport_club'),
      NULLIF(btrim(coalesce(v_item->>'sport', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'city', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'postal_code', '')), ''),
      public.club_directory_url(v_item->>'website_url'),
      public.club_directory_url(v_item->>'facebook_url'),
      'directory', NULLIF(btrim(coalesce(v_item->>'source_url', '')), ''),
      -- A directory entry is a fact about the world, not a claim by the club.
      -- It goes live because the source is a public federation listing, but it
      -- stays unclaimed until somebody from the club takes it over.
      'approved', true
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ingest_directory_clubs(jsonb) FROM public, anon, authenticated;
