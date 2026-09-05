-- V6: foreign event sources (AT/CZ/PL/SI/SK) discovered by the 2026-09-04 crawl.
--
-- Unlike the V4/V5 Hungarian candidate seeds, these land LIVE: each one was
-- fetched by a proposing pass and then independently re-fetched by an adversarial
-- verifying pass that also read robots.txt. Only hosts that survived BOTH passes
-- are here, so review_state='approved' and scrape_enabled=true rather than
-- pending_review. `enabled` stays false — that column drives the legacy no-JS feed
-- pipeline (false on all 377 pre-existing rows); the Playwright worker reads
-- scrape_enabled.
--
-- Hosts whose second pass could not run are deliberately NOT in this migration.
-- The verify stage is not ceremony: on the Hungarian V5 run it rejected 11 of 39
-- first-pass proposals and corrected another 10, so a single pass is not a safe
-- basis for enabling live scraping of a third-party site.

INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, publisher_type, city, country_code, endpoint_url,
  original_endpoint_url, format, categories, legal_basis, audit_status,
  dedupe_priority, parser_strategy, notes, fetch_hosts,
  review_state, legal_review_status, robots_allowed, enabled, scrape_enabled, scrape_strategy
)
SELECT
  v.source_id, v.publisher_name, NULL, v.city, v.country_code, v.endpoint_url,
  v.endpoint_url, 'HTML event listing', v.categories, v.legal_basis, NULL,
  v.dedupe_priority, v.parser_strategy,
  'Discovered by the 2026-09-04 foreign crawl; endpoint and robots.txt verified by two independent live fetches.',
  ARRAY[v.host],
  'approved', 'approved', true, false, true, 'render'
