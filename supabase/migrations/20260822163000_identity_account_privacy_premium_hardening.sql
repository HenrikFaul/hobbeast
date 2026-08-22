-- Prompt 03 premium second pass: normalized first-event confidence, scoped
-- self-service data export and auditable deletion preparation.
-- Rollback: revoke the new RPCs, drop the two new confidence tables, and leave
-- the additive data_subject_requests columns in place until no client uses them.

CREATE TABLE IF NOT EXISTS public.profile_first_event_confidence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_event_formats text[] NOT NULL DEFAULT '{}'::text[],
  beginner_friendly boolean,
  solo_arrival_comfort text,
  preferred_group_size text,
  accessibility_needs text,
  communication_preference text,
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_first_event_formats_check CHECK (
    cardinality(preferred_event_formats) <= 5
    AND preferred_event_formats <@ ARRAY[
      'guided_beginner', 'small_group_intro', 'drop_in_social',
      'easy_outdoor', 'buddy_welcome'
    ]::text[]
  ),
  CONSTRAINT profile_first_event_solo_check CHECK (
    solo_arrival_comfort IS NULL
    OR solo_arrival_comfort IN ('prefer_buddy', 'comfortable')
  ),
  CONSTRAINT profile_first_event_group_check CHECK (
    preferred_group_size IS NULL
    OR preferred_group_size IN ('small', 'medium', 'large')
  ),
  CONSTRAINT profile_first_event_accessibility_check CHECK (
    accessibility_needs IS NULL OR char_length(accessibility_needs) <= 500
  ),
  CONSTRAINT profile_first_event_communication_check CHECK (
    communication_preference IS NULL
    OR communication_preference IN ('in_app', 'email', 'minimal')
  ),
  CONSTRAINT profile_first_event_visibility_check CHECK (
    visibility IN ('private', 'event_host_after_join')
  )
);

CREATE TABLE IF NOT EXISTS public.first_event_confidence_access_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accessed_fields text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS first_event_confidence_access_subject_time_idx
  ON public.first_event_confidence_access_audits (subject_user_id, created_at DESC);

ALTER TABLE public.profile_first_event_confidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_event_confidence_access_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own first-event confidence"
  ON public.profile_first_event_confidence;
CREATE POLICY "Users read own first-event confidence"
  ON public.profile_first_event_confidence
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own confidence access audit"
  ON public.first_event_confidence_access_audits;
CREATE POLICY "Users read own confidence access audit"
  ON public.first_event_confidence_access_audits
  FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.profile_first_event_confidence
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.first_event_confidence_access_audits
  FROM anon, authenticated;
GRANT SELECT ON public.profile_first_event_confidence
  TO authenticated;
GRANT SELECT ON public.first_event_confidence_access_audits
  TO authenticated;
GRANT SELECT ON public.user_session_devices, public.account_activity_events,
  public.data_subject_requests
  TO authenticated;

INSERT INTO public.profile_first_event_confidence (
  user_id,
  beginner_friendly,
  solo_arrival_comfort,
  preferred_group_size,
  accessibility_needs,
  communication_preference,
  visibility
)
SELECT
  profile.user_id,
  profile.beginner_friendly_preference,
  NULLIF(profile.solo_arrival_comfort, 'no_preference'),
  NULLIF(profile.preferred_group_size, 'no_preference'),
  NULLIF(btrim(profile.accessibility_needs), ''),
  profile.communication_preference,
  'private'
FROM public.profiles profile
WHERE profile.user_id IS NOT NULL
  AND (
    profile.beginner_friendly_preference IS NOT NULL
    OR profile.solo_arrival_comfort IS NOT NULL
    OR profile.preferred_group_size IS NOT NULL
    OR NULLIF(btrim(profile.accessibility_needs), '') IS NOT NULL
    OR profile.communication_preference IS NOT NULL
  )
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS update_profile_first_event_confidence_updated_at
  ON public.profile_first_event_confidence;
CREATE TRIGGER update_profile_first_event_confidence_updated_at
  BEFORE UPDATE ON public.profile_first_event_confidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_activity_events
  DROP CONSTRAINT IF EXISTS account_activity_events_event_type_check;
ALTER TABLE public.account_activity_events
  ADD CONSTRAINT account_activity_events_event_type_check CHECK (event_type IN (
    'sign_in', 'sign_out', 'password_reset', 'session_seen', 'new_device',
    'sessions_revoked', 'profile_privacy_changed',
    'first_event_confidence_changed', 'data_export_requested',
    'data_export_prepared', 'deletion_requested', 'data_request_cancelled'
  ));

