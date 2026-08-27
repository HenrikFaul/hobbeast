-- Continuous source discovery.
--
-- Every one of the 309 registered hosts was added by hand. The sites the
-- collector already reads link outward constantly — a venue lists its
-- partners, a town hall links its cultural centre — and those links are the
-- best-qualified leads available, because they come from a site that already
-- publishes Hungarian programmes.
--
-- This is a frontier in the crawler sense: a queue of hosts we have reason to
-- look at, each carrying the evidence for why. Promotion into the collector
-- stays a human decision; the scoring only decides what reaches the list.
--
-- Applied via the Supabase MCP; this file is the record. Verified live before
-- shipping: a host already in the registry is refused, a re-sighting raises
-- the score and the evidence rather than duplicating, a non-operator can
-- neither list nor judge, and promotion produces a real source row.

CREATE TABLE IF NOT EXISTS public.source_discovery_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One row per host: the goal is a new SOURCE, not a new page.
  host text NOT NULL UNIQUE,
  url text NOT NULL,
  -- Where the lead came from, so a bad suggestion can be traced back.
  discovered_from_source_id text,
  discovered_from_url text,
  link_text text,
  depth integer NOT NULL DEFAULT 1,
  score integer NOT NULL DEFAULT 0,
  -- Why it was suggested, in words an operator can disagree with.
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  promoted_source_id text,
  times_seen integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_discovery_candidates_status_check
    CHECK (status IN ('new', 'reviewing', 'promoted', 'rejected')),
  CONSTRAINT source_discovery_candidates_url_scheme
    CHECK (url ~ '^https?://'),
  CONSTRAINT source_discovery_candidates_score_range
    CHECK (score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS source_discovery_candidates_queue_idx
  ON public.source_discovery_candidates (status, score DESC, last_seen_at DESC);

ALTER TABLE public.source_discovery_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers managers read discovery frontier"
  ON public.source_discovery_candidates;
CREATE POLICY "Providers managers read discovery frontier"
  ON public.source_discovery_candidates FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'providers.manage'));

COMMENT ON TABLE public.source_discovery_candidates IS
  'Frontier of possible new programme sources, harvested from pages the collector already reads. Promotion is a human decision.';

-- Writes go through a function rather than a policy so the same call serves
-- the collector (service role, mid-run) and an operator, and so a host seen
-- again strengthens its evidence instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.record_source_candidates(p_candidates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row jsonb;
  v_host text;
  v_written integer := 0;
BEGIN
  IF NOT (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    OR public.admin_has_capability(auth.uid(), 'providers.manage')
  ) THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  LOOP
    v_host := lower(btrim(coalesce(v_row ->> 'host', '')));
    CONTINUE WHEN v_host = '' OR coalesce(v_row ->> 'url', '') !~ '^https?://';

    -- A host we already collect is not a lead. Checked here as well as in the
    -- worker, because the registry moves between runs.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.external_event_feed_sources s
      WHERE public.event_feed_url_host(s.endpoint_url) = v_host
    );

    INSERT INTO public.source_discovery_candidates AS c (
      host, url, discovered_from_source_id, discovered_from_url, link_text,
      depth, score, reasons, signals
    ) VALUES (
      v_host,
      v_row ->> 'url',
      nullif(v_row ->> 'discovered_from_source_id', ''),
      nullif(v_row ->> 'discovered_from_url', ''),
      nullif(v_row ->> 'link_text', ''),
      greatest(1, coalesce((v_row ->> 'depth')::integer, 1)),
      least(100, greatest(0, coalesce((v_row ->> 'score')::integer, 0))),
      coalesce(v_row -> 'reasons', '[]'::jsonb),
      coalesce(v_row -> 'signals', '{}'::jsonb)
    )
    ON CONFLICT (host) DO UPDATE SET
      times_seen = c.times_seen + 1,
      last_seen_at = now(),
      score = greatest(c.score, EXCLUDED.score),
      reasons = CASE WHEN EXCLUDED.score > c.score THEN EXCLUDED.reasons ELSE c.reasons END,
      signals = CASE WHEN EXCLUDED.score > c.score THEN EXCLUDED.signals ELSE c.signals END,
      url = CASE WHEN EXCLUDED.score > c.score THEN EXCLUDED.url ELSE c.url END
    -- Never resurrect a lead an operator already rejected.
    WHERE c.status IN ('new', 'reviewing');

    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$$;

REVOKE ALL ON FUNCTION public.record_source_candidates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_source_candidates(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_source_candidates(
  p_status text DEFAULT 'new',
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.source_discovery_candidates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT *
  FROM public.source_discovery_candidates
  WHERE public.admin_has_capability(auth.uid(), 'providers.manage')
    AND (p_status = 'all' OR status = p_status)
  ORDER BY score DESC, times_seen DESC, last_seen_at DESC
  LIMIT greatest(1, least(200, coalesce(p_limit, 50)));
$$;

REVOKE ALL ON FUNCTION public.admin_list_source_candidates(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_source_candidates(text, integer) TO authenticated;

-- Promotion must name a strategy the sources table accepts. 'site' is the
-- honest default for a page nobody has inspected: the general HTML reader,
-- which the source wizard can then refine into a selector rule.
CREATE OR REPLACE FUNCTION public.admin_judge_source_candidate(
  p_host text,
  p_decision text,
  p_note text DEFAULT NULL,
  p_publisher_name text DEFAULT NULL,
  p_strategy text DEFAULT 'site'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_candidate public.source_discovery_candidates%ROWTYPE;
  v_source_id text;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('promote', 'reject', 'reviewing') THEN
    RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_candidate FROM public.source_discovery_candidates
  WHERE host = lower(btrim(p_host)) FOR UPDATE;
  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_decision = 'promote' THEN
    -- Reuse the one path that creates a source, so a promoted lead is
    -- indistinguishable from a hand-added source from here on.
    v_source_id := public.admin_upsert_scraper_source(
      p_endpoint_url => v_candidate.url,
      p_publisher_name => coalesce(nullif(btrim(p_publisher_name), ''), v_candidate.host),
      p_strategy => coalesce(nullif(btrim(p_strategy), ''), 'site')
    );
  END IF;

  UPDATE public.source_discovery_candidates SET
    status = CASE p_decision WHEN 'promote' THEN 'promoted'
                             WHEN 'reject' THEN 'rejected'
                             ELSE 'reviewing' END,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    promoted_source_id = coalesce(v_source_id, promoted_source_id)
  WHERE id = v_candidate.id;

  RETURN jsonb_build_object('host', v_candidate.host, 'decision', p_decision, 'source_id', v_source_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_judge_source_candidate(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_judge_source_candidate(text, text, text, text, text) TO authenticated;
