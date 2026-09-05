-- map_foreign_markers(): külföldi programok buborékjai a térképre.
--
-- Külön RPC, nem a meglévő map_markers() bővítése. Az utóbbi a magyar
-- geo_places/megye-hierarchiára épül, zoom-szintenként más aggregációval; ha
-- azt írnám át, minden magyar térképnézet regressziókockázatot kapna egy olyan
-- funkcióért, ami ma nulla magyar felhasználót érint. Így a hazai útvonal
-- bitre változatlan marad, a külföldi réteg pedig egyszerűen hozzáadódik.
--
-- A visszaadott marker-objektum mezőnevei szándékosan azonosak a map_markers()
-- alakjával, hogy a kliens egyetlen tömbbe fűzhesse a kettőt.
CREATE OR REPLACE FUNCTION public.map_foreign_markers(
  p_countries text[] DEFAULT NULL,
  p_category  text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH scoped AS (
    SELECT e.country_code AS cc,
           public.canonical_city(e.location_city, e.country_code) AS city,
           e.category
    FROM public.external_events e
    WHERE e.is_active = true
      AND e.event_date >= current_date
      AND e.import_state = 'active'
      AND e.freshness_state IN ('fresh', 'aging')
      AND e.country_code IS NOT NULL
      AND e.country_code <> 'HU'
      AND (p_countries IS NULL OR array_length(p_countries, 1) IS NULL
           OR e.country_code = ANY (p_countries))
      AND (p_category IS NULL OR btrim(p_category) = '' OR e.category = p_category)
  ), placed AS (
    SELECT s.cc, s.city, c.display_city, c.lat, c.lon, c.precision, count(*) AS events
    FROM scoped s
    JOIN public.city_coordinates c
      ON c.country_code = s.cc AND c.city_norm = public.fold_city_label(s.city)
    WHERE s.city IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5, 6
  )
  SELECT jsonb_build_object(
    'markers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', 'city',
        'key', p.cc || ':' || p.city,
        'label', p.display_city,
        'sublabel', p.cc,
        'events', p.events,
        'lat', p.lat,
        'lon', p.lon,
        'county', NULL,
        'city', p.display_city,
        'district', NULL,
        'country_code', p.cc,
        'precision', p.precision
      ) ORDER BY p.events DESC, p.display_city)
      FROM placed p
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', t.category, 'events', t.events)
                       ORDER BY t.events DESC)
      FROM (SELECT category, count(*) AS events FROM scoped
            WHERE category IS NOT NULL GROUP BY category) t
    ), '[]'::jsonb),
    'placed_total', (SELECT COALESCE(sum(events), 0) FROM placed),
    -- Minden, amit a térkép nem tud megmutatni, szétbontva, hogy a felület
    -- MEG TUDJA MONDANI, MIÉRT — ne csendben tűnjön el: egy országos programnak
    -- definíció szerint nincs városa, egy koordináta nélküli városnál pedig
    -- egyetlen új city_coordinates sor bezárja a rést.
    'nationwide_total', (SELECT count(*) FROM scoped WHERE city IS NULL),
    'uncoordinated_total', (
      SELECT count(*) FROM scoped s
      WHERE s.city IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.city_coordinates c
          WHERE c.country_code = s.cc AND c.city_norm = public.fold_city_label(s.city)
        )
    ),
    'total', (SELECT count(*) FROM scoped)
  );
$function$;

-- Nyilvános felület: a térképes kereső kijelentkezve is működik. A revoke-nak
-- NEVESÍTENIE kell az anon-t — a Supabase alapértelmezett jogosultságai
-- közvetlenül neki adnak EXECUTE-ot a létrehozáskor, ezért a puszta
-- "FROM PUBLIC" nem venne el semmit. Előbb mindent elveszünk, aztán csak azt
-- adjuk vissza, amire tényleg szükség van.
REVOKE ALL ON FUNCTION public.map_foreign_markers(text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_foreign_markers(text[], text) TO anon, authenticated, service_role;
