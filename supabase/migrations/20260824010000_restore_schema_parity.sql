-- Restore schema parity (v1.9.1).
--
-- Evidence source: the local restore rehearsal for the hosted re-import
-- (`bun run db:verify` reference cluster). Restoring the 2026-06-18 production
-- dump's DATA into a fresh-chain schema failed on two drift classes that only
-- exist on the live database and were never captured by any migration
-- (created through the hosted dashboard):
--
--   1. 15 whole tables: check_in_audit, community_pulses, event_analytics,
--      event_analytics_breakdowns, event_views, external_event_connectors,
--      hidden_hubs, organizer_audit_log, organizer_demand_insights,
--      organizer_message_deliveries, organizer_messages,
--      organizer_opportunities, reminders, ticket_tiers, venues.
--   2. 49 columns on shared tables (events 27, profiles 14, event_trip_plans 7).
--
-- Everything below is generated from the restored production reference schema
-- and made idempotent, so the migration is a no-op on a database that already
-- carries the live shape and a converger everywhere else. RLS state and
-- policies are reproduced exactly as they exist on production.

-- ==== 1) Live-only tables (full production shape) ====

CREATE TABLE IF NOT EXISTS public.check_in_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    participation_id uuid NOT NULL,
    action text NOT NULL,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_in_audit_action_check CHECK ((action = ANY (ARRAY['check_in'::text, 'undo_check_in'::text, 'promote_waitlist'::text])))
);

CREATE TABLE IF NOT EXISTS public.community_pulses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hidden_hub_id uuid,
    headline text NOT NULL,
    supporting_text text,
    confidence_label text,
    confidence_score numeric,
    sample_size integer,
    minimum_sample_size integer,
    scene_label text,
    suppressed boolean DEFAULT false NOT NULL,
    dismissible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    source text,
    views integer DEFAULT 0 NOT NULL,
    detail_opens integer DEFAULT 0 NOT NULL,
    join_clicks integer DEFAULT 0 NOT NULL,
    going_count integer DEFAULT 0 NOT NULL,
    waitlist_count integer DEFAULT 0 NOT NULL,
    checked_in_count integer DEFAULT 0 NOT NULL,
    no_show_count integer DEFAULT 0 NOT NULL,
    ctr numeric,
    join_conversion numeric,
    attendance_rate numeric,
    demand_insight text,
    insight_summary text,
    rationale_summary text,
    source_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    category_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    geo_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    timeline_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unique_viewers bigint DEFAULT 0 NOT NULL,
    total_views bigint DEFAULT 0 NOT NULL,
    interested_count bigint DEFAULT 0 NOT NULL,
    waitlisted_count bigint DEFAULT 0 NOT NULL,
    conversion_rate numeric(10,2) DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_analytics_breakdowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    analytics_id uuid,
    breakdown_type text NOT NULL,
    label text,
    name text,
    source text,
    dimension_value text,
    display_value text,
    value text,
    count integer,
    joins integer,
    rsvps integer,
    views integer,
    metric_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_views (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    source text DEFAULT 'organic'::text NOT NULL,
    view_count integer DEFAULT 1 NOT NULL,
    last_viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.external_event_connectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    name text NOT NULL,
    encrypted_api_key text,
    encrypted_client_secret text,
    base_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hidden_hubs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hub_type text,
    type text,
    scene_label text,
    scene text,
    title text,
    description text,
    summary text,
    lifecycle_state text DEFAULT 'active_internal'::text NOT NULL,
    size_band text,
    activation_potential numeric,
    confidence_score numeric,
    confidence_label text,
    cadence_pattern text,
    time_rhythm text,
    locality_band text,
    neighborhood text,
    city text,
    dominant_formats text[] DEFAULT '{}'::text[] NOT NULL,
    dominant_format text,
    support_count integer,
    sample_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_strengthened_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.organizer_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    action text NOT NULL,
    target_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizer_demand_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    hidden_hub_id uuid,
    title text,
    scene text,
    format text,
    recommended_format text,
    ideal_size_band text,
    size_band text,
    locality_recommendation text,
    locality_hint text,
    timing_recommendation text,
    timing_window text,
    time_rhythm text,
    confidence_label text,
    confidence_score numeric,
    rationale_summary text,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizer_message_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    event_id uuid NOT NULL,
    recipient_user_id uuid,
    recipient_email text,
    delivery_state text DEFAULT 'pending'::text NOT NULL,
    delivered_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizer_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    message_type text DEFAULT 'announcement'::text NOT NULL,
    audience_segment text DEFAULT 'all'::text NOT NULL,
    segment text,
    subject text,
    title text,
    body text DEFAULT ''::text NOT NULL,
    scheduled_for timestamp with time zone,
    send_at timestamp with time zone,
    send_mode text DEFAULT 'scheduled'::text NOT NULL,
    delivery_state text DEFAULT 'draft'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    target_states text[] DEFAULT '{}'::text[],
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    audience_filter text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT organizer_messages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT organizer_messages_type_check CHECK ((type = ANY (ARRAY['reminder'::text, 'logistics_update'::text, 'event_update'::text, 'cancellation'::text, 'general'::text])))
);

