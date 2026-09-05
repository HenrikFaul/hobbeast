-- Close anon's access to 24 SECURITY DEFINER functions.
--
-- Two separate defaults conspire here. Postgres grants EXECUTE to PUBLIC on
-- every new function, and Supabase's default privileges additionally grant it
-- DIRECTLY to anon and authenticated. That second one is the trap: a
-- `REVOKE ... FROM PUBLIC` alone changes nothing at all, because the direct
-- anon grant survives it. Measured on the live database — the ACL reads
-- `{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, ...}`
-- after such a revoke. Every REVOKE below therefore names anon and
-- authenticated explicitly, which is also the dominant pattern already in this
-- repo (214 revokes name anon, 152 name only PUBLIC and are cosmetic).
--
-- This repo mostly knows that — most of its RPCs carry a proper REVOKE — but 24 do not, and
-- `scripts/audit-security-definer.mjs` never said so because it only inspects
-- migrations matching /^202608(?:22|25|26)/. Nothing written after
-- 2026-08-26 has ever been audited; the same commit widens that filter, and
-- this migration is what makes the widened audit pass honestly rather than by
-- moving the goalposts.
--
-- What actually changes for a caller: anon loses the ability to invoke the
-- ticketing, organisation and API-key RPCs directly. Nothing else. Every role
-- that legitimately calls each function is granted back explicitly below, so
-- the app behaves exactly as it did.
--
-- Verified before writing this:
--   * A trigger function keeps firing with EXECUTE revoked from every client
--     role — checked live on event_participants and rolled back, so the four
--     trigger routines need no grants at all.
--   * list_ticket_types_admin is called unconditionally on mount by
--     EventTickets, and its wrapper turns ANY error into null, which is how the
--     component decides the viewer is not an operator. An anon caller therefore
--     sees the same "not an operator" outcome as before, by a different route.
--   * list_ticket_types_public is called on the same mount for everyone, so it
--     stays anon-callable — that is what "public" means here.
--   * has_role and is_organization_member are evaluated inside RLS policies, so
--     they must remain callable by anon and authenticated or every policy that
--     references them fails.

-- ---------------------------------------------------------------------------
-- 1. RLS helpers — evaluated in the querying user's context, so anon and
--    authenticated must keep EXECUTE. The revoke is what removes the implicit
--    grant to any OTHER role that PUBLIC would have covered.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_organization_member(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Trigger routines — never called directly by anyone. Calling one outside a
--    trigger context raises "can only be called as a trigger", so the exposure
--    was nil; closing it is tidiness, not a fix. No grants: the trigger fires
--    regardless of the invoking role's privileges.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_derive_id_from_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_event_participation_metrics() FROM PUBLIC, anon, authenticated;

-- Its trigger wrapper calls it; no client ever should.
REVOKE ALL ON FUNCTION public.refresh_event_participation_metrics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_event_participation_metrics(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Organisation and B2B API-key RPCs — a signed-in member's tools. anon had
--    no business calling create_org_api_key at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_org_api_key(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_api_key(uuid, text, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_org_api_keys(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_org_api_keys(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_org_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_api_key(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_brand(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_brand(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_organization_brands(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_brands(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_my_organizations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_organizations() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Ticketing. Only the public catalogue stays open to anon; buying,
--    organising and checking in are all signed-in actions. confirm_order_payment
--    keeps service_role because it is the seam a payment webhook calls.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_ticket_types_public(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_ticket_types_public(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_ticket_types_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_ticket_types_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_ticket_type(
  uuid, text, text, integer, text, integer, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ticket_type(
  uuid, text, text, integer, text, integer, integer, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_ticket_type_active(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_type_active(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_tickets(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tickets(uuid, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_order_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_ticket_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ticket_order(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_tickets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_tickets() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_event_ticket_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_summary(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_event_pending_orders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_pending_orders(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. admin_scraper_stats — the one the audit flagged from this session's own
--    work. It gates on providers.manage internally, so the revoke only removes
--    anon's ability to reach that gate at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_scraper_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scraper_stats(integer) TO authenticated, service_role;
