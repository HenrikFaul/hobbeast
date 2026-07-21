-- DRAFT — NOT YET APPLIED.
--
-- SECURITY DEFINER remediation, Round B (see docs/SECURITY_DEFINER_AUDIT.md).
--
-- One admin-callable RPC per file when this actually lands; this draft
-- co-locates the guard additions so the operator can review the full
-- shape before splitting into per-function migrations for approval via
-- the supabase migration tool.
--
-- The changes are:
--   1. Wrap High-risk admin RPCs (`admin_update_member_profile`,
--      `refresh_virtual_hubs`) with an explicit `has_role(auth.uid(), 'admin')`
--      guard so a leaked JWT of a non-admin cannot invoke them even if a
--      client bug exposes the RPC surface.
--   2. REVOKE EXECUTE from PUBLIC and GRANT only to `authenticated`.
--   3. Trigger functions (`deliver_organizer_message`, `auto_promote_waitlist`,
--      `notify_favorite_category_on_event`, `handle_new_user`,
--      `update_updated_at_column`) are NOT guarded with `auth.uid()` because
--      they fire inside DB triggers where no auth context exists. Their trust
--      boundary is the trigger attachment itself — documented, no code change.
--
-- Rollback: each block re-runs the CREATE OR REPLACE with the guard removed.
-- Ship one function per real migration; do NOT apply this whole file at once.

-- =============================================================================
-- 1. refresh_virtual_hubs — admin-only rebuild of hub membership.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_virtual_hubs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile RECORD;
  v_hobby text;
  v_hub_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM virtual_hub_members;

  FOR v_profile IN
    SELECT user_id, hobbies, city FROM profiles WHERE hobbies IS NOT NULL AND array_length(hobbies, 1) > 0
  LOOP
    FOREACH v_hobby IN ARRAY v_profile.hobbies
    LOOP
      INSERT INTO virtual_hubs (hobby_category, city)
      VALUES (v_hobby, v_profile.city)
      ON CONFLICT (hobby_category, hobby_subcategory, hobby_activity, city)
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_hub_id;

      INSERT INTO virtual_hub_members (hub_id, user_id)
      VALUES (v_hub_id, v_profile.user_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  UPDATE virtual_hubs SET member_count = (
    SELECT count(*) FROM virtual_hub_members WHERE hub_id = virtual_hubs.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_virtual_hubs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_virtual_hubs() TO authenticated;

-- =============================================================================
-- 2. admin_update_member_profile — guard signature depends on current args.
-- =============================================================================
-- Ship as its own migration; use `\df+ public.admin_update_member_profile`
-- output in Supabase SQL editor to reproduce the exact argument list, then
-- prepend the same guard block:
--
--   IF NOT public.has_role(auth.uid(), 'admin') THEN
--     RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
--   END IF;
--
-- Follow with:
--   REVOKE ALL ON FUNCTION public.admin_update_member_profile(<args>) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.admin_update_member_profile(<args>) TO authenticated;

-- =============================================================================
-- 3. Trigger functions — no code change required.
-- =============================================================================
-- deliver_organizer_message, auto_promote_waitlist,
-- notify_favorite_category_on_event, handle_new_user, update_updated_at_column
-- run inside triggers; auth.uid() is meaningless there. Document the trust
-- boundary in the audit doc; leave the DB definitions as-is.
