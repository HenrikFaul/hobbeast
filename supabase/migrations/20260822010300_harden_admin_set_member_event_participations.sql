-- Prompt 01: make the admin participation mutation grant explicit and least-privileged.
-- The function retains its in-body has_role(admin) authorization check.

ALTER FUNCTION public.admin_set_member_event_participations(uuid, uuid[])
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.admin_set_member_event_participations(uuid, uuid[]) IS
  'Admin-only participation command. Caller must be authenticated and pass the internal admin role guard.';
