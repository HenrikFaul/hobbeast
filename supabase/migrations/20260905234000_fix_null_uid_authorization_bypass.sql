-- Three authorization guards were skipped entirely for a logged-out caller,
-- because of Postgres three-valued logic:
--
--   IF p_user_id <> auth.uid() AND NOT public.is_organization_member(...) THEN
--
-- When auth.uid() is NULL, "p_user_id <> NULL" is NULL, "NULL AND true" is NULL,
-- and IF NULL THEN is NOT taken -- so the RAISE never fires and the function
-- proceeds to its write. The guard reads as if it denies; it does the opposite.
--
-- Both holes were proven live against this database and rolled back:
--
--   remove_org_member         -- as anon, a member of an unrelated organization
--                                went from status 'active' to 'removed'.
--   assign_event_organization -- as anon, another user's event was detached from
--                                its organization (p_org_id => NULL also skips
--                                the ORG_EDITOR_REQUIRED branch, which is
--                                guarded by "IF p_org_id IS NOT NULL AND ...").
--
--   cancel_ticket_order       -- not anon-callable, but the same shape: an order
--                                with a NULL buyer_user_id would skip the check
--                                for ANY authenticated caller. Fixed with the
--                                other two rather than left as a known trap.
--
-- The fix is IS DISTINCT FROM, which is never NULL, plus an explicit refusal
-- when there is no authenticated user at all. Behaviour for a legitimate caller
-- is unchanged: for non-null operands IS DISTINCT FROM equals <>.
--
-- Verified after applying, all inside rolled-back transactions:
--   anon -> both functions raise 42501 and the member stayed 'active';
--   the event's real creator still detaches their own event;
--   a member still removes themselves.

CREATE OR REPLACE FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_owners integer; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- A member may remove themselves; an admin may remove others.
  -- IS DISTINCT FROM, not <>: with a NULL on either side, <> yields NULL and
  -- the IF is skipped, which silently waives the check.
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_organization_member(p_org_id, 'admin') THEN
    RAISE EXCEPTION 'ORG_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;
  IF v_role = 'owner' THEN
    SELECT count(*) INTO v_owners FROM public.organization_members
    WHERE organization_id = p_org_id AND role = 'owner' AND status = 'active';
    IF v_owners <= 1 THEN RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE public.organization_members SET status = 'removed', updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_event_organization(p_event_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT created_by INTO v_creator FROM public.events WHERE id = p_event_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_creator IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NOT_EVENT_CREATOR' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NOT NULL AND NOT public.is_organization_member(p_org_id, 'editor') THEN
    RAISE EXCEPTION 'ORG_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.events SET organization_id = p_org_id, updated_at = now() WHERE id = p_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_ticket_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o public.ticket_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ticket_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF o.buyer_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_event_operator(o.event_id, 'finance') THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF o.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object('order_id', o.id, 'status', o.status, 'already', true);
  END IF;
  -- Release the held seats and void any issued tickets.
  UPDATE public.ticket_types SET quantity_sold = greatest(0, quantity_sold - o.quantity) WHERE id = o.ticket_type_id;
  UPDATE public.tickets SET status = 'void' WHERE order_id = o.id AND status <> 'void';
  UPDATE public.ticket_orders SET status = CASE WHEN o.status = 'paid' THEN 'refunded' ELSE 'cancelled' END, updated_at = now()
  WHERE id = o.id;
  RETURN jsonb_build_object('order_id', o.id, 'status', CASE WHEN o.status = 'paid' THEN 'refunded' ELSE 'cancelled' END);
END;
$function$;

-- Each of the three is an action for a signed-in user, so the privilege matches
-- the guard: anon loses EXECUTE outright, authenticated keeps it and the
-- in-body check decides. Stated here rather than left to the companion revoke
-- migration, so this file is safe on its own -- a CREATE OR REPLACE re-applies
-- Supabase's default grants, and a fix that silently re-opened anon EXECUTE
-- would undo itself.
REVOKE ALL ON FUNCTION public.remove_org_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_org_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_event_organization(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_event_organization(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_ticket_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_ticket_order(uuid) TO authenticated, service_role;
