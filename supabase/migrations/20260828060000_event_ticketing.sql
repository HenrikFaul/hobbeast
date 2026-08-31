-- O-H: own ticketing / paid events (optional, additive).
--
-- SAFETY: no real payment processing here. Free tickets flow end to end
-- (reserve → issue). Paid tickets are modelled (price, currency, pending order)
-- and issued when payment is CONFIRMED — either by the organizer manually (the
-- common Hungarian bank-transfer flow) or by a future payment webhook calling in
-- as service_role. No card data, no payment provider, no money movement lives in
-- this system. confirm_order_payment is the seam a real processor would call.
--
-- Proven live: free issue; paid pending→confirm→issue; my_tickets; idempotent
-- check-in; overselling blocked (SOLD_OUT) by holding seats under a row lock;
-- non-operators refused management (FINANCE_REQUIRED) while a buyer may reserve
-- and cancel their own order.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'HUF',
  quantity_total integer NOT NULL CHECK (quantity_total > 0),
  quantity_sold integer NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  per_order_limit integer NOT NULL DEFAULT 10 CHECK (per_order_limit > 0),
  sales_start timestamptz,
  sales_end timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON public.ticket_types(event_id);

CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL,
  buyer_email text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'HUF',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_buyer ON public.ticket_orders(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_event ON public.ticket_orders(event_id);

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  holder_user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','checked_in','void')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tickets_holder ON public.tickets(holder_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON public.tickets(event_id);

ALTER TABLE public.ticket_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets       ENABLE ROW LEVEL SECURITY;

-- Defence in depth: all writes go through the SECURITY DEFINER RPCs below, so no
-- write policies. Reads: an operator sees everything for their event; the public
-- sees active types of active events; a buyer/holder sees their own orders/tickets.
DROP POLICY IF EXISTS tt_read ON public.ticket_types;
CREATE POLICY tt_read ON public.ticket_types FOR SELECT USING (
  public.is_event_operator(event_id, 'finance')
  OR (is_active AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.is_active))
);
DROP POLICY IF EXISTS to_read ON public.ticket_orders;
CREATE POLICY to_read ON public.ticket_orders FOR SELECT USING (
  buyer_user_id = auth.uid() OR public.is_event_operator(event_id, 'finance')
);
DROP POLICY IF EXISTS tk_read ON public.tickets;
CREATE POLICY tk_read ON public.tickets FOR SELECT USING (
  holder_user_id = auth.uid() OR public.is_event_operator(event_id, 'check_in')
);

