-- Engagement metrics layer (v1.17.0).
-- Fills the gaps in the existing measurement infrastructure instead of duplicating it:
--   * product_analytics_events + analytics-ingest already cover activity logging
--   * scraper_runs already covers source health -> add http_status only
--   * post_event_feedback already exists -> add the connection-quality fields
--   * virtual_hub_activation_events already covers hub funnel stages
-- New: admin_engagement_stats() aggregates the connection funnel KPIs.

-- 1) Connection-quality ("soul metric") fields on post_event_feedback
ALTER TABLE public.post_event_feedback
  ADD COLUMN IF NOT EXISTS mood_score smallint
    CHECK (mood_score IS NULL OR mood_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS met_new_people boolean,
  ADD COLUMN IF NOT EXISTS want_to_meet_again boolean;

-- 2) Source health: HTTP status of the listing fetch per scraper run
ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS http_status integer;

-- log_scraper_run gains an optional p_http_status. Replace the old signature to
-- avoid an ambiguous overload set (worker calls via PostgREST named args).
DROP FUNCTION IF EXISTS public.log_scraper_run(text, integer, integer, integer, integer, integer, text, text, integer);
CREATE OR REPLACE FUNCTION public.log_scraper_run(
  p_source_id text,
  p_discovered integer,
  p_inserted integer,
  p_updated integer,
  p_skipped integer,
  p_duplicates integer,
  p_status text,
  p_error text,
  p_duration_ms integer,
  p_http_status integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.scraper_runs (source_id, discovered, inserted, updated, skipped,
                                   duplicates, status, error, duration_ms, http_status)
  VALUES (p_source_id, COALESCE(p_discovered,0), COALESCE(p_inserted,0), COALESCE(p_updated,0),
          COALESCE(p_skipped,0), COALESCE(p_duplicates,0),
          CASE WHEN p_status IN ('succeeded','partial','failed') THEN p_status ELSE 'partial' END,
          left(p_error, 500), p_duration_ms, p_http_status)
  RETURNING id INTO v_id;

  UPDATE public.external_event_feed_sources
  SET scrape_last_run_at = now(),
      scrape_last_event_count = COALESCE(p_inserted,0) + COALESCE(p_updated,0),
      scrape_total_event_count = scrape_total_event_count + COALESCE(p_inserted,0)
  WHERE source_id = p_source_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_scraper_run(text, integer, integer, integer, integer, integer, text, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_scraper_run(text, integer, integer, integer, integer, integer, text, text, integer, integer) TO service_role;

-- 3) Connection funnel KPIs (admin-only aggregate; k-anonymity >= 3 on feedback)
CREATE OR REPLACE FUNCTION public.admin_engagement_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 180));
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 180)));
  v_feedback_n int;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'health.view') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_feedback_n FROM public.post_event_feedback WHERE created_at >= v_since;

  RETURN jsonb_build_object(
    'window_days', v_days,

    -- Connection funnel: signup -> first participation -> repeat within 30 days
    'funnel', (
      SELECT jsonb_build_object(
        'new_members', (SELECT count(*) FROM public.profiles WHERE created_at >= v_since),
        'members_with_first_join', (
          SELECT count(*) FROM (
            SELECT user_id, min(joined_at) AS first_join
            FROM public.event_participants GROUP BY user_id
          ) f WHERE f.first_join >= v_since
        ),
        'median_days_to_first_join', (
          SELECT round(percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (f.first_join - pr.created_at)) / 86400.0
          )::numeric, 1)
          FROM (
            SELECT user_id, min(joined_at) AS first_join
            FROM public.event_participants GROUP BY user_id
          ) f
          JOIN public.profiles pr ON pr.user_id = f.user_id
          WHERE f.first_join >= v_since AND f.first_join >= pr.created_at
        ),
        'returning_members_30d', (
          SELECT count(*) FROM (
            SELECT user_id FROM public.event_participants
            WHERE joined_at >= now() - interval '30 days'
            GROUP BY user_id HAVING count(DISTINCT event_id) >= 2
          ) r
        )
      )
    ),

    -- Piggyback: social interest attached to external programs
    'piggyback', (
      SELECT jsonb_build_object(
        'intents_total', count(*),
        'intents_active', count(*) FILTER (WHERE status = 'active'),
        'looking_for_company', count(*) FILTER (WHERE intent = 'looking_for_company' AND status = 'active'),
        'distinct_events', count(DISTINCT external_event_id) FILTER (WHERE status = 'active'),
        'distinct_members', count(DISTINCT user_id) FILTER (WHERE status = 'active')
      )
      FROM public.external_event_social_intents
      WHERE created_at >= v_since
    ),

    -- Hub funnel from activation events (stage -> count)
    'hubs', (
      SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
      FROM (
        SELECT stage, count(*) AS cnt
        FROM public.virtual_hub_activation_events
        WHERE occurred_at >= v_since
        GROUP BY stage
      ) h
    ),

    -- Product analytics events by name (daily instrumentation health)
    'activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('event_name', event_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT event_name, count(*) AS cnt
        FROM public.product_analytics_events
        WHERE occurred_at >= v_since AND redacted_at IS NULL
        GROUP BY event_name
      ) a
    ),

    -- Connection quality: only exposed when at least 3 responses (k-anonymity)
    'feedback', CASE WHEN v_feedback_n >= 3 THEN (
      SELECT jsonb_build_object(
        'responses', count(*),
        'avg_mood', round(avg(mood_score)::numeric, 2),
        'met_new_people_pct', round(100.0 * count(*) FILTER (WHERE met_new_people) / NULLIF(count(*) FILTER (WHERE met_new_people IS NOT NULL), 0), 0),
        'want_to_meet_again_pct', round(100.0 * count(*) FILTER (WHERE want_to_meet_again) / NULLIF(count(*) FILTER (WHERE want_to_meet_again IS NOT NULL), 0), 0),
        'would_return_pct', round(100.0 * count(*) FILTER (WHERE would_return) / NULLIF(count(*) FILTER (WHERE would_return IS NOT NULL), 0), 0)
      )
      FROM public.post_event_feedback WHERE created_at >= v_since
    ) ELSE jsonb_build_object('responses', v_feedback_n, 'note', 'k_anonymity_minimum_not_met') END,

    -- Source health snapshot (last N days of scraper runs)
    'source_health', (
      SELECT jsonb_build_object(
        'runs', count(*),
        'failed_runs', count(*) FILTER (WHERE status = 'failed'),
        'http_errors', count(*) FILTER (WHERE http_status IS NOT NULL AND http_status >= 400),
        'sources_with_failures', count(DISTINCT source_id) FILTER (WHERE status = 'failed')
      )
      FROM public.scraper_runs
      WHERE run_started_at >= v_since
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_engagement_stats(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_engagement_stats(integer) TO authenticated;
