-- Prompt 09 + social addendum: consent-bound, k-anonymous Circle venue
-- context and an audited native-event link. Exact member coordinates are used
-- only inside the SECURITY DEFINER boundary and are never returned.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_circle_venue_search_context(
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id uuid := auth.uid();
  eligible_count integer := 0;
  average_lat double precision;
  average_lon double precision;
  minimum_lat double precision;
  maximum_lat double precision;
  minimum_lon double precision;
  maximum_lon double precision;
  city_bucket text;
  travel_radius integer;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_circle_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CIRCLE' USING ERRCODE = '22023';
  END IF;
  IF NOT public.feature_enabled_for_subject('circles', requester_id) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'feature_disabled',
      'privacy_mode', 'coarse_k_anonymous',
      'threshold', 3,
      'contributor_count', 0
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.social_circles circle
    LEFT JOIN public.social_circle_members membership
      ON membership.circle_id = circle.id
     AND membership.user_id = requester_id
     AND membership.membership_status = 'active'
    WHERE circle.id = p_circle_id
      AND circle.lifecycle_state <> 'archived'
      AND (circle.host_id = requester_id OR membership.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'CIRCLE_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*)::integer,
    avg(profile.location_lat),
    avg(profile.location_lon),
    min(profile.location_lat),
    max(profile.location_lat),
    min(profile.location_lon),
    max(profile.location_lon),
    mode() WITHIN GROUP (ORDER BY NULLIF(btrim(profile.city), ''))
  INTO
    eligible_count, average_lat, average_lon,
    minimum_lat, maximum_lat, minimum_lon, maximum_lon, city_bucket
  FROM public.social_circle_members membership
  JOIN public.profiles profile
    ON profile.user_id = membership.user_id
   AND profile.is_active = true
   AND profile.user_origin = 'real'
   AND profile.location_lat IS NOT NULL
   AND profile.location_lon IS NOT NULL
  JOIN LATERAL (
    SELECT consent.decision
    FROM public.consent_records consent
    WHERE consent.user_id = membership.user_id
      AND consent.purpose = 'location_sharing'
    ORDER BY consent.decided_at DESC, consent.id DESC
    LIMIT 1
  ) latest_consent ON latest_consent.decision = 'granted'
  WHERE membership.circle_id = p_circle_id
    AND membership.membership_status = 'active'
    AND NOT public.is_blocked_between(requester_id, membership.user_id);

  IF eligible_count < 3 THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'privacy_threshold_not_met',
      'privacy_mode', 'coarse_k_anonymous',
      'threshold', 3,
      'contributor_count', 0
    );
  END IF;

  travel_radius := least(100, greatest(5, (
    round(greatest(
      (maximum_lat - minimum_lat) * 111,
      (maximum_lon - minimum_lon) * 111 * abs(cos(radians(average_lat)))
    ) / 5) * 5
  )::integer));

  RETURN jsonb_build_object(
    'available', true,
    'privacy_mode', 'coarse_k_anonymous',
    'threshold', 3,
    'contributor_count', eligible_count,
    'center', jsonb_build_object(
      'lat', round(average_lat::numeric, 1),
      'lon', round(average_lon::numeric, 1)
    ),
    'city', city_bucket,
    'max_travel_distance_km', travel_radius,
    'reason_codes', jsonb_build_array('explicit_location_consent', 'coarse_group_center', 'balanced_travel')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_event_to_my_circle(
  p_circle_id uuid,
  p_event_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE(event_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id uuid := auth.uid();
  inserted_count integer := 0;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_circle_id IS NULL OR p_event_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_CIRCLE_EVENT_LINK' USING ERRCODE = '22023';
  END IF;
  IF NOT public.feature_enabled_for_subject('circles', requester_id) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_circles circle
    WHERE circle.id = p_circle_id
      AND circle.host_id = requester_id
      AND circle.lifecycle_state <> 'archived'
  ) THEN
    RAISE EXCEPTION 'CIRCLE_HOST_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.events event
    WHERE event.id = p_event_id
      AND COALESCE(event.organizer_id, event.created_by) = requester_id
      AND event.is_active = true
  ) THEN
    RAISE EXCEPTION 'EVENT_OWNERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.social_circle_events (circle_id, event_id)
  VALUES (p_circle_id, p_event_id)
  ON CONFLICT ON CONSTRAINT social_circle_events_pkey DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 1 THEN
    INSERT INTO public.social_graph_audit_events (
      actor_id, entity_type, entity_id, event_type, metadata
    ) VALUES (
      requester_id,
      'circle',
      p_circle_id,
      'circle_event_linked',
      jsonb_build_object(
        'event_id', p_event_id,
        'idempotency_key', p_idempotency_key,
        'source', 'circle_event_creation'
      )
    );
  END IF;

  RETURN QUERY SELECT p_event_id, inserted_count = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_circle_venue_search_context(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_event_to_my_circle(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_circle_venue_search_context(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_event_to_my_circle(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_circle_venue_search_context(uuid) IS
  'Returns a 0.1-degree, k>=3 group venue search center only from real active Circle members with latest explicit location-sharing consent; blocked pairs are excluded.';
COMMENT ON FUNCTION public.link_event_to_my_circle(uuid, uuid, uuid) IS
  'Host-only idempotent native-event link with social graph audit evidence.';

COMMIT;
