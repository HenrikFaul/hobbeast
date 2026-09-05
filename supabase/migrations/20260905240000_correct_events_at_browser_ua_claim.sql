-- The events.at note opened with an instruction to impersonate a browser:
--   "MUST send a desktop Chrome User-Agent: WebFetch and plain Node fetch both
--    get HTTP 403, while curl with a browser UA plus Accept-Language: de-AT
--    returns 200 every time."
-- That is evasion, and it conflicts with this project's standing rule never to
-- impersonate another client or work around bot protection.
--
-- It is also WRONG about the collector. Measured on 2026-09-05 with Playwright,
-- three user-agents, same browser and timing:
--   plain Chrome UA               -> HTTP 200, 7758 chars
--   Chrome UA + HobbeastBot token -> HTTP 200, 7758 chars
--   HobbeastBot token ALONE       -> HTTP 200, 7758 chars
-- The note conflated two different clients. The 403 it describes was returned to
-- WebFetch and to plain Node fetch -- NON-BROWSER HTTP clients. The worker's
-- render path is a real Chromium, and events.at serves it whatever the UA string
-- says. No impersonation was ever needed here.
--
-- The same check was run on the three other sources whose notes mention a
-- browser user-agent -- innsbruck.info, forumkarlin.cz and mojekarte.si -- and
-- all three are identical under all three user-agents too.
--
-- The 20260905143000 migration is append-only and stays as written; this is the
-- corrective entry, and it rewrites only the live note.
UPDATE public.external_event_feed_sources
SET parser_strategy = 'Server-rendered HTML, no JS, read through the worker''s Playwright render path with our honest identifying user-agent (RENDER_UA). /calendar renders ~10 cards behind a numbered pager ("1 2 3 4 ... 6 Weiter"). Verified live: 04-05 Sep 2026 Oage Tekke @ Arena Wien, 05 Sep 2026 DINOLAND @ Schloss Katzenberg, Schlossberg-Rundgang @ Schlossberg Graz, Vorführungen @ Spanische Hofreitschule. No JSON-LD on listing pages: parse the DOM, where each card carries <time datetime="YYYY-MM-DD HH:mm">, the title, the venue and an href /event/<slug>. For volume prefer the category listings (/konzerte alone yielded 257 event links) or enumerate https://events.at/sitemaps_event.xml. CAUTION: the listing also carries evergreen rows with absurd end dates (an exhibition running to "06 Feb 2202", a yoga studio to 2036) -- clamp end_date. CORRECTION 2026-09-05 (v1.68.0): an earlier version of this note said a desktop Chrome User-Agent MUST be sent because WebFetch and plain Node fetch get HTTP 403. That instruction was evasion AND it was wrong about this collector. Measured with Playwright and three user-agents on 2026-09-05, including the HobbeastBot token ALONE: HTTP 200 and an identical 7758-character page every time. The 403 applies to non-browser HTTP clients, not to the render path. Never send a bare browser UA here.',
    updated_at = now()
WHERE source_id = 'src_44a5e541';
