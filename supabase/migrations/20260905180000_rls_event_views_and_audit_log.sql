-- Close the two tables that carry NO row-level security at all.
--
-- Both were created through the hosted dashboard rather than a migration, and
-- 20260824010000_restore_schema_parity.sql reproduced them exactly as production
-- had them — which included having RLS switched off. The Supabase advisor
-- reports them as ERROR-level `rls_disabled_in_public`, and it is right:
--
--   event_views          (event_id, user_id, source, view_count, last_viewed_at)
--     is per-user reading history. Without RLS any authenticated client can read
--     which events every other user has looked at, and write rows attributed to
--     someone else.
--   organizer_audit_log  (event_id, actor_user_id, action, target_user_id, ...)
--     is an audit trail. Without RLS any client can read every organiser action
--     on every event — and, worse, INSERT entries into the audit trail itself,
--     which destroys the only property an audit log has.
--
-- Both tables are empty today and nothing under src/ references either of them,
-- so no working feature can regress; this only removes the exposure.

-- ---------------------------------------------------------------------------
-- event_views: strictly the caller's own rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_views_select_own ON public.event_views;
CREATE POLICY event_views_select_own ON public.event_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS event_views_insert_own ON public.event_views;
CREATE POLICY event_views_insert_own ON public.event_views
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- USING and WITH CHECK both, so a row cannot be re-pointed at another user.
DROP POLICY IF EXISTS event_views_update_own ON public.event_views;
CREATE POLICY event_views_update_own ON public.event_views
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy on purpose: a view counter is aggregate telemetry, and
-- letting clients delete rows would only be a way to skew it.

COMMENT ON TABLE public.event_views IS
  'Per-user event view counter. RLS: a user reads and writes only their own rows; no client DELETE. Aggregates must go through a SECURITY DEFINER function.';

-- ---------------------------------------------------------------------------
-- organizer_audit_log: readable by the event''s operators, writable by nobody.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizer_audit_log ENABLE ROW LEVEL SECURITY;

-- 'moderate' is the oversight capability: the event's creator/organizer, admins,
-- crew with can_moderate, and organization owner/admin/editor.
DROP POLICY IF EXISTS organizer_audit_log_select_operators ON public.organizer_audit_log;
CREATE POLICY organizer_audit_log_select_operators ON public.organizer_audit_log
  FOR SELECT TO authenticated
  USING (public.is_event_operator(event_id, 'moderate'));

-- Deliberately NO insert/update/delete policy. An audit log that its subjects
-- can write is not an audit log; entries may only be added by service_role or
-- by a SECURITY DEFINER function, both of which bypass RLS.

COMMENT ON TABLE public.organizer_audit_log IS
  'Append-only audit trail of organiser actions. RLS: readable by is_event_operator(event_id, ''moderate''); NO client write policy — writes only via service_role or a SECURITY DEFINER function.';

-- ---------------------------------------------------------------------------
-- Document the deny-all tables so the advisor warning is not "fixed" by
-- someone adding permissive policies.
--
-- These carry RLS with ZERO policies, which the advisor reports as
-- `rls_enabled_no_policy`. That is deliberate here, not an oversight: none of
-- them is referenced anywhere under src/, every one is reached only through a
-- SECURITY DEFINER RPC or the service role, and both of those bypass RLS.
-- Deny-all is the correct posture; adding a permissive policy would OPEN a
-- table that is currently closed.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
  deny_all_tables text[] := ARRAY[
    'account_deletions', 'club_directories', 'club_refresh_schedules',
    'community_research_claim_topics', 'community_research_claim_translations',
    'community_research_claims', 'community_research_topic_translations',
    'community_research_topics', 'edge_rate_limit_buckets',
    'external_event_connectors', 'outbound_clicks', 'raw_venues',
    'scraper_runs', 'scraper_schedules', 'sync_discovery_matrix', 'ticket_tiers'
  ];
BEGIN
  FOREACH t IN ARRAY deny_all_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      -- Belt and braces: assert RLS is on even if a future edit turns it off.
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L', t,
        'RLS enabled with NO policies on purpose: reached only via SECURITY DEFINER RPCs or the service role, both of which bypass RLS. The advisor''s rls_enabled_no_policy warning is expected here — do not add a permissive policy without a client that needs it.'
      );
    END IF;
  END LOOP;
END;
$do$;
