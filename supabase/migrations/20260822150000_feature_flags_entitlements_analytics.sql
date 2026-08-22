-- Prompt 15: provider-independent feature flags, entitlements and
-- privacy-safe product analytics. No payment provider, charge, payout or
-- subscription activation is configured by this migration.

BEGIN;

CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0,
  cohorts text[] NOT NULL DEFAULT '{}'::text[],
  eligibility_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL,
  description text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_key_check CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT feature_flags_rollout_check CHECK (rollout_percentage BETWEEN 0 AND 100),
  CONSTRAINT feature_flags_eligibility_object CHECK (jsonb_typeof(eligibility_rule) = 'object')
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read feature flag state"
ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage feature flags"
ON public.feature_flags FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.feature_flag_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_overrides_unique UNIQUE (flag_key, user_id),
  CONSTRAINT feature_flag_overrides_reason_length CHECK (char_length(reason) BETWEEN 3 AND 500)
);

CREATE INDEX feature_flag_overrides_user_idx ON public.feature_flag_overrides (user_id, flag_key);
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own feature flag overrides"
ON public.feature_flag_overrides FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage feature flag overrides"
ON public.feature_flag_overrides FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.feature_flag_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE RESTRICT,
  subject_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_scope text NOT NULL DEFAULT 'flag',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled_before boolean,
  enabled_after boolean NOT NULL,
  rollout_before integer,
  rollout_after integer NOT NULL,
  config_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_audit_scope_check CHECK (change_scope IN ('flag', 'override')),
  CONSTRAINT feature_flag_audit_config_object CHECK (
    jsonb_typeof(config_before) = 'object' AND jsonb_typeof(config_after) = 'object'
  )
);

