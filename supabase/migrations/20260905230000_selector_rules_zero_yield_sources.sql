-- Selector rules for the four foreign sources that still collected nothing.
--
-- After the locale work in v1.57–v1.60 these four were the only enabled foreign
-- sources still at zero, and each for a different reason that no amount of
-- extra heuristics would fix — the information simply is not where the generic
-- extractor looks. A selector rule is DATA, not code: the `selector` strategy
-- already existed, so this is four rows and one enabling change.
--
-- Every rule was written from the live DOM and then measured with the real
-- selector strategy. The counts below are future-dated events — what the
-- ingest actually keeps, not what was extracted.
--
--   Magiczny Kraków      20   was 0
--   Innsbruck Tourismus  12   was 0
--   Filharmonia Narodowa 11   was 0
--   Cankarjev dom         1   was 0
--
-- THE ENABLING CHANGE (scraper-worker/src/sources/recipeRunner.mjs): the
-- selector strategy parsed its date field with parseHuTextDate, which cannot
-- read "5.09" or "7. - 10. sep.". It now uses a locale parser chosen from the
-- source's country_code, falling back to the Hungarian one — so a Hungarian
-- rule behaves exactly as before, and localeFor() returns null for HU anyway.
--
-- Why the new parser may read shapes the free-text one refuses: a rule NAMES
-- the element holding the date, so "5.09" arriving there is a date. The same
-- pattern loose in page prose would also match prices and scores, which is why
-- parseLocaleTextDate still refuses it.
--
-- Ranges always yield their START, and a year stated anywhere in the range
-- beats inference — without that, "30. jun. - 13. sep. 2026" reads as a past
-- June and rolls forward into 2027, a whole year wrong.

UPDATE public.external_event_feed_sources SET
  scrape_strategy = 'selector',
  scrape_rule = '{"version":1,"container":".events__list__item","limit":200,"dateFormat":"iso","fields":{"title":{"selector":"h3.text__title"},"date":{"selector":"a.item__link","attr":"href"},"url":{"selector":"a.item__link","attr":"href"},"description":{"selector":"p.text__description"}}}'::jsonb,
  scrape_note = 'Szelektoros recept 2026-09-05. A kartya p.text__date mezoje ISO TARTOMANYT tartalmaz ("2026-04-17 - 2026-12-18"), es a hosszu futasu tetelek mult kezdodatuma miatt 20-bol 19 kiesett volna a jovobeli-datum kapun. A href viszont tartalmazza azt a NAPOT, amelyre a lista szol (/kalendarium/1919,object,1,2558996,2026-09-05,...), ezert a datum onnan jon: ez a "ma mi van musoron" helyes olvasata egy napi kalendariumnal. Merve: 20 jovobeli esemeny.',
  updated_at = now()
WHERE publisher_name LIKE 'Magiczny Kraków%';

UPDATE public.external_event_feed_sources SET
  scrape_strategy = 'selector',
  scrape_rule = '{"version":1,"container":".event-list-row","limit":200,"fields":{"title":{"selector":".event-title"},"date":{"selector":".event-date"},"time":{"selector":"span.time"},"location":{"selector":".event-venue"},"url":{"selector":"a.event-link","attr":"href"}}}'::jsonb,
  scrape_note = 'Szelektoros recept 2026-09-05. A generikus kinyero azert adott nullat, mert a reszletoldalakon nincs strukturalt esemenyadat, a listan pedig a horgony korul csak hetkoznap es idopont all ("niedziela / 18:00") -- a datum kulon .event-date mezoben, "5.09" alakban, EV NELKUL. Ezt a selector-strategia locale-datumparsere olvassa (parseLocaleFieldDate), ami csak a kijelolt datummezore fut, ezert biztonsagos. Merve: 11 jovobeli esemeny, idoponttal es teremmel.',
  updated_at = now()
WHERE publisher_name LIKE 'Filharmonia Narodowa%';

UPDATE public.external_event_feed_sources SET
  scrape_strategy = 'selector',
  scrape_rule = '{"version":1,"container":".pcl25-entry","limit":200,"fields":{"title":{"selector":"h3"},"date":{"selector":".pcl25-date"},"url":{"selector":"a","attr":"href"}}}'::jsonb,
  scrape_note = 'Szelektoros recept 2026-09-05. A reszletoldalak bot user-agentre 403-at adnak es a listan talalt linkek kategoria-oldalak voltak, ezert a generikus ut nullat adott; a rendereltt listan viszont ott a .pcl25-entry kartya. A datum "05 Sep 26 - 26 Dez 26" alaku TARTOMANY: a parser a KEZDETET veszi, kulonben egy szeptemberi esemeny decemberbe kerulne. Merve: 12 jovobeli esemeny.',
  updated_at = now()
WHERE publisher_name LIKE 'Innsbruck Tourismus%';

UPDATE public.external_event_feed_sources SET
  scrape_strategy = 'selector',
  scrape_rule = '{"version":1,"container":".event--container","limit":200,"fields":{"title":{"selector":".title h2"},"date":{"selector":".date-multi"},"url":{"selector":"a","attr":"href"}}}'::jsonb,
  scrape_note = 'Szelektoros recept 2026-09-05. A regisztralt /kultura vegpont mufaj-hub, de a .event--container kartyak valodi programok. A .date-multi tartomanyt ad ("30. jun. - 13. sep. 2026"), ahol az EVSZAM gyakran csak a vegen szerepel -- a parser a kezdetet veszi, es a kiirt evet hasznalja kovetkeztetes helyett, kulonben egy juniusi kezdet jovo evre csuszna. Merve: mindossze 1 jovobeli esemeny, mert a haz kinalata tobbnyire hosszu futasu kiallitas, aminek a kezdodatuma mar elmult -- ezeket az ingest helyesen eldobja. Gyenge, de valos hozam.',
  updated_at = now()
WHERE publisher_name LIKE 'Cankarjev dom%';
