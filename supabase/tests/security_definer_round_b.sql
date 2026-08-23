-- Prompt 01 database authorization regression checks.
-- Run after applying all migrations to an isolated Supabase test database.

BEGIN;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.refresh_virtual_hubs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute refresh_virtual_hubs';
  END IF;

  IF has_function_privilege('authenticated', 'public.refresh_virtual_hubs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute refresh_virtual_hubs';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.refresh_virtual_hubs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute refresh_virtual_hubs';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.admin_update_member_profile(uuid,text,boolean,text,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not execute admin_update_member_profile';
  END IF;

  -- 20260822180000_admin_profile_capability_boundary.sql deliberately retired
  -- this RPC: it has no reason/idempotency contract, and the audited
  -- `admin_update_user_profile` replaced it at every call site. It must no
  -- longer be client-callable.
  IF has_function_privilege(
    'authenticated',
    'public.admin_update_member_profile(uuid,text,boolean,text,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'deprecated admin_update_member_profile must not stay client-callable';
  END IF;

  -- The audited replacement is Edge-mediated: only the service role may call
  -- it, and the Edge boundary authenticates the admin before using it.
  IF has_function_privilege(
    'authenticated',
    'public.admin_update_user_profile(uuid,uuid,text,boolean,text,text[],uuid[],text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'admin_update_user_profile must stay Edge-mediated (service_role only)';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.admin_update_user_profile(uuid,uuid,text,boolean,text,text[],uuid[],text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role needs EXECUTE on the audited admin_update_user_profile replacement';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.admin_set_member_event_participations(uuid,uuid[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not execute admin_set_member_event_participations';
  END IF;
END;
$$;

ROLLBACK;
