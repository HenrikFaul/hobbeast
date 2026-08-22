-- P1 follow-up for Prompts 12-15: capability-scoped, allowlisted admin profile
-- reads and reasoned profile mutations. This migration is append-only and is
-- not evidence that any hosted database has been changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_list_user_profiles(
  _actor_id uuid,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  city text,
  district text,
  hobbies text[],
  created_at timestamptz,
  updated_at timestamptz,
  avatar_url text,
  bio text,
  gender text,
  age_band text,
  preferred_radius_km integer,
  user_origin text,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     OR NOT public.admin_has_capability(_actor_id, 'users.manage_profile') THEN
    RAISE EXCEPTION 'Capability required' USING ERRCODE = '42501';
  END IF;
  IF _limit NOT BETWEEN 1 AND 2000 OR _offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Invalid page boundary' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    NULLIF(btrim(p.display_name), ''),
    p.city,
    p.district,
    coalesce(p.hobbies, '{}'::text[]),
    p.created_at,
    p.updated_at,
    p.avatar_url,
    p.bio,
    p.gender,
    CASE
      WHEN p.date_of_birth IS NULL OR p.date_of_birth > current_date THEN NULL
      ELSE (
        (floor(extract(year FROM age(current_date, p.date_of_birth)) / 5) * 5)::integer::text
        || '-'
        || ((floor(extract(year FROM age(current_date, p.date_of_birth)) / 5) * 5) + 4)::integer::text
      )
    END,
    p.preferred_radius_km,
    p.user_origin,
    coalesce(p.is_active, true)
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
  ORDER BY p.created_at DESC, p.id
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_profiles(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_profiles(uuid, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_list_user_profiles(uuid, integer, integer) IS
  'Service-only allowlisted admin profile directory. Excludes email, phone, exact birth date, address, coordinates, consent and moderation metadata.';

CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  _actor_id uuid,
  _target_user_id uuid,
  _gender text,
  _is_active boolean,
  _bio text,
  _hobbies text[],
  _event_ids uuid[],
  _reason text,
  _request_id text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_active boolean;
  normalized_hobbies text[];
  normalized_event_ids uuid[];
  participation_count integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     OR NOT public.admin_has_capability(_actor_id, 'users.manage_profile') THEN
    RAISE EXCEPTION 'Capability required' USING ERRCODE = '42501';
  END IF;
  IF _target_user_id IS NULL
     OR char_length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 1000
     OR char_length(btrim(coalesce(_request_id, ''))) NOT BETWEEN 8 AND 200
     OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 240 THEN
    RAISE EXCEPTION 'Invalid profile mutation request' USING ERRCODE = '22023';
  END IF;
  IF _gender IS NOT NULL
     AND _gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    RAISE EXCEPTION 'Invalid gender value' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(_bio, '')) > 500
     OR cardinality(coalesce(_hobbies, '{}'::text[])) > 100
     OR cardinality(coalesce(_event_ids, '{}'::uuid[])) > 500 THEN
    RAISE EXCEPTION 'Profile mutation exceeds safe bounds' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(_hobbies, '{}'::text[])) AS hobby
    WHERE char_length(btrim(hobby)) NOT BETWEEN 1 AND 80
  ) THEN
    RAISE EXCEPTION 'Invalid hobby value' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE idempotency_key = _idempotency_key
      AND actor_id = _actor_id
      AND action = 'users.profile.update'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin-profile:' || _target_user_id::text, 0));
  SELECT coalesce(p.is_active, true)
  INTO current_active
  FROM public.profiles p
  WHERE p.user_id = _target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF _is_active IS NOT NULL
     AND _is_active IS DISTINCT FROM current_active
     AND NOT public.admin_has_capability(_actor_id, 'users.suspend') THEN
    RAISE EXCEPTION 'Suspend capability required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(value ORDER BY value), '{}'::text[])
  INTO normalized_hobbies
  FROM (
    SELECT DISTINCT btrim(hobby) AS value
    FROM unnest(coalesce(_hobbies, '{}'::text[])) AS hobby
  ) values_to_keep;

  SELECT coalesce(array_agg(value ORDER BY value), '{}'::uuid[])
  INTO normalized_event_ids
  FROM (
    SELECT DISTINCT event_id AS value
    FROM unnest(coalesce(_event_ids, '{}'::uuid[])) AS event_id
  ) values_to_keep;

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_event_ids) requested(event_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = requested.event_id
        AND coalesce(e.is_active, false)
        AND coalesce(e.outcome_status, 'scheduled') NOT IN ('started', 'completed', 'held', 'cancelled', 'archived')
    )
  ) THEN
    RAISE EXCEPTION 'Requested event is unavailable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    gender = _gender,
    is_active = coalesce(_is_active, current_active),
    bio = NULLIF(btrim(coalesce(_bio, '')), ''),
    hobbies = normalized_hobbies,
    updated_at = now()
  WHERE user_id = _target_user_id;

  -- Historical attendance evidence is immutable. Only mutable registrations
  -- may be removed from the admin-maintained selection.
  DELETE FROM public.event_participants ep
  WHERE ep.user_id = _target_user_id
    AND coalesce(ep.status, 'going') IN ('interested', 'going', 'waitlist', 'cancelled')
    AND NOT (ep.event_id = ANY(normalized_event_ids));

  INSERT INTO public.event_participants (event_id, user_id, status, participation_type)
  SELECT e.id, _target_user_id, 'going', 'admin_manual'
  FROM public.events e
  WHERE e.id = ANY(normalized_event_ids)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  SELECT count(*)::integer
  INTO participation_count
  FROM public.event_participants ep
  WHERE ep.user_id = _target_user_id;

  PERFORM public.admin_record_audit_event(
    _actor_id,
    'users.manage_profile',
    'users.profile.update',
    'user',
    _target_user_id::text,
    _reason,
    _request_id,
    _idempotency_key,
    'succeeded',
    jsonb_build_object(
      'active_changed', _is_active IS NOT NULL AND _is_active IS DISTINCT FROM current_active,
      'hobby_count', cardinality(normalized_hobbies),
      'participation_count', participation_count
    ),
    jsonb_build_object('is_active', current_active),
    jsonb_build_object('is_active', coalesce(_is_active, current_active)),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'replayed', false,
    'participation_count', participation_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid, uuid, text, boolean, text, text[], uuid[], text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, uuid, text, boolean, text, text[], uuid[], text, text, text)
  TO service_role;

-- The legacy functions have no reason/idempotency contract and therefore no
-- longer remain client-callable after the audited replacement exists.
REVOKE ALL ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
