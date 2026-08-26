import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: vi.fn() },
  },
}));

import {
  createExternalEventCompanionPlan,
  getExternalEventCompanionPlan,
  getSafeExternalEvent,
  setExternalEventCompanionMembership,
} from '@/lib/eventOperations';

const EVENT_ID = '7031c2cf-2f0e-429f-b8cb-bfa0527e4832';
const PLAN_ID = '0ca5c17c-f2dd-4bf2-aec7-a4977d8a0b6b';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('getSafeExternalEvent', () => {
  it('resolves an external program by id so its internal link is not a dead end', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: EVENT_ID, title: 'Esti csillagászat', external_url: 'https://example.hu/p' },
      error: null,
    });
    const row = await getSafeExternalEvent(EVENT_ID);
    expect(rpcMock).toHaveBeenCalledWith('get_external_event_safe', { p_external_event_id: EVENT_ID });
    expect(row?.title).toBe('Esti csillagászat');
  });

  it('returns null when the program is no longer publicly available', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getSafeExternalEvent(EVENT_ID)).toBeNull();
  });
});

describe('getExternalEventCompanionPlan', () => {
  it('reports "no plan yet" without inventing one', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { feature_enabled: true, available: true, plan: null },
      error: null,
    });
    const state = await getExternalEventCompanionPlan(EVENT_ID);
    expect(state).toEqual({ featureEnabled: true, available: true, plan: null });
  });

  it('normalizes an open plan', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        feature_enabled: true,
        available: true,
        plan: {
          id: PLAN_ID,
          host_name: 'Kata',
          is_host: false,
          meeting_point: 'Főbejárat',
          meet_time: '20:00:00',
          note: 'Utána teázunk.',
          max_companions: 6,
          companion_count: 2,
          spots_left: 4,
          i_joined: true,
          created_at: '2026-08-26T13:07:54.038Z',
        },
      },
      error: null,
    });
    const state = await getExternalEventCompanionPlan(EVENT_ID);
    expect(state.plan).toMatchObject({
      id: PLAN_ID,
      hostName: 'Kata',
      isHost: false,
      meetingPoint: 'Főbejárat',
      meetTime: '20:00:00',
      maxCompanions: 6,
      companionCount: 2,
      spotsLeft: 4,
      iJoined: true,
    });
  });

  it('falls back to a neutral host label when the profile has no display name', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        feature_enabled: true,
        available: true,
        plan: { id: PLAN_ID, host_name: '   ', companion_count: 1 },
      },
      error: null,
    });
    const state = await getExternalEventCompanionPlan(EVENT_ID);
    expect(state.plan?.hostName).toBe('Hobbeast tag');
    expect(state.plan?.spotsLeft).toBeNull();
  });
});

describe('createExternalEventCompanionPlan', () => {
  it('sends the prefilled fields and returns the resulting plan', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { feature_enabled: true, available: true, plan: { id: PLAN_ID, companion_count: 1, is_host: true } },
      error: null,
    });
    const state = await createExternalEventCompanionPlan({
      externalEventId: EVENT_ID,
      meetingPoint: 'Főbejárat',
      meetTime: '20:00',
      note: null,
    });
    expect(rpcMock).toHaveBeenCalledWith('create_external_event_companion_plan', {
      p_external_event_id: EVENT_ID,
      p_meeting_point: 'Főbejárat',
      p_meet_time: '20:00',
      p_note: null,
      p_max_companions: null,
    });
    expect(state.plan?.isHost).toBe(true);
  });

  it('surfaces the database error code so the UI can explain it', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'EXTERNAL_EVENT_NOT_AVAILABLE' },
    });
    await expect(createExternalEventCompanionPlan({ externalEventId: EVENT_ID }))
      .rejects.toThrow('EXTERNAL_EVENT_NOT_AVAILABLE');
  });
});

describe('setExternalEventCompanionMembership', () => {
  it('joins an existing plan instead of creating a second one', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { feature_enabled: true, available: true, plan: { id: PLAN_ID, companion_count: 2, i_joined: true } },
      error: null,
    });
    const state = await setExternalEventCompanionMembership({ planId: PLAN_ID, active: true });
    expect(rpcMock).toHaveBeenCalledWith('set_external_event_companion_membership', {
      p_plan_id: PLAN_ID,
      p_active: true,
    });
    expect(state.plan?.companionCount).toBe(2);
  });

  it('reports a full companion group', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'COMPANION_PLAN_FULL' } });
    await expect(setExternalEventCompanionMembership({ planId: PLAN_ID, active: true }))
      .rejects.toThrow('COMPANION_PLAN_FULL');
  });
});
