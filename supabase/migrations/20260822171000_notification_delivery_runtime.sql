-- Prompt 10 completion: durable external-channel queue leases, send-time
-- guards, digest materialization, push subscriptions and retry/dead-letter
-- plumbing. Provider credentials remain environment-only and are not enabled
-- by this migration.
--
-- Rollback: stop the worker first, revoke worker RPCs, then drop the new
-- tables/functions/columns. Existing notification ledger rows remain valid.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_claim_token_uidx
  ON public.notifications (claim_token) WHERE claim_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_external_due_idx
  ON public.notifications (scheduled_at, priority DESC)
  WHERE channel IN ('email','push') AND delivery_status IN ('scheduled','failed','queued');

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_contract_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_contract_check CHECK (type IN (
  'friend_request', 'event_invite', 'favorite_category_event', 'recommended_event',
  'waitlist_promoted', 'organizer_message', 'event_changed', 'event_cancelled',
  'upcoming_event_reminder', 'post_event_feedback', 'mutual_reconnection',
  'circle_invite', 'circle_activity', 'community_digest', 'hub_opportunity',
  'organizer_reminder', 'new_device', 'security_alert', 'admin_notice'
)) NOT VALID;

CREATE TABLE IF NOT EXISTS public.notification_digest_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_mode text NOT NULL CHECK (digest_mode IN ('daily','weekly')),
  window_key text NOT NULL CHECK (length(window_key) BETWEEN 8 AND 40),
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'delivered' CHECK (status IN ('materialized','delivered','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (user_id, digest_mode, window_key)
);
CREATE TABLE IF NOT EXISTS public.notification_digest_items (
  digest_id uuid NOT NULL REFERENCES public.notification_digest_batches(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_id, notification_id),
  UNIQUE (notification_id)
);
ALTER TABLE public.notification_digest_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_digest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own digest batches" ON public.notification_digest_batches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read own digest items" ON public.notification_digest_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.notification_digest_batches b
    WHERE b.id = notification_digest_items.digest_id AND b.user_id = auth.uid()
  ));
