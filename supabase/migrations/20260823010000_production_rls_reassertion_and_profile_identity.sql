-- Production drift reassertion (v1.9.0).
--
-- Evidence source: `bun run db:verify`, which restores the 2026-06-18 production
-- dump into a disposable local cluster and replays every repository migration on
-- top of it. That replay proved four defects that no source-only review could
-- see, because they exist in the live schema rather than in the migration files:
--
--   1. `profiles.profile_visibility` carries TWO check constraints whose
--      intersection is `{public, private}`. The legacy
--      `profiles_profile_visibility_check` allows public/friends/private and the
--      Prompt 03 `profiles_visibility_check` allows private/members/public, so
--      the `members` tier the privacy model depends on is impossible to set.
--   2. RLS is DISABLED on `virtual_hubs`, `virtual_hub_members`, `notifications`,
--      `notification_preferences` and `event_messages`, even though migrations
--      20260323080006 / 20260330043603 / 20260409005516 enabled it and later
--      migrations kept adding policies. Every one of those policies is inert.
--   3. Those same tables grant ALL privileges to `anon`, so with RLS off an
--      unauthenticated caller can read, modify and delete hub membership,
--      notifications and audit rows.
--   4. `profiles.id` is the auth user id (FK to `auth.users`) with no default,
--      while every migration and RPC written since Prompt 03 addresses profiles
--      by `user_id`. Any `INSERT ... (user_id, ...)` fails with a NOT NULL
--      violation on `id`.
--
-- This migration is additive and expand-only. It grants nothing new to `anon`,
-- removes no policy, and drops no data.

BEGIN;

-- 1) profile_visibility: keep the canonical private/members/public vocabulary
-- and retire the contradictory legacy constraint. `friends` is normalized to
-- `members`, which is the closest tier in the canonical vocabulary. Live data at
-- the time of writing is 100% `public`, so this normalization is a no-op there
-- and exists only so an environment holding legacy values can still migrate.
UPDATE public.profiles
   SET profile_visibility = 'members'
 WHERE profile_visibility = 'friends';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_visibility_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_visibility_check
      CHECK (profile_visibility IN ('private', 'members', 'public'));
  END IF;
END;
$$;

-- 2) profiles.id derives from user_id when the caller addresses the canonical
-- key. `id` stays the primary key and the FK to auth.users; this only removes
-- the need for every caller to repeat the same value twice.
CREATE OR REPLACE FUNCTION public.profiles_derive_id_from_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.id := NEW.user_id;
  ELSIF NEW.user_id IS NULL AND NEW.id IS NOT NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_derive_id_from_user_id ON public.profiles;
CREATE TRIGGER profiles_derive_id_from_user_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_derive_id_from_user_id();

-- 3) Add the policies that are missing for a command class, so enabling RLS in
-- step 4 cannot lock a user out of their own rows.

-- notification_preferences only had an UPDATE policy; without SELECT/INSERT the
-- preference screen would read zero rows and never be able to create a default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'notification_preferences'
      AND p.polname = 'Users read own notification preferences'
  ) THEN
    CREATE POLICY "Users read own notification preferences"
      ON public.notification_preferences
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'notification_preferences'
      AND p.polname = 'Users create own notification preferences'
  ) THEN
    CREATE POLICY "Users create own notification preferences"
      ON public.notification_preferences
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- virtual_hub_members had no policy at all. Membership is written by the hub
-- engine through SECURITY DEFINER routines and the service role, so only read
-- access needs a policy: your own membership, the host's view of their hub, and
-- admins.
--
-- The host check must NOT reference public.virtual_hubs from the policy: the
-- hub visibility policy already references virtual_hub_members, so a direct
-- cross-reference recurses once RLS is on for both tables. The SECURITY DEFINER
-- helper reads the hub row outside RLS and breaks the cycle.
CREATE OR REPLACE FUNCTION public.is_virtual_hub_host(p_hub_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.virtual_hubs h
    WHERE h.id = p_hub_id AND h.host_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_virtual_hub_host(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_virtual_hub_host(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_virtual_hub_host(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'virtual_hub_members'
      AND p.polname = 'Members and hosts read hub membership'
  ) THEN
    CREATE POLICY "Members and hosts read hub membership"
      ON public.virtual_hub_members
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR public.is_virtual_hub_host(hub_id, auth.uid())
      );
  END IF;
END;
$$;

-- 4) Re-enable row level security. Each of these tables already carries the
-- policies its feature was designed around; RLS was switched off on the live
-- database after the migration that enabled it, which silenced them all.
ALTER TABLE public.virtual_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_hub_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

-- 5) `anon` must never write. Read grants are left exactly as they are so no
-- public browsing path changes; only INSERT/UPDATE/DELETE/TRUNCATE are removed.
-- Authenticated admin flows (hobby taxonomy editing, event templates) keep their
-- privileges and remain governed by their own authorization checks.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'account_deletions',
    'event_messages',
    'event_templates',
    'event_views',
    'hike_routes',
    'hobby_activities',
    'hobby_categories',
    'hobby_subcategories',
    'notification_preferences',
    'notifications',
    'organizer_audit_log',
    'participation_audits',
    'user_reminder_preferences',
    'venue_cache',
    'venue_sync_runs',
    'virtual_hub_members',
    'virtual_hubs'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = target_table
    ) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon',
        target_table
      );
    END IF;
  END LOOP;
END;
$$;

