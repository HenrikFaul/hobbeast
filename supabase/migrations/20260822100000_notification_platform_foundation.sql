-- Prompt 10: canonical notification platform foundation.
-- Append-only, additive migration. No provider credential or cron is configured here.
-- Rollback strategy: disable workers/provider dispatch first; drop the new triggers/functions/tables,
-- then drop only the columns/indexes introduced below. Existing notification rows stay intact.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'transactional',
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text;

UPDATE public.notifications
SET
  category = CASE
    WHEN type IN ('new_device', 'security_alert') THEN 'safety'
    WHEN type IN ('organizer_message', 'organizer_reminder') THEN 'organizer'
    WHEN type IN ('mutual_reconnection', 'circle_invite', 'circle_activity', 'post_event_feedback', 'friend_request') THEN 'community'
    WHEN type IN ('favorite_category_event', 'recommended_event', 'hub_opportunity') THEN 'recommendation'
    WHEN type IN ('admin_notice') THEN 'admin'
    ELSE 'transactional'
  END,
  priority = CASE
    WHEN type IN ('waitlist_promoted', 'event_changed', 'event_cancelled', 'new_device', 'security_alert', 'admin_notice') THEN 5
    WHEN type IN ('event_invite', 'upcoming_event_reminder') THEN 4
    WHEN type IN ('organizer_message', 'organizer_reminder') THEN 3
    WHEN type IN ('friend_request', 'mutual_reconnection', 'circle_invite', 'circle_activity', 'post_event_feedback') THEN 2
    ELSE 1
  END,
  delivery_status = 'delivered',
  delivered_at = COALESCE(delivered_at, created_at),
  read_at = CASE WHEN is_read THEN COALESCE(read_at, created_at) ELSE read_at END
WHERE delivered_at IS NULL OR category = 'transactional';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_contract_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_contract_check CHECK (type IN (
  'friend_request', 'event_invite', 'favorite_category_event', 'recommended_event',
  'waitlist_promoted', 'organizer_message', 'event_changed', 'event_cancelled',
  'upcoming_event_reminder', 'post_event_feedback', 'mutual_reconnection',
  'circle_invite', 'circle_activity', 'hub_opportunity', 'organizer_reminder',
  'new_device', 'security_alert', 'admin_notice'
)) NOT VALID;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (category IN ('safety', 'transactional', 'organizer', 'community', 'recommendation', 'admin'));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('in_app', 'email', 'push'));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_priority_check CHECK (priority BETWEEN 1 AND 5);
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_delivery_status_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_delivery_status_check CHECK (
  delivery_status IN ('scheduled', 'queued', 'sent', 'delivered', 'failed', 'dead_letter', 'suppressed')
);
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_deep_link_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_deep_link_check CHECK (
  deep_link IS NULL OR (
    deep_link LIKE '/%'
    AND deep_link NOT LIKE '//%'
    AND position(E'\\' IN deep_link) = 0
    AND length(deep_link) <= 500
  )
);
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_bounds_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_bounds_check CHECK (
  length(title) BETWEEN 1 AND 160
  AND (body IS NULL OR length(body) <= 4000)
  AND (dedupe_key IS NULL OR length(dedupe_key) BETWEEN 1 AND 300)
  AND template_version > 0
  AND attempt_count BETWEEN 0 AND 100
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_dedupe_uidx
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_delivery_queue_idx
  ON public.notifications(delivery_status, scheduled_at, priority DESC)
  WHERE delivery_status IN ('scheduled', 'queued', 'failed');
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS organizer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS community_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recommendation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transactional_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_start time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_end time NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Budapest',
  ADD COLUMN IF NOT EXISTS digest_mode text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS frequency_cap_per_day integer NOT NULL DEFAULT 12;

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_digest_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_digest_check
  CHECK (digest_mode IN ('off', 'daily', 'weekly'));
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_frequency_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_frequency_check
  CHECK (frequency_cap_per_day BETWEEN 1 AND 100);
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_timezone_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_timezone_check
  CHECK (length(timezone) BETWEEN 3 AND 64 AND timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+$');

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view delivered own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND delivery_status = 'delivered'
    AND scheduled_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can mark delivered own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND delivery_status = 'delivered')
  WITH CHECK (auth.uid() = user_id AND delivery_status = 'delivered');

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users can update own preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notification_templates (
  template_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  locale text NOT NULL DEFAULT 'hu-HU' CHECK (length(locale) BETWEEN 2 AND 16),
  notification_type text NOT NULL,
  category text NOT NULL CHECK (category IN ('safety', 'transactional', 'organizer', 'community', 'recommendation', 'admin')),
  title_template text NOT NULL CHECK (length(title_template) BETWEEN 1 AND 160),
  body_template text CHECK (body_template IS NULL OR length(body_template) <= 4000),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_key, version, locale)
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view notification templates" ON public.notification_templates;
CREATE POLICY "Admins can view notification templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service role can manage notification templates" ON public.notification_templates;
CREATE POLICY "Service role can manage notification templates"
  ON public.notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'push')),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 20),
  status text NOT NULL CHECK (status IN ('claimed', 'sent', 'delivered', 'failed', 'dead_letter')),
  provider text,
  provider_message_id text,
  provider_response_code text,
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  next_retry_at timestamptz,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(safe_metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (notification_id, channel, attempt_number)
);
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notification_delivery_attempts_retry_idx
  ON public.notification_delivery_attempts(next_retry_at)
  WHERE retryable AND status = 'failed';