ALTER TABLE public.feature_flag_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read feature flag audit"
ON public.feature_flag_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.feature_flags (
  key, enabled, rollout_percentage, cohorts, owner, expires_at, description
)
VALUES
  ('connections', false, 0, ARRAY['internal'], 'product-social', '2026-11-30T23:59:59Z', 'Mutual reconnection and connection surfaces'),
  ('circles', false, 0, ARRAY['internal'], 'product-social', '2026-11-30T23:59:59Z', 'Persistent activity circles'),
  ('hub2', false, 0, ARRAY['internal'], 'community-ops', '2026-11-30T23:59:59Z', 'Virtual Hubs 2.0 activation'),
  ('ai_proposals', false, 0, ARRAY['internal'], 'community-ops', '2026-10-31T23:59:59Z', 'Human-reviewed AI event proposals'),
  ('new_recommender', false, 0, ARRAY['internal'], 'product-discovery', '2026-10-31T23:59:59Z', 'Explainable diversity-aware ranking'),
  ('moderation', false, 0, ARRAY['internal'], 'trust-safety', '2026-09-30T23:59:59Z', 'Moderation queue operator rollout; report and block remain core access'),
  ('analytics', false, 0, ARRAY['internal'], 'data-product', '2026-09-30T23:59:59Z', 'Privacy-safe product analytics ingestion'),
  ('organizer_pro', false, 0, ARRAY['internal'], 'monetization', '2026-11-30T23:59:59Z', 'Organizer Pro tooling hypothesis'),
  ('promoted_experiences', false, 0, ARRAY['internal'], 'monetization', '2026-11-30T23:59:59Z', 'Clearly labelled promoted experiences hypothesis')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_feature_flag(
  _flag_key text,
  _subject_id uuid,
  _cohort text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flag_record public.feature_flags%ROWTYPE;
  override_value boolean;
  bucket bigint;
BEGIN
  -- A global disable/expiry is the authoritative kill switch. A stale or
  -- previously granted subject override must never resurrect a disabled flag.
  SELECT * INTO flag_record FROM public.feature_flags WHERE key = _flag_key;
  IF NOT FOUND OR NOT flag_record.enabled OR flag_record.expires_at <= now() THEN
    RETURN false;
  END IF;

  SELECT enabled INTO override_value
  FROM public.feature_flag_overrides
  WHERE flag_key = _flag_key
    AND user_id = _subject_id
    AND expires_at > now();
  IF FOUND THEN
    RETURN override_value;
  END IF;

  IF cardinality(flag_record.cohorts) > 0
     AND (_cohort IS NULL OR NOT (_cohort = ANY(flag_record.cohorts))) THEN
    RETURN false;
  END IF;
  -- Arbitrary JSON must never become an implicit allow. Until a typed rule
  -- interpreter is introduced, non-empty advanced eligibility fails closed;
  -- cohorts and audited per-user overrides are the supported targeting modes.
  IF flag_record.eligibility_rule <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF flag_record.rollout_percentage <= 0 THEN RETURN false; END IF;
  IF flag_record.rollout_percentage >= 100 THEN RETURN true; END IF;

  bucket := mod(abs(hashtextextended(_flag_key || ':' || _subject_id::text, 0)::numeric), 100)::bigint;
  RETURN bucket < flag_record.rollout_percentage;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_feature_flag(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_feature_flag(text, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(
  _flag_key text,
  _enabled boolean,
  _rollout_percentage integer,
  _cohorts text[],
  _eligibility_rule jsonb,
  _owner text,
  _expires_at timestamptz,
  _reason text,
  _correlation_id text,
  _idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  before_enabled boolean;
  before_rollout integer;
  before_cohorts text[];
  before_eligibility jsonb;
  before_owner text;
  before_expiry timestamptz;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _rollout_percentage NOT BETWEEN 0 AND 100 OR _expires_at <= now()
     OR jsonb_typeof(COALESCE(_eligibility_rule, '{}'::jsonb)) <> 'object'
     OR char_length(trim(COALESCE(_owner, ''))) NOT BETWEEN 3 AND 100
     OR char_length(trim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'invalid feature flag change' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feature_flag_audit_log WHERE idempotency_key = _idempotency_key) THEN
    RETURN _flag_key;
  END IF;

  SELECT enabled, rollout_percentage, cohorts, eligibility_rule, owner, expires_at
  INTO before_enabled, before_rollout, before_cohorts, before_eligibility, before_owner, before_expiry
  FROM public.feature_flags WHERE key = _flag_key
  FOR UPDATE;
  IF before_enabled IS NULL THEN
    RAISE EXCEPTION 'feature flag not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.feature_flags
  SET enabled = _enabled,
      rollout_percentage = _rollout_percentage,
      cohorts = COALESCE(_cohorts, '{}'::text[]),
      eligibility_rule = COALESCE(_eligibility_rule, '{}'::jsonb),
      owner = trim(_owner),
      expires_at = _expires_at,
      updated_by = actor_id,
      updated_at = now()
  WHERE key = _flag_key;

  INSERT INTO public.feature_flag_audit_log (
    flag_key, actor_id, enabled_before, enabled_after, rollout_before,
    rollout_after, config_before, config_after, reason, correlation_id, idempotency_key
  ) VALUES (
    _flag_key, actor_id, before_enabled, _enabled, before_rollout,
    _rollout_percentage,
    jsonb_build_object('cohorts', before_cohorts, 'eligibility_rule', before_eligibility, 'owner', before_owner, 'expires_at', before_expiry),
    jsonb_build_object('cohorts', COALESCE(_cohorts, '{}'::text[]), 'eligibility_rule', COALESCE(_eligibility_rule, '{}'::jsonb), 'owner', trim(_owner), 'expires_at', _expires_at),
    trim(_reason), _correlation_id, _idempotency_key
  );
  RETURN _flag_key;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag(text, boolean, integer, text[], jsonb, text, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean, integer, text[], jsonb, text, timestamptz, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag_override(
  _flag_key text,
  _user_id uuid,
  _enabled boolean,
  _expires_at timestamptz,
  _reason text,
  _correlation_id text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  override_id uuid;
  before_enabled boolean;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _expires_at <= now() OR char_length(trim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'invalid feature flag override' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feature_flag_audit_log WHERE idempotency_key = _idempotency_key) THEN
    SELECT id INTO override_id FROM public.feature_flag_overrides
    WHERE flag_key = _flag_key AND user_id = _user_id;
    RETURN override_id;
  END IF;

  SELECT enabled INTO before_enabled FROM public.feature_flag_overrides
  WHERE flag_key = _flag_key AND user_id = _user_id
  FOR UPDATE;

  INSERT INTO public.feature_flag_overrides (
    flag_key, user_id, enabled, reason, expires_at, created_by
  ) VALUES (
    _flag_key, _user_id, _enabled, trim(_reason), _expires_at, actor_id
  )
  ON CONFLICT (flag_key, user_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      reason = EXCLUDED.reason,
      expires_at = EXCLUDED.expires_at,
      created_by = EXCLUDED.created_by,
      created_at = now()
  RETURNING id INTO override_id;

  INSERT INTO public.feature_flag_audit_log (
    flag_key, subject_user_id, change_scope, actor_id, enabled_before,
    enabled_after, rollout_before, rollout_after, reason, correlation_id, idempotency_key
  ) VALUES (
    _flag_key, _user_id, 'override', actor_id, before_enabled,
    _enabled, 0, 0, trim(_reason), _correlation_id, _idempotency_key
  );
  RETURN override_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag_override(text, uuid, boolean, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag_override(text, uuid, boolean, timestamptz, text, text, text) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.feature_flags, public.feature_flag_overrides FROM authenticated;

CREATE TABLE public.product_plans (
  key text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  audience text NOT NULL,
  currency text,
  amount_minor integer,
  billing_interval text,
  provider_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_plans_status_check CHECK (status IN ('draft', 'internal', 'active', 'retired')),
  CONSTRAINT product_plans_amount_check CHECK (amount_minor IS NULL OR amount_minor >= 0),
  CONSTRAINT product_plans_provider_activation_check CHECK (
    status <> 'active' OR (provider_key IS NOT NULL AND currency IS NOT NULL AND amount_minor IS NOT NULL)
  )
);

CREATE TABLE public.plan_features (
  plan_key text NOT NULL REFERENCES public.product_plans(key) ON DELETE CASCADE,
  feature_key text NOT NULL,
  limit_value integer,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (plan_key, feature_key),
  CONSTRAINT plan_features_limit_check CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT plan_features_config_object CHECK (jsonb_typeof(config) = 'object')
);

ALTER TABLE public.product_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read non-draft plans"
ON public.product_plans FOR SELECT TO authenticated
USING (status IN ('internal', 'active') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read features of visible plans"
ON public.plan_features FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.product_plans p
  WHERE p.key = plan_key AND (p.status IN ('internal', 'active') OR public.has_role(auth.uid(), 'admin'))
));
CREATE POLICY "Admins manage plans"
ON public.product_plans FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage plan features"
ON public.plan_features FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.product_plans (key, name, status, audience)
VALUES
  ('community_free', 'Community', 'internal', 'all users'),
  ('organizer_pro_hypothesis', 'Organizer Pro (hypothesis)', 'draft', 'organizers')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plan_features (plan_key, feature_key)
VALUES
  ('community_free', 'safety.report'),
  ('community_free', 'safety.block'),
  ('community_free', 'privacy.export'),
  ('community_free', 'privacy.delete'),
  ('community_free', 'events.discover'),
  ('community_free', 'events.join')
ON CONFLICT (plan_key, feature_key) DO NOTHING;

CREATE TABLE public.entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text REFERENCES public.product_plans(key) ON DELETE SET NULL,
  feature_key text NOT NULL,
  status text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  limit_value integer,
  used_value integer NOT NULL DEFAULT 0,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancellation_state text,
  refund_state text,
  tax_state text,
  invoice_state text,
  provider_event_ref text,
  reconciliation_status text NOT NULL DEFAULT 'not_required',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_grants_status_check CHECK (status IN ('trial', 'active', 'grace', 'cancelled', 'refunded', 'expired')),
  CONSTRAINT entitlement_grants_window_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT entitlement_grants_limits_check CHECK (
    (limit_value IS NULL OR limit_value >= 0) AND used_value >= 0
  ),
  CONSTRAINT entitlement_grants_reconcile_check CHECK (
    reconciliation_status IN ('not_required', 'pending', 'matched', 'mismatch', 'manual_review')
  ),
  CONSTRAINT entitlement_grants_unique_window UNIQUE (user_id, feature_key, starts_at)
);

CREATE INDEX entitlement_grants_lookup_idx
ON public.entitlement_grants (user_id, feature_key, status, starts_at, ends_at);
ALTER TABLE public.entitlement_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entitlements"
ON public.entitlement_grants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage entitlement grants"
ON public.entitlement_grants FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.entitlement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES public.entitlement_grants(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  status_before text,
  status_after text,
  reconciliation_before text,
  reconciliation_after text,
  reason text NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlement_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read entitlement audit"
ON public.entitlement_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_upsert_entitlement_grant(
  _grant_id uuid,
  _user_id uuid,
  _plan_key text,
  _feature_key text,
  _status text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _limit_value integer,
  _reason text,
  _correlation_id text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  grant_id uuid;
  before_status text;
  before_reconciliation text;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('trial', 'active', 'grace', 'cancelled', 'refunded', 'expired')
     OR _starts_at IS NULL OR (_ends_at IS NOT NULL AND _ends_at <= _starts_at)
     OR (_limit_value IS NOT NULL AND _limit_value < 0)
     OR char_length(trim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'invalid entitlement grant' USING ERRCODE = '22023';
  END IF;

  SELECT a.grant_id INTO grant_id
  FROM public.entitlement_audit_log a
  WHERE idempotency_key = _idempotency_key;
  IF grant_id IS NOT NULL THEN RETURN grant_id; END IF;

  IF _grant_id IS NOT NULL THEN
    SELECT status, reconciliation_status
    INTO before_status, before_reconciliation
    FROM public.entitlement_grants
    WHERE id = _grant_id
    FOR UPDATE;
    IF before_status IS NULL THEN
      RAISE EXCEPTION 'entitlement grant not found' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.entitlement_grants
    SET plan_key = _plan_key,
        feature_key = _feature_key,
        status = _status,
        starts_at = _starts_at,
        ends_at = _ends_at,
        limit_value = _limit_value,
        updated_at = now()
    WHERE id = _grant_id
    RETURNING id INTO grant_id;
  ELSE
    INSERT INTO public.entitlement_grants (
      user_id, plan_key, feature_key, status, starts_at, ends_at, limit_value
    ) VALUES (
      _user_id, _plan_key, _feature_key, _status, _starts_at, _ends_at, _limit_value
    ) RETURNING id, reconciliation_status INTO grant_id, before_reconciliation;
  END IF;

  INSERT INTO public.entitlement_audit_log (
    grant_id, actor_id, action, status_before, status_after,
    reconciliation_before, reconciliation_after, reason, correlation_id, idempotency_key
  ) VALUES (
    grant_id, actor_id, CASE WHEN _grant_id IS NULL THEN 'grant_created' ELSE 'grant_updated' END,
    before_status, _status, before_reconciliation, before_reconciliation,
    trim(_reason), _correlation_id, _idempotency_key
  );
  RETURN grant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_entitlement_grant(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_entitlement_grant(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, text) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.entitlement_grants FROM authenticated;

CREATE OR REPLACE FUNCTION public.has_entitlement(
  _user_id uuid,
  _feature_key text,
  _requested_units integer DEFAULT 1
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _feature_key IN (
      'safety.report', 'safety.block', 'privacy.export', 'privacy.delete',
      'events.discover', 'events.join'
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.entitlement_grants g
      WHERE g.user_id = _user_id
        AND g.feature_key = _feature_key
        AND g.status IN ('trial', 'active', 'grace')
        AND g.starts_at <= now()
        AND (g.ends_at IS NULL OR g.ends_at > now())
        AND (g.trial_ends_at IS NULL OR g.status <> 'trial' OR g.trial_ends_at > now())
        AND (g.grace_ends_at IS NULL OR g.status <> 'grace' OR g.grace_ends_at > now())
        AND (g.limit_value IS NULL OR g.used_value + GREATEST(_requested_units, 0) <= g.limit_value)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.has_entitlement(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid, text, integer) TO authenticated, service_role;

CREATE TABLE public.billing_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  provider_event_ref text NOT NULL,
  event_type text NOT NULL,
  redacted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received',
  reconciliation_status text NOT NULL DEFAULT 'pending',
  error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT billing_provider_events_unique UNIQUE (provider_key, provider_event_ref),
  CONSTRAINT billing_provider_events_status_check CHECK (processing_status IN ('received', 'processed', 'failed', 'quarantined')),
  CONSTRAINT billing_provider_events_reconcile_check CHECK (reconciliation_status IN ('pending', 'matched', 'mismatch', 'manual_review')),
  CONSTRAINT billing_provider_events_payload_object CHECK (jsonb_typeof(redacted_payload) = 'object')
);

ALTER TABLE public.billing_provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read billing provider events"
ON public.billing_provider_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.financial_exception_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  related_ref text NOT NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  safe_summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_exception_kind_check CHECK (kind IN ('entitlement', 'invoice', 'refund', 'tax', 'payout', 'reconciliation')),
  CONSTRAINT financial_exception_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT financial_exception_state_check CHECK (state IN ('open', 'investigating', 'resolved', 'dismissed'))
);

ALTER TABLE public.financial_exception_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage financial exceptions"
ON public.financial_exception_queue FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.product_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  actor_pseudonym text,
  session_pseudonym text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '395 days'),
  CONSTRAINT product_analytics_event_name_check CHECK (
    event_name IN (
      'onboarding_started', 'onboarding_completed', 'interest_selected',
      'event_impression', 'event_detail', 'event_join', 'waitlist_joined',
      'checked_in', 'completed', 'post_event_feedback', 'reconnection_sent',
      'reconnection_mutual', 'circle_created', 'circle_joined',
      'organizer_event_created', 'organizer_event_completed', 'hub_qualified',
      'auto_event_proposed', 'auto_event_published',
      'verified_or_confirmed_real_world_participation'
    )
  ),
  CONSTRAINT product_analytics_properties_object CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT product_analytics_schema_check CHECK (schema_version = 1)
);

CREATE INDEX product_analytics_outcome_idx ON public.product_analytics_events (event_name, occurred_at);
CREATE INDEX product_analytics_retention_idx ON public.product_analytics_events (retention_until);
ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read aggregate source analytics"
ON public.product_analytics_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.purge_expired_product_analytics(
  _batch_limit integer,
  _correlation_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _batch_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'batch limit must be 1-10000' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT id FROM public.product_analytics_events
    WHERE retention_until <= now()
    ORDER BY retention_until
    LIMIT _batch_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.product_analytics_events e
  WHERE e.id IN (SELECT id FROM expired);
  GET DIAGNOSTICS affected = ROW_COUNT;

  INSERT INTO public.data_deletion_receipts (
    subject_pseudonym, domain, deletion_mode, rows_affected, correlation_id
  ) VALUES (
    'batch:' || md5(_correlation_id), 'product_analytics', 'hard_delete', affected, _correlation_id
  );
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_product_analytics(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_product_analytics(integer, text) TO authenticated;

CREATE VIEW public.product_outcome_daily
WITH (security_barrier = true)
AS
SELECT
  date_trunc('day', occurred_at) AS outcome_day,
  event_name,
  count(*)::bigint AS event_count
FROM public.product_analytics_events
GROUP BY date_trunc('day', occurred_at), event_name;

REVOKE ALL ON public.product_outcome_daily FROM PUBLIC, anon;
REVOKE ALL ON public.product_outcome_daily FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_product_outcomes(_days integer DEFAULT 30)
RETURNS TABLE (
  outcome_day timestamptz,
  event_name text,
  event_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  IF _days NOT BETWEEN 1 AND 395 THEN
    RAISE EXCEPTION 'days must be 1-395' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT d.outcome_day, d.event_name, d.event_count
  FROM public.product_outcome_daily d
  WHERE d.outcome_day >= date_trunc('day', now()) - make_interval(days => _days - 1)
  ORDER BY d.outcome_day DESC, d.event_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_product_outcomes(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_outcomes(integer) TO authenticated;

COMMENT ON TABLE public.product_analytics_events IS
  'PII-free allowlisted analytics. Raw user IDs, email, phone, exact location and free text are prohibited.';
COMMENT ON TABLE public.billing_provider_events IS
  'Quarantined provider-event ledger only. No provider is configured and no payment activation is performed by this migration.';
COMMENT ON TABLE public.product_plans IS
  'Provider-independent pricing hypothesis. Active status requires an explicit provider/currency/amount contract.';

COMMIT;

-- Rollback strategy (operator-reviewed, not auto-executed):
-- disable every feature flag first, stop analytics ingestion, export audit and
-- reconciliation evidence, then drop views/functions/tables in reverse FK
-- order. Existing core event/community tables are not modified by this file.