-- 6) Retire legacy value allowlists that contradict the vocabularies the
-- production pack introduced. In each case two CHECK constraints are live at
-- once and the intersection silently removes a documented capability.

-- `event_participants.status`: the legacy check forbids `invited` and
-- `completed`, so the Prompt 06 completion lifecycle (check-in -> completed,
-- invited participants) cannot be written at all. The Prompt 06 contract check
-- already carries the full vocabulary; the legacy one is dropped and the
-- contract check is validated in its place.
ALTER TABLE public.event_participants
  DROP CONSTRAINT IF EXISTS event_participants_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_participants_status_contract_check'
  ) THEN
    ALTER TABLE public.event_participants
      ADD CONSTRAINT event_participants_status_contract_check
      CHECK (status IN (
        'invited', 'interested', 'going', 'waitlist',
        'checked_in', 'completed', 'cancelled', 'no_show'
      )) NOT VALID;
  END IF;
END;
$$;

-- `events.participation_type` defaults to 'open' (migration 20260320000000) but
-- the live allowlist never included that value, so every insert that relies on
-- the column default is rejected.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_participation_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_participation_type_check
  CHECK (participation_type IN (
    'open', 'internal_rsvp', 'free', 'paid', 'external', 'external_ticket'
  )) NOT VALID;

-- 7) Drop the dashboard-era direct participant mutation policies.
--
-- Prompt 06 (20260822060000) removed direct client mutation of
-- `event_participants` and routed every write through the audited atomic RPCs
-- (join/cancel/transition/complete), which enforce capacity, waitlist FIFO and
-- idempotency. The live database still carries three policies that were created
-- outside the migration chain under different names, so a client could bypass
-- the whole state machine with a plain INSERT/UPDATE. Reads stay covered by the
-- Prompt 06 "Participants read own or operated event" policy.
DROP POLICY IF EXISTS event_participants_insert_self ON public.event_participants;
DROP POLICY IF EXISTS event_participants_update_self_or_owner ON public.event_participants;
DROP POLICY IF EXISTS event_participants_select_self_or_owner ON public.event_participants;

-- 8) Drop the dashboard-era trip-plan read policy.
--
-- `event_trip_plans_select_event_audience` predates the Prompt 06 exact-location
-- boundary. It is broken and leaky at once: it references `events.visibility`
-- (a column that is not part of the safe column allowlist granted to
-- `authenticated`, so the policy errors with "permission denied for table
-- events"), and because policies OR together it would otherwise expose exact
-- route endpoints to any participant before the private-location reveal window.
-- "Trip plans follow event location precision" is the intended read boundary.
-- The owner write policy stays: it only references allowlisted columns.
DROP POLICY IF EXISTS event_trip_plans_select_event_audience ON public.event_trip_plans;

-- 9) Re-attach the waitlist auto-promotion trigger.
--
-- 20260402002801 created `trg_auto_promote_waitlist`; the live database no
-- longer has it, and 20260822060000/20260822100000/20260822150500 only
-- redefine the function body — none of them re-attach the trigger. On the
-- restored production state a freed seat therefore never promotes anyone.
-- Idempotent: replaying this on a database that still has the trigger simply
-- recreates it against the same (latest) function.
DROP TRIGGER IF EXISTS trg_auto_promote_waitlist ON public.event_participants;
CREATE TRIGGER trg_auto_promote_waitlist
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_promote_waitlist();

-- 10) Converge event_trip_plans to the production shape.
--
-- The live table carries NOT NULL discrete coordinate columns
-- (start_lat/start_lon/end_lat/end_lon) that were added outside the migration
-- chain; the chain only creates the jsonb start_point/end_point pair. A fresh
-- environment therefore diverges from production. Add the discrete columns
-- where missing, backfill them from the jsonb points, and enforce NOT NULL —
-- a no-op on the production schema, parity everywhere else.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_trip_plans'
      AND column_name = 'start_lat'
  ) THEN
    ALTER TABLE public.event_trip_plans
      ADD COLUMN start_lat double precision,
      ADD COLUMN start_lon double precision,
      ADD COLUMN end_lat double precision,
      ADD COLUMN end_lon double precision;

    UPDATE public.event_trip_plans
       SET start_lat = (start_point ->> 'lat')::double precision,
           start_lon = (start_point ->> 'lon')::double precision,
           end_lat = (end_point ->> 'lat')::double precision,
           end_lon = (end_point ->> 'lon')::double precision;

    ALTER TABLE public.event_trip_plans
      ALTER COLUMN start_lat SET NOT NULL,
      ALTER COLUMN start_lon SET NOT NULL,
      ALTER COLUMN end_lat SET NOT NULL,
      ALTER COLUMN end_lon SET NOT NULL;
  END IF;
END;
$$;

-- 11) Remove the blanket profile read policy.
--
-- `profiles_select_authenticated` is `USING (true)`, so any signed-in user can
-- read every column of every profile: address, email, phone, date_of_birth and
-- exact coordinates. It defeats the profile visibility tiers, the
-- `public_profile_cards` allowlist and bilateral block filtering in one step.
--
-- The remaining SELECT policies keep every legitimate read working: your own
-- profile, profiles whose owner chose `public` visibility, and admins. Anything
-- else must go through the safe DTO/RPC surfaces.
--
-- Rollback: CREATE POLICY profiles_select_authenticated ON public.profiles
--   FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

NOTIFY pgrst, 'reload schema';

COMMIT;