CREATE TABLE IF NOT EXISTS public.organizer_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    hidden_hub_id uuid,
    title text,
    scene_fit text,
    timing_window text,
    locality_hint text,
    confidence text,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_id uuid,
    title text NOT NULL,
    description text,
    body text,
    scheduled_for timestamp with time zone,
    send_at timestamp with time zone,
    timing text,
    scene_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ticket_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    name text NOT NULL,
    price double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'HUF'::text NOT NULL,
    available integer,
    sold integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.venues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    address text DEFAULT ''::text NOT NULL,
    latitude double precision,
    longitude double precision,
    image_url text,
    category text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    phone text,
    website text,
    opening_hours text,
    rating double precision,
    is_partner boolean DEFAULT false NOT NULL,
    partner_capabilities text[] DEFAULT '{}'::text[],
    provider_id text,
    source text DEFAULT 'hobbeast'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_audit_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.check_in_audit
    ADD CONSTRAINT check_in_audit_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_pulses_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.community_pulses
    ADD CONSTRAINT community_pulses_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_analytics_breakdowns_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_analytics_breakdowns
    ADD CONSTRAINT event_analytics_breakdowns_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_analytics_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_analytics
    ADD CONSTRAINT event_analytics_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_views_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_pkey PRIMARY KEY (event_id, user_id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_event_connectors_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.external_event_connectors
    ADD CONSTRAINT external_event_connectors_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hidden_hubs_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.hidden_hubs
    ADD CONSTRAINT hidden_hubs_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_audit_log_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_audit_log
    ADD CONSTRAINT organizer_audit_log_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_demand_insights_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_demand_insights
    ADD CONSTRAINT organizer_demand_insights_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_message_deliveries_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_message_deliveries
    ADD CONSTRAINT organizer_message_deliveries_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_messages_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_messages
    ADD CONSTRAINT organizer_messages_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_opportunities_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_opportunities
    ADD CONSTRAINT organizer_opportunities_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tiers_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.ticket_tiers
    ADD CONSTRAINT ticket_tiers_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_pkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id)';
  END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS idx_check_in_audit_event_id ON public.check_in_audit USING btree (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_analytics_event_date_source ON public.event_analytics USING btree (event_id, date, COALESCE(source, 'all'::text));

CREATE INDEX IF NOT EXISTS idx_event_analytics_event_id ON public.event_analytics USING btree (event_id);

CREATE INDEX IF NOT EXISTS idx_hidden_hubs_last_strengthened_at ON public.hidden_hubs USING btree (last_strengthened_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_organizer_messages_event_id ON public.organizer_messages USING btree (event_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders USING btree (user_id);

DROP TRIGGER IF EXISTS trg_community_pulses_updated_at ON public.community_pulses;
CREATE TRIGGER trg_community_pulses_updated_at BEFORE UPDATE ON public.community_pulses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_analytics_breakdowns_updated_at ON public.event_analytics_breakdowns;
CREATE TRIGGER trg_event_analytics_breakdowns_updated_at BEFORE UPDATE ON public.event_analytics_breakdowns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_analytics_updated_at ON public.event_analytics;
CREATE TRIGGER trg_event_analytics_updated_at BEFORE UPDATE ON public.event_analytics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_external_event_connectors_updated_at ON public.external_event_connectors;
CREATE TRIGGER trg_external_event_connectors_updated_at BEFORE UPDATE ON public.external_event_connectors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hidden_hubs_updated_at ON public.hidden_hubs;
CREATE TRIGGER trg_hidden_hubs_updated_at BEFORE UPDATE ON public.hidden_hubs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_demand_insights_updated_at ON public.organizer_demand_insights;
CREATE TRIGGER trg_organizer_demand_insights_updated_at BEFORE UPDATE ON public.organizer_demand_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_message_deliveries_updated_at ON public.organizer_message_deliveries;
CREATE TRIGGER trg_organizer_message_deliveries_updated_at BEFORE UPDATE ON public.organizer_message_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_messages_updated_at ON public.organizer_messages;
CREATE TRIGGER trg_organizer_messages_updated_at BEFORE UPDATE ON public.organizer_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_opportunities_updated_at ON public.organizer_opportunities;
CREATE TRIGGER trg_organizer_opportunities_updated_at BEFORE UPDATE ON public.organizer_opportunities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reminders_updated_at ON public.reminders;
CREATE TRIGGER trg_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_audit_actor_user_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.check_in_audit
    ADD CONSTRAINT check_in_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_audit_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.check_in_audit
    ADD CONSTRAINT check_in_audit_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_audit_participation_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.check_in_audit
    ADD CONSTRAINT check_in_audit_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.event_participants(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_pulses_hidden_hub_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.community_pulses
    ADD CONSTRAINT community_pulses_hidden_hub_id_fkey FOREIGN KEY (hidden_hub_id) REFERENCES public.hidden_hubs(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_analytics_breakdowns_analytics_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_analytics_breakdowns
    ADD CONSTRAINT event_analytics_breakdowns_analytics_id_fkey FOREIGN KEY (analytics_id) REFERENCES public.event_analytics(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_analytics_breakdowns_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_analytics_breakdowns
    ADD CONSTRAINT event_analytics_breakdowns_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_analytics_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_analytics
    ADD CONSTRAINT event_analytics_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_views_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_views_user_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_audit_log_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_audit_log
    ADD CONSTRAINT organizer_audit_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_demand_insights_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_demand_insights
    ADD CONSTRAINT organizer_demand_insights_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_demand_insights_hidden_hub_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_demand_insights
    ADD CONSTRAINT organizer_demand_insights_hidden_hub_id_fkey FOREIGN KEY (hidden_hub_id) REFERENCES public.hidden_hubs(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_message_deliveries_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_message_deliveries
    ADD CONSTRAINT organizer_message_deliveries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_message_deliveries_message_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_message_deliveries
    ADD CONSTRAINT organizer_message_deliveries_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.organizer_messages(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_message_deliveries_recipient_user_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_message_deliveries
    ADD CONSTRAINT organizer_message_deliveries_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_messages_created_by_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_messages
    ADD CONSTRAINT organizer_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_messages_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_messages
    ADD CONSTRAINT organizer_messages_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_opportunities_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_opportunities
    ADD CONSTRAINT organizer_opportunities_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_opportunities_hidden_hub_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.organizer_opportunities
    ADD CONSTRAINT organizer_opportunities_hidden_hub_id_fkey FOREIGN KEY (hidden_hub_id) REFERENCES public.hidden_hubs(id) ON DELETE SET NULL';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_user_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tiers_event_id_fkey') THEN
    EXECUTE 'ALTER TABLE ONLY public.ticket_tiers
    ADD CONSTRAINT ticket_tiers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'venues' AND p.polname = 'Venues readable by authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY "Venues readable by authenticated" ON public.venues FOR SELECT USING ((auth.role() = ''authenticated''::text))';
  END IF;
END;
$do$;

ALTER TABLE public.check_in_audit ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'check_in_audit' AND p.polname = 'check_in_audit_insert_owner'
  ) THEN
    EXECUTE 'CREATE POLICY check_in_audit_insert_owner ON public.check_in_audit FOR INSERT TO authenticated WITH CHECK (((actor_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = check_in_audit.event_id) AND (e.created_by = auth.uid()))))))';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'check_in_audit' AND p.polname = 'check_in_audit_select_owner_or_actor'
  ) THEN
    EXECUTE 'CREATE POLICY check_in_audit_select_owner_or_actor ON public.check_in_audit FOR SELECT TO authenticated USING (((actor_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = check_in_audit.event_id) AND (e.created_by = auth.uid()))))))';
  END IF;
END;
$do$;

ALTER TABLE public.community_pulses ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'community_pulses' AND p.polname = 'community_pulses_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY community_pulses_select_authenticated ON public.community_pulses FOR SELECT TO authenticated USING ((suppressed = false))';
  END IF;
END;
$do$;

ALTER TABLE public.event_analytics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.event_analytics_breakdowns ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'event_analytics_breakdowns' AND p.polname = 'event_analytics_breakdowns_owner_all'
  ) THEN
    EXECUTE 'CREATE POLICY event_analytics_breakdowns_owner_all ON public.event_analytics_breakdowns TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_analytics_breakdowns.event_id) AND (e.created_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_analytics_breakdowns.event_id) AND (e.created_by = auth.uid())))))';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'event_analytics' AND p.polname = 'event_analytics_owner_select'
  ) THEN
    EXECUTE 'CREATE POLICY event_analytics_owner_select ON public.event_analytics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_analytics.event_id) AND (e.created_by = auth.uid())))))';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'event_analytics' AND p.polname = 'event_analytics_owner_write'
  ) THEN
    EXECUTE 'CREATE POLICY event_analytics_owner_write ON public.event_analytics FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_analytics.event_id) AND (e.created_by = auth.uid())))))';
  END IF;
END;
$do$;

ALTER TABLE public.external_event_connectors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hidden_hubs ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'hidden_hubs' AND p.polname = 'hidden_hubs_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY hidden_hubs_select_authenticated ON public.hidden_hubs FOR SELECT TO authenticated USING (true)';
  END IF;
END;
$do$;

ALTER TABLE public.organizer_demand_insights ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'organizer_demand_insights' AND p.polname = 'organizer_demand_insights_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY organizer_demand_insights_select_authenticated ON public.organizer_demand_insights FOR SELECT TO authenticated USING (true)';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'organizer_demand_insights' AND p.polname = 'organizer_demand_insights_write_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY organizer_demand_insights_write_authenticated ON public.organizer_demand_insights FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
END;
$do$;

ALTER TABLE public.organizer_message_deliveries ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'organizer_message_deliveries' AND p.polname = 'organizer_message_deliveries_owner_all'
  ) THEN
    EXECUTE 'CREATE POLICY organizer_message_deliveries_owner_all ON public.organizer_message_deliveries TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = organizer_message_deliveries.event_id) AND (e.created_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = organizer_message_deliveries.event_id) AND (e.created_by = auth.uid())))))';
  END IF;
END;
$do$;

ALTER TABLE public.organizer_messages ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'organizer_messages' AND p.polname = 'organizer_messages_owner_all'
  ) THEN
    EXECUTE 'CREATE POLICY organizer_messages_owner_all ON public.organizer_messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = organizer_messages.event_id) AND (e.created_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = organizer_messages.event_id) AND (e.created_by = auth.uid())))))';
  END IF;
