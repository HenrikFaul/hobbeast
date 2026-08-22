-- Prompt 03 completion: resumable optional onboarding plus atomic legacy/canonical
-- preference dual-write. Expand-contract only; profiles.hobbies remains supported.

ALTER TABLE public.profile_hobby_preferences
  ADD COLUMN IF NOT EXISTS sync_source text NOT NULL DEFAULT 'legacy_profile',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_hobby_preferences_sync_source_check'
  ) THEN
    ALTER TABLE public.profile_hobby_preferences
      ADD CONSTRAINT profile_hobby_preferences_sync_source_check
      CHECK (sync_source IN ('legacy_profile', 'onboarding', 'profile_editor'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS profile_hobby_preferences_user_source_idx
  ON public.profile_hobby_preferences (user_id, sync_source, updated_at DESC);

CREATE OR REPLACE FUNCTION public.sync_profile_hobbies_to_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profile_hobby_preferences (
    user_id,
    activity_id,
    interest_level,
    visibility,
    sync_source,
    last_synced_at
  )
  SELECT DISTINCT
    NEW.user_id,
    a.id,
    'interested',
    CASE
      WHEN NEW.interests_visibility IN ('private', 'members', 'public')
        THEN NEW.interests_visibility
      ELSE 'members'
    END,
    'legacy_profile',
    now()
  FROM unnest(coalesce(NEW.hobbies, '{}'::text[])) selected_hobby
  JOIN public.hobby_activities a
    ON lower(btrim(a.name)) = lower(btrim(selected_hobby))
    OR lower(btrim(a.slug)) = lower(regexp_replace(btrim(selected_hobby), '\s+', '-', 'g'))
  WHERE btrim(selected_hobby) <> ''
  ON CONFLICT (user_id, activity_id)
  DO UPDATE SET
    visibility = EXCLUDED.visibility,
    last_synced_at = now(),
    updated_at = now();

  DELETE FROM public.profile_hobby_preferences pref
  WHERE pref.user_id = NEW.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(NEW.hobbies, '{}'::text[])) selected_hobby
      JOIN public.hobby_activities a
        ON lower(btrim(a.name)) = lower(btrim(selected_hobby))
        OR lower(btrim(a.slug)) = lower(regexp_replace(btrim(selected_hobby), '\s+', '-', 'g'))
      WHERE a.id = pref.activity_id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_hobby_preferences ON public.profiles;
CREATE TRIGGER profiles_sync_hobby_preferences
  AFTER INSERT OR UPDATE OF hobbies, interests_visibility
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_hobbies_to_preferences();

CREATE OR REPLACE FUNCTION public.save_my_onboarding_progress(
  _payload jsonb,
  _step smallint,
  _complete boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed_keys constant text[] := ARRAY[
    'display_name', 'avatar_url', 'city', 'hobbies', 'activity_modes',
    'availability_window', 'normalized_preferences', 'beginner_friendly',
    'solo_arrival_comfort', 'preferred_group_size', 'accessibility_needs',
    'communication_preference', 'profile_visibility', 'interests_visibility',
    'privacy_accepted', 'notification_consent'
  ];
  invalid_key text;
  selected_hobbies text[] := '{}'::text[];
  activity_modes text[] := '{}'::text[];
  availability jsonb := '{}'::jsonb;
  preference_item jsonb;
  preference_activity_id uuid;
  preference_experience text;
  normalized_count integer := 0;
  profile_changed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' OR pg_column_size(_payload) > 32768 THEN
    RAISE EXCEPTION 'Invalid onboarding payload' USING ERRCODE = '22023';
  END IF;
  IF _step NOT BETWEEN 0 AND 5 THEN
    RAISE EXCEPTION 'Invalid onboarding step' USING ERRCODE = '22023';
  END IF;

  SELECT key INTO invalid_key
  FROM jsonb_object_keys(_payload) AS key
  WHERE NOT (key = ANY (allowed_keys))
  LIMIT 1;
  IF invalid_key IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported onboarding field' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_payload->>'display_name', ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Display name must contain 2-80 characters' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(_payload->>'city', '')) > 120
    OR length(coalesce(_payload->>'avatar_url', '')) > 2048
    OR length(coalesce(_payload->>'accessibility_needs', '')) > 500 THEN
    RAISE EXCEPTION 'Onboarding text field is too long' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(_payload->>'avatar_url', '')), '') IS NOT NULL
    AND (_payload->>'avatar_url') !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Avatar URL must use HTTPS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(coalesce(_payload->'hobbies', '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(_payload->'hobbies', '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Choose at most 10 interests' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT btrim(value)), '{}'::text[])
  INTO selected_hobbies
  FROM jsonb_array_elements_text(coalesce(_payload->'hobbies', '[]'::jsonb)) item(value)
  WHERE btrim(value) <> '' AND length(btrim(value)) <= 120;
  IF cardinality(selected_hobbies) <> jsonb_array_length(coalesce(_payload->'hobbies', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'Invalid interest label' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(coalesce(_payload->'activity_modes', '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(_payload->'activity_modes', '[]'::jsonb)) > 4 THEN
    RAISE EXCEPTION 'Invalid activity modes' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value), '{}'::text[])
  INTO activity_modes
  FROM jsonb_array_elements_text(coalesce(_payload->'activity_modes', '[]'::jsonb)) item(value)
  WHERE value IN (
    'one_to_one', 'small_group', 'larger_group', 'online',
    'in_person', 'outdoor', 'indoor'
  );
  IF cardinality(activity_modes) <> jsonb_array_length(coalesce(_payload->'activity_modes', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'Unsupported activity mode' USING ERRCODE = '22023';
  END IF;

  availability := coalesce(_payload->'availability_window', '{}'::jsonb);
  IF jsonb_typeof(availability) <> 'object' OR pg_column_size(availability) > 4096 THEN
    RAISE EXCEPTION 'Invalid availability window' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(availability) key
    WHERE key NOT IN ('days', 'from', 'to')
  ) THEN
    RAISE EXCEPTION 'Unsupported availability field' USING ERRCODE = '22023';
  END IF;
  IF availability ? 'days' THEN
    IF jsonb_typeof(availability->'days') <> 'array'
      OR jsonb_array_length(availability->'days') > 7 THEN
      RAISE EXCEPTION 'Invalid availability days' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(availability->'days') item(value)
      WHERE value NOT IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
    ) OR (
      SELECT count(*) FROM jsonb_array_elements_text(availability->'days')
    ) <> (
      SELECT count(DISTINCT value) FROM jsonb_array_elements_text(availability->'days') item(value)
    ) THEN
      RAISE EXCEPTION 'Invalid availability days' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF (availability ? 'from' AND coalesce(availability->>'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    OR (availability ? 'to' AND coalesce(availability->>'to', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'Invalid availability time' USING ERRCODE = '22023';
  END IF;
  IF (_payload ? 'normalized_preferences')
    AND jsonb_typeof(_payload->'normalized_preferences') <> 'array' THEN
    RAISE EXCEPTION 'Invalid normalized preferences' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(_payload->'normalized_preferences', '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Too many normalized preferences' USING ERRCODE = '22023';
  END IF;

  IF (_payload->>'solo_arrival_comfort') IS NOT NULL
    AND (_payload->>'solo_arrival_comfort') NOT IN ('prefer_buddy', 'comfortable', 'no_preference') THEN
    RAISE EXCEPTION 'Invalid solo arrival preference' USING ERRCODE = '22023';
  END IF;
  IF (_payload->>'preferred_group_size') IS NOT NULL
    AND (_payload->>'preferred_group_size') NOT IN ('small', 'medium', 'large', 'no_preference') THEN
    RAISE EXCEPTION 'Invalid group size preference' USING ERRCODE = '22023';
  END IF;
  IF (_payload->>'communication_preference') IS NOT NULL
    AND (_payload->>'communication_preference') NOT IN ('in_app', 'email', 'minimal') THEN
    RAISE EXCEPTION 'Invalid communication preference' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payload->>'profile_visibility', 'members') NOT IN ('private', 'members', 'public')
    OR coalesce(_payload->>'interests_visibility', 'members') NOT IN ('private', 'members', 'public') THEN
    RAISE EXCEPTION 'Invalid visibility setting' USING ERRCODE = '22023';
  END IF;
  IF _complete AND NOT coalesce((_payload->>'privacy_accepted')::boolean, false) THEN
    RAISE EXCEPTION 'Privacy consent is required to complete onboarding' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET display_name = btrim(_payload->>'display_name'),
      avatar_url = nullif(btrim(coalesce(_payload->>'avatar_url', '')), ''),
      city = nullif(btrim(coalesce(_payload->>'city', '')), ''),
      hobbies = selected_hobbies,
      preferred_activity_modes = activity_modes,
      availability_window = availability,
      beginner_friendly_preference = CASE
        WHEN _payload ? 'beginner_friendly' THEN (_payload->>'beginner_friendly')::boolean
        ELSE NULL
      END,
      solo_arrival_comfort = nullif(_payload->>'solo_arrival_comfort', ''),
      preferred_group_size = nullif(_payload->>'preferred_group_size', ''),
      accessibility_needs = nullif(btrim(coalesce(_payload->>'accessibility_needs', '')), ''),
      communication_preference = nullif(_payload->>'communication_preference', ''),
      profile_visibility = coalesce(nullif(_payload->>'profile_visibility', ''), 'members'),
      interests_visibility = coalesce(nullif(_payload->>'interests_visibility', ''), 'members'),
      location_precision = CASE
        WHEN nullif(btrim(coalesce(_payload->>'city', '')), '') IS NULL THEN 'hidden'
        ELSE 'city'
      END,
      onboarding_step = _step,
      onboarding_completed_at = CASE
        WHEN _complete THEN coalesce(onboarding_completed_at, now())
        ELSE onboarding_completed_at
      END,
      privacy_consent_at = CASE
        WHEN coalesce((_payload->>'privacy_accepted')::boolean, false)
          THEN coalesce(privacy_consent_at, now())
        ELSE privacy_consent_at
      END,
      notification_consent_at = CASE
        WHEN coalesce((_payload->>'notification_consent')::boolean, false)
          THEN coalesce(notification_consent_at, now())
        ELSE notification_consent_at
      END,
      updated_at = now()
  WHERE user_id = auth.uid();
  GET DIAGNOSTICS profile_changed = ROW_COUNT;
  IF profile_changed <> 1 THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  FOR preference_item IN
    SELECT value FROM jsonb_array_elements(coalesce(_payload->'normalized_preferences', '[]'::jsonb))
  LOOP
    IF jsonb_typeof(preference_item) <> 'object'
      OR coalesce(preference_item->>'activity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid canonical activity preference' USING ERRCODE = '22023';
    END IF;
    preference_activity_id := (preference_item->>'activity_id')::uuid;
    preference_experience := nullif(preference_item->>'experience_level', '');
    IF preference_experience IS NOT NULL
      AND preference_experience NOT IN ('new', 'beginner', 'intermediate', 'advanced') THEN
      RAISE EXCEPTION 'Invalid experience level' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.hobby_activities a
      WHERE a.id = preference_activity_id
        AND EXISTS (
          SELECT 1 FROM unnest(selected_hobbies) selected_hobby
          WHERE lower(btrim(selected_hobby)) IN (
            lower(btrim(a.name)),
            lower(btrim(a.slug)),
            lower(regexp_replace(btrim(a.name), '\s+', '-', 'g'))
          )
        )
    ) THEN
      RAISE EXCEPTION 'Canonical activity does not match a selected interest' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.profile_hobby_preferences (
      user_id, activity_id, interest_level, experience_level, preferred_modes,
      visibility, sync_source, last_synced_at
    ) VALUES (
      auth.uid(), preference_activity_id, 'interested', preference_experience,
      activity_modes, coalesce(nullif(_payload->>'interests_visibility', ''), 'members'),
      'onboarding', now()
    )
    ON CONFLICT (user_id, activity_id)
    DO UPDATE SET
      experience_level = EXCLUDED.experience_level,
      preferred_modes = EXCLUDED.preferred_modes,
      visibility = EXCLUDED.visibility,
      sync_source = 'onboarding',
      last_synced_at = now(),
      updated_at = now();
    normalized_count := normalized_count + 1;
  END LOOP;

  DELETE FROM public.profile_hobby_preferences pref
  WHERE pref.user_id = auth.uid()
    AND pref.sync_source = 'onboarding'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(_payload->'normalized_preferences', '[]'::jsonb)) item
      WHERE item->>'activity_id' = pref.activity_id::text
    );

  RETURN jsonb_build_object(
    'step', _step,
    'completed', _complete,
    'normalized_preference_count', normalized_count,
    'legacy_interest_count', cardinality(selected_hobbies)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_preferences()
RETURNS TABLE (
  activity_id uuid,
  activity_name text,
  experience_level text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT preference.activity_id, activity.name, preference.experience_level
  FROM public.profile_hobby_preferences preference
  JOIN public.hobby_activities activity ON activity.id = preference.activity_id
  WHERE preference.user_id = auth.uid()
  ORDER BY activity.name;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_hobbies_to_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_my_onboarding_progress(jsonb, smallint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_onboarding_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_progress(jsonb, smallint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_preferences() TO authenticated;

COMMENT ON FUNCTION public.save_my_onboarding_progress(jsonb, smallint, boolean) IS
  'Atomic, resumable onboarding save. Keeps profiles.hobbies for compatibility and canonical profile_hobby_preferences in sync.';