DROP POLICY IF EXISTS "Admins can view notification delivery attempts" ON public.notification_delivery_attempts;
CREATE POLICY "Admins can view notification delivery attempts"
  ON public.notification_delivery_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service role can manage notification delivery attempts" ON public.notification_delivery_attempts;
CREATE POLICY "Service role can manage notification delivery attempts"
  ON public.notification_delivery_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.notification_templates (
  template_key, version, locale, notification_type, category, title_template, body_template, is_active
) VALUES
  ('waitlist.promoted', 1, 'hu-HU', 'waitlist_promoted', 'transactional', 'Felkerültél az eseményre!', 'Felszabadult egy hely. Nézd át az esemény részleteit és jelezz, ha mégsem tudsz jönni.', true),
  ('event.changed', 1, 'hu-HU', 'event_changed', 'transactional', 'Változott egy eseményed', 'A szervező módosította az esemény időpontját vagy helyszínét. Kérjük, ellenőrizd a részleteket.', true),
  ('event.cancelled', 1, 'hu-HU', 'event_cancelled', 'transactional', 'Az eseményt lemondták', 'A szervező lemondta az eseményt. Nincs további teendőd.', true),
  ('event.upcoming', 1, 'hu-HU', 'upcoming_event_reminder', 'transactional', 'Hamarosan találkozunk', 'Nézd át a találkozási információkat, és csak akkor indulj el, ha továbbra is részt veszel.', true),
  ('event.feedback', 1, 'hu-HU', 'post_event_feedback', 'community', 'Milyen volt a közös program?', 'Egy rövid visszajelzés segít a következő alkalom jobb megszervezésében.', true),
  ('security.new_device', 1, 'hu-HU', 'new_device', 'safety', 'Új eszközt észleltünk', 'Ha nem te jelentkeztél be erről az eszközről, ellenőrizd a fióktevékenységedet és vond vissza az ismeretlen munkameneteket.', true),
  ('hub.opportunity', 1, 'hu-HU', 'hub_opportunity', 'recommendation', 'Összejött egy helyi közösség', 'Már elegen érdeklődtök ugyanazért az aktivitásért a környéken. Nézd meg a kapcsolódó lehetőségeket.', true)