END;
$do$;

ALTER TABLE public.organizer_opportunities ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'organizer_opportunities' AND p.polname = 'organizer_opportunities_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY organizer_opportunities_select_authenticated ON public.organizer_opportunities FOR SELECT TO authenticated USING (true)';
  END IF;
END;
$do$;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'reminders' AND p.polname = 'reminders_select_owner'
  ) THEN
    EXECUTE 'CREATE POLICY reminders_select_owner ON public.reminders FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (user_id IS NULL)))';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'reminders' AND p.polname = 'reminders_write_owner'
  ) THEN
    EXECUTE 'CREATE POLICY reminders_write_owner ON public.reminders TO authenticated USING (((user_id = auth.uid()) OR (user_id IS NULL))) WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)))';
  END IF;
END;
$do$;

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- ==== 2) Missing columns on shared tables ====

ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS ascent_text text;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS distance_km text;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS duration_text text;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS end_label text;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS external_open_url text;
ALTER TABLE public.event_trip_plans ADD COLUMN IF NOT EXISTS start_label text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendee_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS community_pulse_score double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS detail_open_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS entry_window_from text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS entry_window_to text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_ticket_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_early_access boolean DEFAULT false NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text DEFAULT ''::text NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS max_capacity integer;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_notes text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS share_exact_address boolean DEFAULT true NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source text DEFAULT 'hobbeast'::text NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS trip_plan_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public'::text NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS distance_km integer DEFAULT 25 NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_organizer boolean DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_sharing boolean DEFAULT true NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organizer_verified boolean DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token_updated_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- ==== 3) Cross-table FK that binds the restored columns ====

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_venue_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL NOT VALID';
  END IF;
