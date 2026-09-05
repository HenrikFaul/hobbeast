-- The listing showed "Warszawa 412" and "Warsaw 132" as two different places.
-- They are one city. The cause is not a typo: the Ticketmaster Discovery API is
-- English and writes exonyms (Warsaw, Krakow, Wroclaw, Prague), while every
-- local source writes the endonym (Warszawa, Kraków, Wrocław, Praha). Measured
-- on 2026-09-05, the same split affects Poznan/Poznań, Gdansk/Gdańsk, and the
-- Wiener Staatsoper writes "Vienna, Austria" where everyone else writes "Wien".
--
-- Two more things hid in that column:
--   * Prague DISTRICTS are written as separate cities -- Praha 1..10 scatter a
--     further 250 events away from "Praha".
--   * Some rows carry an ADDRESS ("Ke Sklárně 3213/15, Praha") or a NATIONWIDE
--     marker ("Országos", "Polska", "Vsa Slovenija", "celostátní (celá ČR)")
--     where a city belongs.
--
-- This is a display and grouping layer on purpose: location_city is NOT
-- rewritten. A wrong alias therefore mislabels a chip, it never damages data,
-- and adding a newly-observed duplicate is one INSERT rather than a code change.

CREATE TABLE IF NOT EXISTS public.city_aliases (
  country_code   text NOT NULL,
  alias_norm     text NOT NULL,
  canonical_city text,
  is_nationwide  boolean NOT NULL DEFAULT false,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, alias_norm),
  CONSTRAINT city_aliases_shape CHECK (is_nationwide OR canonical_city IS NOT NULL)
);

COMMENT ON TABLE public.city_aliases IS
  'Maps an observed location_city spelling to one canonical city per country, or marks it as a nationwide (not-a-city) label. Lookup key is the accent-folded lowercase form.';

ALTER TABLE public.city_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_aliases_readable ON public.city_aliases;
CREATE POLICY city_aliases_readable ON public.city_aliases FOR SELECT USING (true);

