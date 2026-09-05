-- Fix: fold_city_label() ékezetes NAGYBETŰKET nem hajtogatott le.
--
-- A v1.69.0-ban bevezetett változat a translate()-et a lower() ELŐTT futtatta:
--
--   translate(btrim(lower(...)), 'áàâ…', 'aaa…')   <-- helyes
--   lower(translate(btrim(...), 'áàâ…', 'aaa…'))   <-- ez volt, hibás
--
-- A translate() kisbetűs forrás- és célkészletet kap, ezért egy 'Ö' vagy 'Č'
-- érintetlenül ment át rajta, és csak utána lett belőle 'ö' / 'č' — vagyis
-- SOHA nem hajtogatódott le. Következmény: az 'Österreichweit' és a
-- 'celostátní (celá ČR)' alakok nem találták meg az országos aliasukat, és
-- kamu városként jelentek meg a HELYSZÍN listában.
--
-- Miért nem bukott ki korábban: a Warszawa/Warsaw, Praha/Prague és Wien/Vienna
-- összevonás mind olyan névvel kezdődik, aminek az első karaktere ékezet
-- nélküli, így azok a példák jól működtek — ezért hitte a mérés jónak.
--
-- A függvény IMMUTABLE és csak szövegre hat; a rá épülő indexek nem
-- perzisztensek (nincs rajta funkcionális index), ezért a csere biztonságos.
CREATE OR REPLACE FUNCTION public.fold_city_label(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT regexp_replace(
           translate(lower(btrim(coalesce(p_text, ''))),
             'áàâäãåāéèêëěēíìîïīóòôöõőōúùûüűūýÿčďľňŕřšťžźżłńśćęąğıİ',
             'aaaaaaaeeeeeeiiiiiooooooouuuuuuyycdlnrrstzzzlnsceagii'),
           '\s+', ' ', 'g');
$function$;

-- A revoke-nak NEVESÍTENIE kell az anon-t: a Supabase alapértelmezett
-- jogosultságai közvetlenül az anon/authenticated szerepnek adnak EXECUTE-ot a
-- függvény létrehozásakor, ezért a puszta "FROM PUBLIC" no-op lenne.
REVOKE ALL ON FUNCTION public.fold_city_label(text) FROM PUBLIC, anon, authenticated;
