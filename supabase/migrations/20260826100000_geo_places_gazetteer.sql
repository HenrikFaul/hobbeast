-- Precise map placement: venue gazetteer + Budapest districts.
--
-- Until now the map could only place a program on its CITY centroid, so every
-- Budapest program (503 of them) piled onto one pin. The scraped data does
-- carry a usable signal, it just is not an address: location_address holds the
-- VENUE NAME ("A38", "Dürer Kert", "Budapest Park", "Budapest - Átrium").
--
-- So placement becomes a ladder, most precise first:
--   1. the event's own coordinates, when a source provides them
--   2. geo_places  — the venue gazetteer, geocoded and name-verified (exact)
--   3. hu_districts — Budapest postal code (1XYZ -> district XY) or "N. kerület"
--   4. hu_settlements — the city centroid, as before
--   5. unplaced, and counted as such in the UI
--
-- geo_places doubles as a work queue: a row with lat IS NULL is a venue nobody
-- has resolved yet. scripts/geocode-places.mjs drains that queue, which is what
-- makes newly added sources place themselves without any code change.

CREATE TABLE IF NOT EXISTS public.geo_places (
  place_key text PRIMARY KEY,               -- hu_fold(trimmed location_address)
  raw_name text NOT NULL,
  city_hint text,
  lat double precision,
  lon double precision,
  city text,
  county text,
  district text,                            -- Budapest roman numeral, e.g. 'VII'
  postcode text,
  geo_precision text NOT NULL DEFAULT 'pending' -- exact | district | city | pending | unresolvable
    CHECK (geo_precision IN ('exact', 'district', 'city', 'pending', 'unresolvable')),
  provider text,                            -- nominatim | photon | manual
  matched_name text,                        -- what the geocoder actually returned
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_places_pending_idx
  ON public.geo_places (created_at) WHERE lat IS NULL;

ALTER TABLE public.geo_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Resolved places are public reference data" ON public.geo_places;
CREATE POLICY "Resolved places are public reference data"
  ON public.geo_places FOR SELECT TO anon, authenticated USING (lat IS NOT NULL);

GRANT SELECT ON public.geo_places TO anon, authenticated;

-- Budapest districts ---------------------------------------------------------
-- Approximate district centroids. They are only ever used as a FALLBACK, when
-- the exact venue is unknown but the district is: a pin a few hundred metres
-- from the district's middle is honest at that zoom level, a city-wide pin is not.

CREATE TABLE IF NOT EXISTS public.hu_districts (
  district text PRIMARY KEY,                -- roman numeral, 'I' .. 'XXIII'
  number smallint NOT NULL UNIQUE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL
);

ALTER TABLE public.hu_districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "District centroids are public reference data" ON public.hu_districts;
CREATE POLICY "District centroids are public reference data"
  ON public.hu_districts FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.hu_districts TO anon, authenticated;

INSERT INTO public.hu_districts (district, number, name, lat, lon) VALUES
  ('I', 1, 'Várkerület', 47.4966, 19.0333),
  ('II', 2, 'II. kerület', 47.5390, 18.9860),
  ('III', 3, 'Óbuda-Békásmegyer', 47.5680, 19.0400),
  ('IV', 4, 'Újpest', 47.5670, 19.0900),
  ('V', 5, 'Belváros-Lipótváros', 47.5000, 19.0520),
  ('VI', 6, 'Terézváros', 47.5070, 19.0640),
  ('VII', 7, 'Erzsébetváros', 47.5010, 19.0730),
  ('VIII', 8, 'Józsefváros', 47.4890, 19.0800),
  ('IX', 9, 'Ferencváros', 47.4700, 19.0870),
  ('X', 10, 'Kőbánya', 47.4770, 19.1500),
  ('XI', 11, 'Újbuda', 47.4600, 19.0300),
  ('XII', 12, 'Hegyvidék', 47.4970, 18.9880),
  ('XIII', 13, 'XIII. kerület', 47.5350, 19.0700),
  ('XIV', 14, 'Zugló', 47.5210, 19.1120),
  ('XV', 15, 'Rákospalota-Pestújhely-Újpalota', 47.5610, 19.1180),
  ('XVI', 16, 'XVI. kerület', 47.5180, 19.2000),
  ('XVII', 17, 'Rákosmente', 47.4800, 19.2500),
  ('XVIII', 18, 'Pestszentlőrinc-Pestszentimre', 47.4350, 19.1800),
  ('XIX', 19, 'Kispest', 47.4500, 19.1400),
  ('XX', 20, 'Pesterzsébet', 47.4340, 19.1200),
  ('XXI', 21, 'Csepel', 47.4200, 19.0700),
  ('XXII', 22, 'Budafok-Tétény', 47.4200, 18.9900),
  ('XXIII', 23, 'Soroksár', 47.4000, 19.1200)
ON CONFLICT (district) DO UPDATE
  SET number = EXCLUDED.number, name = EXCLUDED.name,
      lat = EXCLUDED.lat, lon = EXCLUDED.lon;

-- Text -> district -----------------------------------------------------------
-- Budapest postal codes are 1XYZ where XY is the district number, which makes
-- "1075 Budapest, Király utca" a lossless district signal. "VII. kerület" and
-- "7. kerület" spellings are handled too.

CREATE OR REPLACE FUNCTION public.hu_district_from_text(p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_code text;
  v_district text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN NULL; END IF;

  -- 1XYZ postal code: XY is the district number. A code whose middle pair is
  -- not 01..23 simply finds no district, so bad matches cannot leak through.
  v_code := (regexp_match(p_text, '\m1(\d{2})\d\M'))[1];
  IF v_code IS NOT NULL THEN
    SELECT d.district INTO v_district FROM public.hu_districts d WHERE d.number = v_code::smallint;
    IF v_district IS NOT NULL THEN RETURN v_district; END IF;
  END IF;

  -- "VII. kerület" / "VII. ker." / "7. kerület". Longest roman numeral first so
  -- "XVIII." never degrades into "X".
  SELECT d.district INTO v_district
  FROM public.hu_districts d
  WHERE p_text ~* ('(^|[^a-z])' || d.district || '\.?\s*ker')
     OR p_text ~* ('(^|[^0-9])' || d.number::text || '\.?\s*ker')
  ORDER BY char_length(d.district) DESC
  LIMIT 1;

  RETURN v_district;
END;
$$;

-- Queue API ------------------------------------------------------------------
-- Called by the scraper ingest for every venue string it has never seen, and by
-- the admin panel when a new source is registered. Idempotent by design.

CREATE OR REPLACE FUNCTION public.queue_geo_place(p_name text, p_city text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE v_key text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' OR char_length(btrim(p_name)) > 160 THEN
    RETURN NULL;
  END IF;
  v_key := public.hu_fold(btrim(p_name));
  IF v_key IS NULL OR v_key = '' THEN RETURN NULL; END IF;

  INSERT INTO public.geo_places (place_key, raw_name, city_hint)
  VALUES (v_key, btrim(p_name), NULLIF(btrim(coalesce(p_city, '')), ''))
  ON CONFLICT (place_key) DO UPDATE
    SET city_hint = COALESCE(public.geo_places.city_hint, EXCLUDED.city_hint);

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_geo_place(text, text) FROM public, anon, authenticated;

-- Seed the queue with every venue string the catalogue already contains.
INSERT INTO public.geo_places (place_key, raw_name, city_hint)
SELECT DISTINCT ON (public.hu_fold(btrim(e.location_address)))
       public.hu_fold(btrim(e.location_address)),
       btrim(e.location_address),
       NULLIF(btrim(coalesce(e.location_city, '')), '')
FROM public.external_events e
WHERE e.location_address IS NOT NULL
  AND btrim(e.location_address) <> ''
  AND char_length(btrim(e.location_address)) <= 160
  AND public.hu_fold(btrim(e.location_address)) <> ''
ORDER BY public.hu_fold(btrim(e.location_address)), e.updated_at DESC
ON CONFLICT (place_key) DO NOTHING;