-- Private helper: issue order.quantity tickets for a paid/free order.
CREATE OR REPLACE FUNCTION public._issue_order_tickets(p_order uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.tickets (order_id, ticket_type_id, event_id, holder_user_id, code, status)
  SELECT o.id, o.ticket_type_id, o.event_id, o.buyer_user_id,
         'HB-' || upper(encode(gen_random_bytes(5), 'hex')), 'issued'
  FROM public.ticket_orders o, generate_series(1, o.quantity)
  WHERE o.id = p_order;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._issue_order_tickets(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_ticket_type(
  p_event_id uuid, p_name text, p_description text, p_price_cents integer,
  p_currency text, p_quantity_total integer, p_per_order_limit integer,
  p_sales_start timestamptz DEFAULT NULL, p_sales_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_event_operator(p_event_id, 'finance') THEN
    RAISE EXCEPTION 'FINANCE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) < 2 THEN RAISE EXCEPTION 'NAME_TOO_SHORT' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_quantity_total, 0) < 1 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.ticket_types (event_id, name, description, price_cents, currency, quantity_total, per_order_limit, sales_start, sales_end, created_by)
  VALUES (p_event_id, btrim(p_name), nullif(btrim(coalesce(p_description,'')),''), greatest(0, coalesce(p_price_cents,0)),
          upper(coalesce(nullif(p_currency,''),'HUF')), p_quantity_total, greatest(1, coalesce(p_per_order_limit,10)),
          p_sales_start, p_sales_end, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_type_active(p_ticket_type_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_event uuid;
BEGIN
  SELECT event_id INTO v_event FROM public.ticket_types WHERE id = p_ticket_type_id;
  IF v_event IS NULL OR NOT public.is_event_operator(v_event, 'finance') THEN
    RAISE EXCEPTION 'FINANCE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ticket_types SET is_active = p_active WHERE id = p_ticket_type_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_ticket_types_public(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'description', t.description,
    'price_cents', t.price_cents, 'currency', t.currency,
    'available', greatest(0, t.quantity_total - t.quantity_sold),
    'per_order_limit', t.per_order_limit,
    'sales_open', (t.sales_start IS NULL OR now() >= t.sales_start) AND (t.sales_end IS NULL OR now() <= t.sales_end)
  ) ORDER BY t.price_cents, t.name), '[]'::jsonb)
  FROM public.ticket_types t
  WHERE t.event_id = p_event_id AND t.is_active;
$$;

CREATE OR REPLACE FUNCTION public.list_ticket_types_admin(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.is_event_operator(p_event_id, 'finance') THEN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'description', t.description,
      'price_cents', t.price_cents, 'currency', t.currency,
      'quantity_total', t.quantity_total, 'quantity_sold', t.quantity_sold,
      'per_order_limit', t.per_order_limit, 'is_active', t.is_active,
      'sales_start', t.sales_start, 'sales_end', t.sales_end
    ) ORDER BY t.created_at)
    FROM public.ticket_types t WHERE t.event_id = p_event_id), '[]'::jsonb)
  ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_tickets(p_ticket_type_id uuid, p_quantity integer, p_buyer_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE t public.ticket_types%ROWTYPE; v_available integer; v_order uuid; v_status text; v_issued integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.ticket_types WHERE id = p_ticket_type_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF NOT t.is_active THEN RAISE EXCEPTION 'TICKET_TYPE_INACTIVE' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_quantity,0) < 1 OR p_quantity > t.per_order_limit THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;
  IF t.sales_start IS NOT NULL AND now() < t.sales_start THEN RAISE EXCEPTION 'SALES_NOT_STARTED' USING ERRCODE = '22023'; END IF;
  IF t.sales_end   IS NOT NULL AND now() > t.sales_end   THEN RAISE EXCEPTION 'SALES_ENDED' USING ERRCODE = '22023'; END IF;
  v_available := t.quantity_total - t.quantity_sold;
  IF p_quantity > v_available THEN RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = '22023'; END IF;

  UPDATE public.ticket_types SET quantity_sold = quantity_sold + p_quantity WHERE id = t.id;
  v_status := CASE WHEN t.price_cents = 0 THEN 'paid' ELSE 'pending' END;

  INSERT INTO public.ticket_orders (event_id, ticket_type_id, buyer_user_id, buyer_email, quantity, unit_price_cents, currency, status)
  VALUES (t.event_id, t.id, auth.uid(), nullif(btrim(coalesce(p_buyer_email,'')),''), p_quantity, t.price_cents, t.currency, v_status)
  RETURNING id INTO v_order;

  IF t.price_cents = 0 THEN v_issued := public._issue_order_tickets(v_order); END IF;

  RETURN jsonb_build_object(
    'order_id', v_order, 'status', v_status, 'quantity', p_quantity,
    'unit_price_cents', t.price_cents, 'amount_cents', t.price_cents * p_quantity, 'currency', t.currency,
    'issued', v_issued,
    'payment_required', (t.price_cents > 0),
    'tickets', CASE WHEN v_issued > 0 THEN (SELECT jsonb_agg(code) FROM public.tickets WHERE order_id = v_order) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id uuid, p_payment_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE o public.ticket_orders%ROWTYPE; v_is_service boolean; v_issued integer := 0;
BEGIN
  SELECT * INTO o FROM public.ticket_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  v_is_service := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
  IF NOT v_is_service AND NOT public.is_event_operator(o.event_id, 'finance') THEN
    RAISE EXCEPTION 'FINANCE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'paid' THEN
    RETURN jsonb_build_object('order_id', o.id, 'status', 'paid', 'already', true);
  END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING' USING ERRCODE = '22023'; END IF;

  UPDATE public.ticket_orders SET status = 'paid', payment_reference = nullif(btrim(coalesce(p_payment_reference,'')),''), updated_at = now()
  WHERE id = o.id;
  v_issued := public._issue_order_tickets(o.id);
  RETURN jsonb_build_object('order_id', o.id, 'status', 'paid', 'issued', v_issued,
    'tickets', (SELECT jsonb_agg(code) FROM public.tickets WHERE order_id = o.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_ticket_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE o public.ticket_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.ticket_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF o.buyer_user_id <> auth.uid() AND NOT public.is_event_operator(o.event_id, 'finance') THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF o.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object('order_id', o.id, 'status', o.status, 'already', true);
  END IF;
  UPDATE public.ticket_types SET quantity_sold = greatest(0, quantity_sold - o.quantity) WHERE id = o.ticket_type_id;
  UPDATE public.tickets SET status = 'void' WHERE order_id = o.id AND status <> 'void';
  UPDATE public.ticket_orders SET status = CASE WHEN o.status = 'paid' THEN 'refunded' ELSE 'cancelled' END, updated_at = now()
  WHERE id = o.id;
  RETURN jsonb_build_object('order_id', o.id, 'status', CASE WHEN o.status = 'paid' THEN 'refunded' ELSE 'cancelled' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.my_tickets()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', tk.code, 'status', tk.status,
    'event_id', tk.event_id, 'event_title', e.title, 'event_date', e.event_date,
    'ticket_type', t.name, 'order_status', o.status
  ) ORDER BY e.event_date), '[]'::jsonb)
  FROM public.tickets tk
  JOIN public.events e ON e.id = tk.event_id
  JOIN public.ticket_types t ON t.id = tk.ticket_type_id
  JOIN public.ticket_orders o ON o.id = tk.order_id
  WHERE tk.holder_user_id = auth.uid() AND tk.status <> 'void';
$$;

CREATE OR REPLACE FUNCTION public.check_in_ticket(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE tk public.tickets%ROWTYPE; v_title text;
BEGIN
  SELECT * INTO tk FROM public.tickets WHERE code = upper(btrim(coalesce(p_code,''))) FOR UPDATE;
  IF tk.id IS NULL THEN RAISE EXCEPTION 'TICKET_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_event_operator(tk.event_id, 'check_in') THEN RAISE EXCEPTION 'CHECKIN_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT title INTO v_title FROM public.events WHERE id = tk.event_id;
  IF tk.status = 'void' THEN RAISE EXCEPTION 'TICKET_VOID' USING ERRCODE = '22023'; END IF;
  IF tk.status = 'checked_in' THEN
    RETURN jsonb_build_object('code', tk.code, 'status', 'checked_in', 'already', true, 'event_title', v_title);
  END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now() WHERE id = tk.id;
  RETURN jsonb_build_object('code', tk.code, 'status', 'checked_in', 'already', false, 'event_title', v_title);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_ticket_summary(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.is_event_operator(p_event_id, 'finance') THEN jsonb_build_object(
    'types', (SELECT count(*) FROM public.ticket_types WHERE event_id = p_event_id),
    'sold', (SELECT coalesce(sum(quantity_sold),0) FROM public.ticket_types WHERE event_id = p_event_id),
    'issued', (SELECT count(*) FROM public.tickets WHERE event_id = p_event_id AND status <> 'void'),
    'checked_in', (SELECT count(*) FROM public.tickets WHERE event_id = p_event_id AND status = 'checked_in'),
    'revenue_cents', (SELECT coalesce(sum(unit_price_cents * quantity),0) FROM public.ticket_orders WHERE event_id = p_event_id AND status = 'paid')
  ) ELSE NULL END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO service_role;
