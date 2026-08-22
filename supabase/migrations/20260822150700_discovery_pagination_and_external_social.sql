-- Prompt 06/08/09 second pass: bounded discovery pagination and a privacy-safe
-- social-intent wrapper for stored external events. External ownership never
-- becomes Hobbeast organizer ownership.
-- Rollback: disable `external_social_intent`, revoke the RPCs, then drop the
-- two intent tables. The existing event list RPCs and source records remain.

BEGIN;

INSERT INTO public.feature_flags (
  key, enabled, rollout_percentage, cohorts, owner, expires_at, description
)
VALUES (
  'external_social_intent', false, 0, '{}'::text[], 'product-social',
  '2027-02-28T23:59:59Z',
  'Privacy-safe company interest around verified external events'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.external_event_social_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  visibility text NOT NULL DEFAULT 'aggregate_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_event_social_intents_user_event_unique UNIQUE (external_event_id, user_id),
  CONSTRAINT external_event_social_intents_intent_check CHECK (intent IN ('interested', 'looking_for_company')),
  CONSTRAINT external_event_social_intents_status_check CHECK (status IN ('active', 'withdrawn')),
  CONSTRAINT external_event_social_intents_visibility_check CHECK (visibility = 'aggregate_only')
);

CREATE INDEX external_event_social_intents_active_event_idx
  ON public.external_event_social_intents (external_event_id, intent)
  WHERE status = 'active';

ALTER TABLE public.external_event_social_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own external event social intent"
ON public.external_event_social_intents FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.external_event_social_intent_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_intent text,
  new_intent text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_event_social_intent_audit_idempotency UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.external_event_social_intent_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own external event social intent audit"
