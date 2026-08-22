import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import {
  loadDiscoveryProfileLocation,
  loadJoinedEventIds,
} from '../eventsRepository';

describe('events repository boundary', () => {
  beforeEach(() => mocks.from.mockReset());

  it('normalizes joined IDs behind the event domain boundary', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ event_id: 'event-1' }, { event_id: 'event-2' }],
      error: null,
    });
    mocks.from.mockReturnValue({ select: () => ({ eq }) });
    const result = await loadJoinedEventIds('user-1');
    expect(mocks.from).toHaveBeenCalledWith('event_participants');
    expect([...result.data]).toEqual(['event-1', 'event-2']);
    expect(result.errorCode).toBeNull();
  });

  it('fails closed with a stable code rather than exposing database errors', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'raw database detail' } });
    mocks.from.mockReturnValue({ select: () => ({ eq }) });
    const result = await loadJoinedEventIds('user-1');
    expect(result.data.size).toBe(0);
    expect(result.errorCode).toBe('EVENTS_REPOSITORY_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain('raw database detail');
  });

  it('returns only the allowlisted discovery profile fields', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        city: 'Budapest',
        address: null,
        location_lat: 47.5,
        location_lon: 19.04,
        hobbies: ['Túrázás'],
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    mocks.from.mockReturnValue({ select: () => ({ eq }) });
    const result = await loadDiscoveryProfileLocation('user-1');
    expect(result.data?.city).toBe('Budapest');
    expect(result.errorCode).toBeNull();
  });
});