ON CONFLICT (template_key, version, locale) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_notification_read_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    NEW.read_at := now();
  ELSIF NEW.is_read = false THEN
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_notification_read_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_touch_notification_read_at ON public.notifications;
CREATE TRIGGER trg_touch_notification_read_at
  BEFORE UPDATE OF is_read ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_read_at();

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_data jsonb DEFAULT '{}'::jsonb,
  p_event_key text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_template_key text DEFAULT NULL,
  p_template_version integer DEFAULT 1,
  p_scheduled_at timestamptz DEFAULT now(),
  p_expires_at timestamptz DEFAULT NULL,
  p_correlation_id uuid DEFAULT gen_random_uuid(),
  p_channel text DEFAULT 'in_app'
)
RETURNS TABLE(notification_id uuid, outcome text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text;
  v_priority smallint;
  v_critical boolean;
  v_social boolean;
  v_origin text := 'unknown';
  v_blocked boolean := false;
  v_preferences public.notification_preferences%ROWTYPE;
  v_opted_in boolean := true;
  v_channel_enabled boolean := true;
  v_local_time time;
  v_local_date date;
  v_quiet boolean := false;
  v_digest boolean := false;
  v_scheduled_at timestamptz := GREATEST(COALESCE(p_scheduled_at, now()), now());
  v_status text := 'delivered';
  v_reason text := NULL;
  v_deep_link text;
  v_dedupe_key text;
  v_recent_count integer := 0;
  v_target_active boolean := true;
  v_notification_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'notification recipient is required' USING ERRCODE = '22023'; END IF;
  IF p_type NOT IN (
    'friend_request', 'event_invite', 'favorite_category_event', 'recommended_event',
    'waitlist_promoted', 'organizer_message', 'event_changed', 'event_cancelled',
    'upcoming_event_reminder', 'post_event_feedback', 'mutual_reconnection',
    'circle_invite', 'circle_activity', 'hub_opportunity', 'organizer_reminder',
    'new_device', 'security_alert', 'admin_notice'
  ) THEN RAISE EXCEPTION 'unsupported notification type' USING ERRCODE = '22023'; END IF;
  IF p_channel NOT IN ('in_app', 'email', 'push') THEN RAISE EXCEPTION 'unsupported notification channel' USING ERRCODE = '22023'; END IF;
  IF length(trim(p_title)) NOT BETWEEN 1 AND 160 OR length(COALESCE(p_body, '')) > 4000 THEN
    RAISE EXCEPTION 'notification content outside allowed bounds' USING ERRCODE = '22023';
  END IF;
  IF p_template_version < 1 OR pg_column_size(COALESCE(p_data, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'notification metadata outside allowed bounds' USING ERRCODE = '22023';
  END IF;

  v_category := CASE
    WHEN p_type IN ('new_device', 'security_alert') THEN 'safety'
    WHEN p_type IN ('organizer_message', 'organizer_reminder') THEN 'organizer'
    WHEN p_type IN ('friend_request', 'mutual_reconnection', 'circle_invite', 'circle_activity', 'post_event_feedback') THEN 'community'
    WHEN p_type IN ('favorite_category_event', 'recommended_event', 'hub_opportunity') THEN 'recommendation'
    WHEN p_type = 'admin_notice' THEN 'admin'
    ELSE 'transactional'
  END;
  v_priority := CASE
    WHEN p_type IN ('waitlist_promoted', 'event_changed', 'event_cancelled', 'new_device', 'security_alert', 'admin_notice') THEN 5
    WHEN p_type IN ('event_invite', 'upcoming_event_reminder') THEN 4
    WHEN p_type IN ('organizer_message', 'organizer_reminder') THEN 3
    WHEN p_type IN ('friend_request', 'mutual_reconnection', 'circle_invite', 'circle_activity', 'post_event_feedback') THEN 2
    ELSE 1
  END;
  v_critical := p_type IN ('waitlist_promoted', 'event_changed', 'event_cancelled', 'new_device', 'security_alert', 'admin_notice');
  v_social := p_type IN ('friend_request', 'mutual_reconnection', 'circle_invite', 'circle_activity');

  SELECT COALESCE(p.user_origin, 'unknown')
  INTO v_origin
  FROM public.profiles p
  WHERE COALESCE(p.user_id, p.id) = p_user_id
  ORDER BY (p.user_id = p_user_id) DESC
  LIMIT 1;
  v_origin := COALESCE(v_origin, 'unknown');

  IF v_social AND p_actor_user_id IS NOT NULL AND to_regclass('public.user_blocks') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1 FROM public.user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
    )' INTO v_blocked USING p_actor_user_id, p_user_id;
  END IF;

  SELECT * INTO v_preferences
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  v_channel_enabled := CASE p_channel
    WHEN 'in_app' THEN COALESCE(v_preferences.in_app_enabled, true)
    WHEN 'email' THEN COALESCE(v_preferences.email_enabled, false)
    WHEN 'push' THEN COALESCE(v_preferences.push_enabled, false)
  END;
  v_opted_in := CASE
    WHEN p_type = 'friend_request' THEN COALESCE(v_preferences.friend_request, true)
    WHEN p_type = 'event_invite' THEN COALESCE(v_preferences.event_invite, true)
    WHEN p_type = 'favorite_category_event' THEN COALESCE(v_preferences.favorite_category_event, true)
    WHEN v_category = 'organizer' THEN COALESCE(v_preferences.organizer_enabled, true)
    WHEN v_category = 'community' THEN COALESCE(v_preferences.community_enabled, true)
    WHEN v_category = 'recommendation' THEN COALESCE(v_preferences.recommendation_enabled, true)
    WHEN v_category = 'transactional' THEN COALESCE(v_preferences.transactional_enabled, true)
    ELSE true
  END;

  IF COALESCE(p_data->>'event_id', '') <> '' AND p_type <> 'event_cancelled' THEN
    SELECT COALESCE(e.is_active, false) INTO v_target_active
    FROM public.events e
    WHERE e.id::text = p_data->>'event_id';
    v_target_active := COALESCE(v_target_active, false);
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    v_status := 'suppressed'; v_reason := 'expired';
  ELSIF v_origin <> 'real' THEN
    v_status := 'suppressed'; v_reason := 'non_real_recipient';
  ELSIF v_social AND v_blocked THEN
    v_status := 'suppressed'; v_reason := 'relationship_blocked';
  ELSIF NOT v_target_active THEN
    v_status := 'suppressed'; v_reason := 'stale_target';
  ELSIF NOT v_channel_enabled AND NOT (v_critical AND p_channel = 'in_app') THEN
    v_status := 'suppressed'; v_reason := 'channel_opt_out';
  ELSIF NOT v_critical AND NOT v_opted_in THEN
    v_status := 'suppressed'; v_reason := 'category_opt_out';
  END IF;

  IF v_status <> 'suppressed' AND NOT v_critical THEN
    SELECT count(*) INTO v_recent_count
    FROM public.notifications n
    WHERE n.user_id = p_user_id
      AND n.created_at >= date_trunc('day', now())
      AND n.priority < 5
      AND n.delivery_status <> 'suppressed';
    IF v_recent_count >= COALESCE(v_preferences.frequency_cap_per_day, 12) THEN
      v_status := 'suppressed'; v_reason := 'frequency_cap';
    END IF;
  END IF;

  IF v_status <> 'suppressed' AND NOT v_critical THEN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = COALESCE(v_preferences.timezone, 'Europe/Budapest')) THEN
      v_preferences.timezone := 'UTC';
    END IF;
    v_local_time := (now() AT TIME ZONE COALESCE(v_preferences.timezone, 'Europe/Budapest'))::time;
    v_local_date := (now() AT TIME ZONE COALESCE(v_preferences.timezone, 'Europe/Budapest'))::date;
    IF COALESCE(v_preferences.quiet_hours_enabled, false) AND v_preferences.quiet_start <> v_preferences.quiet_end THEN
      v_quiet := CASE
        WHEN v_preferences.quiet_start < v_preferences.quiet_end
          THEN v_local_time >= v_preferences.quiet_start AND v_local_time < v_preferences.quiet_end
        ELSE v_local_time >= v_preferences.quiet_start OR v_local_time < v_preferences.quiet_end
      END;
      IF v_quiet THEN
        v_status := 'scheduled'; v_reason := 'quiet_hours';
        IF v_preferences.quiet_start > v_preferences.quiet_end AND v_local_time >= v_preferences.quiet_start THEN
          v_local_date := v_local_date + 1;
        END IF;
        v_scheduled_at := (v_local_date + v_preferences.quiet_end) AT TIME ZONE COALESCE(v_preferences.timezone, 'Europe/Budapest');
      END IF;
    END IF;
    v_digest := COALESCE(v_preferences.digest_mode, 'off') <> 'off'
      AND v_category IN ('community', 'recommendation');
    IF v_status <> 'scheduled' AND v_digest THEN
      v_status := 'scheduled'; v_reason := 'digest';
      v_scheduled_at := now() + CASE v_preferences.digest_mode WHEN 'weekly' THEN interval '7 days' ELSE interval '1 day' END;
    END IF;
  END IF;

  v_deep_link := NULLIF(trim(COALESCE(p_data->>'deep_link', '')), '');
  IF v_deep_link IS NOT NULL AND (
    v_deep_link NOT LIKE '/%' OR v_deep_link LIKE '//%' OR position(E'\\' IN v_deep_link) > 0 OR length(v_deep_link) > 500
  ) THEN v_deep_link := NULL; END IF;
  IF v_deep_link IS NULL AND COALESCE(p_data->>'event_id', '') ~ '^[A-Za-z0-9_-]{1,128}$' THEN
    v_deep_link := '/events/' || (p_data->>'event_id');
  END IF;

  v_dedupe_key := NULLIF(left(trim(COALESCE(p_dedupe_key,
    p_type || ':' || p_user_id::text || ':' || COALESCE(p_event_key, '-') || ':' || COALESCE(p_data->>'source_id', '-')
  )), 300), '');

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, category, channel, priority, deep_link,
    dedupe_key, event_key, template_key, template_version, delivery_status,
    suppression_reason, scheduled_at, expires_at, delivered_at, actor_user_id,
    source_type, source_id, correlation_id
  ) VALUES (
    p_user_id, p_type, trim(p_title), NULLIF(trim(COALESCE(p_body, '')), ''), COALESCE(p_data, '{}'::jsonb),
    v_status = 'suppressed', v_category, p_channel, v_priority, v_deep_link,
    v_dedupe_key, p_event_key, p_template_key, p_template_version, v_status,
    v_reason, v_scheduled_at, p_expires_at, CASE WHEN v_status = 'delivered' THEN now() ELSE NULL END,
    p_actor_user_id, NULLIF(p_data->>'source_type', ''), NULLIF(p_data->>'source_id', ''),
    COALESCE(p_correlation_id, gen_random_uuid())
  )
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_notification_id;

  IF v_notification_id IS NULL THEN
    SELECT n.id INTO v_notification_id FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.dedupe_key = v_dedupe_key
    ORDER BY n.created_at DESC LIMIT 1;
    RETURN QUERY SELECT v_notification_id, 'suppressed'::text, 'duplicate'::text;
  ELSE
    RETURN QUERY SELECT v_notification_id,
      CASE WHEN v_status = 'delivered' THEN 'delivered' WHEN v_status = 'scheduled' THEN 'deferred' ELSE 'suppressed' END,
      v_reason;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb, text, text, uuid, text, integer, timestamptz, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb, text, text, uuid, text, integer, timestamptz, timestamptz, uuid, text) TO service_role;

