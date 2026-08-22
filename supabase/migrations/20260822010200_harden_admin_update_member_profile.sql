-- Prompt 01: make the admin profile mutation grant explicit and least-privileged.
-- The function retains its in-body has_role(admin) authorization check.

ALTER FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[])
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) TO service_role;

COMMENT ON FUNCTION public.admin_update_member_profile(uuid, text, boolean, text, text[]) IS
  'Admin-only member profile command. Caller must be authenticated and pass the internal admin role guard.';
