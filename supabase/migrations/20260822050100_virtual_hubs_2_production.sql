-- Prompt 05 + Premium Addendum: canonical hub identity, duplicate-safe backfill,
-- scoped incremental reconciliation, activation lifecycle and operational audit.

ALTER TABLE public.virtual_hubs
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'latent',
  ADD COLUMN IF NOT EXISTS is_discoverable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS community_rules text,
  ADD COLUMN IF NOT EXISTS real_member_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_member_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unknown_member_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activity_freshness_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_hubs_join_policy_check') THEN
    ALTER TABLE public.virtual_hubs ADD CONSTRAINT virtual_hubs_join_policy_check
      CHECK (join_policy IN ('automatic', 'open', 'approval', 'invite_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_hubs_lifecycle_check') THEN
    ALTER TABLE public.virtual_hubs ADD CONSTRAINT virtual_hubs_lifecycle_check
      CHECK (lifecycle_state IN ('latent', 'recruiting', 'active', 'inactive', 'archived'));
  END IF;
END;
$$;

UPDATE public.virtual_hubs
SET identity_key = lower(btrim(hobby_category)) || '|' ||
  lower(coalesce(NULLIF(btrim(hobby_subcategory), ''), '-')) || '|' ||
  lower(coalesce(NULLIF(btrim(hobby_activity), ''), '-')) || '|' ||
  lower(coalesce(NULLIF(btrim(city), ''), '-'))
WHERE identity_key IS NULL OR btrim(identity_key) = '';

CREATE TEMP TABLE virtual_hub_dedup_map AS
SELECT
  id AS old_hub_id,
  first_value(id) OVER (PARTITION BY identity_key ORDER BY created_at, id) AS keeper_hub_id
FROM public.virtual_hubs;

INSERT INTO public.virtual_hub_members (hub_id, user_id, joined_at)
SELECT m.keeper_hub_id, hm.user_id, min(hm.joined_at)
FROM virtual_hub_dedup_map m
JOIN public.virtual_hub_members hm ON hm.hub_id = m.old_hub_id
WHERE m.old_hub_id <> m.keeper_hub_id
GROUP BY m.keeper_hub_id, hm.user_id
ON CONFLICT (hub_id, user_id) DO NOTHING;

DELETE FROM public.virtual_hub_members hm
USING virtual_hub_dedup_map m
WHERE hm.hub_id = m.old_hub_id AND m.old_hub_id <> m.keeper_hub_id;

DELETE FROM public.virtual_hubs h
USING virtual_hub_dedup_map m
WHERE h.id = m.old_hub_id AND m.old_hub_id <> m.keeper_hub_id;

DROP TABLE virtual_hub_dedup_map;

ALTER TABLE public.virtual_hubs ALTER COLUMN identity_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_hubs_identity_key_uidx ON public.virtual_hubs (identity_key);

CREATE OR REPLACE FUNCTION public.set_virtual_hub_identity_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.identity_key := lower(btrim(NEW.hobby_category)) || '|' ||
    lower(coalesce(NULLIF(btrim(NEW.hobby_subcategory), ''), '-')) || '|' ||
    lower(coalesce(NULLIF(btrim(NEW.hobby_activity), ''), '-')) || '|' ||
    lower(coalesce(NULLIF(btrim(NEW.city), ''), '-'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_virtual_hub_identity_key ON public.virtual_hubs;
CREATE TRIGGER set_virtual_hub_identity_key
  BEFORE INSERT OR UPDATE OF hobby_category, hobby_subcategory, hobby_activity, city
  ON public.virtual_hubs
  FOR EACH ROW EXECUTE FUNCTION public.set_virtual_hub_identity_key();

ALTER TABLE public.virtual_hub_members
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS join_source text NOT NULL DEFAULT 'legacy_refresh',
  ADD COLUMN IF NOT EXISTS policy_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_attendance_at timestamptz,
  ADD COLUMN IF NOT EXISTS repeat_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_hub_members_status_check') THEN
    ALTER TABLE public.virtual_hub_members ADD CONSTRAINT virtual_hub_members_status_check
      CHECK (membership_status IN ('pending', 'active', 'left', 'removed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_hub_members_join_source_check') THEN
    ALTER TABLE public.virtual_hub_members ADD CONSTRAINT virtual_hub_members_join_source_check
      CHECK (join_source IN ('legacy_refresh', 'interest_reconciliation', 'open_join', 'approved', 'invited'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS virtual_hub_members_user_status_idx
  ON public.virtual_hub_members (user_id, membership_status);

CREATE TABLE IF NOT EXISTS public.virtual_hub_activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.virtual_hubs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN (
    'discovery', 'preview', 'join_request', 'joined', 'first_activity', 'first_attendance', 'repeat_activity', 'reactivation'
  )),
  source text NOT NULL DEFAULT 'web',
  dedupe_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS virtual_hub_activation_funnel_idx
  ON public.virtual_hub_activation_events (hub_id, stage, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.virtual_hub_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  run_type text NOT NULL DEFAULT 'single_user' CHECK (run_type IN ('single_user', 'batch', 'repair')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped_locked')),
  memberships_added integer NOT NULL DEFAULT 0,
  memberships_reactivated integer NOT NULL DEFAULT 0,
  memberships_soft_left integer NOT NULL DEFAULT 0,
  hubs_touched integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS virtual_hub_reconciliation_status_idx
  ON public.virtual_hub_reconciliation_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.virtual_hub_moderation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.virtual_hubs(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.user_reports(id) ON DELETE SET NULL,
  item_type text NOT NULL CHECK (item_type IN ('join_request', 'member_report', 'content_report', 'reactivation_review')),
  subject_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_hub_activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_hub_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_hub_moderation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Discoverable hubs are visible to members" ON public.virtual_hubs;
CREATE POLICY "Discoverable hubs are visible to members" ON public.virtual_hubs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (is_discoverable AND lifecycle_state IN ('recruiting', 'active'))
    OR host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.virtual_hub_members m
      WHERE m.hub_id = id AND m.user_id = auth.uid() AND m.membership_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users view own activation history" ON public.virtual_hub_activation_events;
CREATE POLICY "Users view own activation history" ON public.virtual_hub_activation_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins view hub reconciliation" ON public.virtual_hub_reconciliation_runs;
CREATE POLICY "Admins view hub reconciliation" ON public.virtual_hub_reconciliation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Hub hosts manage moderation items" ON public.virtual_hub_moderation_items;
CREATE POLICY "Hub hosts manage moderation items" ON public.virtual_hub_moderation_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.virtual_hubs h WHERE h.id = hub_id AND h.host_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.virtual_hubs h WHERE h.id = hub_id AND h.host_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.reconcile_virtual_hub_member(
  _target_user_id uuid,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  run_id uuid;
  prior_run public.virtual_hub_reconciliation_runs%ROWTYPE;
  added_count integer := 0;
  reactivated_count integer := 0;
  left_count integer := 0;
  touched_count integer := 0;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _target_user_id IS NULL OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'target user and idempotency key are required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS DISTINCT FROM _target_user_id
    AND NOT public.has_role(auth.uid(), 'admin')
    AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized for target user' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO prior_run FROM public.virtual_hub_reconciliation_runs
  WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'run_id', prior_run.id, 'status', prior_run.status, 'idempotent_replay', true,
      'memberships_added', prior_run.memberships_added,
      'memberships_reactivated', prior_run.memberships_reactivated,
      'memberships_soft_left', prior_run.memberships_soft_left,
      'hubs_touched', prior_run.hubs_touched
    );
  END IF;

  INSERT INTO public.virtual_hub_reconciliation_runs (
    idempotency_key, requested_by, target_user_id, run_type
  ) VALUES (_idempotency_key, auth.uid(), _target_user_id, 'single_user')
  RETURNING id INTO run_id;

  IF NOT pg_try_advisory_xact_lock(hashtextextended('virtual-hub-user:' || _target_user_id::text, 0)) THEN
    UPDATE public.virtual_hub_reconciliation_runs
    SET status = 'skipped_locked', completed_at = now(), error_code = 'CONCURRENT_RECONCILIATION'
    WHERE id = run_id;
    RETURN jsonb_build_object('run_id', run_id, 'status', 'skipped_locked', 'idempotent_replay', false);
  END IF;

  WITH desired AS (
    SELECT DISTINCT
      btrim(hobby) AS hobby_category,
      p.city,
      lower(btrim(hobby)) || '|-|-|' || lower(coalesce(NULLIF(btrim(p.city), ''), '-')) AS identity_key
    FROM public.profiles p
    CROSS JOIN LATERAL unnest(coalesce(p.hobbies, '{}'::text[])) hobby
    WHERE p.user_id = _target_user_id AND btrim(hobby) <> '' AND coalesce(p.is_active, true)
  )
  INSERT INTO public.virtual_hubs (
    hobby_category, city, identity_key, purpose, lifecycle_state, is_discoverable, last_reconciled_at
  )
  SELECT d.hobby_category, d.city, d.identity_key,
    'Local ' || d.hobby_category || ' community', 'latent', false, now()
  FROM desired d
  ON CONFLICT (identity_key)
  DO UPDATE SET last_reconciled_at = now(), updated_at = now();

  WITH desired_hubs AS (
    SELECT h.id
    FROM public.virtual_hubs h
    JOIN public.profiles p ON p.user_id = _target_user_id
    CROSS JOIN LATERAL unnest(coalesce(p.hobbies, '{}'::text[])) hobby
    WHERE h.identity_key = lower(btrim(hobby)) || '|-|-|' || lower(coalesce(NULLIF(btrim(p.city), ''), '-'))
  ), before_rows AS (
    SELECT m.hub_id, m.membership_status FROM public.virtual_hub_members m
    JOIN desired_hubs d ON d.id = m.hub_id
    WHERE m.user_id = _target_user_id
  ), upserted AS (
    INSERT INTO public.virtual_hub_members (
      hub_id, user_id, membership_status, join_source, joined_at, left_at, updated_at
    )
    SELECT id, _target_user_id, 'active', 'interest_reconciliation', now(), NULL, now()
    FROM desired_hubs
    ON CONFLICT (hub_id, user_id)
    DO UPDATE SET membership_status = 'active', join_source = 'interest_reconciliation',
      left_at = NULL, updated_at = now()
    RETURNING hub_id
  )
  SELECT
    count(*) FILTER (WHERE b.hub_id IS NULL),
    count(*) FILTER (WHERE b.membership_status IN ('left', 'removed'))
  INTO added_count, reactivated_count
  FROM upserted u
  LEFT JOIN before_rows b ON b.hub_id = u.hub_id;

  WITH desired_hubs AS (
    SELECT h.id
    FROM public.virtual_hubs h
    JOIN public.profiles p ON p.user_id = _target_user_id
    CROSS JOIN LATERAL unnest(coalesce(p.hobbies, '{}'::text[])) hobby
    WHERE h.identity_key = lower(btrim(hobby)) || '|-|-|' || lower(coalesce(NULLIF(btrim(p.city), ''), '-'))
  )
  UPDATE public.virtual_hub_members m
  SET membership_status = 'left', left_at = coalesce(left_at, now()), updated_at = now()
  WHERE m.user_id = _target_user_id
    AND m.membership_status = 'active'
    AND NOT EXISTS (SELECT 1 FROM desired_hubs d WHERE d.id = m.hub_id);
  GET DIAGNOSTICS left_count = ROW_COUNT;

  WITH touched AS (
    SELECT DISTINCT hub_id FROM public.virtual_hub_members WHERE user_id = _target_user_id
  ), counts AS (
    SELECT
      t.hub_id,
      count(*) FILTER (WHERE m.membership_status = 'active' AND p.user_origin = 'real')::integer AS real_count,
      count(*) FILTER (WHERE m.membership_status = 'active' AND p.user_origin = 'generated')::integer AS generated_count,
      count(*) FILTER (WHERE m.membership_status = 'active' AND p.user_origin IS NULL)::integer AS unknown_count
    FROM touched t
    LEFT JOIN public.virtual_hub_members m ON m.hub_id = t.hub_id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    GROUP BY t.hub_id
  )
  UPDATE public.virtual_hubs h
  SET real_member_count = c.real_count,
      generated_member_count = c.generated_count,
      unknown_member_count = c.unknown_count,
      member_count = c.real_count + c.generated_count + c.unknown_count,
      last_reconciled_at = now(),
      lifecycle_state = CASE
        WHEN h.lifecycle_state = 'archived' THEN 'archived'
        WHEN c.real_count >= 3 THEN 'recruiting'
        ELSE 'latent'
      END,
      updated_at = now()
  FROM counts c
  WHERE h.id = c.hub_id;
  GET DIAGNOSTICS touched_count = ROW_COUNT;

  UPDATE public.virtual_hub_reconciliation_runs
  SET status = 'completed', memberships_added = added_count,
      memberships_reactivated = reactivated_count,
      memberships_soft_left = left_count, hubs_touched = touched_count, completed_at = now()
  WHERE id = run_id;

  RETURN jsonb_build_object(
    'run_id', run_id, 'status', 'completed', 'idempotent_replay', false,
    'memberships_added', added_count, 'memberships_reactivated', reactivated_count,
    'memberships_soft_left', left_count, 'hubs_touched', touched_count
  );
EXCEPTION WHEN OTHERS THEN
  IF run_id IS NULL THEN
    RAISE;
  END IF;
  IF run_id IS NOT NULL THEN
    UPDATE public.virtual_hub_reconciliation_runs
    SET status = 'failed', error_code = SQLSTATE, error_message = left(SQLERRM, 500), completed_at = now()
    WHERE id = run_id;
  END IF;
  RETURN jsonb_build_object('run_id', run_id, 'status', 'failed', 'error_code', SQLSTATE);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_virtual_hub_join(
  _hub_id uuid,
  _acknowledge_rules boolean,
  _idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Idempotency key required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id AND lifecycle_state <> 'archived';
  IF NOT FOUND OR hub_row.join_policy IN ('automatic', 'invite_only') THEN
    RAISE EXCEPTION 'Hub does not accept direct join requests' USING ERRCODE = '22023';
  END IF;
  IF hub_row.community_rules IS NOT NULL AND NOT _acknowledge_rules THEN
    RAISE EXCEPTION 'Community rules must be acknowledged' USING ERRCODE = '22023';
  END IF;

  next_status := CASE WHEN hub_row.join_policy = 'open' THEN 'active' ELSE 'pending' END;
  INSERT INTO public.virtual_hub_members (
    hub_id, user_id, membership_status, join_source, policy_acknowledged_at, left_at, updated_at
  ) VALUES (
    _hub_id, auth.uid(), next_status, 'open_join', CASE WHEN _acknowledge_rules THEN now() END, NULL, now()
  )
  ON CONFLICT (hub_id, user_id)
  DO UPDATE SET membership_status = EXCLUDED.membership_status,
    policy_acknowledged_at = EXCLUDED.policy_acknowledged_at, left_at = NULL, updated_at = now();

  INSERT INTO public.virtual_hub_activation_events (hub_id, user_id, stage, dedupe_key)
  VALUES (_hub_id, auth.uid(), CASE WHEN next_status = 'active' THEN 'joined' ELSE 'join_request' END, _idempotency_key)
  ON CONFLICT (dedupe_key) DO NOTHING;

  IF next_status = 'pending' THEN
    INSERT INTO public.virtual_hub_moderation_items (hub_id, item_type, subject_user_id)
    SELECT _hub_id, 'join_request', auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.virtual_hub_moderation_items
      WHERE hub_id = _hub_id AND item_type = 'join_request' AND subject_user_id = auth.uid()
        AND status IN ('open', 'in_review')
    );
  END IF;
  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_virtual_hub_activation(
  _hub_id uuid,
  _stage text,
  _dedupe_key text
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
  IF _stage NOT IN ('discovery', 'preview', 'first_activity', 'first_attendance', 'repeat_activity', 'reactivation') THEN
    RAISE EXCEPTION 'Unsupported activation stage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.virtual_hub_activation_events (hub_id, user_id, stage, dedupe_key)
  VALUES (_hub_id, auth.uid(), _stage, _dedupe_key)
  ON CONFLICT (dedupe_key) DO NOTHING;

  IF _stage IN ('first_activity', 'first_attendance', 'repeat_activity') THEN
    UPDATE public.virtual_hub_members SET
      first_activity_at = CASE WHEN _stage = 'first_activity' THEN coalesce(first_activity_at, now()) ELSE first_activity_at END,
      first_attendance_at = CASE WHEN _stage = 'first_attendance' THEN coalesce(first_attendance_at, now()) ELSE first_attendance_at END,
      repeat_activity_at = CASE WHEN _stage = 'repeat_activity' THEN coalesce(repeat_activity_at, now()) ELSE repeat_activity_at END,
      updated_at = now()
    WHERE hub_id = _hub_id AND user_id = auth.uid();
    UPDATE public.virtual_hubs SET activity_freshness_at = now(), updated_at = now() WHERE id = _hub_id;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.virtual_hub_discovery_cards
WITH (security_barrier = true)
AS
SELECT
  h.id,
  h.hobby_category,
  h.hobby_subcategory,
  h.hobby_activity,
  h.city,
  h.purpose,
  h.host_id,
  h.join_policy,
  h.lifecycle_state,
  h.real_member_count AS member_count,
  h.activity_freshness_at,
  h.welcome_message,
  h.community_rules
FROM public.virtual_hubs h
WHERE h.is_discoverable
  AND h.lifecycle_state IN ('recruiting', 'active')
  AND (h.activity_freshness_at IS NULL OR h.activity_freshness_at > now() - interval '120 days');

REVOKE ALL ON public.virtual_hub_discovery_cards FROM PUBLIC;
GRANT SELECT ON public.virtual_hub_discovery_cards TO authenticated;

CREATE TABLE IF NOT EXISTS public.virtual_hub_admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hub_id uuid REFERENCES public.virtual_hubs(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_hub_admin_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view hub admin audit" ON public.virtual_hub_admin_audit_events;
CREATE POLICY "Admins view hub admin audit" ON public.virtual_hub_admin_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_update_virtual_hub_metadata(
  _hub_id uuid,
  _hobby_category text,
  _city text,
  _purpose text,
  _welcome_message text,
  _community_rules text,
  _join_policy text,
  _lifecycle_state text,
  _is_discoverable boolean,
  _actor_id uuid,
  _reason text
)
RETURNS public.virtual_hubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  before_row public.virtual_hubs%ROWTYPE;
  after_row public.virtual_hubs%ROWTYPE;
  next_identity_key text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_hobby_category, ''))) NOT BETWEEN 1 AND 120
    OR length(coalesce(_city, '')) > 160
    OR length(coalesce(_purpose, '')) > 500
    OR length(coalesce(_welcome_message, '')) > 1000
    OR length(coalesce(_community_rules, '')) > 4000
    OR _join_policy NOT IN ('automatic', 'open', 'approval', 'invite_only')
    OR _lifecycle_state NOT IN ('latent', 'recruiting', 'active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid hub metadata' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row FROM public.virtual_hubs WHERE id = _hub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub not found' USING ERRCODE = 'P0002';
  END IF;
  next_identity_key := lower(btrim(_hobby_category)) || '|' ||
    lower(coalesce(NULLIF(btrim(before_row.hobby_subcategory), ''), '-')) || '|' ||
    lower(coalesce(NULLIF(btrim(before_row.hobby_activity), ''), '-')) || '|' ||
    lower(coalesce(NULLIF(btrim(_city), ''), '-'));

  UPDATE public.virtual_hubs
  SET hobby_category = btrim(_hobby_category),
      city = NULLIF(btrim(_city), ''),
      identity_key = next_identity_key,
      purpose = NULLIF(btrim(_purpose), ''),
      welcome_message = NULLIF(btrim(_welcome_message), ''),
      community_rules = NULLIF(btrim(_community_rules), ''),
      join_policy = _join_policy,
      lifecycle_state = _lifecycle_state,
      is_discoverable = _is_discoverable,
      archived_at = CASE WHEN _lifecycle_state = 'archived' THEN coalesce(archived_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = _hub_id
  RETURNING * INTO after_row;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, hub_id, action, before_state, after_state, reason
  ) VALUES (
    _actor_id, _hub_id, 'metadata_updated', to_jsonb(before_row) - 'member_count',
    to_jsonb(after_row) - 'member_count', NULLIF(left(btrim(coalesce(_reason, '')), 500), '')
  );
  RETURN after_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_virtual_hubs_batch(
  _limit integer,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_run_id uuid;
  profile_row record;
  result jsonb;
  completed_count integer := 0;
  failed_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF _limit NOT BETWEEN 1 AND 500 OR length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Invalid batch arguments' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO batch_run_id FROM public.virtual_hub_reconciliation_runs
  WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('run_id', batch_run_id, 'status', 'idempotent_replay');
  END IF;

  INSERT INTO public.virtual_hub_reconciliation_runs (idempotency_key, requested_by, run_type)
  VALUES (_idempotency_key, auth.uid(), 'batch') RETURNING id INTO batch_run_id;

  IF NOT pg_try_advisory_xact_lock(hashtextextended('virtual-hubs-batch', 0)) THEN
    UPDATE public.virtual_hub_reconciliation_runs
    SET status = 'skipped_locked', completed_at = now(), error_code = 'CONCURRENT_BATCH'
    WHERE id = batch_run_id;
    RETURN jsonb_build_object('run_id', batch_run_id, 'status', 'skipped_locked');
  END IF;

  FOR profile_row IN
    SELECT p.user_id FROM public.profiles p
    WHERE p.user_id IS NOT NULL AND coalesce(p.is_active, true)
    ORDER BY p.updated_at, p.user_id
    LIMIT _limit
  LOOP
    result := public.reconcile_virtual_hub_member(
      profile_row.user_id,
      _idempotency_key || ':' || profile_row.user_id::text
    );
    IF result->>'status' = 'completed' THEN
      completed_count := completed_count + 1;
    ELSE
      failed_count := failed_count + 1;
    END IF;
  END LOOP;

  UPDATE public.virtual_hub_reconciliation_runs
  SET status = CASE WHEN failed_count = 0 THEN 'completed' ELSE 'failed' END,
      completed_at = now(),
      metadata = jsonb_build_object('profiles_completed', completed_count, 'profiles_failed', failed_count)
  WHERE id = batch_run_id;

  RETURN jsonb_build_object(
    'run_id', batch_run_id,
    'status', CASE WHEN failed_count = 0 THEN 'completed' ELSE 'failed' END,
    'profiles_completed', completed_count,
    'profiles_failed', failed_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_virtual_hub_member(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_virtual_hub_join(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_virtual_hub_activation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_virtual_hub_metadata(uuid, text, text, text, text, text, text, text, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_virtual_hubs_batch(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_virtual_hub_member(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_virtual_hub_join(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_virtual_hub_activation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_virtual_hub_metadata(uuid, text, text, text, text, text, text, text, boolean, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_virtual_hubs_batch(integer, text) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.virtual_hub_activation_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.virtual_hub_reconciliation_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.virtual_hub_admin_audit_events FROM anon, authenticated;

DROP TRIGGER IF EXISTS update_virtual_hub_members_updated_at ON public.virtual_hub_members;
CREATE TRIGGER update_virtual_hub_members_updated_at BEFORE UPDATE ON public.virtual_hub_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_virtual_hub_moderation_items_updated_at ON public.virtual_hub_moderation_items;
CREATE TRIGGER update_virtual_hub_moderation_items_updated_at BEFORE UPDATE ON public.virtual_hub_moderation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.virtual_hubs.identity_key IS
  'Canonical lowercased category|subcategory|activity|city identity; never relies on nullable UNIQUE semantics.';
COMMENT ON FUNCTION public.reconcile_virtual_hub_member(uuid, text) IS
  'Scoped, idempotent, concurrency-locked reconciliation. Never performs a global membership delete.';
