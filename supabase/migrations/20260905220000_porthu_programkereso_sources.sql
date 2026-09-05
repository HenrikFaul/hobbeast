-- PORT.hu programme finder: four category listings, live.
--
-- PORT.hu was registered long ago (src_6ed598ef) but held back, because its
-- robots.txt carries a blanket `Disallow: /` for a list of AI crawlers by name
-- — anthropic-ai, GPTBot, CCBot, PerplexityBot, Google-Extended. Our collector
-- is none of those: it identifies as HobbeastBot/1.0 and therefore falls under
-- the `User-agent: *` group, which disallows only the jegymester paths,
-- /site/, /ticketlist/ and /galeria/, and declares no Crawl-delay. Verified
-- with the worker's own robots evaluator against every path used below.
-- The owner made the call to proceed on 2026-09-05.
--
-- No new code was needed. The event pages publish proper schema.org JSON-LD:
--   /esemeny/zene/hot-spot-2026-every-wednesday-a38/event-6262316
--   → {"@type":"MusicEvent","name":"HØT SPØT 2026 …","startDate":"2026-05-06T17:00:00+0200"}
-- so the existing `render` strategy reads them, `/esemeny/` already matches the
-- event-path vocabulary, and the per-event @type feeds the category hint added
-- in v1.60.0 (MusicEvent → Zene, ExhibitionEvent → Kultúra).
--
-- MEASURED with the real extractor before registering anything, counting only
-- what the ingest's future-date gate would keep:
--
--   zene        30 future events
--   fesztival   39
--   kiallitas   20   (52 extracted; exhibitions carry their OPENING date, so
--                     the past ones are dropped by the ingest, as they should be)
--   egyeb       14
--
-- DELIBERATELY NOT REGISTERED: /programkereso/szinhaz. It yields 0 /esemeny
-- links and 19 /helyszin links — it is a directory of THEATRES, not of
-- performances, and the extractor duly turned the two it found into "events"
-- named "Városmajori Szabadtéri Színpad" and "Millenáris". Registering it would
-- publish venue names as programmes. Theatre content still arrives through the
-- festival category, which yields Színház & Előadás rows.
--
-- The mozi-idorendben category is skipped too: cinema showtimes are thousands
-- of screenings of the same films, which is not what this catalogue is for.

INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, city, country_code, endpoint_url, original_endpoint_url,
  format, categories, legal_basis, dedupe_priority, parser_strategy, notes, fetch_hosts,
  review_state, legal_review_status, robots_allowed, enabled, scrape_enabled, scrape_strategy
)
SELECT v.source_id, v.publisher_name, NULL, 'HU', v.endpoint_url, v.endpoint_url,
       'HTML listing + schema.org JSON-LD on the detail pages', v.categories,
       'robots.txt User-agent:* disallows only port.jegymester.hu, jegymester.hu, /jegymester/, /site/, /ticketlist/ and /galeria/, with no Crawl-delay; every path used here is permitted. The file additionally names AI crawlers (anthropic-ai, GPTBot, CCBot, PerplexityBot, Google-Extended) with a blanket Disallow — our collector is none of them and runs under its own honest HobbeastBot UA. Factual listing data only, with a link back to the port.hu detail page.',
       1, v.parser_note,
       'PORT.hu programme finder, category listing. Registered 2026-09-05 after measuring each category with the real extractor.',
       ARRAY['port.hu'],
       'approved', 'approved', true, false, true, 'render'
FROM (VALUES
  ('src_e92e37cc', 'PORT.hu Programkereső — Zene', 'https://port.hu/programkereso/zene',
   ARRAY['zene','koncert'],
   'Detail pages carry schema.org MusicEvent JSON-LD with name + startDate, so the generic render strategy reads them without a recipe. Measured 2026-09-05: 30 future-dated events per run. The per-event @type drives the category, so these land as Zene rather than inheriting the source''s list.'),
  ('src_330e3800', 'PORT.hu Programkereső — Fesztivál', 'https://port.hu/programkereso/fesztival',
   ARRAY['fesztival','zene','szinhaz'],
   'Mixed festival programme; measured 39 future events, categorised per event from JSON-LD (mostly Zene, some Színház & Előadás). This is also where theatre performances surface, since /programkereso/szinhaz is a venue directory rather than a performance list.'),
  ('src_9e69b5d7', 'PORT.hu Programkereső — Kiállítás', 'https://port.hu/programkereso/kiallitas',
   ARRAY['kiallitas','kultura'],
   'Exhibitions. Their JSON-LD startDate is the OPENING date, so a long-running show that opened months ago is dropped by the ingest''s future-date gate — 52 extracted, 20 kept, and that is correct. Lands as Kultúra from the @type.'),
  ('src_3b8d9c59', 'PORT.hu Programkereső — Egyéb', 'https://port.hu/programkereso/egyeb',
   ARRAY['egyeb','kultura','csaladi'],
   'The catch-all category: talks, guided tours, family programmes. Measured 14 future events. No usable @type on most, so these inherit the source category list.')
) AS v(source_id, publisher_name, endpoint_url, categories, parser_note)
ON CONFLICT (source_id) DO NOTHING;

-- The original placeholder row pointed at /programkereso/jegy?interval=anytime,
-- a ticket-filtered view. The four category listings above supersede it, and a
-- query-string endpoint is the wrong shape for a durable source.
UPDATE public.external_event_feed_sources
SET scrape_enabled = false,
    scrape_note = 'Leváltva: a /programkereso/{zene,fesztival,kiallitas,egyeb} kategórialisták veszik át (2026-09-05). Ez a sor egy jegyszűrt nézetre mutatott query stringgel, ami nem tartós végpont-alak.',
    updated_at = now()
WHERE source_id = 'src_6ed598ef';