END;
$do$;

-- ==== 4) app_runtime_config provider allowlist: accept the live vocabulary ====
--
-- The production data still holds provider='local_catalog' rows, which the
-- final 20260426203000 allowlist dropped. Re-inserting live data therefore
-- fails the CHECK. Re-add the constraint as the superset of every value the
-- production database actually contains.
DO $$
BEGIN
  EXECUTE 'alter table public.app_runtime_config drop constraint if exists app_runtime_config_provider_check';
EXCEPTION WHEN others THEN NULL;
END;
$$;

ALTER TABLE public.app_runtime_config
  ADD CONSTRAINT app_runtime_config_provider_check
  CHECK (
    provider IN (
      'aws', 'geoapify', 'tomtom', 'geoapify_tomtom', 'mapy',
      'local_catalog', 'supabase', 'address_manager'
    )
    OR provider LIKE 'db:%'
  )
  NOT VALID;

-- The dashboard-era tables must follow the same anon hardening as
-- 20260823010000: anon may read where a policy allows it, but never write.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'check_in_audit', 'community_pulses', 'event_analytics',
    'event_analytics_breakdowns', 'event_views', 'external_event_connectors',
    'hidden_hubs', 'organizer_audit_log', 'organizer_demand_insights',
    'organizer_message_deliveries', 'organizer_messages',
    'organizer_opportunities', 'reminders', 'ticket_tiers', 'venues'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r' AND relname = target_table
    ) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon',
        target_table
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
