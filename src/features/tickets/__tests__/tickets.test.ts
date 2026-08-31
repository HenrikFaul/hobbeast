import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Ticketing (O-H) client contract. The safety rules (operator-only management,
 * seat-holding, idempotent check-in) are proven live in the database; these tests
 * pin the client half: correct RPC params, error sentences, and price formatting.
 */

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

const {
  formatPrice, listTicketTypesPublic, createTicketType, reserveTickets,
  confirmOrderPayment, checkInTicket, myTickets,
} = await import('@/features/tickets/tickets');

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe('formatPrice', () => {
  it('shows free as a word, not a zero amount', () => {
    expect(formatPrice(0)).toBe('Ingyenes');
    expect(formatPrice(0, 'HUF')).toBe('Ingyenes');
  });

  it('formats a HUF amount from cents into forints', () => {
    const s = formatPrice(250000, 'HUF');
    expect(s).not.toBe('Ingyenes');
    expect(s).toMatch(/Ft/);
    expect(s.replace(/\s/g, '')).toContain('2500');
  });
});

describe('buying', () => {
  it('reserves with the right params and returns the result', async () => {
    rpcMock.mockResolvedValue({ data: { order_id: 'o1', status: 'paid', tickets: ['HB-ABC'] }, error: null });
    const result = await reserveTickets('type-1', 2, 'a@b.hu');
    expect(rpcMock).toHaveBeenCalledWith('reserve_tickets', {
      p_ticket_type_id: 'type-1', p_quantity: 2, p_buyer_email: 'a@b.hu',
    });
    expect(result).toEqual({ ok: true, result: { order_id: 'o1', status: 'paid', tickets: ['HB-ABC'] } });
  });

  it('turns a sold-out refusal into a clear message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SOLD_OUT' } });
    expect(await reserveTickets('type-1', 5)).toEqual({
      ok: false, message: 'Elfogyott — nincs ennyi szabad hely.',
    });
  });

  it('returns an empty list when there are no ticket types', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await listTicketTypesPublic('e1')).toEqual([]);
  });
});

describe('operating', () => {
  it('creates a ticket type with cents and a currency', async () => {
    rpcMock.mockResolvedValue({ data: { id: 't1' }, error: null });
    await createTicketType({ eventId: 'e1', name: 'Elővétel', priceCents: 250000, quantityTotal: 50 });
    expect(rpcMock).toHaveBeenCalledWith('create_ticket_type', expect.objectContaining({
      p_event_id: 'e1', p_name: 'Elővétel', p_price_cents: 250000, p_quantity_total: 50, p_currency: 'HUF',
    }));
  });

  it('maps a finance-required refusal to a clear message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'FINANCE_REQUIRED' } });
    expect(await confirmOrderPayment('o1')).toEqual({
      ok: false, message: 'Ehhez pénzügyi jogosultság kell az eseményhez.',
    });
  });

  it('reports an already-checked-in ticket without failing', async () => {
    rpcMock.mockResolvedValue({ data: { already: true, event_title: 'Koncert' }, error: null });
    expect(await checkInTicket('HB-ABC')).toEqual({ ok: true, already: true, eventTitle: 'Koncert' });
  });

  it('returns an empty ticket list rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await myTickets()).toEqual([]);
  });
});
