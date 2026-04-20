-- Admin-controlled member profile editing and event participation sync.
-- Uses SECURITY DEFINER RPCs so the admin UI can persist controlled profile fields
-- even if the edge function deploy lags behind the frontend merge.

CREATE OR REPLACE FUNCTION public.admin_update_member_profile(
  _target_user_id uuid,
  _gender text,
  _is_active boolean,
  _bio text,
  _hobbies text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user id is required';
  END IF;

  IF _gender IS NOT NULL AND _gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    RAISE EXCEPTION 'invalid gender value';
  END IF;

  UPDATE public.profiles
  SET
    gender = _gender,
    is_active = COALESCE(_is_active, true),
    bio = CASE WHEN _bio IS NULL OR btrim(_bio) = '' THEN NULL ELSE left(btrim(_bio), 500) END,
    hobbies = COALESCE(_hobbies, '{}'::text[]),
    updated_at = now()
  WHERE user_id = _target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_member_event_participations(
  _target_user_id uuid,
  _event_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user id is required';
  END IF;

  DELETE FROM public.event_participants ep
  WHERE ep.user_id = _target_user_id
    AND (
      COALESCE(array_length(_event_ids, 1), 0) = 0
      OR NOT (ep.event_id = ANY(_event_ids))
    );

  IF COALESCE(array_length(_event_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.event_participants (event_id, user_id, status, participation_type)
  SELECT e.id, _target_user_id, 'going', 'admin_manual'
  FROM public.events e
  WHERE e.id = ANY(_event_ids)
    AND e.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.event_participants ep
      WHERE ep.event_id = e.id
        AND ep.user_id = _target_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) TO authenticated;
