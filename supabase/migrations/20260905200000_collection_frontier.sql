-- A persistent frontier for the collector's detail fetches.
--
-- Today scrapeGenericSource renders a source's listing, gathers every
-- same-host event link, takes `shuffled(detailUrls).slice(0, maxDetails)`,
-- fetches those — and forgets all of it when the run ends. A listing with
-- three hundred programmes and a forty-detail budget is re-sampled every
-- night: the same pages come back again and again, and some are never opened
-- at all. The grepsearch crawler (Smartsearchtool, event_queue) keeps a
-- per-URL queue instead — pending/running/done/error, a priority, a depth,
-- what the page yielded and when — and each tick takes the top-N. Successive
-- runs CONVERGE on full coverage instead of re-rolling the dice.
--
-- This is that queue, scoped per SOURCE rather than global, because two
-- sources may share a host (jegy.hu has five endpoints) and each must own its
-- own progress; hence uniqueness on (source_id, url), not on url.
--
-- What this migration does not change: every extractor path, robots and
-- Crawl-delay, conditional GET, the per-source time budget. The frontier wraps
-- only the detail-fetch step, and when it is switched off
-- (crawl_config.collection_frontier_enabled) or any of its RPCs fails, the
-- worker runs the old shuffle path unchanged. That is the regression guarantee.
--
--   collection_frontier         — the queue. RLS: providers.manage may read;
--                                 nobody but service_role writes.
--   crawl_config.collection_frontier_enabled — the kill switch.
--   enqueue_collection_urls     — service role. ON CONFLICT DO NOTHING, so a
--                                 link seen again is never duplicated; only the
--                                 first 2000 elements of a call are considered.
--   claim_collection_urls       — service role. Frees claims older than an hour
--                                 (a crashed run must not park a URL for ever),
--                                 then picks pending-first, priority DESC,
--                                 depth ASC, longest-unfetched first, skipping
--                                 hosts in backoff, FOR UPDATE SKIP LOCKED.
--                                 Returns the PRE-claim status so the worker can
--                                 tell a revisit from a first visit.
--   finish_collection_url       — service role. done or error. An error is
--                                 retried until three attempts, each time with
--                                 halved priority, then it stays an error.
--   release_collection_urls     — service role. running -> pending when the
--                                 time budget runs out mid-batch.
--   note_host_backoff /
--   clear_host_backoff          — service role. A 429/503 parks the host in the
--                                 EXISTING crawl_host_state (reused, not
--                                 recreated) for at most ten minutes.
--   admin_scraper_stats         — ADDITIVE: four frontier_* keys per
--                                 destination from one LATERAL count. Row set,
--                                 ordering, every existing key and the
--                                 capability check are unchanged.
--
-- Every statement is idempotent, so the file can be applied again safely.

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collection_frontier (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       text NOT NULL
                  REFERENCES public.external_event_feed_sources(source_id) ON DELETE CASCADE,
  url             text NOT NULL,
  host            text NOT NULL,
  depth           integer NOT NULL DEFAULT 0,
  priority        real NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'done', 'error')),
  found_events    integer NOT NULL DEFAULT 0,
  attempts        integer NOT NULL DEFAULT 0,
  error           text,
  etag            text,
  last_modified   text,
  discovered_from text,
  claimed_at      timestamptz,
  fetched_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, url)
);

CREATE INDEX IF NOT EXISTS collection_frontier_pick_idx
  ON public.collection_frontier (source_id, status, priority DESC, depth);

CREATE INDEX IF NOT EXISTS collection_frontier_host_idx
  ON public.collection_frontier (host);

ALTER TABLE public.collection_frontier ENABLE ROW LEVEL SECURITY;

-- Operators read it; no client role writes it. service_role bypasses RLS.
DROP POLICY IF EXISTS "Providers managers read collection frontier"
  ON public.collection_frontier;
CREATE POLICY "Providers managers read collection frontier"
  ON public.collection_frontier FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'providers.manage'));

REVOKE ALL ON TABLE public.collection_frontier FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.collection_frontier TO authenticated;

COMMENT ON TABLE public.collection_frontier IS
  'Per-source queue of detail URLs the collector still has to open (or revisit). Wraps only the detail-fetch step of scrapeGenericSource; the old shuffle path remains the fallback.';

-- ---------------------------------------------------------------------------
-- The kill switch — the worker reads crawl_config once per run.
-- ---------------------------------------------------------------------------
ALTER TABLE public.crawl_config
  ADD COLUMN IF NOT EXISTS collection_frontier_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.crawl_config.collection_frontier_enabled IS
  'false = the collector skips the persistent frontier and samples detail URLs the old way.';

