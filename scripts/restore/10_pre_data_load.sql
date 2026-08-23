-- Hobbeast production data re-import — PRE step.
--
-- Run against a database that already carries the full migration chain
-- (through 20260824010000_restore_schema_parity). Prepares the schema to
-- accept the 2026-06-18 production dump's data:
--
--   1. Detach the auth.users signup trigger so restored users do not spawn
--      duplicate profile rows (the dump carries the real profiles).
--   2. Disable USER triggers on public tables (notification enqueue, hub
--      activation, audit fan-out must not fire on historical rows).
--      FK (system) triggers stay active; the loader supplies FK-safe order.
--   3. virtual_hubs.identity_key: the live data predates this column; lift
--      NOT NULL for the load, the POST step backfills and re-asserts it.
--   4. Empty every table the dump will fill (migration seeds would collide),
--      in one CASCADE so dependent seeded rows go too.
--
-- The POST step (20_post_data_load.sql) reverses 1-3.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_hobbeast ON auth.users;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT relname FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t.relname);
  END LOOP;
END;
$$;

ALTER TABLE public.virtual_hubs ALTER COLUMN identity_key DROP NOT NULL;

TRUNCATE
  public.account_deletions,
  public.app_runtime_config,
  public.auto_event_config,
  public.check_in_audit,
  public.community_pulses,
  public.event_analytics,
  public.event_analytics_breakdowns,
  public.event_messages,
  public.event_participants,
  public.event_templates,
  public.event_trip_plans,
  public.event_views,
  public.events,
  public.external_event_connectors,
  public.external_events,
  public.hidden_hubs,
  public.hike_routes,
  public.hobby_activities,
  public.hobby_categories,
  public.hobby_subcategories,
  public.notification_preferences,
  public.notifications,
  public.organizer_audit_log,
  public.organizer_demand_insights,
  public.organizer_message_deliveries,
  public.organizer_messages,
  public.organizer_opportunities,
  public.participation_audits,
  public.place_sync_logs,
  public.place_sync_state,
  public.places_cache,
  public.places_local_catalog,
  public.profiles,
  public.raw_venues,
  public.reminders,
  public.sync_discovery_matrix,
  public.ticket_tiers,
  public.user_reminder_preferences,
  public.user_roles,
  public.venue_cache,
  public.venue_sync_runs,
  public.venues,
  public.virtual_hub_members,
  public.virtual_hubs
  CASCADE;

DELETE FROM auth.identities;
DELETE FROM auth.users;
DELETE FROM storage.buckets;