-- Accent fold without the unaccent extension, which this project does not rely
-- on (see the organization_slug_without_unaccent migration).
CREATE OR REPLACE FUNCTION public.fold_city_label(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT regexp_replace(
           lower(translate(btrim(coalesce(p_text, '')),
             'áàâäãåāéèêëěēíìîïīóòôöõőōúùûüűūýÿčďľňŕřšťžźżłńśćęąğıİ',
             'aaaaaaaeeeeeeiiiiiooooooouuuuuuyycdlnrrstzzzlnsceagiI')),
           '\s+', ' ', 'g');
$function$;

-- Seeded from what is actually in the table on 2026-09-05, not from a guess at
-- what might appear. Every row below was observed.
INSERT INTO public.city_aliases (country_code, alias_norm, canonical_city, is_nationwide, note) VALUES
  ('PL', 'warsaw',            'Warszawa', false, 'Ticketmaster writes the English exonym; 132 events'),
  ('PL', 'krakow',            'Kraków',   false, 'Ticketmaster writes the unaccented form; 80 events'),
  ('PL', 'wroclaw',           'Wrocław',  false, 'Ticketmaster writes the unaccented form; 29 events'),
  ('PL', 'poznan',            'Poznań',   false, 'unaccented spelling; 10 events'),
  ('PL', 'gdansk',            'Gdańsk',   false, 'unaccented spelling; 7 events'),
  ('CZ', 'prague',            'Praha',    false, 'English exonym'),
  ('AT', 'vienna',            'Wien',     false, 'English exonym'),
  ('AT', 'vienna, austria',   'Wien',     false, 'Wiener Staatsoper appends the country; 52 events'),
  ('CZ', 'praha 1',  'Praha', false, 'district'), ('CZ', 'praha 2',  'Praha', false, 'district'),
  ('CZ', 'praha 3',  'Praha', false, 'district'), ('CZ', 'praha 4',  'Praha', false, 'district'),
  ('CZ', 'praha 5',  'Praha', false, 'district'), ('CZ', 'praha 6',  'Praha', false, 'district'),
  ('CZ', 'praha 7',  'Praha', false, 'district'), ('CZ', 'praha 8',  'Praha', false, 'district'),
  ('CZ', 'praha 9',  'Praha', false, 'district'), ('CZ', 'praha 10', 'Praha', false, 'district'),
  ('CZ', 'ke sklarne 3213/15, praha', 'Praha', false, 'a street address landed in the city field'),
  ('HU', 'orszagos',                'Országos',       true, 'nationwide'),
  ('PL', 'polska',                  'Polska',         true, 'nationwide'),
  ('PL', 'cala polska',             'Polska',         true, 'nationwide'),
  ('SI', 'slovenija',               'Slovenija',      true, 'nationwide'),
  ('SI', 'vsa slovenija',           'Slovenija',      true, 'nationwide'),
  ('SK', 'celoslovensky',           'Celoslovensky',  true, 'nationwide'),
  ('CZ', 'celostatni (cela cr)',    'Česko',          true, 'nationwide'),
  ('CZ', 'cesko',                   'Česko',          true, 'nationwide'),
  ('AT', 'osterreichweit',          'Österreich',     true, 'nationwide'),
  ('DE', 'deutschland',             'Deutschland',    true, 'nationwide')
ON CONFLICT (country_code, alias_norm) DO NOTHING;

/**
 * The canonical city label for a raw location_city, or NULL when the label is
 * not a city at all (a nationwide marker).
 *
 * Order matters: the alias table is consulted on the WHOLE string first, so a
 * seeded entry like "vienna, austria" wins before any structural rule gets a
 * chance to mangle it.
 */
CREATE OR REPLACE FUNCTION public.canonical_city(p_city text, p_country text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_raw  text := btrim(coalesce(p_city, ''));
  v_norm text;
  v_cc   text := upper(btrim(coalesce(p_country, '')));
  v_hit  public.city_aliases%ROWTYPE;
  v_tail text;
BEGIN
  IF v_raw = '' THEN RETURN NULL; END IF;
  v_norm := public.fold_city_label(v_raw);

  SELECT * INTO v_hit FROM public.city_aliases
  WHERE country_code = v_cc AND alias_norm = v_norm;
  IF FOUND THEN
    RETURN CASE WHEN v_hit.is_nationwide THEN NULL ELSE v_hit.canonical_city END;
  END IF;

  -- "<something>, <city>" -- an address that ended up here. Try the last segment.
  IF position(',' IN v_raw) > 0 THEN
    v_tail := btrim(split_part(v_raw, ',', array_length(string_to_array(v_raw, ','), 1)));
    IF v_tail <> '' AND public.fold_city_label(v_tail) <> v_norm THEN
      SELECT * INTO v_hit FROM public.city_aliases
      WHERE country_code = v_cc AND alias_norm = public.fold_city_label(v_tail);
      IF FOUND THEN
        RETURN CASE WHEN v_hit.is_nationwide THEN NULL ELSE v_hit.canonical_city END;
      END IF;
    END IF;
  END IF;

  -- "<city> <n>" district form, but ONLY when the stem is itself a known city
  -- for this country. Without that guard this would happily turn "Telč 2" into
  -- "Telč" and also "Route 66" into "Route".
  v_tail := (regexp_match(v_raw, '^(.+?)\s+\d{1,2}\.?$'))[1];
  IF v_tail IS NOT NULL THEN
    SELECT * INTO v_hit FROM public.city_aliases
    WHERE country_code = v_cc AND alias_norm = public.fold_city_label(v_tail);
    IF FOUND AND NOT v_hit.is_nationwide THEN
      RETURN v_hit.canonical_city;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.city_aliases
      WHERE country_code = v_cc AND canonical_city IS NOT NULL
        AND public.fold_city_label(canonical_city) = public.fold_city_label(v_tail)
    ) THEN
      RETURN v_tail;
    END IF;
  END IF;

  RETURN v_raw;
END;
$function$;

REVOKE ALL ON FUNCTION public.fold_city_label(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fold_city_label(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.canonical_city(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_city(text, text) TO anon, authenticated, service_role;