-- A newly registered device is both user-visible account activity and an idempotent
-- high-priority safety notification. Existing device heartbeats remain session_seen.
ALTER TABLE public.account_activity_events
  DROP CONSTRAINT IF EXISTS account_activity_events_event_type_check;
ALTER TABLE public.account_activity_events
  ADD CONSTRAINT account_activity_events_event_type_check CHECK (event_type IN (
    'sign_in', 'sign_out', 'password_reset', 'session_seen', 'new_device',
    'sessions_revoked', 'profile_privacy_changed'
  ));

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
  is_new_device boolean := false;
  safe_device_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_session_fingerprint, ''))) < 8 THEN
    RAISE EXCEPTION 'Invalid session fingerprint' USING ERRCODE = '22023';
  END IF;
  safe_device_label := left(coalesce(NULLIF(btrim(_device_label), ''), 'Unknown device'), 120);

  INSERT INTO public.user_session_devices (
    user_id, session_fingerprint, device_label, user_agent_family, last_seen_at, revoked_at
  ) VALUES (
    auth.uid(), left(_session_fingerprint, 128), safe_device_label,
    left(NULLIF(btrim(_user_agent_family), ''), 120), now(), NULL
  )
  ON CONFLICT (user_id, session_fingerprint) DO NOTHING
  RETURNING id INTO session_record_id;

  IF session_record_id IS NULL THEN
    UPDATE public.user_session_devices
    SET device_label = safe_device_label,
        user_agent_family = left(NULLIF(btrim(_user_agent_family), ''), 120),
        last_seen_at = now(), revoked_at = NULL
    WHERE user_id = auth.uid() AND session_fingerprint = left(_session_fingerprint, 128)
    RETURNING id INTO session_record_id;
  ELSE
    is_new_device := true;
  END IF;

  INSERT INTO public.account_activity_events (user_id, event_type, device_label, metadata)
  VALUES (
    auth.uid(), CASE WHEN is_new_device THEN 'new_device' ELSE 'session_seen' END,
    safe_device_label, jsonb_build_object('session_device_id', session_record_id)
  );

  IF is_new_device THEN
    PERFORM public.enqueue_notification(
      auth.uid(), 'new_device', 'Új eszközt észleltünk',
      safe_device_label || ' először kapcsolódott a fiókodhoz. Ha nem te voltál, ellenőrizd a fióktevékenységedet.',
      jsonb_build_object(
        'session_device_id', session_record_id,
        'device_label', safe_device_label,
        'deep_link', '/profile',
        'source_type', 'session_device',
        'source_id', session_record_id
      ),
      'new-device:' || session_record_id::text,
      'new-device:' || session_record_id::text,
      NULL, 'security.new_device', 1, now(), NULL, gen_random_uuid(), 'in_app'
    );
  END IF;
  RETURN session_record_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_my_session_device(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_my_session_device(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_due_in_app_notifications(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  WITH due AS (
    SELECT id FROM public.notifications
    WHERE channel = 'in_app' AND delivery_status = 'scheduled' AND scheduled_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY priority DESC, scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  )
  UPDATE public.notifications n
  SET delivery_status = 'delivered', delivered_at = now(), suppression_reason = NULL
  FROM due WHERE n.id = due.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.release_due_in_app_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_in_app_notifications(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.record_notification_delivery_attempt(
  p_notification_id uuid,
  p_status text,
  p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_response_code text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_retryable boolean DEFAULT false,
  p_safe_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_attempt integer; v_id uuid; v_next_retry timestamptz;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('claimed', 'sent', 'delivered', 'failed', 'dead_letter') THEN
    RAISE EXCEPTION 'invalid delivery status' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(COALESCE(p_safe_metadata, '{}'::jsonb)) > 8192 THEN
    RAISE EXCEPTION 'delivery metadata too large' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt
  FROM public.notification_delivery_attempts WHERE notification_id = p_notification_id;
  IF p_retryable AND p_status = 'failed' AND v_attempt < 5 THEN
    v_next_retry := now() + make_interval(secs => LEAST(3600, 30 * (2 ^ (v_attempt - 1))::integer));
  END IF;
  INSERT INTO public.notification_delivery_attempts (
    notification_id, channel, attempt_number, status, provider, provider_message_id,
    provider_response_code, error_code, retryable, next_retry_at, safe_metadata, completed_at
  )
  SELECT p_notification_id, n.channel, v_attempt,
    CASE WHEN p_status = 'failed' AND (NOT p_retryable OR v_attempt >= 5) THEN 'dead_letter' ELSE p_status END,
    left(p_provider, 80), left(p_provider_message_id, 200), left(p_response_code, 40), left(p_error_code, 120),
    p_retryable AND v_attempt < 5, v_next_retry, COALESCE(p_safe_metadata, '{}'::jsonb),
    CASE WHEN p_status <> 'claimed' THEN now() ELSE NULL END
  FROM public.notifications n WHERE n.id = p_notification_id AND n.channel IN ('email', 'push')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'external-channel notification not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.notifications SET
    attempt_count = v_attempt,
    delivery_status = CASE
      WHEN p_status = 'delivered' THEN 'delivered'
      WHEN p_status = 'sent' THEN 'sent'
      WHEN p_status = 'failed' AND p_retryable AND v_attempt < 5 THEN 'failed'
      WHEN p_status = 'failed' THEN 'dead_letter'
      ELSE delivery_status
    END,
    sent_at = CASE WHEN p_status IN ('sent', 'delivered') THEN COALESCE(sent_at, now()) ELSE sent_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
    last_error_code = CASE WHEN p_status = 'failed' THEN left(p_error_code, 120) ELSE NULL END
  WHERE id = p_notification_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_notification_delivery_attempt(uuid, text, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_notification_delivery_attempt(uuid, text, text, text, text, text, boolean, jsonb) TO service_role;

-- Make waitlist promotion concurrency-safe and route its notification through the canonical guard.
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next_id uuid;
  v_next_user_id uuid;
  v_max_attendees integer;
  v_active_count integer;
  v_outcome text;
  v_waitlist_enabled boolean;
BEGIN
  IF OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'participant event cannot change during status transition' USING ERRCODE = '22023';
  END IF;
  IF OLD.status = 'going' AND NEW.status IN ('cancelled', 'no_show') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));
    SELECT max_attendees, outcome_status, COALESCE(waitlist_enabled, false)
      INTO v_max_attendees, v_outcome, v_waitlist_enabled
    FROM public.events WHERE id = NEW.event_id;
    IF NOT v_waitlist_enabled OR v_outcome IN ('started', 'completed', 'held', 'cancelled', 'archived') THEN
      RETURN NEW;
    END IF;
    SELECT count(*) INTO v_active_count FROM public.event_participants
      WHERE event_id = NEW.event_id AND status IN ('going', 'checked_in', 'completed');
    IF v_max_attendees IS NULL OR v_active_count < v_max_attendees THEN
      SELECT id, user_id INTO v_next_id, v_next_user_id
      FROM public.event_participants
      WHERE event_id = NEW.event_id AND status = 'waitlist'
      ORDER BY joined_at, id
      FOR UPDATE SKIP LOCKED LIMIT 1;
      IF v_next_id IS NOT NULL THEN
        UPDATE public.event_participants SET status = 'going', status_updated_at = now()
        WHERE id = v_next_id AND status = 'waitlist';
        INSERT INTO public.participation_audits (participation_id, event_id, actor_user_id, action, metadata)
        VALUES
          (NEW.id, NEW.event_id, NEW.user_id, NEW.status, jsonb_build_object('auto_promoted_participation_id', v_next_id)),
          (v_next_id, NEW.event_id, NULL, 'auto_promoted_from_waitlist', jsonb_build_object('freed_by_participation_id', NEW.id));
        PERFORM public.enqueue_notification(
          v_next_user_id, 'waitlist_promoted', 'Felkerültél az eseményre!',
          'Felszabadult egy hely. Nézd át az esemény részleteit és jelezz, ha mégsem tudsz jönni.',
          jsonb_build_object('event_id', NEW.event_id, 'deep_link', '/events/' || NEW.event_id::text, 'source_type', 'waitlist'),
          'waitlist:' || NEW.event_id::text, 'waitlist:' || NEW.event_id::text || ':' || v_next_id::text,
          NULL, 'waitlist.promoted', 1, now(), NULL, gen_random_uuid(), 'in_app'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_promote_waitlist() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.deliver_organizer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_participant record; v_event_title text; v_event_owner uuid;
BEGIN
  IF NEW.delivery_state = 'sending' AND OLD.delivery_state IS DISTINCT FROM 'sending' THEN
    IF NEW.audience_filter NOT IN ('all', 'going', 'waitlist', 'checked_in', 'no_show', 'completed') THEN
      RAISE EXCEPTION 'invalid organizer message audience' USING ERRCODE = '22023';
    END IF;
    SELECT title, created_by INTO v_event_title, v_event_owner FROM public.events WHERE id = NEW.event_id;
    IF v_event_owner IS NULL OR NEW.actor_user_id <> v_event_owner THEN
      RAISE EXCEPTION 'only the event organizer can deliver this message' USING ERRCODE = '42501';
    END IF;
    FOR v_participant IN
      SELECT user_id FROM public.event_participants
      WHERE event_id = NEW.event_id
        AND status IN ('going', 'waitlist', 'checked_in', 'no_show', 'completed')
        AND (NEW.audience_filter = 'all' OR status = NEW.audience_filter)
    LOOP
      PERFORM public.enqueue_notification(
        v_participant.user_id, 'organizer_message', COALESCE(NULLIF(trim(NEW.subject), ''), 'Üzenet a szervezőtől'), NEW.body,
        jsonb_build_object('event_id', NEW.event_id, 'message_id', NEW.id, 'event_title', v_event_title, 'deep_link', '/events/' || NEW.event_id::text, 'source_type', 'organizer_message', 'source_id', NEW.id),
        'organizer-message:' || NEW.event_id::text,
        'organizer-message:' || NEW.id::text || ':' || v_participant.user_id::text,
        NEW.actor_user_id, NULL, 1, COALESCE(NEW.scheduled_for, now()), NULL, gen_random_uuid(), 'in_app'
      );
    END LOOP;
    NEW.delivery_state := 'sent';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.deliver_organizer_message() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_favorite_category_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user record; v_parts text[]; v_top text; v_activity text;
BEGIN
  IF NOT COALESCE(NEW.is_active, true) THEN RETURN NEW; END IF;
  v_parts := string_to_array(NEW.category, ' › ');
  v_top := v_parts[1];
  v_activity := CASE WHEN array_length(v_parts, 1) >= 3 THEN v_parts[3] ELSE v_parts[1] END;
  FOR v_user IN
    SELECT COALESCE(p.user_id, p.id) AS user_id
    FROM public.profiles p
    WHERE COALESCE(p.user_id, p.id) <> NEW.created_by
      AND COALESCE(p.user_origin, 'unknown') = 'real'
      AND p.favorite_event_categories IS NOT NULL
      AND (
        v_activity = ANY(p.favorite_event_categories) OR v_top = ANY(p.favorite_event_categories)
        OR EXISTS (SELECT 1 FROM unnest(p.favorite_event_categories) fav WHERE NEW.category ILIKE '%' || fav || '%')
      )
  LOOP
    PERFORM public.enqueue_notification(
      v_user.user_id, 'favorite_category_event', 'Új esemény a kedvenc aktivitásodban!',
      NEW.title || ' — ' || COALESCE(NEW.location_city, 'Online'),
      jsonb_build_object('event_id', NEW.id, 'event_title', NEW.title, 'category', NEW.category, 'event_date', NEW.event_date, 'location_city', NEW.location_city, 'deep_link', '/events/' || NEW.id::text, 'source_type', 'event'),
      'favorite-event:' || NEW.id::text,
      'favorite-event:' || NEW.id::text || ':' || v_user.user_id::text,
      NEW.created_by, NULL, 1, now(),
      CASE WHEN NEW.event_date IS NOT NULL THEN (NEW.event_date + interval '1 day')::timestamptz ELSE NULL END,
      gen_random_uuid(), 'in_app'
    );
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_favorite_category_on_event() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_event_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_participant record; v_type text; v_cancelled boolean; v_changed boolean;
BEGIN
  v_cancelled := (COALESCE(OLD.is_active, true) AND NOT COALESCE(NEW.is_active, true))
    OR (COALESCE(to_jsonb(OLD)->>'outcome_status', '') <> 'cancelled' AND COALESCE(to_jsonb(NEW)->>'outcome_status', '') = 'cancelled');
  v_changed := OLD.event_date IS DISTINCT FROM NEW.event_date
    OR OLD.event_time IS DISTINCT FROM NEW.event_time
    OR OLD.location_city IS DISTINCT FROM NEW.location_city
    OR OLD.location_free_text IS DISTINCT FROM NEW.location_free_text;
  IF NOT v_cancelled AND NOT v_changed THEN RETURN NEW; END IF;
  v_type := CASE WHEN v_cancelled THEN 'event_cancelled' ELSE 'event_changed' END;
  FOR v_participant IN
    SELECT user_id FROM public.event_participants
    WHERE event_id = NEW.id AND status IN ('going', 'waitlist')
  LOOP
    PERFORM public.enqueue_notification(
      v_participant.user_id, v_type,
      CASE WHEN v_cancelled THEN 'Az eseményt lemondták' ELSE 'Változott egy eseményed' END,
      CASE WHEN v_cancelled THEN 'A szervező lemondta az eseményt.' ELSE 'A szervező módosította az időpontot vagy a helyszínt. Ellenőrizd a részleteket.' END,
      jsonb_build_object('event_id', NEW.id, 'event_title', NEW.title, 'deep_link', '/events/' || NEW.id::text, 'source_type', 'event'),
      v_type || ':' || NEW.id::text || ':' || COALESCE(NEW.event_date::text, '-') || ':' || COALESCE(NEW.event_time::text, '-'),
      v_type || ':' || NEW.id::text || ':' || v_participant.user_id::text || ':' || COALESCE(NEW.updated_at::text, txid_current()::text),
      NEW.created_by, CASE WHEN v_cancelled THEN 'event.cancelled' ELSE 'event.changed' END, 1, now(), NULL, gen_random_uuid(), 'in_app'
    );
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_event_state_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_event_state_change ON public.events;
CREATE TRIGGER trg_notify_event_state_change
  AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.notify_event_state_change();

CREATE OR REPLACE FUNCTION public.enqueue_event_lifecycle_notifications(p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_reminders integer := 0; v_feedback integer := 0; v_organizers integer := 0;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  FOR v_row IN
    SELECT ep.user_id, e.id event_id, e.title, e.created_by, e.event_date, e.event_time
    FROM public.event_participants ep JOIN public.events e ON e.id = ep.event_id
    WHERE ep.status = 'going' AND e.is_active
      AND e.event_date BETWEEN p_now::date AND (p_now + interval '2 days')::date
    ORDER BY e.event_date, e.event_time NULLS LAST LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id, 'upcoming_event_reminder', 'Hamarosan találkozunk', v_row.title,
      jsonb_build_object('event_id', v_row.event_id, 'deep_link', '/events/' || v_row.event_id::text, 'source_type', 'event'),
      'upcoming:' || v_row.event_id::text || ':' || v_row.event_date::text,
      'upcoming:' || v_row.event_id::text || ':' || v_row.user_id::text || ':' || v_row.event_date::text,
      v_row.created_by, 'event.upcoming', 1, p_now, (v_row.event_date + interval '1 day')::timestamptz, gen_random_uuid(), 'in_app'
    );
    v_reminders := v_reminders + 1;
  END LOOP;
  FOR v_row IN
    SELECT DISTINCT ep.user_id, e.id event_id, e.title, e.created_by, e.event_date
    FROM public.event_participants ep JOIN public.events e ON e.id = ep.event_id
    WHERE ep.checked_in_at IS NOT NULL AND e.event_date BETWEEN (p_now - interval '3 days')::date AND (p_now - interval '1 day')::date
    ORDER BY e.event_date DESC LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id, 'post_event_feedback', 'Milyen volt a közös program?', v_row.title,
      jsonb_build_object('event_id', v_row.event_id, 'deep_link', '/events/' || v_row.event_id::text, 'source_type', 'event'),
      'feedback:' || v_row.event_id::text,
      'feedback:' || v_row.event_id::text || ':' || v_row.user_id::text,
      v_row.created_by, 'event.feedback', 1, p_now, p_now + interval '14 days', gen_random_uuid(), 'in_app'
    );
    v_feedback := v_feedback + 1;
  END LOOP;
  FOR v_row IN
    SELECT e.created_by user_id, e.id event_id, e.title, e.event_date
    FROM public.events e WHERE e.is_active AND e.event_date BETWEEN p_now::date AND (p_now + interval '2 days')::date
    ORDER BY e.event_date LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id, 'organizer_reminder', 'Szervezői teendők a közelgő eseményhez', v_row.title,
      jsonb_build_object('event_id', v_row.event_id, 'deep_link', '/organizer?event=' || v_row.event_id::text, 'source_type', 'event'),
      'organizer-reminder:' || v_row.event_id::text || ':' || v_row.event_date::text,
      'organizer-reminder:' || v_row.event_id::text || ':' || v_row.event_date::text,
      NULL, NULL, 1, p_now, (v_row.event_date + interval '1 day')::timestamptz, gen_random_uuid(), 'in_app'
    );
    v_organizers := v_organizers + 1;
  END LOOP;
  RETURN jsonb_build_object('upcoming_candidates', v_reminders, 'feedback_candidates', v_feedback, 'organizer_candidates', v_organizers);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_event_lifecycle_notifications(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_event_lifecycle_notifications(timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_hub_opportunity_notifications(p_min_real_members integer DEFAULT 5, p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_count integer := 0;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_min_real_members NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'invalid threshold' USING ERRCODE = '22023'; END IF;
  FOR v_row IN
    WITH qualified AS (
      SELECT vhm.hub_id, count(*) AS real_count
      FROM public.virtual_hub_members vhm
      JOIN public.profiles p ON COALESCE(p.user_id, p.id) = vhm.user_id
      WHERE COALESCE(p.user_origin, 'unknown') = 'real'
      GROUP BY vhm.hub_id HAVING count(*) >= p_min_real_members
    )
    SELECT vhm.user_id, vh.id hub_id, vh.hobby_category, vh.city, q.real_count
    FROM qualified q JOIN public.virtual_hubs vh ON vh.id = q.hub_id
    JOIN public.virtual_hub_members vhm ON vhm.hub_id = q.hub_id
    JOIN public.profiles p ON COALESCE(p.user_id, p.id) = vhm.user_id AND COALESCE(p.user_origin, 'unknown') = 'real'
    ORDER BY q.real_count DESC, vh.id, vhm.user_id LIMIT LEAST(GREATEST(p_limit, 1), 2000)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id, 'hub_opportunity', 'Összejött egy helyi közösség',
      v_row.real_count || ' valódi érdeklődő van a környéken ehhez: ' || v_row.hobby_category,
      jsonb_build_object('hub_id', v_row.hub_id, 'activity', v_row.hobby_category, 'city', v_row.city, 'real_member_count', v_row.real_count, 'deep_link', '/events', 'source_type', 'virtual_hub'),
      'hub-qualified:' || v_row.hub_id::text || ':' || p_min_real_members::text,
      'hub-qualified:' || v_row.hub_id::text || ':' || v_row.user_id::text || ':' || p_min_real_members::text,
      NULL, 'hub.opportunity', 1, now(), now() + interval '30 days', gen_random_uuid(), 'in_app'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_hub_opportunity_notifications(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_hub_opportunity_notifications(integer, integer) TO service_role;

-- Pulls audited social transitions into the notification queue. It is intentionally a bounded
-- worker, not a row trigger, so replay/dedupe, block guards and operational scheduling remain explicit.
CREATE OR REPLACE FUNCTION public.enqueue_social_graph_notifications(
  p_since timestamptz DEFAULT now() - interval '1 day',
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_mutual integer := 0; v_dormant integer := 0; v_bucket text;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.social_graph_audit_events') IS NULL OR to_regclass('public.connections') IS NULL THEN
    RETURN jsonb_build_object('mutual_candidates', 0, 'dormant_circle_candidates', 0, 'schema_ready', false);
  END IF;

  FOR v_row IN EXECUTE $query$
    SELECT a.id audit_id, a.created_at, c.id connection_id, c.user_low_id, c.user_high_id
    FROM public.social_graph_audit_events a
    JOIN public.connections c ON c.id = a.entity_id
    WHERE a.event_type = 'mutual_reconnection_created'
      AND a.entity_type = 'connection'
      AND a.created_at >= $1
      AND c.status = 'active'
    ORDER BY a.created_at, a.id
    LIMIT $2
  $query$ USING p_since, LEAST(GREATEST(p_limit, 1), 1000)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_low_id, 'mutual_reconnection', 'Mindketten szívesen találkoznátok újra',
      'Ez egy kölcsönös, privát jelzés. Nézzetek egy következő közös aktivitást, amikor nektek kényelmes.',
      jsonb_build_object('connection_id', v_row.connection_id, 'deep_link', '/profile', 'source_type', 'social_graph_audit', 'source_id', v_row.audit_id),
      'mutual-reconnection:' || v_row.connection_id::text,
      'mutual-reconnection:' || v_row.audit_id::text || ':' || v_row.user_low_id::text,
      v_row.user_high_id, NULL, 1, v_row.created_at, v_row.created_at + interval '30 days', gen_random_uuid(), 'in_app'
    );
    PERFORM public.enqueue_notification(
      v_row.user_high_id, 'mutual_reconnection', 'Mindketten szívesen találkoznátok újra',
      'Ez egy kölcsönös, privát jelzés. Nézzetek egy következő közös aktivitást, amikor nektek kényelmes.',
      jsonb_build_object('connection_id', v_row.connection_id, 'deep_link', '/profile', 'source_type', 'social_graph_audit', 'source_id', v_row.audit_id),
      'mutual-reconnection:' || v_row.connection_id::text,
      'mutual-reconnection:' || v_row.audit_id::text || ':' || v_row.user_high_id::text,
      v_row.user_low_id, NULL, 1, v_row.created_at, v_row.created_at + interval '30 days', gen_random_uuid(), 'in_app'
    );
    v_mutual := v_mutual + 2;
  END LOOP;

  IF to_regclass('public.social_circles') IS NOT NULL AND to_regclass('public.circle_health_dashboard') IS NOT NULL THEN
    v_bucket := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
    FOR v_row IN EXECUTE $query$
      SELECT c.id circle_id, c.host_id, c.name, h.last_activity_at
      FROM public.social_circles c
      JOIN public.circle_health_dashboard h ON h.circle_id = c.id
      WHERE c.lifecycle_state = 'paused'
        AND (h.last_activity_at IS NULL OR h.last_activity_at < now() - interval '30 days')
      ORDER BY h.last_activity_at NULLS FIRST, c.id
      LIMIT $1
    $query$ USING LEAST(GREATEST(p_limit, 1), 1000)
    LOOP
      PERFORM public.enqueue_notification(
        v_row.host_id, 'circle_activity', 'Van kedved új alkalmat indítani?',
        COALESCE(v_row.name, 'A köröd') || ' egy ideje szünetel. Csak akkor szervezz új programot, ha ez most jólesik és van rá kapacitásod.',
        jsonb_build_object('circle_id', v_row.circle_id, 'deep_link', '/profile', 'source_type', 'circle_health', 'source_id', v_row.circle_id),
        'dormant-circle:' || v_row.circle_id::text || ':' || v_bucket,
        'dormant-circle:' || v_row.circle_id::text || ':' || v_row.host_id::text || ':' || v_bucket,
        NULL, NULL, 1, now(), now() + interval '30 days', gen_random_uuid(), 'in_app'
      );
      v_dormant := v_dormant + 1;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('mutual_candidates', v_mutual, 'dormant_circle_candidates', v_dormant, 'schema_ready', true);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_social_graph_notifications(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_social_graph_notifications(timestamptz, integer) TO service_role;

COMMIT;
