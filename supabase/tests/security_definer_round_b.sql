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

  IF NOT has_function_privilege(
    'authenticated',
    'public.admin_update_member_profile(uuid,text,boolean,text,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role needs EXECUTE so the function can apply its admin guard';
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
