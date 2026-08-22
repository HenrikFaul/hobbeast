-- Prompt 01: contain the legacy global virtual-hub refresh behind the service role.
-- The safe incremental replacement is introduced by the Virtual Hubs 2 migration;
-- this migration deliberately changes grants only, so it is independently reversible.

ALTER FUNCTION public.refresh_virtual_hubs() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.refresh_virtual_hubs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_virtual_hubs() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_virtual_hubs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_virtual_hubs() TO service_role;

COMMENT ON FUNCTION public.refresh_virtual_hubs() IS
  'Legacy global refresh. Service-role only; interactive clients must use the scoped Virtual Hubs 2 commands.';
