-- O-H follow-up: the organizer's "who still owes payment" view — pending
-- paid-ticket orders for an event, so they can confirm a received transfer.
-- Finance operators only; returns NULL for anyone else.
CREATE OR REPLACE FUNCTION public.list_event_pending_orders(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.is_event_operator(p_event_id, 'finance') THEN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'buyer_email', o.buyer_email, 'quantity', o.quantity,
      'amount_cents', o.unit_price_cents * o.quantity, 'currency', o.currency,
      'ticket_type', t.name, 'created_at', o.created_at
    ) ORDER BY o.created_at)
    FROM public.ticket_orders o
    JOIN public.ticket_types t ON t.id = o.ticket_type_id
    WHERE o.event_id = p_event_id AND o.status = 'pending'), '[]'::jsonb)
  ELSE NULL END;
$$;
