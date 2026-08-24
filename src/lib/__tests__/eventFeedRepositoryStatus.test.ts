import { describe, expect, it, vi } from 'vitest';

import { createEventFeedRepository } from '../../../supabase/functions/event-feed-ingest/repository';

function queryBuilder(result: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<typeof result> = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    ilike: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe('event feed status repository pagination', () => {
  it('ranges and searches the registry on the server while retaining global counters', async () => {
    const sourcePage = queryBuilder({
      data: [{ source_id: 'src_000000a0', publisher_name: 'Budapest Park' }],
      error: null,
      count: 185,
    });
    const sourceStates = queryBuilder({
      data: Array.from({ length: 185 }, (_, index) => ({
        source_id: `src_${index.toString(16).padStart(8, '0')}`,
        review_state: index === 0 ? 'approved' : 'pending_review',
        enabled: index === 0,
        health_status: index === 0 ? 'healthy' : 'unknown',
      })),
      error: null,
    });
    const runs = queryBuilder({ data: [], error: null });
    const quarantine = queryBuilder({ data: null, error: null, count: 7 });
    let sourceTableCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === 'external_event_feed_sources') {
        sourceTableCalls += 1;
        return sourceTableCalls === 1 ? sourcePage : sourceStates;
      }
      if (table === 'external_event_feed_runs') return runs;
      if (table === 'external_event_feed_items') return quarantine;
      throw new Error(`Unexpected table: ${table}`);
    });
    const repository = createEventFeedRepository({ from, rpc: vi.fn() } as never);

    const result = await repository.status({ query: 'Budapest Park', page: 10, limit: 20 });

    expect(sourcePage.range).toHaveBeenCalledWith(180, 199);
    expect(sourcePage.ilike).toHaveBeenCalledWith('publisher_name', '%Budapest Park%');
    expect(result.pagination).toEqual({ page: 10, limit: 20, total: 185 });
    expect(result.summary).toMatchObject({
      total: 185,
      pending_review: 184,
      approved: 1,
      enabled: 1,
      healthy: 1,
      quarantined_items: 7,
    });
  });
});