-- ---------------------------------------------------------------------------
-- 1. enqueue_collection_urls(source, [{url, host, depth, priority, discovered_from}])
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_collection_urls(p_source_id text, p_urls jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_source_id IS NULL OR p_urls IS NULL OR jsonb_typeof(p_urls) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.collection_frontier (source_id, url, host, depth, priority, discovered_from)
    SELECT DISTINCT ON (e.elem ->> 'url')
           p_source_id,
           e.elem ->> 'url',
           e.elem ->> 'host',
           COALESCE((e.elem ->> 'depth')::integer, 0),
           COALESCE((e.elem ->> 'priority')::real, 1),
           e.elem ->> 'discovered_from'
    FROM jsonb_array_elements(p_urls) WITH ORDINALITY AS e(elem, ord)
    WHERE e.ord <= 2000
      AND jsonb_typeof(e.elem) = 'object'
      AND NULLIF(e.elem ->> 'url', '') IS NOT NULL
      AND NULLIF(e.elem ->> 'host', '') IS NOT NULL
    ORDER BY e.elem ->> 'url', e.ord
    ON CONFLICT (source_id, url) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_collection_urls(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_collection_urls(text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. claim_collection_urls(source, limit, revisit_after)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_collection_urls(
  p_source_id text,
  p_limit integer,
  p_revisit_after interval DEFAULT interval '3 days'
)
RETURNS TABLE(
  id uuid, url text, host text, depth integer, priority real,
  etag text, last_modified text, found_events integer, status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 40), 200));
  v_revisit interval := COALESCE(p_revisit_after, interval '3 days');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_source_id IS NULL THEN
    RETURN;
  END IF;

  -- a) crash recovery: a claim nobody finished within an hour is free again.
  UPDATE public.collection_frontier f
     SET status = 'pending', claimed_at = NULL
   WHERE f.source_id = p_source_id
     AND f.status = 'running'
     AND f.claimed_at < now() - interval '1 hour';

  -- b) pick, c) claim — returning the PRE-claim status, in pick order.
  RETURN QUERY
  WITH picked AS MATERIALIZED (
    SELECT f.id, f.status AS prev_status, f.priority AS prev_priority,
           f.depth AS prev_depth, f.fetched_at AS prev_fetched_at,
           f.created_at AS prev_created_at
      FROM public.collection_frontier f
     WHERE f.source_id = p_source_id
       AND (
         (f.status = 'pending' AND f.attempts < 3)
         OR (f.status = 'done' AND f.fetched_at < now() - v_revisit)
       )
       AND f.host NOT IN (
         SELECT h.host FROM public.crawl_host_state h
          WHERE h.backoff_until IS NOT NULL AND h.backoff_until > now()
       )
     ORDER BY (f.status = 'pending') DESC, f.priority DESC, f.depth ASC,
              f.fetched_at ASC NULLS FIRST, f.created_at ASC
     LIMIT v_limit
     FOR UPDATE OF f SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.collection_frontier f
       SET status = 'running', claimed_at = now()
      FROM picked p
     WHERE f.id = p.id
    RETURNING f.id, f.url, f.host, f.depth, f.priority, f.etag, f.last_modified, f.found_events
  )
  SELECT c.id, c.url, c.host, c.depth, c.priority, c.etag, c.last_modified,
         c.found_events, p.prev_status
    FROM claimed c
    JOIN picked p ON p.id = c.id
   ORDER BY (p.prev_status = 'pending') DESC, p.prev_priority DESC, p.prev_depth ASC,
            p.prev_fetched_at ASC NULLS FIRST, p.prev_created_at ASC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_collection_urls(text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_collection_urls(text, integer, interval) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. finish_collection_url(id, status, found_events, error, etag, last_modified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_collection_url(
  p_id uuid,
  p_status text,
  p_found_events integer,
  p_error text,
  p_etag text,
  p_last_modified text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;

  -- Bounded retry: an error goes back to pending with decaying priority until
  -- the third attempt; after that it stays an error and is never picked again.
  UPDATE public.collection_frontier f
     SET status = CASE
                    WHEN p_status = 'error' AND f.attempts + 1 < 3 THEN 'pending'
                    ELSE p_status
                  END,
         priority = CASE
                      WHEN p_status = 'error' AND f.attempts + 1 < 3 THEN f.priority * 0.5
                      ELSE f.priority
                    END,
         found_events = COALESCE(p_found_events, f.found_events),
         error = p_error,
         etag = COALESCE(p_etag, f.etag),
         last_modified = COALESCE(p_last_modified, f.last_modified),
         fetched_at = now(),
         attempts = f.attempts + 1,
         claimed_at = NULL
   WHERE f.id = p_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finish_collection_url(uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_collection_url(uuid, text, integer, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. release_collection_urls(ids) — the time budget ran out mid-batch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_collection_urls(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_count integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.collection_frontier f
     SET status = 'pending', claimed_at = NULL
   WHERE f.id = ANY (COALESCE(p_ids, '{}'::uuid[]))
     AND f.status = 'running';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_collection_urls(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_collection_urls(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. note_host_backoff(host, seconds) — into the EXISTING crawl_host_state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.note_host_backoff(p_host text, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_host, '')), '') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.crawl_host_state AS h (host, backoff_until, consecutive_errors, updated_at)
  VALUES (
    p_host,
    now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 1), 1), 600)),
    1,
    now()
  )
  ON CONFLICT (host) DO UPDATE
    SET backoff_until = EXCLUDED.backoff_until,
        consecutive_errors = COALESCE(h.consecutive_errors, 0) + 1,
        updated_at = now();
END;
$fn$;

REVOKE ALL ON FUNCTION public.note_host_backoff(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.note_host_backoff(text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. clear_host_backoff(host) — a successful fetch lifts the backoff. No-op if
--    the host was never noted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_host_backoff(p_host text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crawl_host_state h
     SET backoff_until = NULL,
         consecutive_errors = 0,
         last_fetched_at = now(),
         updated_at = now()
   WHERE h.host = p_host;
END;
$fn$;

REVOKE ALL ON FUNCTION public.clear_host_backoff(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_host_backoff(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. admin_scraper_stats — ADDITIVE. The body below is the one from
--    20260904171524_admin_scraper_stats_country.sql with exactly two additions:
--    the four frontier_* keys in each destination object and the `fr` LATERAL
--    that feeds them. Nothing else moved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scraper_stats(p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_days int := GREATEST(1, LEAST(COALESCE(p_days, 14), 90));
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'destinations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_id', s.source_id, 'publisher_name', s.publisher_name,
        'endpoint_url', s.endpoint_url, 'city', s.city,
        'country_code', s.country_code,
        'scrape_enabled', s.scrape_enabled, 'scrape_priority', s.scrape_priority,
        'last_run_at', s.scrape_last_run_at, 'last_events', s.scrape_last_event_count,
        'total_events', s.scrape_total_event_count,
        'scrape_strategy', s.scrape_strategy, 'scrape_note', s.scrape_note,
        'categories', s.categories,
        'access', CASE
          WHEN s.attribution_required IS TRUE THEN 'ingyenes (forrasmegjeloles)'
          ELSE 'ingyenes' END,
        'active_events', ev.active_cnt,
        'expired_events', ev.expired_cnt,
        'frontier_pending', fr.pending_cnt,
        'frontier_done', fr.done_cnt,
        'frontier_error', fr.error_cnt,
        'frontier_events', fr.events_sum
      ) ORDER BY s.scrape_priority, s.publisher_name), '[]'::jsonb)
      FROM public.external_event_feed_sources s
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE e.event_date >= current_date AND e.is_active) AS active_cnt,
               count(*) FILTER (WHERE e.event_date < current_date) AS expired_cnt
        FROM public.external_events e
        WHERE e.external_source = 'scraper'
          AND e.external_id LIKE s.source_id || ':%'
      ) ev
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE f.status = 'pending') AS pending_cnt,
               count(*) FILTER (WHERE f.status = 'done') AS done_cnt,
               count(*) FILTER (WHERE f.status = 'error') AS error_cnt,
               COALESCE(sum(f.found_events), 0) AS events_sum
        FROM public.collection_frontier f
        WHERE f.source_id = s.source_id
      ) fr
      WHERE s.scrape_enabled = true
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', d.day, 'runs', d.runs, 'sources', d.sources,
        'discovered', d.discovered, 'inserted', d.inserted,
        'updated', d.updated, 'duplicates', d.duplicates
      ) ORDER BY d.day DESC), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', run_started_at)::date AS day,
               count(*) AS runs, count(DISTINCT source_id) AS sources,
               sum(discovered) AS discovered, sum(inserted) AS inserted,
               sum(updated) AS updated, sum(duplicates) AS duplicates
        FROM public.scraper_runs
        WHERE run_started_at >= current_date - (v_days || ' days')::interval
        GROUP BY 1
      ) d
    ),
    'totals', (
      SELECT jsonb_build_object(
        'total_scraper_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND is_active),
        'active_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND is_active AND event_date >= current_date),
        'expired_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND event_date < current_date),
        'enabled_sources', (SELECT count(*) FROM public.external_event_feed_sources WHERE scrape_enabled),
        'registered_sources', (SELECT count(*) FROM public.external_event_feed_sources),
        'runs_total', (SELECT count(*) FROM public.scraper_runs),
        'inserted_total', (SELECT COALESCE(sum(inserted),0) FROM public.scraper_runs),
        'duplicates_total', (SELECT COALESCE(sum(duplicates),0) FROM public.scraper_runs)
      )
    )
  );
END;
$function$;