REVOKE INSERT, UPDATE, DELETE ON public.notification_digest_batches, public.notification_digest_items
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint_hash text NOT NULL CHECK (endpoint_hash ~ '^[a-f0-9]{64}$'),
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 20 AND 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 16 AND 512),
  auth_secret text NOT NULL CHECK (length(auth_secret) BETWEEN 8 AND 256),
  expiration_time timestamptz,
  user_agent_family text CHECK (user_agent_family IS NULL OR length(user_agent_family) <= 120),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint_hash)
);
CREATE INDEX IF NOT EXISTS user_push_subscriptions_active_idx
  ON public.user_push_subscriptions (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Subscription endpoints and crypto material never need to be readable from
-- the browser after registration. The authenticated Edge endpoint returns only
-- a redacted active-count status.
CREATE POLICY "Service manages push subscriptions" ON public.user_push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.user_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO service_role;

INSERT INTO public.notification_templates (
  template_key, version, locale, notification_type, category,
  title_template, body_template, is_active
) VALUES (
  'community.digest', 1, 'hu-HU', 'community_digest', 'community',
  'Közösségi összefoglalód',
  'Az általad választott ritmusban összegyűjtöttük a közösségi és ajánlási értesítéseket.', true
)
ON CONFLICT (template_key, version, locale) DO NOTHING;

CREATE OR REPLACE FUNCTION public.normalize_future_notification_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.scheduled_at > now() + interval '1 second'
     AND NEW.delivery_status = 'delivered' THEN
    NEW.delivery_status := 'scheduled';
    NEW.delivered_at := NULL;
    NEW.suppression_reason := COALESCE(NEW.suppression_reason, 'scheduled');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_future_notification_schedule() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_normalize_future_notification_schedule ON public.notifications;
CREATE TRIGGER trg_normalize_future_notification_schedule
  BEFORE INSERT OR UPDATE OF scheduled_at, delivery_status ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.normalize_future_notification_schedule();

CREATE OR REPLACE FUNCTION public.materialize_due_notification_digests(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  digest_row record;
  digest_id uuid;
  digest_count integer := 0;
  item_total integer := 0;
  notification_ids uuid[];
  digest_key text;
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  FOR digest_row IN
    SELECT n.user_id, p.digest_mode,
      CASE WHEN p.digest_mode = 'weekly'
        THEN to_char(now() AT TIME ZONE p.timezone, 'IYYY-IW')
        ELSE to_char(now() AT TIME ZONE p.timezone, 'YYYY-MM-DD') END AS window_key,
      (array_agg(n.id ORDER BY n.priority DESC, n.created_at))[1:500] AS ids
    FROM public.notifications n
    JOIN public.notification_preferences p ON p.user_id = n.user_id
    WHERE n.delivery_status = 'scheduled'
      AND n.suppression_reason = 'digest'
      AND n.scheduled_at <= now()
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND n.category IN ('community','recommendation')
      AND p.digest_mode IN ('daily','weekly')
    GROUP BY n.user_id, p.digest_mode, p.timezone
    ORDER BY min(n.scheduled_at)
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
  LOOP
    notification_ids := digest_row.ids;
    IF cardinality(notification_ids) = 0 THEN CONTINUE; END IF;
    INSERT INTO public.notification_digest_batches (
      user_id, digest_mode, window_key, item_count, status, delivered_at
    ) VALUES (
      digest_row.user_id, digest_row.digest_mode, digest_row.window_key,
      cardinality(notification_ids), 'delivered', now()
    )
    ON CONFLICT (user_id, digest_mode, window_key) DO UPDATE SET
      item_count = public.notification_digest_batches.item_count + EXCLUDED.item_count,
      delivered_at = now()
    RETURNING id INTO digest_id;

    INSERT INTO public.notification_digest_items (digest_id, notification_id)
    SELECT digest_id, id FROM unnest(notification_ids) id
    ON CONFLICT (notification_id) DO NOTHING;

    UPDATE public.notifications SET
      delivery_status = 'suppressed', suppression_reason = 'batched_into_digest',
      delivered_at = NULL, is_read = true
    WHERE id = ANY(notification_ids) AND delivery_status = 'scheduled';

    digest_key := 'community-digest:' || digest_row.user_id::text || ':' || digest_row.digest_mode || ':' || digest_row.window_key;
    INSERT INTO public.notifications (
      user_id, type, title, body, data, is_read, category, channel, priority,
      deep_link, dedupe_key, event_key, template_key, template_version,
      delivery_status, scheduled_at, delivered_at, source_type, source_id
    ) VALUES (
      digest_row.user_id, 'community_digest', 'Közösségi összefoglalód',
      cardinality(notification_ids)::text || ' értesítést foglaltunk össze a beállított ritmusod szerint.',
      jsonb_build_object('digest_id', digest_id, 'item_count', cardinality(notification_ids),
        'deep_link', '/profile', 'source_type', 'notification_digest', 'source_id', digest_id),
      false, 'community', 'in_app', 2, '/profile', digest_key, digest_key,
      'community.digest', 1, 'delivered', now(), now(), 'notification_digest', digest_id::text
    ) ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    digest_count := digest_count + 1;
    item_total := item_total + cardinality(notification_ids);
  END LOOP;
  RETURN jsonb_build_object('digest_count', digest_count, 'item_count', item_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_external_notifications_for_quiet_hours(p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE row_item record; local_time time; local_date date; next_send timestamptz; affected integer := 0;
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  FOR row_item IN
    SELECT n.id, p.quiet_start, p.quiet_end,
      CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = p.timezone)
        THEN p.timezone ELSE 'UTC' END AS timezone
    FROM public.notifications n
    JOIN public.notification_preferences p ON p.user_id = n.user_id
    WHERE n.channel IN ('email','push')
      AND n.delivery_status IN ('scheduled','failed')
      AND n.scheduled_at <= now()
      AND n.priority < 5
      AND p.quiet_hours_enabled
      AND p.quiet_start <> p.quiet_end
    ORDER BY n.priority DESC, n.scheduled_at
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    local_time := (now() AT TIME ZONE row_item.timezone)::time;
    local_date := (now() AT TIME ZONE row_item.timezone)::date;
    IF (row_item.quiet_start < row_item.quiet_end
        AND local_time >= row_item.quiet_start AND local_time < row_item.quiet_end)
       OR (row_item.quiet_start > row_item.quiet_end
        AND (local_time >= row_item.quiet_start OR local_time < row_item.quiet_end)) THEN
      IF row_item.quiet_start > row_item.quiet_end AND local_time >= row_item.quiet_start THEN
        local_date := local_date + 1;
      END IF;
      next_send := (local_date + row_item.quiet_end) AT TIME ZONE row_item.timezone;
      UPDATE public.notifications SET delivery_status = 'scheduled', scheduled_at = next_send,
        suppression_reason = 'quiet_hours', claim_token = NULL, claimed_at = NULL,
        claim_expires_at = NULL
      WHERE id = row_item.id;
      affected := affected + 1;
    END IF;
  END LOOP;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_external_notifications(
  p_worker_id text,
  p_limit integer DEFAULT 100,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
  notification_id uuid,
  user_id uuid,
  channel text,
  notification_type text,
  title text,
  body text,
  data jsonb,
  attempt_count integer,
  claim_token uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_worker_id, ''))) NOT BETWEEN 3 AND 120
     OR p_limit NOT BETWEEN 1 AND 500 OR p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'INVALID_CLAIM_REQUEST' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notifications n SET delivery_status = 'failed', claim_token = NULL,
    claimed_at = NULL, claim_expires_at = NULL, last_error_code = 'LEASE_EXPIRED'
  WHERE n.channel IN ('email','push') AND n.delivery_status = 'queued'
    AND n.claim_expires_at < now();

  UPDATE public.notifications n SET delivery_status = 'suppressed',
    suppression_reason = CASE
      WHEN n.expires_at IS NOT NULL AND n.expires_at <= now() THEN 'expired'
      WHEN COALESCE(p.user_origin, 'unknown') <> 'real' THEN 'non_real_recipient'
      WHEN n.channel = 'email' AND NOT COALESCE(pref.email_enabled, false) THEN 'channel_opt_out'
      WHEN n.channel = 'push' AND NOT COALESCE(pref.push_enabled, false) THEN 'channel_opt_out'
      WHEN n.priority < 5 AND (
        (n.category = 'organizer' AND NOT COALESCE(pref.organizer_enabled, true))
        OR (n.category = 'community' AND NOT COALESCE(pref.community_enabled, true))
        OR (n.category = 'recommendation' AND NOT COALESCE(pref.recommendation_enabled, true))
        OR (n.category = 'transactional' AND NOT COALESCE(pref.transactional_enabled, true))
      ) THEN 'category_opt_out'
      WHEN n.priority < 5 AND (
        SELECT count(*) FROM public.notifications recent
        WHERE recent.user_id = n.user_id AND recent.channel = n.channel
          AND recent.created_at >= date_trunc('day', now())
          AND recent.delivery_status IN ('sent','delivered')
      ) >= COALESCE(pref.frequency_cap_per_day, 12) THEN 'frequency_cap'
      WHEN n.actor_user_id IS NOT NULL
        AND n.type IN ('friend_request','mutual_reconnection','circle_invite','circle_activity')
        AND EXISTS (
          SELECT 1 FROM public.user_blocks b
          WHERE (b.blocker_id = n.actor_user_id AND b.blocked_id = n.user_id)
             OR (b.blocker_id = n.user_id AND b.blocked_id = n.actor_user_id)
        ) THEN 'relationship_blocked'
      ELSE 'stale_target' END,
    claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
  FROM public.profiles p
  LEFT JOIN public.notification_preferences pref ON pref.user_id = COALESCE(p.user_id, p.id)
  WHERE COALESCE(p.user_id, p.id) = n.user_id
    AND n.channel IN ('email','push')
    AND n.delivery_status IN ('scheduled','failed')
    AND (
      (n.expires_at IS NOT NULL AND n.expires_at <= now())
      OR COALESCE(p.user_origin, 'unknown') <> 'real'
      OR (n.channel = 'email' AND NOT COALESCE(pref.email_enabled, false))
      OR (n.channel = 'push' AND NOT COALESCE(pref.push_enabled, false))
      OR (n.priority < 5 AND (
        (n.category = 'organizer' AND NOT COALESCE(pref.organizer_enabled, true))
        OR (n.category = 'community' AND NOT COALESCE(pref.community_enabled, true))
        OR (n.category = 'recommendation' AND NOT COALESCE(pref.recommendation_enabled, true))
        OR (n.category = 'transactional' AND NOT COALESCE(pref.transactional_enabled, true))
      ))
      OR (n.priority < 5 AND (
        SELECT count(*) FROM public.notifications recent
        WHERE recent.user_id = n.user_id AND recent.channel = n.channel
          AND recent.created_at >= date_trunc('day', now())
          AND recent.delivery_status IN ('sent','delivered')
      ) >= COALESCE(pref.frequency_cap_per_day, 12))
      OR (n.actor_user_id IS NOT NULL
        AND n.type IN ('friend_request','mutual_reconnection','circle_invite','circle_activity')
        AND EXISTS (
          SELECT 1 FROM public.user_blocks b
          WHERE (b.blocker_id = n.actor_user_id AND b.blocked_id = n.user_id)
             OR (b.blocker_id = n.user_id AND b.blocked_id = n.actor_user_id)
        ))
      OR (COALESCE(n.data->>'event_id', '') <> '' AND n.type <> 'event_cancelled' AND NOT EXISTS (
        SELECT 1 FROM public.events e WHERE e.id::text = n.data->>'event_id' AND e.is_active
      ))
    );

  PERFORM public.defer_external_notifications_for_quiet_hours(LEAST(p_limit * 5, 5000));

  RETURN QUERY
  WITH due AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.channel IN ('email','push')
      AND n.delivery_status IN ('scheduled','failed')
      AND n.scheduled_at <= now()
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (
        n.delivery_status <> 'failed'
        OR NOT EXISTS (
          SELECT 1 FROM public.notification_delivery_attempts a
          WHERE a.notification_id = n.id AND a.status = 'failed'
            AND a.retryable AND a.next_retry_at > now()
        )
      )
    ORDER BY n.priority DESC, n.scheduled_at, n.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
  ), claimed AS (
    UPDATE public.notifications n SET
      delivery_status = 'queued', claim_token = gen_random_uuid(), claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => p_lease_seconds),
      suppression_reason = NULL
    FROM due WHERE n.id = due.id
    RETURNING n.id, n.user_id, n.channel, n.type, n.title, n.body, n.data,
      n.attempt_count, n.claim_token, n.expires_at
  )
  SELECT c.id, c.user_id, c.channel, c.type, c.title, c.body, c.data,
    c.attempt_count, c.claim_token, c.expires_at
  FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_external_notification_claim(
  p_notification_id uuid,
  p_claim_token uuid,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_response_code text,
  p_error_code text,
  p_retryable boolean,
  p_safe_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE attempt_id uuid;
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.id = p_notification_id AND n.claim_token = p_claim_token
      AND n.delivery_status = 'queued' AND n.claim_expires_at > now()
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED_CLAIM' USING ERRCODE = 'P0001';
  END IF;
  attempt_id := public.record_notification_delivery_attempt(
    p_notification_id, p_status, p_provider, p_provider_message_id,
    p_response_code, p_error_code, p_retryable, p_safe_metadata
  );
  UPDATE public.notifications SET claim_token = NULL, claimed_at = NULL,
    claim_expires_at = NULL
  WHERE id = p_notification_id AND claim_token = p_claim_token;
  RETURN attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.suppress_external_notification_claim(
  p_notification_id uuid,
  p_claim_token uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_reason NOT IN ('provider_not_configured','recipient_unavailable','subscription_missing','stale_target') THEN
    RAISE EXCEPTION 'INVALID_SUPPRESSION_REASON' USING ERRCODE = '22023';
  END IF;
  UPDATE public.notifications SET delivery_status = 'suppressed',
    suppression_reason = p_reason, claim_token = NULL, claimed_at = NULL,
    claim_expires_at = NULL, last_error_code = NULL
  WHERE id = p_notification_id AND claim_token = p_claim_token
    AND delivery_status = 'queued' AND claim_expires_at > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_due_organizer_messages(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE affected integer;
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  WITH due AS (
    SELECT id FROM public.event_messages
    WHERE delivery_state = 'scheduled' AND scheduled_for <= now()
    ORDER BY scheduled_for, id FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  )
  UPDATE public.event_messages m SET delivery_state = 'sent'
  FROM due WHERE m.id = due.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_due_notification_digests(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_external_notifications_for_quiet_hours(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_external_notifications(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_external_notification_claim(uuid, uuid, text, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suppress_external_notification_claim(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_due_organizer_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_due_notification_digests(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_external_notifications_for_quiet_hours(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_external_notifications(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_external_notification_claim(uuid, uuid, text, text, text, text, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.suppress_external_notification_claim(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_due_organizer_messages(integer) TO service_role;

COMMENT ON TABLE public.user_push_subscriptions IS
  'Server-only Web Push subscription material. Browser access is limited to authenticated register/revoke Edge actions.';
COMMENT ON FUNCTION public.claim_due_external_notifications(text, integer, integer) IS
  'Bounded SKIP LOCKED lease with send-time origin, opt-out, stale-target, expiry and quiet-hour guards.';

COMMIT;
