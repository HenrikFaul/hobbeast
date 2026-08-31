import { supabase } from '@/integrations/supabase/client';

/**
 * Ticketing (O-H) — the client side of own/paid events.
 *
 * The rules that keep it safe live in the database (SECURITY DEFINER RPCs +
 * RLS, proven live): who may manage ticket types (the event's finance operators),
 * seat-holding so concurrent buyers cannot oversell, and idempotent check-in.
 *
 * PAYMENT BOUNDARY: this platform does not process card payments. Free tickets
 * issue immediately. Paid tickets create a *pending* order; the tickets issue
 * when payment is confirmed — either the organizer confirms a received transfer
 * (confirmOrderPayment) or a future payment webhook does. No money moves here.
 */

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export interface TicketTypePublic {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  available: number;
  per_order_limit: number;
  sales_open: boolean;
}

export interface TicketTypeAdmin {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  per_order_limit: number;
  is_active: boolean;
  sales_start: string | null;
  sales_end: string | null;
}

export interface MyTicket {
  code: string;
  status: 'issued' | 'checked_in' | 'void';
  event_id: string;
  event_title: string;
  event_date: string;
  ticket_type: string;
  order_status: string;
}

export interface TicketSummary {
  types: number;
  sold: number;
  issued: number;
  checked_in: number;
  revenue_cents: number;
}

export interface ReserveResult {
  order_id: string;
  status: 'paid' | 'pending';
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  currency: string;
  issued: number;
  payment_required: boolean;
  tickets: string[];
}

/** A price in the smallest currency unit, formatted for Hungarian display. */
export function formatPrice(cents: number, currency = 'HUF'): string {
  if (cents === 0) return 'Ingyenes';
  const major = currency === 'HUF' ? Math.round(cents / 100) : cents / 100;
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: currency === 'HUF' ? 0 : 2 }).format(major);
}

function readable(message: string): string {
  if (message.includes('FINANCE_REQUIRED')) return 'Ehhez pénzügyi jogosultság kell az eseményhez.';
  if (message.includes('CHECKIN_REQUIRED')) return 'Ehhez beléptetői jogosultság kell.';
  if (message.includes('SOLD_OUT')) return 'Elfogyott — nincs ennyi szabad hely.';
  if (message.includes('SALES_NOT_STARTED')) return 'Az értékesítés még nem kezdődött el.';
  if (message.includes('SALES_ENDED')) return 'Az értékesítés lezárult.';
  if (message.includes('TICKET_TYPE_INACTIVE')) return 'Ez a jegytípus jelenleg nem elérhető.';
  if (message.includes('INVALID_QUANTITY')) return 'Érvénytelen darabszám.';
  if (message.includes('TICKET_NOT_FOUND')) return 'Nincs ilyen jegy.';
  if (message.includes('TICKET_VOID')) return 'Ez a jegy érvénytelenítve lett.';
  if (message.includes('AUTH_REQUIRED')) return 'Előbb jelentkezz be.';
  if (message.includes('NAME_TOO_SHORT')) return 'A név túl rövid.';
  return 'A művelet nem sikerült.';
}

export async function listTicketTypesPublic(eventId: string): Promise<TicketTypePublic[]> {
  const { data, error } = await rpc.rpc('list_ticket_types_public', { p_event_id: eventId });
  return error || !Array.isArray(data) ? [] : (data as TicketTypePublic[]);
}

export async function listTicketTypesAdmin(eventId: string): Promise<TicketTypeAdmin[] | null> {
  const { data, error } = await rpc.rpc('list_ticket_types_admin', { p_event_id: eventId });
  if (error || data == null) return null;
  return data as TicketTypeAdmin[];
}

export async function createTicketType(input: {
  eventId: string; name: string; description?: string; priceCents: number;
  currency?: string; quantityTotal: number; perOrderLimit?: number;
  salesStart?: string | null; salesEnd?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('create_ticket_type', {
    p_event_id: input.eventId, p_name: input.name, p_description: input.description ?? null,
    p_price_cents: input.priceCents, p_currency: input.currency ?? 'HUF',
    p_quantity_total: input.quantityTotal, p_per_order_limit: input.perOrderLimit ?? 10,
    p_sales_start: input.salesStart ?? null, p_sales_end: input.salesEnd ?? null,
  });
  if (error || !data) return { ok: false, message: readable(error?.message ?? '') };
  return { ok: true, id: (data as { id: string }).id };
}

export async function setTicketTypeActive(ticketTypeId: string, active: boolean): Promise<boolean> {
  const { error } = await rpc.rpc('set_ticket_type_active', { p_ticket_type_id: ticketTypeId, p_active: active });
  return !error;
}

export async function reserveTickets(
  ticketTypeId: string, quantity: number, buyerEmail?: string,
): Promise<{ ok: true; result: ReserveResult } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('reserve_tickets', {
    p_ticket_type_id: ticketTypeId, p_quantity: quantity, p_buyer_email: buyerEmail ?? null,
  });
  if (error || !data) return { ok: false, message: readable(error?.message ?? '') };
  return { ok: true, result: data as ReserveResult };
}

export async function confirmOrderPayment(
  orderId: string, paymentReference?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('confirm_order_payment', { p_order_id: orderId, p_payment_reference: paymentReference ?? null });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function cancelTicketOrder(orderId: string): Promise<boolean> {
  const { error } = await rpc.rpc('cancel_ticket_order', { p_order_id: orderId });
  return !error;
}

export async function myTickets(): Promise<MyTicket[]> {
  const { data, error } = await rpc.rpc('my_tickets');
  return error || !Array.isArray(data) ? [] : (data as MyTicket[]);
}

export async function checkInTicket(
  code: string,
): Promise<{ ok: true; already: boolean; eventTitle: string } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('check_in_ticket', { p_code: code });
  if (error || !data) return { ok: false, message: readable(error?.message ?? '') };
  const row = data as { already: boolean; event_title: string };
  return { ok: true, already: row.already, eventTitle: row.event_title };
}

export async function getEventTicketSummary(eventId: string): Promise<TicketSummary | null> {
  const { data, error } = await rpc.rpc('get_event_ticket_summary', { p_event_id: eventId });
  if (error || data == null) return null;
  return data as TicketSummary;
}

export interface PendingOrder {
  order_id: string;
  buyer_email: string | null;
  quantity: number;
  amount_cents: number;
  currency: string;
  ticket_type: string;
  created_at: string;
}

export async function listEventPendingOrders(eventId: string): Promise<PendingOrder[]> {
  const { data, error } = await rpc.rpc('list_event_pending_orders', { p_event_id: eventId });
  return error || !Array.isArray(data) ? [] : (data as PendingOrder[]);
}
