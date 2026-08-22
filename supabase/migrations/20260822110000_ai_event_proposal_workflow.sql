-- Prompt 11: privacy-safe demand aggregation and human-controlled AI event proposals.
-- This migration never enables automatic publishing. Provider/cron configuration is external.
-- Rollback: activate the kill switch, stop proposal workers, remove proposal-derived events only
-- after an explicit product decision, then drop the functions/tables and additive columns below.

BEGIN;

ALTER TABLE public.auto_event_config
  ADD COLUMN IF NOT EXISTS proposal_generation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_recent_active_members integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_explicit_interest_members integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS k_anonymity_threshold integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_upcoming_overlapping_events integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposal_cooldown_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS daily_proposal_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS daily_token_budget integer NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS prompt_template_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS model_name text NOT NULL DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS generation_timeout_ms integer NOT NULL DEFAULT 15000;

ALTER TABLE public.auto_event_config DROP CONSTRAINT IF EXISTS auto_event_config_proposal_bounds_check;
ALTER TABLE public.auto_event_config ADD CONSTRAINT auto_event_config_proposal_bounds_check CHECK (
  min_members BETWEEN 2 AND 100
  AND min_recent_active_members BETWEEN 1 AND 100
  AND min_explicit_interest_members BETWEEN 2 AND 100
  AND k_anonymity_threshold BETWEEN 5 AND 100
  AND max_upcoming_overlapping_events BETWEEN 0 AND 20
  AND proposal_cooldown_days BETWEEN 1 AND 365
  AND daily_proposal_limit BETWEEN 1 AND 500
  AND daily_token_budget BETWEEN 1000 AND 10000000
  AND prompt_template_version BETWEEN 1 AND 10000
  AND generation_timeout_ms BETWEEN 1000 AND 60000
  AND length(model_name) BETWEEN 1 AND 120
  AND auto_publish_enabled = false
);

-- The legacy direct-generation switch remains off. It can only be superseded by the
-- proposal_generation_enabled workflow, which still requires explicit human publishing.
UPDATE public.auto_event_config
SET enabled = false, auto_publish_enabled = false
WHERE enabled OR auto_publish_enabled;

CREATE TABLE IF NOT EXISTS public.ai_event_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_fallback', 'failed', 'skipped_locked', 'budget_exhausted', 'kill_switched')),
  provider text,
  model text,
  prompt_template_version integer NOT NULL DEFAULT 1,
  qualified_hub_count integer NOT NULL DEFAULT 0 CHECK (qualified_hub_count >= 0),
  proposal_count integer NOT NULL DEFAULT 0 CHECK (proposal_count >= 0),
  fallback_count integer NOT NULL DEFAULT 0 CHECK (fallback_count >= 0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_microunits bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_microunits >= 0),
  error_code text,
  error_message text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(request_metadata) <= 8192),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_event_generation_one_running_idx
  ON public.ai_event_generation_runs ((status)) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS ai_event_generation_runs_time_idx
  ON public.ai_event_generation_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_event_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id uuid REFERENCES public.ai_event_generation_runs(id) ON DELETE SET NULL,
  hub_id uuid NOT NULL REFERENCES public.virtual_hubs(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published', 'cancelled')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 4000),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 120),
  subcategory text CHECK (subcategory IS NULL OR length(subcategory) <= 120),
  activity text CHECK (activity IS NULL OR length(activity) <= 120),
  suggested_start timestamptz NOT NULL,
  suggested_end timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Budapest' CHECK (length(timezone) BETWEEN 3 AND 64),
  city text NOT NULL CHECK (length(city) BETWEEN 1 AND 160),
  area_hint text CHECK (area_hint IS NULL OR length(area_hint) <= 160),
  venue_category text NOT NULL CHECK (length(venue_category) BETWEEN 1 AND 120),
  target_capacity integer NOT NULL CHECK (target_capacity BETWEEN 3 AND 500),
  demand_reason text NOT NULL CHECK (length(demand_reason) BETWEEN 10 AND 1000),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  demand_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  model text,
  prompt_template_version integer NOT NULL DEFAULT 1 CHECK (prompt_template_version > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  generation_mode text NOT NULL DEFAULT 'provider'
    CHECK (generation_mode IN ('provider', 'deterministic_fallback', 'manual')),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'passed', 'blocked', 'needs_review')),
  moderation_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(moderation_result) <= 16384),
  human_edits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(human_edits) <= 16384),
  organizer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_validation_status text NOT NULL DEFAULT 'unverified'
    CHECK (venue_validation_status IN ('unverified', 'verified', 'rejected')),
  venue_name text CHECK (venue_name IS NULL OR length(venue_name) <= 200),
  venue_address text CHECK (venue_address IS NULL OR length(venue_address) <= 500),
  venue_lat double precision CHECK (venue_lat IS NULL OR venue_lat BETWEEN -90 AND 90),
  venue_lon double precision CHECK (venue_lon IS NULL OR venue_lon BETWEEN -180 AND 180),
  host_responsibility_accepted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejection_reason text CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (suggested_end > suggested_start),
  CHECK (suggested_end <= suggested_start + interval '24 hours'),
  CHECK (pg_column_size(demand_snapshot) <= 16384),
  CHECK (pg_column_size(provenance) <= 16384),
  CHECK (NOT (demand_snapshot ?| ARRAY['member_ids', 'user_ids', 'emails', 'session_ids'])),
  CHECK (NOT (provenance ?| ARRAY['member_ids', 'user_ids', 'emails', 'session_ids']))
);

