-- Prompt 08 + Premium Addendum: privacy-minimized, server-side activity
-- context ranking signals. The function returns only aggregate/derived values
-- for the caller and never exposes another member's identity or exact profile
-- location.

BEGIN;

CREATE OR REPLACE FUNCTION public.rank_activity_context_events(
  p_candidate_ids uuid[],
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  event_id uuid,
  ranking_score numeric,
  reason_codes text[],
  distance_km numeric,
  attended_similar boolean,
  availability_match boolean,
  host_reliability numeric,
  exposure_share numeric,
  impression_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id uuid := auth.uid();
  viewer_cohort text;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_candidate_ids IS NULL
     OR cardinality(p_candidate_ids) NOT BETWEEN 1 AND 100
     OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_RECOMMENDATION_REQUEST' USING ERRCODE = '22023';
  END IF;

  viewer_cohort := CASE
    WHEN public.has_role(requester_id, 'admin') THEN 'internal'
    ELSE NULL
  END;
  IF NOT public.evaluate_feature_flag('new_recommender', requester_id, viewer_cohort) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH viewer AS (
    SELECT
      subject.requester_id AS user_id,
      profile.city,
      profile.location_lat,
      profile.location_lon,
      COALESCE(profile.preferred_radius_km, 25) AS radius_km,
      COALESCE(profile.hobbies, '{}'::text[]) AS hobbies,
      COALESCE(profile.availability_window, '{}'::jsonb) AS availability_window
    FROM (SELECT requester_id) subject
    LEFT JOIN public.profiles profile ON profile.user_id = subject.requester_id
  ),
  candidates AS (
    SELECT
      event.id,
      event.created_by,
      COALESCE(event.organizer_id, event.created_by) AS host_id,
      event.title,
      event.category,
      event.tags,
      event.event_date,
      event.event_time,
      event.location_city,
      event.location_lat,
      event.location_lon,
      event.max_attendees,
      event.created_at
    FROM public.events event
    WHERE event.id = ANY(p_candidate_ids)
      AND event.is_active = true
      AND COALESCE(event.event_date, current_date) >= current_date
      AND COALESCE(event.outcome_status, 'scheduled') NOT IN ('completed', 'held', 'cancelled', 'archived')
      AND NOT public.is_blocked_between(requester_id, COALESCE(event.organizer_id, event.created_by))
  ),
  attended_categories AS (
    SELECT DISTINCT attended_event.category
    FROM public.event_participants participation
    JOIN public.events attended_event ON attended_event.id = participation.event_id
    WHERE participation.user_id = requester_id
      AND participation.status IN ('checked_in', 'completed')
      AND attended_event.outcome_status IN ('completed', 'held')
  ),
  host_history AS (
    SELECT
      COALESCE(history_event.organizer_id, history_event.created_by) AS host_id,
      (
        count(*) FILTER (WHERE history_event.outcome_status IN ('completed', 'held')) + 2
      )::numeric / NULLIF(
        count(*) FILTER (WHERE history_event.outcome_status IN ('completed', 'held', 'cancelled')) + 4,
        0
      )::numeric AS reliability
    FROM public.events history_event
    WHERE COALESCE(history_event.organizer_id, history_event.created_by) IN (SELECT candidate.host_id FROM candidates candidate)
      AND history_event.updated_at >= now() - interval '365 days'
      AND history_event.outcome_status IN ('completed', 'held', 'cancelled')
    GROUP BY COALESCE(history_event.organizer_id, history_event.created_by)
  ),
  impressions AS (
    SELECT
      candidate.id AS event_id,
      count(analytics.id)::bigint AS impression_count
    FROM candidates candidate
    LEFT JOIN public.product_analytics_events analytics
      ON analytics.event_name = 'event_impression'
     AND analytics.occurred_at >= now() - interval '30 days'
     AND analytics.properties->>'event_id' = candidate.id::text
    GROUP BY candidate.id
  ),
  signal_base AS (
    SELECT
      candidate.*,
      viewer.hobbies,
      viewer.availability_window,
      COALESCE(host_history.reliability, 0.5)::numeric AS reliability,
      COALESCE(impressions.impression_count, 0)::bigint AS impressions,
      max(COALESCE(impressions.impression_count, 0)) OVER ()::numeric AS max_impressions,
      EXISTS (
        SELECT 1
        FROM unnest(viewer.hobbies) hobby(value)
        WHERE char_length(btrim(hobby.value)) >= 2
          AND strpos(lower(concat_ws(' ', candidate.title, candidate.category, array_to_string(candidate.tags, ' '))), lower(btrim(hobby.value))) > 0
      ) AS explicit_match,
      EXISTS (
        SELECT 1 FROM attended_categories attended
        WHERE lower(attended.category) = lower(candidate.category)
      ) AS attended_match,
      (
        jsonb_typeof(viewer.availability_window->'days') = 'array'
        AND (viewer.availability_window->'days') ?
          (ARRAY['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow FROM candidate.event_date)::integer]
      ) AS fits_availability,
      (
        lower(COALESCE(candidate.location_city, '')) = lower(COALESCE(viewer.city, ''))
        AND COALESCE(candidate.location_city, '') <> ''
      ) AS same_city,
      CASE
        WHEN viewer.location_lat IS NULL OR viewer.location_lon IS NULL
          OR candidate.location_lat IS NULL OR candidate.location_lon IS NULL THEN NULL
        ELSE round((
          6371 * acos(least(1, greatest(-1,
            cos(radians(viewer.location_lat)) * cos(radians(candidate.location_lat))
              * cos(radians(candidate.location_lon) - radians(viewer.location_lon))
            + sin(radians(viewer.location_lat)) * sin(radians(candidate.location_lat))
          )))
        )::numeric, 0)
      END AS coarse_distance_km,
      viewer.radius_km,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(candidate.tags, '{}'::text[])) tag(value)
        WHERE lower(tag.value) LIKE '%kezd%'
      ) AS beginner_friendly,
      (
        SELECT count(*)
        FROM public.event_participants participation
        WHERE participation.event_id = candidate.id
          AND participation.status IN ('going', 'checked_in', 'completed')
      ) AS active_participants
    FROM candidates candidate
    CROSS JOIN viewer
    LEFT JOIN host_history ON host_history.host_id = candidate.host_id
    LEFT JOIN impressions ON impressions.event_id = candidate.id
  ),
  signals AS (
    SELECT
      signal.*,
      (
        signal.same_city
        OR (signal.coarse_distance_km IS NOT NULL AND signal.coarse_distance_km <= signal.radius_km)
      ) AS nearby,
      CASE
        WHEN signal.max_impressions <= 0 THEN 0::numeric
        ELSE least(1::numeric, signal.impressions::numeric / signal.max_impressions)
      END AS normalized_exposure,
      array_remove(ARRAY[
        CASE WHEN signal.explicit_match THEN 'explicit_interest' END,
        CASE WHEN signal.attended_match THEN 'attended_similar' END,
        CASE WHEN signal.same_city OR (signal.coarse_distance_km IS NOT NULL AND signal.coarse_distance_km <= signal.radius_km) THEN 'nearby' END,
        CASE WHEN signal.fits_availability THEN 'fits_availability' END,
        CASE WHEN signal.beginner_friendly THEN 'beginner_friendly' END,
        CASE WHEN signal.reliability >= 0.75 THEN 'trusted_host' END,
        CASE WHEN signal.created_at >= now() - interval '14 days' THEN 'fresh' END
      ], NULL)::text[] AS safe_reasons
    FROM signal_base signal
  ),
  scored AS (
    SELECT
      signal.*,
      (
        CASE WHEN signal.explicit_match THEN 32 ELSE 0 END
        + CASE WHEN signal.attended_match THEN 12 ELSE 0 END
        + CASE WHEN signal.nearby THEN 16 ELSE 0 END
        + CASE WHEN signal.fits_availability THEN 6 ELSE 0 END
        + CASE WHEN signal.beginner_friendly THEN 8 ELSE 0 END
        + signal.reliability * 10
        + CASE WHEN signal.created_at >= now() - interval '14 days' THEN 8 ELSE 3 END
        + (1 - signal.normalized_exposure) * 6
        + CASE
            WHEN signal.event_date IS NULL THEN 0
            ELSE greatest(0, 8 - least(8, (signal.event_date - current_date)::numeric * 8 / 30))
          END
        + CASE
            WHEN signal.max_attendees IS NULL OR signal.active_participants < signal.max_attendees THEN 4
            ELSE 0
          END
      )::numeric AS score
    FROM signals signal
  )
  SELECT
    scored.id,
    round(scored.score, 4),
    CASE
      WHEN cardinality(scored.safe_reasons) = 0 THEN ARRAY['discovery_pick']::text[]
      ELSE scored.safe_reasons
    END,
    scored.coarse_distance_km,
    scored.attended_match,
    scored.fits_availability,
    round(scored.reliability, 4),
    round(scored.normalized_exposure, 4),
    scored.impressions
  FROM scored
  ORDER BY scored.score DESC, scored.id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rank_activity_context_events(uuid[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rank_activity_context_events(uuid[], integer)
  TO authenticated;

COMMENT ON FUNCTION public.rank_activity_context_events(uuid[], integer) IS
  'Feature-flagged server-side activity-context ranking. Returns only caller-derived, coarse and aggregate signals; blocked organizers are omitted before scoring.';

COMMIT;