ON public.external_event_social_intent_audits FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Admins read external event social intent audit"
ON public.external_event_social_intent_audits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.list_discoverable_events_safe_page(
  p_from_date date DEFAULT current_date,
  p_requester_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
  v_ids uuid[];
  v_event_id uuid;
  v_payload jsonb;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean;
BEGIN
  SELECT COALESCE(array_agg(candidate.id ORDER BY candidate.event_date, candidate.event_time NULLS LAST, candidate.id), '{}'::uuid[])
  INTO v_ids
  FROM (
    SELECT e.id, e.event_date, e.event_time
    FROM public.events e
    WHERE e.is_active = true
      AND e.event_date >= COALESCE(p_from_date, current_date)
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET v_offset
    LIMIT v_limit + 1
  ) candidate;

  v_has_more := COALESCE(array_length(v_ids, 1), 0) > v_limit;
  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    FOREACH v_event_id IN ARRAY v_ids[1:LEAST(array_length(v_ids, 1), v_limit)]
    LOOP
      v_payload := public.event_safe_payload(v_event_id, p_requester_id);
      IF v_payload IS NOT NULL THEN v_items := v_items || jsonb_build_array(v_payload); END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'offset', v_offset,
    'next_offset', CASE WHEN v_has_more THEN v_offset + v_limit ELSE NULL END,
    'has_more', v_has_more
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_external_events_safe_page(
  p_from_date date DEFAULT current_date,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100) AS page_limit,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS page_offset
  ), candidates AS (
    SELECT e.*
    FROM public.external_events e, bounds b
    WHERE e.is_active = true
      AND e.event_date >= COALESCE(p_from_date, current_date)
      AND e.import_state NOT IN ('cancelled', 'rejected')
      AND e.freshness_state <> 'stale'
      AND e.external_url ~ '^https://'
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET (SELECT page_offset FROM bounds)
    LIMIT (SELECT page_limit + 1 FROM bounds)
  ), numbered AS (
    SELECT c.*, row_number() OVER (ORDER BY c.event_date, c.event_time NULLS LAST, c.id) AS row_number
    FROM candidates c
  ), page AS (
    SELECT n.* FROM numbered n, bounds b WHERE n.row_number <= b.page_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'external_source', p.external_source,
      'external_id', p.external_id,
      'external_url', p.external_url,
      'title', p.title,
      'category', p.category,
      'subcategory', p.subcategory,
      'tags', p.tags,
      'description', p.description,
      'event_date', p.event_date,
      'event_time', p.event_time,
      'location_type', p.location_type,
      'location_city', p.location_city,
      'location_address', p.location_address,
      'location_free_text', p.location_free_text,
      'location_lat', p.location_lat,
      'location_lon', p.location_lon,
      'max_attendees', p.max_attendees,
      'image_url', p.image_url,
      'source_last_synced_at', p.source_last_synced_at,
      'first_seen_at', p.first_seen_at,
      'last_verified_at', p.last_verified_at,
      'freshness_state', p.freshness_state,
      'normalization_version', p.normalization_version,
      'dedupe_confidence', p.dedupe_confidence,
      'canonical_fingerprint', p.canonical_fingerprint,
      'import_state', p.import_state
    ) ORDER BY p.event_date, p.event_time NULLS LAST, p.id), '[]'::jsonb),
    'offset', (SELECT page_offset FROM bounds),
    'next_offset', CASE
      WHEN (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
      THEN (SELECT page_offset + page_limit FROM bounds)
      ELSE NULL
    END,
    'has_more', (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
  )
  FROM page p;
$$;

CREATE OR REPLACE FUNCTION public.set_external_event_social_intent(
  p_external_event_id uuid,
  p_intent text,
  p_active boolean,
  p_idempotency_key uuid
)
RETURNS TABLE (intent text, status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.external_events%ROWTYPE;
  v_before public.external_event_social_intents%ROWTYPE;
  v_status text := CASE WHEN p_active THEN 'active' ELSE 'withdrawn' END;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_intent NOT IN ('interested', 'looking_for_company') OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_SOCIAL_INTENT' USING ERRCODE = '22023';
  END IF;
  IF NOT public.evaluate_feature_flag('external_social_intent', v_user_id, NULL) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_suspended(v_user_id) THEN
    RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event FROM public.external_events WHERE id = p_external_event_id FOR SHARE;
  IF NOT FOUND OR NOT v_event.is_active OR v_event.event_date < current_date
     OR v_event.import_state IN ('stale', 'cancelled', 'rejected')
     OR v_event.freshness_state = 'stale'
     OR v_event.external_url !~ '^https://' THEN
    RAISE EXCEPTION 'EXTERNAL_EVENT_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.external_event_social_intent_audits
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN QUERY SELECT i.intent, i.status, true
    FROM public.external_event_social_intents i
    WHERE i.external_event_id = p_external_event_id AND i.user_id = v_user_id;
    RETURN;
  END IF;

  SELECT * INTO v_before FROM public.external_event_social_intents
  WHERE external_event_id = p_external_event_id AND user_id = v_user_id
  FOR UPDATE;

  INSERT INTO public.external_event_social_intents (
    external_event_id, user_id, intent, status, visibility
  ) VALUES (
    p_external_event_id, v_user_id, p_intent, v_status, 'aggregate_only'
  )
  ON CONFLICT (external_event_id, user_id) DO UPDATE SET
    intent = EXCLUDED.intent,
    status = EXCLUDED.status,
    visibility = 'aggregate_only',
    updated_at = now();

  INSERT INTO public.external_event_social_intent_audits (
    external_event_id, user_id, previous_intent, new_intent,
    previous_status, new_status, idempotency_key
  ) VALUES (
    p_external_event_id, v_user_id, v_before.intent, p_intent,
    v_before.status, v_status, p_idempotency_key
  );

  RETURN QUERY SELECT p_intent, v_status, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_external_event_social_summary(p_external_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
  v_intent text;
  v_status text;
  v_enabled boolean := false;
BEGIN
  IF v_user_id IS NOT NULL THEN
    v_enabled := public.evaluate_feature_flag('external_social_intent', v_user_id, NULL);
    SELECT i.intent, i.status INTO v_intent, v_status
    FROM public.external_event_social_intents i
    WHERE i.external_event_id = p_external_event_id AND i.user_id = v_user_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.external_event_social_intents i
  JOIN public.profiles p ON p.user_id = i.user_id
  WHERE i.external_event_id = p_external_event_id
    AND i.status = 'active'
    AND i.intent = 'looking_for_company'
    AND p.user_origin = 'real'
    AND p.is_active = true;

  RETURN jsonb_build_object(
    'feature_enabled', v_enabled,
    'company_interest_count', CASE WHEN v_count >= 3 THEN v_count ELSE 0 END,
    'threshold_met', v_count >= 3,
    'my_intent', v_intent,
    'my_status', v_status,
    'privacy_mode', 'aggregate_only'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_discoverable_events_safe_page(date, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_external_events_safe_page(date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_external_event_social_intent(uuid, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_external_event_social_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_discoverable_events_safe_page(date, uuid, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_external_events_safe_page(date, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_external_event_social_intent(uuid, text, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_external_event_social_summary(uuid) TO anon, authenticated, service_role;

COMMIT;