CREATE INDEX IF NOT EXISTS ai_event_proposals_queue_idx
  ON public.ai_event_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_event_proposals_hub_time_idx
  ON public.ai_event_proposals (hub_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_event_proposals_organizer_idx
  ON public.ai_event_proposals (organizer_id, status, suggested_start);

CREATE TABLE IF NOT EXISTS public.ai_event_proposal_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ai_event_proposals(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  from_status text,
  to_status text,
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  before_state jsonb,
  after_state jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (before_state IS NULL OR pg_column_size(before_state) <= 32768),
  CHECK (after_state IS NULL OR pg_column_size(after_state) <= 32768)
);
CREATE INDEX IF NOT EXISTS ai_event_proposal_audit_idx
  ON public.ai_event_proposal_audit_events (proposal_id, created_at);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ai_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS source_origin text NOT NULL DEFAULT 'user';
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_origin_check;
ALTER TABLE public.events ADD CONSTRAINT events_source_origin_check CHECK (
  source_origin IN ('user', 'admin', 'ai_proposal', 'external_import')
);
CREATE UNIQUE INDEX IF NOT EXISTS events_ai_proposal_uidx
  ON public.events (ai_proposal_id) WHERE ai_proposal_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_ai_proposal_id_fkey'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_ai_proposal_id_fkey
      FOREIGN KEY (ai_proposal_id) REFERENCES public.ai_event_proposals(id) ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.ai_event_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_proposal_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view AI event generation runs" ON public.ai_event_generation_runs;
CREATE POLICY "Admins view AI event generation runs" ON public.ai_event_generation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service manages AI event generation runs" ON public.ai_event_generation_runs;
CREATE POLICY "Service manages AI event generation runs" ON public.ai_event_generation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view AI event proposals" ON public.ai_event_proposals;
CREATE POLICY "Admins view AI event proposals" ON public.ai_event_proposals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Assigned organizers view AI event proposals" ON public.ai_event_proposals;
CREATE POLICY "Assigned organizers view AI event proposals" ON public.ai_event_proposals
  FOR SELECT TO authenticated USING (organizer_id = auth.uid());
DROP POLICY IF EXISTS "Service manages AI event proposals" ON public.ai_event_proposals;
CREATE POLICY "Service manages AI event proposals" ON public.ai_event_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view AI proposal audit" ON public.ai_event_proposal_audit_events;
CREATE POLICY "Admins view AI proposal audit" ON public.ai_event_proposal_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Assigned organizers view AI proposal audit" ON public.ai_event_proposal_audit_events;
CREATE POLICY "Assigned organizers view AI proposal audit" ON public.ai_event_proposal_audit_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_event_proposals p
    WHERE p.id = proposal_id AND p.organizer_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE ON public.ai_event_generation_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_event_proposals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_event_proposal_audit_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_ai_event_proposal_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.ai_event_proposal_audit_events (
    proposal_id, actor_id, action, to_status, after_state, correlation_id
  ) VALUES (
    NEW.id, NULL, 'proposal_created', NEW.status,
    jsonb_build_object(
      'status', NEW.status,
      'hub_id', NEW.hub_id,
      'generation_run_id', NEW.generation_run_id,
      'generation_mode', NEW.generation_mode,
      'prompt_template_version', NEW.prompt_template_version
    ), NEW.correlation_id
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_ai_event_proposal_created() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_audit_ai_event_proposal_created ON public.ai_event_proposals;
CREATE TRIGGER trg_audit_ai_event_proposal_created
  AFTER INSERT ON public.ai_event_proposals
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_event_proposal_created();

DROP TRIGGER IF EXISTS update_ai_event_proposals_updated_at ON public.ai_event_proposals;
CREATE TRIGGER update_ai_event_proposals_updated_at
  BEFORE UPDATE ON public.ai_event_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.organizer_accept_ai_event_proposal(
  _proposal_id uuid,
  _accepted boolean,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE before_row public.ai_event_proposals%ROWTYPE; after_row public.ai_event_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO before_row FROM public.ai_event_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  IF before_row.organizer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Assigned organizer required' USING ERRCODE = '42501';
  END IF;
  IF before_row.status NOT IN ('review', 'approved') THEN
    RAISE EXCEPTION 'Proposal is not awaiting organizer decision' USING ERRCODE = '22023';
  END IF;
  IF NOT _accepted AND length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Decline reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ai_event_proposals SET
    host_responsibility_accepted_at = CASE WHEN _accepted THEN now() ELSE NULL END,
    status = CASE WHEN _accepted THEN status ELSE 'rejected' END,
    rejection_reason = CASE WHEN _accepted THEN NULL ELSE left(btrim(_reason), 1000) END,
    rejected_by = CASE WHEN _accepted THEN NULL ELSE auth.uid() END,
    rejected_at = CASE WHEN _accepted THEN NULL ELSE now() END
  WHERE id = _proposal_id RETURNING * INTO after_row;

  INSERT INTO public.ai_event_proposal_audit_events (
    proposal_id, actor_id, action, from_status, to_status, reason, before_state, after_state, correlation_id
  ) VALUES (
    _proposal_id, auth.uid(), CASE WHEN _accepted THEN 'organizer_accepted' ELSE 'organizer_declined' END,
    before_row.status, after_row.status, NULLIF(left(btrim(coalesce(_reason, '')), 1000), ''),
    jsonb_build_object('organizer_id', before_row.organizer_id, 'responsibility_accepted_at', before_row.host_responsibility_accepted_at),
    jsonb_build_object('organizer_id', after_row.organizer_id, 'responsibility_accepted_at', after_row.host_responsibility_accepted_at),
    after_row.correlation_id
  );
  RETURN jsonb_build_object('proposal_id', after_row.id, 'status', after_row.status,
    'host_responsibility_accepted_at', after_row.host_responsibility_accepted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_transition_ai_event_proposal(
  _proposal_id uuid,
  _actor_id uuid,
  _next_status text,
  _reason text DEFAULT NULL,
  _organizer_id uuid DEFAULT NULL,
  _moderation_status text DEFAULT NULL,
  _venue_validation_status text DEFAULT NULL,
  _venue_name text DEFAULT NULL,
  _venue_address text DEFAULT NULL,
  _venue_lat double precision DEFAULT NULL,
  _venue_lon double precision DEFAULT NULL,
  _human_edits jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE before_row public.ai_event_proposals%ROWTYPE; after_row public.ai_event_proposals%ROWTYPE;
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin actor required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION 'Admin actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF _next_status NOT IN ('review', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported proposal transition' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(coalesce(_human_edits, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'Human edits too large' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO before_row FROM public.ai_event_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT (
    (before_row.status = 'draft' AND _next_status IN ('review', 'rejected'))
    OR (before_row.status = 'review' AND _next_status IN ('review', 'approved', 'rejected'))
    OR (before_row.status = 'approved' AND _next_status IN ('review', 'rejected', 'cancelled'))
    OR (before_row.status = 'rejected' AND _next_status = 'review')
    OR (before_row.status = 'published' AND _next_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid proposal state transition' USING ERRCODE = '22023';
  END IF;
  IF _next_status IN ('rejected', 'cancelled') AND length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Decision reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ai_event_proposals SET
    status = _next_status,
    organizer_id = coalesce(_organizer_id, organizer_id),
    moderation_status = coalesce(_moderation_status, moderation_status),
    venue_validation_status = coalesce(_venue_validation_status, venue_validation_status),
    venue_name = coalesce(NULLIF(btrim(_venue_name), ''), venue_name),
    venue_address = coalesce(NULLIF(btrim(_venue_address), ''), venue_address),
    venue_lat = coalesce(_venue_lat, venue_lat),
    venue_lon = coalesce(_venue_lon, venue_lon),
    human_edits = human_edits || coalesce(_human_edits, '{}'::jsonb),
    reviewed_by = CASE WHEN _next_status IN ('review', 'approved', 'rejected') THEN _actor_id ELSE reviewed_by END,
    reviewed_at = CASE WHEN _next_status IN ('review', 'approved', 'rejected') THEN now() ELSE reviewed_at END,
    approved_by = CASE WHEN _next_status = 'approved' THEN _actor_id WHEN _next_status = 'review' THEN NULL ELSE approved_by END,
    approved_at = CASE WHEN _next_status = 'approved' THEN now() WHEN _next_status = 'review' THEN NULL ELSE approved_at END,
    rejected_by = CASE WHEN _next_status = 'rejected' THEN _actor_id WHEN _next_status = 'review' THEN NULL ELSE rejected_by END,
    rejected_at = CASE WHEN _next_status = 'rejected' THEN now() WHEN _next_status = 'review' THEN NULL ELSE rejected_at END,
    rejection_reason = CASE WHEN _next_status IN ('rejected', 'cancelled') THEN left(btrim(_reason), 1000) WHEN _next_status = 'review' THEN NULL ELSE rejection_reason END,
    cancelled_by = CASE WHEN _next_status = 'cancelled' THEN _actor_id ELSE cancelled_by END,
    cancelled_at = CASE WHEN _next_status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE id = _proposal_id RETURNING * INTO after_row;

  IF _next_status = 'approved' AND (
    after_row.organizer_id IS NULL
    OR after_row.host_responsibility_accepted_at IS NULL
    OR after_row.moderation_status <> 'passed'
    OR after_row.venue_validation_status <> 'verified'
    OR after_row.suggested_start <= now() + interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'Proposal approval gates are incomplete' USING ERRCODE = '22023';
  END IF;

  IF before_row.status = 'published' AND _next_status = 'cancelled' AND before_row.published_event_id IS NOT NULL THEN
    UPDATE public.events
    SET outcome_status = 'cancelled', is_active = false, cancelled_at = coalesce(cancelled_at, now()),
        cancellation_reason = left(btrim(_reason), 1000), updated_at = now()
    WHERE id = before_row.published_event_id AND outcome_status <> 'cancelled';
  END IF;

  INSERT INTO public.ai_event_proposal_audit_events (
    proposal_id, actor_id, action, from_status, to_status, reason, before_state, after_state, correlation_id
  ) VALUES (
    _proposal_id, _actor_id, 'admin_transition', before_row.status, after_row.status,
    NULLIF(left(btrim(coalesce(_reason, '')), 1000), ''),
    jsonb_build_object('status', before_row.status, 'organizer_id', before_row.organizer_id,
      'moderation_status', before_row.moderation_status, 'venue_validation_status', before_row.venue_validation_status),
    jsonb_build_object('status', after_row.status, 'organizer_id', after_row.organizer_id,
      'moderation_status', after_row.moderation_status, 'venue_validation_status', after_row.venue_validation_status),
    after_row.correlation_id
  );
  RETURN jsonb_build_object('proposal_id', after_row.id, 'status', after_row.status,
    'organizer_id', after_row.organizer_id, 'ready_for_publish', after_row.status = 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_ai_event_proposal(
  _proposal_id uuid,
  _actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE proposal public.ai_event_proposals%ROWTYPE; event_id uuid; canonical_category text;
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin actor required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION 'Admin actor mismatch' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-proposal-publish:' || _proposal_id::text, 0));
  SELECT * INTO proposal FROM public.ai_event_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  IF proposal.published_event_id IS NOT NULL THEN RETURN proposal.published_event_id; END IF;
  IF proposal.status <> 'approved'
    OR proposal.organizer_id IS NULL
    OR proposal.host_responsibility_accepted_at IS NULL
    OR proposal.moderation_status <> 'passed'
    OR proposal.venue_validation_status <> 'verified'
    OR proposal.suggested_start <= now() + interval '1 hour' THEN
    RAISE EXCEPTION 'Proposal is not ready for publish' USING ERRCODE = '22023';
  END IF;

  canonical_category := proposal.category
    || CASE WHEN proposal.subcategory IS NOT NULL THEN ' › ' || proposal.subcategory ELSE '' END
    || CASE WHEN proposal.activity IS NOT NULL THEN ' › ' || proposal.activity ELSE '' END;

  INSERT INTO public.events (
    created_by, organizer_id, title, description, category,
    event_date, event_time, start_time, end_time, expected_end_at,
    location_type, location_city, location_address,
    place_name, place_address, place_city, place_lat, place_lon,
    max_attendees, waitlist_enabled, visibility_type, participation_type,
    outcome_status, is_active, venue_validation_status,
    host_responsibility_accepted_at, ai_proposal_id, source_origin
  ) VALUES (
    proposal.organizer_id, proposal.organizer_id, proposal.title, proposal.description, canonical_category,
    (proposal.suggested_start AT TIME ZONE proposal.timezone)::date,
    (proposal.suggested_start AT TIME ZONE proposal.timezone)::time,
    proposal.suggested_start, proposal.suggested_end, proposal.suggested_end,
    CASE WHEN proposal.venue_address IS NULL THEN 'city' ELSE 'address' END,
    proposal.city, proposal.venue_address,
    proposal.venue_name, proposal.venue_address, proposal.city, proposal.venue_lat, proposal.venue_lon,
    proposal.target_capacity, true, 'public', 'open',
    'published', true, 'verified', proposal.host_responsibility_accepted_at,
    proposal.id, 'ai_proposal'
  ) RETURNING id INTO event_id;

  UPDATE public.ai_event_proposals SET
    status = 'published', published_by = _actor_id, published_at = now(), published_event_id = event_id
  WHERE id = proposal.id;

  INSERT INTO public.ai_event_proposal_audit_events (
    proposal_id, actor_id, action, from_status, to_status, before_state, after_state, correlation_id
  ) VALUES (
    proposal.id, _actor_id, 'published', proposal.status, 'published',
    jsonb_build_object('status', proposal.status),
    jsonb_build_object('status', 'published', 'event_id', event_id), proposal.correlation_id
  );
  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_accept_ai_event_proposal(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_transition_ai_event_proposal(uuid, uuid, text, text, uuid, text, text, text, text, double precision, double precision, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_publish_ai_event_proposal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_accept_ai_event_proposal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transition_ai_event_proposal(uuid, uuid, text, text, uuid, text, text, text, text, double precision, double precision, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_ai_event_proposal(uuid, uuid) TO service_role;

COMMENT ON TABLE public.ai_event_proposals IS
  'Privacy-safe aggregate demand proposals. AI output is a draft and cannot publish without explicit human, organizer, moderation and venue gates.';
COMMENT ON COLUMN public.ai_event_proposals.demand_snapshot IS
  'Aggregate-only demand evidence. Direct member/user/session identifiers are prohibited.';

COMMIT;
