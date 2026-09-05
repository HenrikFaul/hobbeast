-- The V8 note for gama.gliwice.eu guessed that our parser missed its dates
-- because they use the abbreviated Polish month form ("6 wrz"). That guess was
-- tested and is WRONG: month matching is prefix-based, so "wrz" already resolves
-- to wrzesien. Verified live on 2026-09-05:
--   parseLocaleFieldDate('6 wrz 2026', localeFor('PL'))  -> 2026-09-06
--   parseLocaleFieldDate('6 wrz',      localeFor('PL'))  -> 2026-09-06
-- and the same holds for CZ 'zar', SI 'avg', SK 'okt', PL 'paz'.
--
-- Worth recording twice over, because the guess nearly became a code change:
-- CZ/PL/SI/SK carry no explicit three-letter month keys, which LOOKS like a gap
-- until you test it. Adding them would have been dead code.
--
-- Leaving a disproven explanation in the row would send the next person down a
-- dead end, so it is replaced with what is actually known: the dates are in the
-- raw HTML, the parser reads that date format fine, and the real cause is still
-- unidentified.
UPDATE public.external_event_feed_sources
SET parser_strategy = 'NOT ENABLED: both judging passes accepted this listing, but our extractor collected ZERO future-dated events from it on 2026-09-05. Registered so the endpoint and its robots clearance are not lost; it needs a selector recipe before it can be switched on. Read https://gama.gliwice.eu/kalendarz with our honest UA (HTTP 200, 128 KB). Dates and titles ARE in the raw HTML, no JS needed: ''XIII Rodzinny Piknik Seniora'' 6 wrz 2026 14:00-19:00 (Miejska Biblioteka Publiczna w Gliwicach); ''Biennale Akademia''. CAUSE STILL UNKNOWN: an earlier note blamed the abbreviated Polish month form "6 wrz", but that was tested and disproven — month matching is prefix-based, so parseLocaleFieldDate(''6 wrz 2026'', PL) correctly returns 2026-09-06. Start the investigation at the card/container detection instead.',
    updated_at = now()
WHERE source_id = 'src_ba877971';
