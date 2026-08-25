-- The 2026-08-25 audit classified these as 'rss' because the site advertises a
-- feed, but the feed is a NEWS feed, not an event stream: koncert.hu/rss/hirek
-- yields ~4 articles while the rendered listing carries 181 dated concerts.
-- With listing-level extraction (v1.21.0) the render strategy is strictly better.
UPDATE public.external_event_feed_sources
SET scrape_strategy = 'render',
    scrape_feed_url = NULL,
    scrape_note = 'Hir-feed volt beallitva esemenyfolyam helyett; render + listaoldal-kinyeres sokkal tobbet ad',
    scrape_last_run_at = NULL
WHERE scrape_enabled
  AND scrape_strategy = 'rss'
  AND (scrape_feed_url ILIKE '%hirek%' OR scrape_feed_url ILIKE '%/news%');