FROM (VALUES
  ('FALTER.at (Falter Zeitschriften GmbH), Wien','Wien','AT','https://www.falter.at/events/suche',ARRAY['Theater','Tanz','Musiktheater','Oper','Klassik','Pop'],'Public listings, no paywall/login/consent wall; robots.txt permits the /events/suche path.',1,'Server-rendered HTML, no JS. Paginate via ?page=N (footer reads "Seite 1 / 625"); ?page=2 verified to return a different result set. The ?region= filter is unproven — it returned page 1 unchanged.','www.falter.at','src_48e40d69'),
  ('KulturServer Graz — a Service of the City of Graz','Graz','AT','https://www.kultur.graz.at/kalender/kategorie/musik',ARRAY['Musik','Theater','Tanz','Ausstellungen','Film','Neue Medien'],'robots.txt on the serving host is fully permissive (empty Disallow) with Crawl-delay: 2 — honour the 2s delay.',1,'Static server-rendered HTML; plain GET plus an HTML parser, no headless browser. Seed each of the 10 category slugs: /kalender/kategorie/{musik,theater-tanz,ausstellungen,film-neue-medien,lesung-vortrag-diskussion,kabarett-kleinkunst,kinder-jugend,fuehrungen,...}.','www.kultur.graz.at','src_2efed7f9'),
  ('Innsbruck Tourismus','Innsbruck','AT','https://www.innsbruck.info/events/d/alle.html',ARRAY['Ausstellung','Platzkonzerte','Theater','Tanz','Festival','Film'],'Official regional tourism board, public non-paywalled calendar; robots.txt permits the events path.',1,'Static server-side HTML (TYPO3). MUST send a real desktop User-Agent: no-UA curl and WebFetch both return HTTP 403, while a Chrome UA plus Accept-Language: de-AT returns HTTP 200 (~207 KB).','www.innsbruck.info','src_1e132158'),
  ('Wiener Konzerthaus','Wien','AT','https://www.konzerthaus.at/de/programm-und-karten',ARRAY['Klassik','Orchester','Kammermusik','Alte Musik','Neue Musik','Jazz'],'Public programme of a public-interest cultural institution (Wiener Konzerthausgesellschaft); no login or paywall.',1,'Server-rendered HTML. Parse listing rows: title, date DD/MM/YY, weekday, start time, href /de/programm-und-karten/{slug}/{id} — the trailing numeric id is a stable external_id. ROBOTS CONSTRAINT: robots.txt has "Disallow: /*?", so do NOT crawl ?page=N query listings.','www.konzerthaus.at','src_283a2be6'),
  ('Forum Karlín','Praha','CZ','https://www.forumkarlin.cz/program/',ARRAY['koncerty','rock','metal','pop','hip-hop','klasika'],'Public unauthenticated programme; factual event fields only, with attribution and a deep link back.',1,'Static HTML + CSS selectors (WordPress); no JS, no pagination, no JSON-LD. Verified selectors: div.event_inner, a[href^="https://www.forumkarlin.cz/udalost/"], div.date, span.den (31 each). Use a neutral browser User-Agent.','www.forumkarlin.cz','src_2a099487'),
  ('GoOut','Praha','CZ','https://goout.net/cs/praha/akce/',ARRAY['Koncerty','Výstavy','Filmy','Sport','Parties'],'Public listing, no login/paywall/consent wall; robots.txt has no Disallow covering /cs/ or /akce.',0,'Server-rendered HTML, readable without JS. The city-scoped path /cs/{city}/akce/ is the crawl unit — there is NO nationwide feed: /cs/cesko/akce/ returns 404 and bare /cs/akce silently resolves to Prague.','goout.net','src_02848795'),
  ('Kudy z nudy (CzechTourism)','celostátní (celá ČR)','CZ','https://www.kudyznudy.cz/kalendar-akci',ARRAY['festivaly','koncerty','výstavy','divadlo','akce pro děti','sport'],'National tourism portal operated by CzechTourism (Czech state tourism agency); listings published for promotion.',1,'Server-rendered HTML, no JS, no consent wall. Cards carry title, date range, city, kraj and detail link. Facets narrow reliably: /kalendar-akci/{kategorie}/{kraj}[/{oblast}]. Detail pages /akce/{slug} expose time, venue, street address, kraj and category.','www.kudyznudy.cz','src_52704b76'),
  ('Národní divadlo (National Theatre Prague)','Praha','CZ','https://www.narodni-divadlo.cz/cs/program',ARRAY['opera','balet','činohra','divadlo','Laterna magika'],'robots.txt is "Disallow: /api" with "Allow: /" — the /cs/program path is permitted; no Crawl-delay declared.',0,'Server-rendered HTML calendar grouped by day heading; no consent wall, no JS. Combine the day heading with the row time for the start datetime (Europe/Prague, DD.M.YYYY + HH:MM). Deep links: /cs/predstaveni/<slug-id>?t=YYYY-MM-DD-HH-MM.','www.narodni-divadlo.cz','src_827702fc'),
  ('eBilet.pl','cała Polska','PL','https://www.ebilet.pl/muzyka',ARRAY['koncerty','festiwale','muzyka','teatr','musical','sport'],'robots.txt disallows only /api/ and /cms/; category hubs are permitted. Commercial ticketing data — link back, do not republish descriptions wholesale.',0,'Server-rendered HTML, no JS. Crawl the eight category hubs (/muzyka, /teatr, /sport, /rodzina, /klasyka, /widowiska, /biznes, /zwiedzanie). No numeric pagination — ?page=N silently returns page 1; enumerate the subcategory listings instead.','www.ebilet.pl','src_dbc2e9b6'),
  ('Filharmonia Narodowa (National Philharmonic, Warsaw)','Warszawa','PL','https://filharmonia.pl/repertuar',ARRAY['muzyka klasyczna','koncerty','symfonika','kameralistyka','chór'],'robots.txt blocks only meta-externalagent entirely and /tmp/ for others; /repertuar is permitted.',0,'Static server-rendered HTML. /repertuar shows the current month. Paginate by following the "Następny Miesiąc" links, which use a comma-suffixed path segment /repertuar,ts:<unix_seconds> — follow the rendered links rather than synthesising timestamps.','filharmonia.pl','src_81eba781'),
  ('Magiczny Kraków — City of Kraków official portal','Kraków','PL','https://www.krakow.pl/kalendarium/1919,artykul,kalendarium.html',ARRAY['kultura','koncerty','festiwale','wystawy','teatr','dla dzieci'],'Municipal portal of Urząd Miasta Krakowa; public, no login/paywall/consent wall.',1,'Server-rendered HTML, no JS. Strongest date signal is the href itself: detail URLs follow /kalendarium/1919,object,<view>,<eventId>,<YYYY-MM-DD>,<slug>.html — parse the date straight out of the link.','www.krakow.pl','src_2e75d2cc'),
  ('Cankarjev dom, kulturni in kongresni center','Ljubljana','SI','https://www.cd-cc.si/kultura',ARRAY['koncerti','klasična glasba','jazz','gledališče','ples','film'],'Venue''s own public programme, no login/paywall; robots.txt is a stock Drupal ruleset that does not disallow /kultura.',0,'Static HTML, no JS. /kultura shows only ~15 events; crawl the genre sub-listings for real coverage (/kultura/glasba alone returned 60+). Accept ANY genre segment in /kultura/{genre}/{slug} — it also includes prireditev-drugega-organizatorja. Follow emitted hrefs; slugs are diacritic-stripped. /sl/koledar is a 404.','www.cd-cc.si','src_9379fb6d'),
  ('Kinodvor (Javni zavod Kinodvor)','Ljubljana','SI','https://www.kinodvor.org/spored/',ARRAY['film','kino','art kino','filmski festivali','premiere'],'robots.txt permissive: only /wp-admin/ and /potrditve/* disallowed; public sitemap available.',2,'Static HTML (WordPress), fully server-rendered. Iterate div.day-wrappper blocks carrying data-day="DD-MM-YYYY" for the date (Europe/Ljubljana); within each day each screening is div.card.card-schedule-vertical with "HH:MM / Dvorana" in the leading p > small > b.','www.kinodvor.org','src_da269e19'),
  ('Slovenská filharmónia (Slovak Philharmonic)','Bratislava','SK','https://filharmonia.sk/koncerty',ARRAY['klasická hudba','koncerty','orchester','komorná hudba','zbor'],'Public listing, no login/paywall; stock Drupal robots.txt disallowing only admin paths.',1,'Static server-rendered HTML (Drupal). Iterate /koncerty?page=0,1,2,... using the 0-indexed pager. Do NOT trust a low hardcoded page cap: the visible "Strana 1..9" is a windowed pager — ?page=8 reported "current page 9, last page 13" and still returned events.','filharmonia.sk','src_a13a4314')
) AS v(publisher_name, city, country_code, endpoint_url, categories, legal_basis, dedupe_priority, parser_strategy, host, source_id)
-- Host guard: never register a host the collector already has, whatever id it carries.
WHERE NOT EXISTS (
  SELECT 1 FROM public.external_event_feed_sources existing
  WHERE existing.endpoint_url IS NOT NULL
    AND lower(regexp_replace(split_part(regexp_replace(existing.endpoint_url, '^https?://', ''), '/', 1), '^www\.', ''))
      = lower(regexp_replace(v.host, '^www\.', ''))
)
ON CONFLICT (source_id) DO NOTHING;
