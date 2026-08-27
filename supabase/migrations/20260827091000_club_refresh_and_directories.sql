-- Keeping the club list fresh, on a schedule the operator sets.
--
-- A directory is not a one-off import. Clubs fold, federations drop them, a
-- site moves its listing. So every harvest stamps last_seen_at on what it
-- still finds, and anything from that same directory that stopped appearing is
-- marked stale rather than deleted - a club that vanished from a listing has
-- not necessarily vanished from the world.
--
-- Curated rows are never touched by any of this: an admin-entered club, a
-- self-registered one and a derived one all keep their own source, and a
-- claimed club (owner_id IS NOT NULL) is out of reach entirely.
--
-- Scheduling copies the collector's proven pattern rather than inventing a
-- second one: run_at_hours + days_of_week, read by an hourly pg_cron tick
-- (club-refresh-dispatch) which dispatches the harvest workflow with a token
-- read from the vault.
--
-- Applied via the Supabase MCP; this file is the record. Tables:
--   club_directories        - the harvestable sources, incl. list_url + city
--   club_refresh_schedules  - when the harvest runs
-- Functions:
--   ingest_directory_clubs(jsonb, text)      - stamps freshness, infers topic
--   mark_stale_directory_clubs(text,int,int) - marks, never deletes
--   derive_clubs_from_programmes(int,int)    - repeated programmes are clubs
--   club_topic_from_title / club_audience_from_title
--   list_club_directories_for_harvest(text[]) - service-role worklist
--   admin_list/upsert/delete_club_refresh_schedule
--   admin_upsert_club_directory, admin_set_club_directory_enabled
--   run_due_club_refresh_schedules()

SELECT cron.schedule(
  'club-refresh-dispatch', '7 * * * *',
  'SELECT public.run_due_club_refresh_schedules();'
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'club-refresh-dispatch');
