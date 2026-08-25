-- Per-site recon results (2026-08-25/26, scraper-worker/recon.mjs on the owner's
-- 18 problem aggregators). Adds the requested per-source marking (scrape_note),
-- a 'site' strategy for host-specific adapters, endpoint corrections, and
-- disables the two bot-blocked sites.

ALTER TABLE public.external_event_feed_sources
  ADD COLUMN IF NOT EXISTS scrape_note text;

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_scrape_strategy_check;
ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_scrape_strategy_check
  CHECK (scrape_strategy IN ('render', 'rss', 'tribe', 'site'));

-- telekomspots: 293 event links after render; no schema.org; Next.js payload has
-- startsAt -> host adapter in the worker.
UPDATE public.external_event_feed_sources SET
  endpoint_url = 'https://telekomspots.hu/events',
  scrape_strategy = 'site',
  scrape_note = 'Sajat adapter: nincs JSON-LD, og:cimke + beagyazott startsAt datumok; listat gorgetni kell'
WHERE source_id = 'src_96ff4b85';

-- fluxarcgames: the /events/ page carries Event JSON-LD directly.
UPDATE public.external_event_feed_sources SET
  endpoint_url = 'https://fluxarcgames.com/events/',
  scrape_note = 'JSON-LD Event kozvetlenul a /events/ listan; endpoint javitva a fooldalrol'
WHERE source_id = 'src_4530afc8';

-- budapest.com: list view has 48 event links statically, but no schema anywhere.
UPDATE public.external_event_feed_sources SET
  endpoint_url = 'https://www.budapest.com/en/events',
  scrape_note = 'Nincs sema sehol; endpoint a terkeprol a listanezetre javitva; gyenge hozam varhato, adapter-jelolt'
WHERE source_id = 'src_27f7a401';

-- ra.co and 10times: hard bot-block (HTTP 403 even for a rendered browser).
UPDATE public.external_event_feed_sources SET
  scrape_enabled = false,
  scrape_note = 'HTTP 403 bot-block (Cloudflare); stealth/playwright-extra kellene - kikapcsolva'
WHERE source_id IN ('src_6393c81d', 'src_25e98779');

-- eventim: Chromium HTTP/2 protocol error; worker now launches with --disable-http2.
UPDATE public.external_event_feed_sources SET
  scrape_note = 'HTTP2 protokoll-hiba volt; worker --disable-http2 flaggel javitva'
WHERE source_id IN ('src_7c42d344', 'src_d4b32f69');

-- budapestbylocals: WordPress article hub -> use its standard feed.
UPDATE public.external_event_feed_sources SET
  scrape_strategy = 'rss',
  scrape_feed_url = 'https://www.budapestbylocals.com/feed/',
  scrape_note = 'WP cikkes oldal; RSS + HU szoveges datum-fallback'
WHERE source_id = 'src_e609f5b8';

-- futanet: real running events live under /valos-esemenyek.
UPDATE public.external_event_feed_sources SET
  endpoint_url = 'https://www.futanet.hu/valos-esemenyek',
  scrape_note = 'Esemenyek a /valos-esemenyek hub alatt; RSS a hirekhez'
WHERE source_id IN ('src_63896215', 'src_8b02ea7c');

-- Confirmed-good render sources (schema on listing or detail) - marked so the
-- admin table shows why these are expected to produce.
UPDATE public.external_event_feed_sources SET scrape_note = 'MusicEvent JSON-LD kozvetlenul a listan - render OK'
WHERE source_id IN ('src_42fa5e02', 'src_f304c77c');
UPDATE public.external_event_feed_sources SET scrape_note = 'Event JSON-LD a detail oldalakon, /events/ linkek datummal - render OK'
WHERE source_id = 'src_24e37bba';
UPDATE public.external_event_feed_sources SET scrape_note = '747 /events link + ItemList JSON-LD a listan - render OK (ItemList-koveto)'
WHERE source_id = 'src_d07e0bd3';
UPDATE public.external_event_feed_sources SET scrape_note = 'Nincs sema; /events/{slug}-{datum} linkek - og:cim + URL-datum fallback szedi'
WHERE source_id = 'src_6666975b';
UPDATE public.external_event_feed_sources SET scrape_note = 'JS-lista, horgony-linkek; RSS feed gyakran ures - adapter-jelolt, figyelni'
WHERE source_id IN ('src_d4c70b03', 'src_f295a0d5');
UPDATE public.external_event_feed_sources SET scrape_note = 'Ketszintu kategoria-hub (outdoor/festivals/gastro) - adapter-jelolt'
WHERE source_id = 'src_42e46656';
UPDATE public.external_event_feed_sources SET scrape_note = '/events linkek, nincs sema; uzleti esemenyek - gyenge relevancia'
WHERE source_id = 'src_ba74fc09';
UPDATE public.external_event_feed_sources SET scrape_note = 'Cikkes esemeny-hub, nincs sema - gyenge hozam varhato'
WHERE source_id = 'src_a3f64ca9';
UPDATE public.external_event_feed_sources SET scrape_note = 'Mukodik, termel (listan lathato reszletek JSON-LD-vel)'
WHERE source_id IN ('src_2999005f', 'src_a5321f0c');
