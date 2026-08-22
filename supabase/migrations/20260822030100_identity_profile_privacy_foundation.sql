-- Prompt 03 + Premium Addendum: progressive onboarding, private-by-default
-- profile controls, safe public DTOs, account activity, block/report and DSR flows.
-- Expand-contract only: no legacy profile column is removed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS interests_visibility text NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS preferred_activity_modes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS availability_window jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS beginner_friendly_preference boolean,
  ADD COLUMN IF NOT EXISTS solo_arrival_comfort text,
  ADD COLUMN IF NOT EXISTS preferred_group_size text,
  ADD COLUMN IF NOT EXISTS accessibility_needs text,
  ADD COLUMN IF NOT EXISTS communication_preference text,
  ADD COLUMN IF NOT EXISTS location_precision text NOT NULL DEFAULT 'city',
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_consent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_onboarding_step_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_step_check CHECK (onboarding_step BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_visibility_check CHECK (profile_visibility IN ('private', 'members', 'public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_interests_visibility_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_interests_visibility_check CHECK (interests_visibility IN ('private', 'members', 'public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_location_precision_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_precision_check CHECK (location_precision IN ('hidden', 'city', 'event_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_solo_arrival_comfort_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_solo_arrival_comfort_check
      CHECK (solo_arrival_comfort IS NULL OR solo_arrival_comfort IN ('prefer_buddy', 'comfortable', 'no_preference'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_group_size_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_group_size_check
      CHECK (preferred_group_size IS NULL OR preferred_group_size IN ('small', 'medium', 'large', 'no_preference'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profile_hobby_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.hobby_activities(id) ON DELETE CASCADE,
  interest_level text NOT NULL DEFAULT 'interested'
    CHECK (interest_level IN ('curious', 'interested', 'core')),
  experience_level text
    CHECK (experience_level IS NULL OR experience_level IN ('new', 'beginner', 'intermediate', 'advanced')),
  preferred_modes text[] NOT NULL DEFAULT '{}'::text[],
  visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('private', 'members', 'public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);

-- Best-effort expand-contract backfill. Legacy labels that do not map to a
-- canonical activity remain in profiles.hobbies until a later reviewed mapping.
INSERT INTO public.profile_hobby_preferences (user_id, activity_id, interest_level, visibility)
SELECT DISTINCT p.user_id, a.id, 'interested', 'members'
FROM public.profiles p
CROSS JOIN LATERAL unnest(coalesce(p.hobbies, '{}'::text[])) legacy_hobby
JOIN public.hobby_activities a
  ON lower(btrim(a.name)) = lower(btrim(legacy_hobby))
  OR lower(btrim(a.slug)) = lower(regexp_replace(btrim(legacy_hobby), '\s+', '-', 'g'))
WHERE p.user_id IS NOT NULL AND btrim(legacy_hobby) <> ''
ON CONFLICT (user_id, activity_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context_type text NOT NULL DEFAULT 'profile'
    CHECK (context_type IN ('profile', 'event', 'circle', 'hub', 'message', 'other')),
  context_id uuid,
  category text NOT NULL
    CHECK (category IN ('harassment', 'spam', 'unsafe_behavior', 'impersonation', 'privacy', 'other')),
  details text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'triaged', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reported_user_id IS NULL OR reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS user_reports_queue_idx ON public.user_reports (status, created_at);
CREATE INDEX IF NOT EXISTS user_reports_reporter_rate_idx ON public.user_reports (reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_type text NOT NULL CHECK (request_type IN ('export', 'deletion')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'identity_verified', 'processing', 'ready', 'completed', 'cancelled', 'retention_hold')),
  grace_period_ends_at timestamptz,
  export_expires_at timestamptz,
  retention_exception_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS data_subject_requests_one_open_kind_idx
  ON public.data_subject_requests (user_id, request_type)
  WHERE status IN ('requested', 'identity_verified', 'processing', 'ready', 'retention_hold');

CREATE TABLE IF NOT EXISTS public.user_session_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_fingerprint text NOT NULL,
  device_label text NOT NULL DEFAULT 'Unknown device',
  user_agent_family text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, session_fingerprint)
);

CREATE TABLE IF NOT EXISTS public.account_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('sign_in', 'sign_out', 'password_reset', 'session_seen', 'sessions_revoked', 'profile_privacy_changed')),
  device_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_activity_user_time_idx
  ON public.account_activity_events (user_id, created_at DESC);

ALTER TABLE public.profile_hobby_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_session_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view profiles" ON public.profiles;
CREATE POLICY "Admins can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own hobby preferences" ON public.profile_hobby_preferences;
CREATE POLICY "Users manage own hobby preferences" ON public.profile_hobby_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own blocks" ON public.user_blocks;
CREATE POLICY "Users view own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "Users create own blocks" ON public.user_blocks;
CREATE POLICY "Users create own blocks" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "Users update own blocks" ON public.user_blocks;
CREATE POLICY "Users update own blocks" ON public.user_blocks
  FOR UPDATE TO authenticated USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "Users delete own blocks" ON public.user_blocks;
CREATE POLICY "Users delete own blocks" ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Reporters view own reports" ON public.user_reports;
CREATE POLICY "Reporters view own reports" ON public.user_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Admins manage reports" ON public.user_reports;
CREATE POLICY "Admins manage reports" ON public.user_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own data requests" ON public.data_subject_requests;
CREATE POLICY "Users view own data requests" ON public.data_subject_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins manage data requests" ON public.data_subject_requests;
CREATE POLICY "Admins manage data requests" ON public.data_subject_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own session devices" ON public.user_session_devices;
CREATE POLICY "Users view own session devices" ON public.user_session_devices
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own session devices" ON public.user_session_devices;
CREATE POLICY "Users update own session devices" ON public.user_session_devices
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own account activity" ON public.account_activity_events;
CREATE POLICY "Users view own account activity" ON public.account_activity_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.public_profile_cards
WITH (security_barrier = true)
AS
SELECT
  p.id AS profile_id,
  p.user_id,
  NULLIF(btrim(p.display_name), '') AS display_name,
  p.avatar_url,
  p.bio,
  CASE WHEN p.location_precision = 'city' THEN p.city ELSE NULL END AS city,
  CASE
    WHEN p.interests_visibility = 'public' THEN p.hobbies
    WHEN p.interests_visibility = 'members' AND auth.uid() IS NOT NULL THEN p.hobbies
    ELSE '{}'::text[]
  END AS interests,
  p.profile_visibility,
  p.created_at AS member_since
FROM public.profiles p
WHERE coalesce(p.is_active, true)
  AND (
    p.user_id = auth.uid()
    OR p.profile_visibility = 'public'
    OR (p.profile_visibility = 'members' AND auth.uid() IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
       OR (b.blocker_id = p.user_id AND b.blocked_id = auth.uid())
  );

REVOKE ALL ON public.public_profile_cards FROM PUBLIC;
GRANT SELECT ON public.public_profile_cards TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_user_block(
  _blocked_user_id uuid,
  _blocked boolean,
  _reason_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _blocked_user_id IS NULL OR _blocked_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid block target' USING ERRCODE = '22023';
  END IF;

  IF _blocked THEN
    INSERT INTO public.user_blocks (blocker_id, blocked_id, reason_code)
    VALUES (auth.uid(), _blocked_user_id, NULLIF(btrim(_reason_code), ''))
    ON CONFLICT (blocker_id, blocked_id)
    DO UPDATE SET reason_code = EXCLUDED.reason_code;
  ELSE
    DELETE FROM public.user_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = _blocked_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_user_report(
  _reported_user_id uuid,
  _context_type text,
  _context_id uuid,
  _category text,
  _details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _reported_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.user_reports WHERE reporter_id = auth.uid() AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Report rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_reports (reporter_id, reported_user_id, context_type, context_id, category, details)
  VALUES (
    auth.uid(),
    _reported_user_id,
    coalesce(NULLIF(btrim(_context_type), ''), 'profile'),
    _context_id,
    _category,
    NULLIF(left(btrim(coalesce(_details, '')), 2000), '')
  )
  RETURNING id INTO report_id;
  RETURN report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_data_subject_action(_request_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _request_type NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unsupported data request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.data_subject_requests (user_id, request_type, grace_period_ends_at)
  VALUES (
    auth.uid(),
    _request_type,
    CASE WHEN _request_type = 'deletion' THEN now() + interval '14 days' ELSE NULL END
  )
  ON CONFLICT (user_id, request_type)
    WHERE status IN ('requested', 'identity_verified', 'processing', 'ready', 'retention_hold')
  DO UPDATE SET updated_at = now()
  RETURNING id INTO request_id;
  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_data_subject_action(_request_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _request_type NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unsupported data request' USING ERRCODE = '22023';
  END IF;
  UPDATE public.data_subject_requests
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = auth.uid()
    AND request_type = _request_type
    AND status IN ('requested', 'identity_verified');
END;
$$;

CREATE OR REPLACE FUNCTION public.register_my_session_device(
  _session_fingerprint text,
  _device_label text,
  _user_agent_family text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  session_record_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_session_fingerprint, ''))) < 8 THEN
    RAISE EXCEPTION 'Invalid session fingerprint' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_session_devices (
    user_id, session_fingerprint, device_label, user_agent_family, last_seen_at, revoked_at
  )
  VALUES (
    auth.uid(), left(_session_fingerprint, 128), left(coalesce(NULLIF(btrim(_device_label), ''), 'Unknown device'), 120),
    left(NULLIF(btrim(_user_agent_family), ''), 120), now(), NULL
  )
  ON CONFLICT (user_id, session_fingerprint)
  DO UPDATE SET
    device_label = EXCLUDED.device_label,
    user_agent_family = EXCLUDED.user_agent_family,
    last_seen_at = now(),
    revoked_at = NULL
  RETURNING id INTO session_record_id;

  INSERT INTO public.account_activity_events (user_id, event_type, device_label)
  VALUES (auth.uid(), 'session_seen', left(coalesce(NULLIF(btrim(_device_label), ''), 'Unknown device'), 120));
  RETURN session_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_other_session_devices_revoked(_current_fingerprint text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  revoked_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_session_devices
  SET revoked_at = coalesce(revoked_at, now())
  WHERE user_id = auth.uid()
    AND session_fingerprint <> _current_fingerprint
    AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  INSERT INTO public.account_activity_events (user_id, event_type, metadata)
  VALUES (auth.uid(), 'sessions_revoked', jsonb_build_object('count', revoked_count));
  RETURN revoked_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_participant_cards(_event_id uuid)
RETURNS TABLE (user_id uuid, display_name text, avatar_url text, city text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Organizer access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.avatar_url,
    CASE WHEN p.location_precision = 'city' THEN p.city ELSE NULL END
  FROM public.event_participants ep
  JOIN public.profiles p ON p.user_id = ep.user_id
  WHERE ep.event_id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_block(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_user_report(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_my_data_subject_action(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_my_data_subject_action(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_my_session_device(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_other_session_devices_revoked(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_participant_cards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_block(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_user_report(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_data_subject_action(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_data_subject_action(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_my_session_device(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_other_session_devices_revoked(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_participant_cards(uuid) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.user_reports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_blocks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.data_subject_requests FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_session_devices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.account_activity_events FROM anon, authenticated;

DROP TRIGGER IF EXISTS update_profile_hobby_preferences_updated_at ON public.profile_hobby_preferences;
CREATE TRIGGER update_profile_hobby_preferences_updated_at
  BEFORE UPDATE ON public.profile_hobby_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_reports_updated_at ON public.user_reports;
CREATE TRIGGER update_user_reports_updated_at
  BEFORE UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_data_subject_requests_updated_at ON public.data_subject_requests;
CREATE TRIGGER update_data_subject_requests_updated_at
  BEFORE UPDATE ON public.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON VIEW public.public_profile_cards IS
  'Allowlisted profile DTO. Never exposes address, coordinates, birth date, gender, internal flags, consent or moderation metadata.';
COMMENT ON TABLE public.user_session_devices IS
  'User-visible device activity, not raw Auth refresh tokens. Exact Auth session revocation remains an Auth service operation.';
