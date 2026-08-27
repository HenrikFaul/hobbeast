import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The participant side of event communication.
 *
 * Sending already worked; being told did not. The only SELECT policy on
 * event_message_recipients covers operators, so a recipient could not read
 * their own row — which is why this goes through one curated RPC rather than
 * a widened policy. The database-side proof is in the migration; these tests
 * pin the client half.
 */

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const { getMyEventUpdates, relativeTime } = await import('@/features/events/eventUpdates');

beforeEach(() => {
  rpcMock.mockReset();
});

describe('reading my updates', () => {
  it('asks the curated function, never the raw audit table', () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    void getMyEventUpdates('event-1');
    expect(rpcMock).toHaveBeenCalledWith('my_event_updates', { p_event_id: 'event-1' });
  });

  it('returns the feed as given, newest first', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { kind: 'change', id: 'a', headline: 'Új időpont', body: 'Eső miatt később.', occurred_at: '2026-08-27T10:00:00Z' },
        { kind: 'message', id: 'b', headline: 'Helyszín', body: 'Hátsó kapu.', occurred_at: '2026-08-26T10:00:00Z' },
      ],
      error: null,
    });
    const updates = await getMyEventUpdates('event-1');
    expect(updates.map((u) => u.kind)).toEqual(['change', 'message']);
  });

  /**
   * Not having joined is the database's answer, not a fault: the RPC returns
   * nothing and the card simply does not render.
   */
  it('is empty rather than broken for somebody who has not joined', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await getMyEventUpdates('event-1')).toEqual([]);
  });

  it('stays empty when the call fails outright', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getMyEventUpdates('event-1')).toEqual([]);

    rpcMock.mockRejectedValue(new Error('network gone'));
    expect(await getMyEventUpdates('event-1')).toEqual([]);
  });
});

describe('how long ago', () => {
  const now = new Date('2026-08-27T12:00:00Z');

  it('speaks in the units a person actually uses', () => {
    expect(relativeTime('2026-08-27T11:59:40Z', now)).toBe('az imént');
    expect(relativeTime('2026-08-27T11:30:00Z', now)).toBe('30 perce');
    expect(relativeTime('2026-08-27T09:00:00Z', now)).toBe('3 órája');
    expect(relativeTime('2026-08-26T12:00:00Z', now)).toBe('tegnap');
    expect(relativeTime('2026-08-20T12:00:00Z', now)).toBe('7 napja');
  });

  it('falls back to a date once "napja" stops being useful', () => {
    expect(relativeTime('2026-01-15T12:00:00Z', now)).toContain('2026');
  });

  it('says nothing at all for a timestamp it cannot read', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
