import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { trackOutboundClick } from '@/lib/outboundTracking';

describe('outbound click tracking', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockReturnValue({ then: (_ok?: unknown, _err?: unknown) => undefined });
  });

  it('reports the click with the event id and surface', () => {
    trackOutboundClick('11111111-2222-3333-4444-555555555555', 'event_detail');
    expect(rpcMock).toHaveBeenCalledWith('track_outbound_click', {
      p_external_event_id: '11111111-2222-3333-4444-555555555555',
      p_surface: 'event_detail',
    });
  });

  it('sends nothing for an internal event with no external id', () => {
    trackOutboundClick(undefined, 'event_card');
    trackOutboundClick(null, 'event_card');
    trackOutboundClick('', 'event_card');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('never throws when measurement fails, so the user still reaches the partner', () => {
    rpcMock.mockImplementation(() => { throw new Error('network down'); });
    // A thrown error here would break the anchor's onClick and could block navigation.
    expect(() => trackOutboundClick('11111111-2222-3333-4444-555555555555', 'event_card')).not.toThrow();
  });
});
