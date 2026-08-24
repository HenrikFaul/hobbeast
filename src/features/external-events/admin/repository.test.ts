import { beforeEach, describe, expect, it, vi } from 'vitest';

const edgeMocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: edgeMocks.invoke } },
}));

import { loadEventFeedStatus } from './repository';

describe('external-events admin feed repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards bounded server-side page and publisher query parameters', async () => {
    edgeMocks.invoke.mockResolvedValue({
      data: {
        summary: { total: 185 },
        sources: [],
        runs: [],
        pagination: { page: 10, limit: 20, total: 185 },
      },
      error: null,
    });

    const snapshot = await loadEventFeedStatus({
      page: 10,
      limit: 200,
      query: '  Budapest Park  ',
    });

    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: {
        action: 'status',
        page: 10,
        limit: 20,
        query: 'Budapest Park',
      },
    });
    expect(snapshot.pagination).toEqual({ page: 10, limit: 20, total: 185, totalPages: 10 });
  });

  it('keeps the initial request deterministic and omits an empty query', async () => {
    edgeMocks.invoke.mockResolvedValue({
      data: {
        summary: { total: 0 },
        sources: [],
        runs: [],
        pagination: { page: 1, limit: 20, total: 0 },
      },
      error: null,
    });

    await loadEventFeedStatus({ query: '   ' });

    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'status', page: 1, limit: 20 },
    });
  });
});
