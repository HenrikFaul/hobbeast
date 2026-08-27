import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Crew roles: the layer that was missing, over a back end that was already
 * complete.
 *
 * The table, its read policies and `manage_event_crew_role_atomic` — with an
 * idempotency key, an audit entry, an owner check and a reason requirement —
 * all existed and had never been reachable from any screen. These tests pin
 * the thin layer added on top, and in particular that it passes the RPC what
 * the RPC actually demands.
 */

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const {
  CREW_CAPABILITIES,
  EMPTY_CAPABILITIES,
  describeCapabilities,
  grantsAnything,
  saveCrewRole,
  listEventCrew,
} = await import('@/features/organizer/eventCrew');

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockResolvedValue({ data: { replayed: false }, error: null });
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-3333-4444-555555555555' });
});

describe('capabilities', () => {
  it('offers the five the table actually stores, and no invented sixth', () => {
    expect(CREW_CAPABILITIES.map((c) => c.key)).toEqual([
      'can_check_in',
      'can_message_attendees',
      'can_edit_event',
      'can_view_finance',
      'can_moderate',
    ]);
  });

  it('knows when nothing at all is granted', () => {
    // The RPC refuses an empty grant, so the screen must not offer to send one.
    expect(grantsAnything(EMPTY_CAPABILITIES)).toBe(false);
    expect(grantsAnything({ ...EMPTY_CAPABILITIES, can_check_in: true })).toBe(true);
  });

  it('describes a role in words rather than flags', () => {
    expect(describeCapabilities({ ...EMPTY_CAPABILITIES, can_check_in: true, can_moderate: true }))
      .toBe('Beléptetés · Moderálás');
    expect(describeCapabilities(EMPTY_CAPABILITIES)).toBe('Nincs jogosultság');
  });
});

describe('saving a role', () => {
  it('sends every field the RPC requires, including an idempotency key', async () => {
    await saveCrewRole({
      eventId: 'event-1',
      userId: 'user-1',
      action: 'upsert',
      capabilities: { ...EMPTY_CAPABILITIES, can_check_in: true },
      reason: 'ő intézi a beléptetést',
    });

    expect(rpcMock).toHaveBeenCalledWith('manage_event_crew_role_atomic', {
      p_event_id: 'event-1',
      p_user_id: 'user-1',
      p_action: 'upsert',
      p_can_check_in: true,
      p_can_message_attendees: false,
      p_can_edit_event: false,
      p_can_view_finance: false,
      p_can_moderate: false,
      p_reason: 'ő intézi a beléptetést',
      // Without this the RPC raises INVALID_CREW_MUTATION outright.
      p_idempotency_key: '11111111-2222-3333-4444-555555555555',
    });
  });

  it('sends no capabilities when removing somebody', async () => {
    await saveCrewRole({
      eventId: 'event-1', userId: 'user-1', action: 'remove', reason: 'már nem segít',
    });
    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_action).toBe('remove');
    expect(args.p_can_check_in).toBe(false);
  });

  it('reports a replay honestly rather than as a fresh success', async () => {
    rpcMock.mockResolvedValue({ data: { replayed: true }, error: null });
    const result = await saveCrewRole({
      eventId: 'e', userId: 'u', action: 'upsert', reason: 'ok ok',
      capabilities: { ...EMPTY_CAPABILITIES, can_moderate: true },
    });
    expect(result).toEqual({ ok: true, replayed: true });
  });

  it('turns each RPC error into something a person can act on', async () => {
    const cases: Array<[string, string]> = [
      ['EVENT_OWNER_REQUIRED', 'Ehhez az esemény tulajdonosának kell lenned.'],
      ['REAL_CREW_PROFILE_REQUIRED', 'Csak valódi, regisztrált felhasználó lehet segítő.'],
      ['AT_LEAST_ONE_CREW_CAPABILITY_REQUIRED', 'Adj meg legalább egy jogosultságot.'],
      ['INVALID_CREW_MUTATION', 'Hiányzik az indoklás — írj legalább három karaktert.'],
    ];
    for (const [code, message] of cases) {
      rpcMock.mockResolvedValue({ data: null, error: { message: `boom ${code} detail` } });
      const result = await saveCrewRole({ eventId: 'e', userId: 'u', action: 'remove', reason: 'x y z' });
      expect(result).toEqual({ ok: false, message });
    }
  });

  it('falls back to a plain message for an error it does not recognise', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'network exploded' } });
    const result = await saveCrewRole({ eventId: 'e', userId: 'u', action: 'remove', reason: 'x y z' });
    expect(result).toEqual({ ok: false, message: 'A mentés nem sikerült.' });
  });
});

describe('reading the crew', () => {
  it('returns an empty list rather than throwing when the reader may not see it', async () => {
    // The row-level policies decide this; a non-operator simply sees nothing.
    fromMock.mockReturnValue({
      select: () => ({ eq: async () => ({ data: null, error: { message: 'denied' } }) }),
    });
    expect(await listEventCrew('event-1')).toEqual([]);
  });

  it('attaches names from profiles, since the crew table stores only ids', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'event_crew_roles') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{
                id: 'r1', event_id: 'e1', user_id: 'u1', granted_by: 'o1',
                created_at: 'x', updated_at: 'y',
                can_check_in: true, can_message_attendees: false, can_edit_event: false,
                can_view_finance: false, can_moderate: false,
              }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: async () => ({ data: [{ user_id: 'u1', display_name: 'Kis Anna' }], error: null }),
        }),
      };
    });

    const crew = await listEventCrew('e1');
    expect(crew).toHaveLength(1);
    expect(crew[0].display_name).toBe('Kis Anna');
    expect(describeCapabilities(crew[0])).toBe('Beléptetés');
  });
});