CREATE OR REPLACE FUNCTION public.save_my_first_event_confidence(
  _payload jsonb,
  _clear boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_row public.profile_first_event_confidence%ROWTYPE;
  formats text[] := '{}'::text[];
  beginner_value boolean;
  solo_value text;
  group_value text;
  accessibility_value text;
  communication_value text;
  visibility_value text := 'private';
  changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
    OR octet_length(_payload::text) > 4096 THEN
    RAISE EXCEPTION 'Invalid first-event confidence payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_payload) key
    WHERE key NOT IN (
      'preferred_event_formats', 'beginner_friendly', 'solo_arrival_comfort',
      'preferred_group_size', 'accessibility_needs',
      'communication_preference', 'visibility'
    )
  ) THEN
    RAISE EXCEPTION 'Unsupported first-event confidence field' USING ERRCODE = '22023';
  END IF;

  IF _clear THEN
    DELETE FROM public.profile_first_event_confidence WHERE user_id = auth.uid();
    UPDATE public.profiles
    SET beginner_friendly_preference = NULL,
        solo_arrival_comfort = NULL,
        preferred_group_size = NULL,
        accessibility_needs = NULL,
        communication_preference = NULL,
        updated_at = now()
    WHERE user_id = auth.uid();
    INSERT INTO public.account_activity_events (user_id, event_type, metadata)
    VALUES (auth.uid(), 'first_event_confidence_changed', jsonb_build_object('action', 'cleared'));
    RETURN jsonb_build_object('status', 'cleared', 'idempotent_replay', false);
  END IF;

  IF _payload ? 'preferred_event_formats' THEN
    IF jsonb_typeof(_payload->'preferred_event_formats') <> 'array' THEN
      RAISE EXCEPTION 'Invalid preferred event formats' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT value ORDER BY value), '{}'::text[])
      INTO formats
    FROM jsonb_array_elements_text(_payload->'preferred_event_formats') value;
  END IF;
  IF cardinality(formats) > 5 OR NOT formats <@ ARRAY[
    'guided_beginner', 'small_group_intro', 'drop_in_social',
    'easy_outdoor', 'buddy_welcome'
  ]::text[] THEN
    RAISE EXCEPTION 'Unsupported preferred event format' USING ERRCODE = '22023';
  END IF;

  beginner_value := CASE
    WHEN jsonb_typeof(_payload->'beginner_friendly') = 'boolean'
      THEN (_payload->>'beginner_friendly')::boolean
    ELSE NULL
  END;
  solo_value := NULLIF(NULLIF(btrim(_payload->>'solo_arrival_comfort'), ''), 'no_preference');
  group_value := NULLIF(NULLIF(btrim(_payload->>'preferred_group_size'), ''), 'no_preference');
  accessibility_value := NULLIF(left(btrim(coalesce(_payload->>'accessibility_needs', '')), 500), '');
  communication_value := NULLIF(NULLIF(btrim(_payload->>'communication_preference'), ''), 'not_shared');
  visibility_value := coalesce(NULLIF(btrim(_payload->>'visibility'), ''), 'private');

  IF solo_value IS NOT NULL AND solo_value NOT IN ('prefer_buddy', 'comfortable')
    OR group_value IS NOT NULL AND group_value NOT IN ('small', 'medium', 'large')
    OR communication_value IS NOT NULL AND communication_value NOT IN ('in_app', 'email', 'minimal')
    OR visibility_value NOT IN ('private', 'event_host_after_join') THEN
    RAISE EXCEPTION 'Invalid first-event confidence value' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_row
  FROM public.profile_first_event_confidence
  WHERE user_id = auth.uid();

  changed := NOT FOUND
    OR current_row.preferred_event_formats IS DISTINCT FROM formats
    OR current_row.beginner_friendly IS DISTINCT FROM beginner_value
    OR current_row.solo_arrival_comfort IS DISTINCT FROM solo_value
    OR current_row.preferred_group_size IS DISTINCT FROM group_value
    OR current_row.accessibility_needs IS DISTINCT FROM accessibility_value
    OR current_row.communication_preference IS DISTINCT FROM communication_value
    OR current_row.visibility IS DISTINCT FROM visibility_value;

  IF NOT changed THEN
    RETURN jsonb_build_object('status', 'saved', 'idempotent_replay', true);
  END IF;

  INSERT INTO public.profile_first_event_confidence (
    user_id, preferred_event_formats, beginner_friendly,
    solo_arrival_comfort, preferred_group_size, accessibility_needs,
    communication_preference, visibility
  ) VALUES (
    auth.uid(), formats, beginner_value,
    solo_value, group_value, accessibility_value,
    communication_value, visibility_value
  )
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_event_formats = EXCLUDED.preferred_event_formats,
    beginner_friendly = EXCLUDED.beginner_friendly,
    solo_arrival_comfort = EXCLUDED.solo_arrival_comfort,
    preferred_group_size = EXCLUDED.preferred_group_size,
    accessibility_needs = EXCLUDED.accessibility_needs,
    communication_preference = EXCLUDED.communication_preference,
    visibility = EXCLUDED.visibility,
    updated_at = now();

  -- Preserve legacy readers while the normalized contract rolls out.
  UPDATE public.profiles
  SET beginner_friendly_preference = beginner_value,
      solo_arrival_comfort = solo_value,
      preferred_group_size = group_value,
      accessibility_needs = accessibility_value,
      communication_preference = communication_value,
      updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.account_activity_events (user_id, event_type, metadata)
  VALUES (
    auth.uid(), 'first_event_confidence_changed',
    jsonb_build_object('action', 'saved', 'visibility', visibility_value)
  );
  RETURN jsonb_build_object('status', 'saved', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_first_event_confidence()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'preferred_event_formats', confidence.preferred_event_formats,
        'beginner_friendly', confidence.beginner_friendly,
        'solo_arrival_comfort', confidence.solo_arrival_comfort,
        'preferred_group_size', confidence.preferred_group_size,
        'accessibility_needs', confidence.accessibility_needs,
        'communication_preference', confidence.communication_preference,
        'visibility', confidence.visibility,
        'updated_at', confidence.updated_at
      )
      FROM public.profile_first_event_confidence confidence
      WHERE confidence.user_id = auth.uid()
    ),
    jsonb_build_object(
      'preferred_event_formats', '[]'::jsonb,
      'beginner_friendly', NULL,
      'solo_arrival_comfort', NULL,
      'preferred_group_size', NULL,
      'accessibility_needs', NULL,
      'communication_preference', NULL,
      'visibility', 'private',
      'updated_at', NULL
    )
  )
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_event_first_confidence_cards(_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  preferred_event_formats text[],
  beginner_friendly boolean,
  solo_arrival_comfort text,
  preferred_group_size text,
  accessibility_needs text,
  communication_preference text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate record;
  shared_fields text[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.events event
    WHERE event.id = _event_id
      AND (event.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Event host access required' USING ERRCODE = '42501';
  END IF;

  FOR candidate IN
    SELECT
      confidence.user_id,
      profile.display_name,
      confidence.preferred_event_formats,
      confidence.beginner_friendly,
      confidence.solo_arrival_comfort,
      confidence.preferred_group_size,
      confidence.accessibility_needs,
      confidence.communication_preference
    FROM public.event_participants participant
    JOIN public.profile_first_event_confidence confidence
      ON confidence.user_id = participant.user_id
     AND confidence.visibility = 'event_host_after_join'
    JOIN public.profiles profile ON profile.user_id = participant.user_id
    WHERE participant.event_id = _event_id
      AND participant.status IN ('going', 'checked_in', 'completed')
      AND coalesce(profile.is_active, true)
      AND NOT public.is_blocked_between(auth.uid(), participant.user_id)
    ORDER BY participant.joined_at
  LOOP
    shared_fields := ARRAY[
      'preferred_event_formats', 'beginner_friendly', 'solo_arrival_comfort',
      'preferred_group_size', 'accessibility_needs', 'communication_preference'
    ];
    INSERT INTO public.first_event_confidence_access_audits (
      event_id, actor_user_id, subject_user_id, accessed_fields
    ) VALUES (_event_id, auth.uid(), candidate.user_id, shared_fields);

    user_id := candidate.user_id;
    display_name := candidate.display_name;
    preferred_event_formats := candidate.preferred_event_formats;
    beginner_friendly := candidate.beginner_friendly;
    solo_arrival_comfort := candidate.solo_arrival_comfort;
    preferred_group_size := candidate.preferred_group_size;
    accessibility_needs := candidate.accessibility_needs;
    communication_preference := candidate.communication_preference;
    RETURN NEXT;
  END LOOP;
END;
$$;

ALTER TABLE public.data_subject_requests
  ADD COLUMN IF NOT EXISTS export_scope text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS data_subject_requests_user_request_key_uidx
  ON public.data_subject_requests (user_id, request_key)
  WHERE request_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_subject_requests_export_scope_check'
  ) THEN
    ALTER TABLE public.data_subject_requests
      ADD CONSTRAINT data_subject_requests_export_scope_check CHECK (
        cardinality(export_scope) <= 5
        AND export_scope <@ ARRAY[
          'profile', 'preferences', 'events', 'social', 'account_activity'
        ]::text[]
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_data_subject_action_v2(
  _request_type text,
  _export_scope text[],
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.data_subject_requests%ROWTYPE;
  normalized_scope text[] := '{}'::text[];
  policy jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _request_type NOT IN ('export', 'deletion')
    OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid data-subject request' USING ERRCODE = '22023';
  END IF;

  IF _request_type = 'export' THEN
    SELECT coalesce(array_agg(DISTINCT scope ORDER BY scope), '{}'::text[])
      INTO normalized_scope
    FROM unnest(coalesce(_export_scope, '{}'::text[])) scope;
    IF cardinality(normalized_scope) = 0 THEN
      normalized_scope := ARRAY['profile', 'preferences', 'events', 'social', 'account_activity'];
    END IF;
    IF cardinality(normalized_scope) > 5 OR NOT normalized_scope <@ ARRAY[
      'profile', 'preferences', 'events', 'social', 'account_activity'
    ]::text[] THEN
      RAISE EXCEPTION 'Invalid export scope' USING ERRCODE = '22023';
    END IF;
    policy := jsonb_build_object(
      'format', 'json', 'expires_after_days', 7,
      'bounded_collections', true, 'schema_version', 1
    );
  ELSE
    policy := jsonb_build_object(
      'grace_period_days', 14,
      'profile', 'tombstone_or_delete',
      'attendance', 'anonymize_actor_keep_event_aggregate',
      'social', 'delete_or_anonymize_relationships',
      'moderation', 'retain_only_under_documented_legal_or_safety_hold',
      'auth_account', 'operator_service_role_required',
      'schema_version', 1
    );
  END IF;

  SELECT * INTO request_row
  FROM public.data_subject_requests request
  WHERE request.user_id = auth.uid()
    AND request.request_type = _request_type
    AND request.status IN ('requested', 'identity_verified', 'processing', 'ready', 'retention_hold')
  ORDER BY request.requested_at DESC
  LIMIT 1
  FOR UPDATE;

  -- A previously prepared bundle is intentionally short-lived. Finalize the
  -- stale request here so the owner can start a fresh export without operator
  -- intervention or weakening the one-open-request invariant.
  IF request_row.id IS NOT NULL
    AND _request_type = 'export'
    AND request_row.status = 'ready'
    AND request_row.export_expires_at IS NOT NULL
    AND request_row.export_expires_at <= now() THEN
    UPDATE public.data_subject_requests
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = request_row.id;
    request_row.id := NULL;
  END IF;

  IF request_row.id IS NOT NULL THEN
    IF request_row.request_key = _idempotency_key THEN
      RETURN jsonb_build_object(
        'request_id', request_row.id, 'status', request_row.status,
        'idempotent_replay', true,
        'grace_period_ends_at', request_row.grace_period_ends_at
      );
    END IF;
    IF request_row.status = 'requested' THEN
      UPDATE public.data_subject_requests
      SET export_scope = normalized_scope,
          request_key = _idempotency_key,
          policy_snapshot = policy,
          updated_at = now()
      WHERE id = request_row.id
      RETURNING * INTO request_row;
    END IF;
    RETURN jsonb_build_object(
      'request_id', request_row.id, 'status', request_row.status,
      'idempotent_replay', true,
      'grace_period_ends_at', request_row.grace_period_ends_at
    );
  END IF;

  INSERT INTO public.data_subject_requests (
    user_id, request_type, export_scope, request_key, policy_snapshot,
    grace_period_ends_at
  ) VALUES (
    auth.uid(), _request_type, normalized_scope, _idempotency_key, policy,
    CASE WHEN _request_type = 'deletion' THEN now() + interval '14 days' END
  ) RETURNING * INTO request_row;

  INSERT INTO public.account_activity_events (user_id, event_type, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN _request_type = 'export'
      THEN 'data_export_requested' ELSE 'deletion_requested' END,
    jsonb_build_object('request_id', request_row.id, 'scope', normalized_scope)
  );

  RETURN jsonb_build_object(
    'request_id', request_row.id, 'status', request_row.status,
    'idempotent_replay', false,
    'grace_period_ends_at', request_row.grace_period_ends_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_data_subject_action(_request_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  result := public.request_my_data_subject_action_v2(
    _request_type,
    CASE WHEN _request_type = 'export'
      THEN ARRAY['profile', 'preferences', 'events', 'social', 'account_activity']
      ELSE '{}'::text[] END,
    'legacy:' || _request_type || ':' || gen_random_uuid()::text
  );
  RETURN (result->>'request_id')::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_data_subject_action(_request_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cancelled_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _request_type NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unsupported data request' USING ERRCODE = '22023';
  END IF;
  UPDATE public.data_subject_requests
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE user_id = auth.uid()
    AND request_type = _request_type
    AND status IN ('requested', 'identity_verified');
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  IF cancelled_count > 0 THEN
    INSERT INTO public.account_activity_events (user_id, event_type, metadata)
    VALUES (
      auth.uid(), 'data_request_cancelled',
      jsonb_build_object('request_type', _request_type)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_my_data_export(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.data_subject_requests%ROWTYPE;
  scope text[];
  payload jsonb;
  profile_payload jsonb := NULL;
  preference_payload jsonb := NULL;
  event_payload jsonb := NULL;
  social_payload jsonb := NULL;
  activity_payload jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO request_row
  FROM public.data_subject_requests request
  WHERE request.id = _request_id
    AND request.user_id = auth.uid()
    AND request.request_type = 'export'
  FOR UPDATE;
  IF NOT FOUND OR request_row.status NOT IN ('requested', 'identity_verified', 'ready') THEN
    RAISE EXCEPTION 'Export request is unavailable' USING ERRCODE = '42501';
  END IF;
  IF request_row.status = 'ready'
    AND request_row.export_expires_at IS NOT NULL
    AND request_row.export_expires_at <= now() THEN
    RAISE EXCEPTION 'Export request has expired' USING ERRCODE = '42501';
  END IF;
  scope := CASE WHEN cardinality(request_row.export_scope) = 0
    THEN ARRAY['profile', 'preferences', 'events', 'social', 'account_activity']
    ELSE request_row.export_scope END;

  IF 'profile' = ANY(scope) THEN
    SELECT jsonb_build_object(
      'display_name', profile.display_name,
      'avatar_url', profile.avatar_url,
      'bio', profile.bio,
      'city', profile.city,
      'address', profile.address,
      'hobbies', profile.hobbies,
      'profile_visibility', profile.profile_visibility,
      'interests_visibility', profile.interests_visibility,
      'location_precision', profile.location_precision,
      'onboarding_completed_at', profile.onboarding_completed_at,
      'created_at', profile.created_at
    ) INTO profile_payload
    FROM public.profiles profile WHERE profile.user_id = auth.uid();
  END IF;

  IF 'preferences' = ANY(scope) THEN
    SELECT jsonb_build_object(
      'hobbies', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'activity_id', preference.activity_id,
          'interest_level', preference.interest_level,
          'experience_level', preference.experience_level,
          'preferred_modes', preference.preferred_modes,
          'visibility', preference.visibility,
          'updated_at', preference.updated_at
        ) ORDER BY preference.updated_at)
        FROM public.profile_hobby_preferences preference
        WHERE preference.user_id = auth.uid()
      ), '[]'::jsonb),
      'first_event_confidence', (
        SELECT to_jsonb(confidence) - 'user_id'
        FROM public.profile_first_event_confidence confidence
        WHERE confidence.user_id = auth.uid()
      )
    ) INTO preference_payload;
  END IF;

  IF 'events' = ANY(scope) THEN
    SELECT coalesce(jsonb_agg(row_payload ORDER BY joined_at DESC), '[]'::jsonb)
      INTO event_payload
    FROM (
      SELECT
        participant.joined_at,
        jsonb_build_object(
          'event_id', participant.event_id,
          'event_title', event.title,
          'status', participant.status,
          'joined_at', participant.joined_at,
          'checked_in_at', participant.checked_in_at,
          'completed_at', participant.completed_at
        ) AS row_payload
      FROM public.event_participants participant
      JOIN public.events event ON event.id = participant.event_id
      WHERE participant.user_id = auth.uid()
      ORDER BY participant.joined_at DESC
      LIMIT 1000
    ) bounded_events;
  END IF;

  IF 'social' = ANY(scope) THEN
    SELECT jsonb_build_object(
      'connection_count', (
        SELECT count(*) FROM public.connections connection
        WHERE auth.uid() IN (connection.user_low_id, connection.user_high_id)
      ),
      'circle_memberships', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'circle_id', member.circle_id,
          'role', member.role,
          'membership_status', member.membership_status,
          'joined_at', member.joined_at,
          'left_at', member.left_at
        ) ORDER BY member.created_at DESC)
        FROM (
          SELECT * FROM public.social_circle_members
          WHERE user_id = auth.uid()
          ORDER BY created_at DESC LIMIT 500
        ) member
      ), '[]'::jsonb),
      'hub_memberships', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'hub_id', member.hub_id,
          'membership_status', member.membership_status,
          'join_source', member.join_source,
          'joined_at', member.joined_at,
          'left_at', member.left_at
        ) ORDER BY member.updated_at DESC)
        FROM (
          SELECT * FROM public.virtual_hub_members
          WHERE user_id = auth.uid()
          ORDER BY updated_at DESC LIMIT 500
        ) member
      ), '[]'::jsonb)
    ) INTO social_payload;
  END IF;

  IF 'account_activity' = ANY(scope) THEN
    SELECT jsonb_build_object(
      'recent_activity', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'event_type', activity.event_type,
          'device_label', activity.device_label,
          'created_at', activity.created_at
        ) ORDER BY activity.created_at DESC)
        FROM (
          SELECT * FROM public.account_activity_events
          WHERE user_id = auth.uid()
          ORDER BY created_at DESC LIMIT 500
        ) activity
      ), '[]'::jsonb),
      'devices', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'device_label', device.device_label,
          'user_agent_family', device.user_agent_family,
          'first_seen_at', device.first_seen_at,
          'last_seen_at', device.last_seen_at,
          'revoked_at', device.revoked_at
        ) ORDER BY device.last_seen_at DESC)
        FROM public.user_session_devices device
        WHERE device.user_id = auth.uid()
      ), '[]'::jsonb)
    ) INTO activity_payload;
  END IF;

  payload := jsonb_strip_nulls(jsonb_build_object(
    'manifest', jsonb_build_object(
      'schema_version', 1,
      'request_id', request_row.id,
      'generated_at', now(),
      'scope', scope,
      'bounded_collection_limits', jsonb_build_object(
        'event_participations', 1000,
        'circle_memberships', 500,
        'hub_memberships', 500,
        'account_activity', 500
      )
    ),
    'profile', profile_payload,
    'preferences', preference_payload,
    'events', event_payload,
    'social', social_payload,
    'account_activity', activity_payload
  ));

  UPDATE public.data_subject_requests
  SET status = 'ready',
      prepared_at = coalesce(prepared_at, now()),
      export_expires_at = coalesce(export_expires_at, now() + interval '7 days'),
      updated_at = now()
  WHERE id = request_row.id;

  INSERT INTO public.account_activity_events (user_id, event_type, metadata)
  VALUES (
    auth.uid(), 'data_export_prepared',
    jsonb_build_object('request_id', request_row.id, 'scope', scope)
  );
  RETURN payload;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_first_event_confidence(jsonb, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_first_event_confidence()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_first_confidence_cards(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_my_data_subject_action_v2(text, text[], text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_my_data_subject_action(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_my_data_subject_action(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_my_data_export(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_my_first_event_confidence(jsonb, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_first_event_confidence()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_first_confidence_cards(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_data_subject_action_v2(text, text[], text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_data_subject_action(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_data_subject_action(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_my_data_export(uuid)
  TO authenticated;

COMMENT ON TABLE public.profile_first_event_confidence IS
  'Optional, owner-controlled first-attendance preferences. Private by default; explicit event_host_after_join consent is required for host access.';
COMMENT ON FUNCTION public.prepare_my_data_export(uuid) IS
  'Builds a bounded, allowlisted JSON export for the authenticated owner. It never exposes another user profile or raw session fingerprint.';
COMMENT ON COLUMN public.data_subject_requests.policy_snapshot IS
  'Versioned execution contract captured when an export/deletion request is created; no legal/safety hold is inferred automatically.';
