import { describe, expect, it, vi } from 'vitest';
import {
  eventFeedItemPayload,
  processEventFeedClaim,
  type EventFeedClaim,
  type EventFeedProcessorRepository,
} from '../../../supabase/functions/event-feed-ingest/processor';
import type { ParsedEventFeedItem } from '../../../supabase/functions/shared/eventFeeds';

const claim: EventFeedClaim = {
  run_id: 'run-1', source_id: 'src_12345678', endpoint_url: 'https://events.example/feed.xml',
  publisher_name: 'Példa szervező', city: 'Budapest', review_state: 'approved', enabled: true,
  legal_review_status: 'approved', robots_allowed: true, min_publish_quality: 80,
  fetch_hosts: ['events.example'], poll_interval_minutes: 1440, max_response_bytes: 2_097_152,
  lease_token: 'lease-1', lease_expires_at: '2026-08-25T09:00:00Z',
};

const event: ParsedEventFeedItem = {
  sourceId: claim.source_id, format: 'rss', externalId: 'item-1', recurrenceId: null,
  title: 'Esti közösségi futás', description: 'Mozgás együtt.', url: 'https://events.example/1',
  imageUrl: null, startAt: '2026-09-10T16:00:00Z', endAt: null, publishedAt: null,
  status: 'scheduled', organizerName: null,
  location: { name: 'Városliget', address: null, city: null, online: false },
  category: 'sport', tags: ['futas'], sourceCategories: ['Közösségi sport'],
  quality: { publishable: true, score: 100, reasons: [] },
};

function repository(): EventFeedProcessorRepository {
  return {
    storeRawPayload: vi.fn(async () => 'raw-1'),
    commitItem: vi.fn(async () => ({ feed_item_id: 'item-db-1', external_event_id: 'event-db-1', item_state: 'published', published: true })),
    completeRun: vi.fn(async () => ({})),
  };
}

describe('event feed processor', () => {
  it('maps taxonomy IDs to searchable Hungarian catalog names and Budapest local time', () => {
    expect(eventFeedItemPayload(event, claim)).toMatchObject({
      category: 'Sport & Mozgás', event_date: '2026-09-10', event_time: '18:00',
      location_city: 'Budapest', organizer_name: 'Példa szervező', status: 'scheduled',
    });
  });

  it('keeps the parser canonical recurrence identity without appending it twice', async () => {
    const repo = repository();
    const recurringEvent = {
      ...event,
      format: 'ics' as const,
      externalId: 'weekly-run::20260910T160000Z',
      recurrenceId: '20260910T160000Z',
    };
    await processEventFeedClaim(claim, repo, {
      resolveHost: async () => ['93.184.216.34'],
      safeFetch: vi.fn(async () => ({
        status: 'ok', finalUrl: claim.endpoint_url, httpStatus: 200, contentType: 'text/calendar',
        etag: null, lastModified: null, body: 'BEGIN:VCALENDAR', bodyBytes: 15,
      })),
      parseDocument: vi.fn(() => ({ format: 'ics', events: [recurringEvent], discoveredFeedUrls: [], warnings: [] })),
    });

    expect(repo.commitItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemId: 'weekly-run::20260910T160000Z',
    }));
  });

  it('stages raw content, commits normalized items and completes the lease', async () => {
    const repo = repository();
    const safeFetch = vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
      const endpointUrl = registry[claim.source_id].endpointUrl;
      if (endpointUrl.endsWith('/robots.txt')) {
        return {
          status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 200, contentType: 'text/plain',
          etag: null, lastModified: null, body: 'User-agent: *\nAllow: /', bodyBytes: 22,
        };
      }
      return {
        status: 'ok' as const, finalUrl: claim.endpoint_url, httpStatus: 200, contentType: 'application/rss+xml',
        etag: '"v1"', lastModified: null, body: '<rss/>', bodyBytes: 6,
      };
    });
    const result = await processEventFeedClaim(claim, repo, {
      resolveHost: async () => ['93.184.216.34'],
      safeFetch,
      parseDocument: vi.fn(() => ({ format: 'rss', events: [event], discoveredFeedUrls: [], warnings: [] })),
      now: () => new Date('2026-08-25T08:00:00Z'),
    });

    expect(result).toMatchObject({ status: 'succeeded', discovered: 1, published: 1, quarantined: 0 });
    expect(repo.storeRawPayload).toHaveBeenCalledTimes(1);
    expect(repo.commitItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemId: 'item-1', qualityScore: 100, qualityReasons: [],
    }));
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', publishedCount: 1,
    }));
  });

  it('never fetches a source without explicit robots approval', async () => {
    const repo = repository();
    const safeFetch = vi.fn();
    await expect(processEventFeedClaim({ ...claim, robots_allowed: null }, repo, { safeFetch }))
      .rejects.toThrow('ROBOTS_APPROVAL_REQUIRED');
    expect(safeFetch).not.toHaveBeenCalled();
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('allows a registered probe only after a live robots check and keeps DB publication delegated to quarantine', async () => {
    const repo = repository();
    const safeFetch = vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
      const endpointUrl = registry[claim.source_id].endpointUrl;
      return endpointUrl.endsWith('/robots.txt')
        ? {
          status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
          etag: null, lastModified: null, body: '', bodyBytes: 0,
        }
        : {
          status: 'ok' as const, finalUrl: claim.endpoint_url, httpStatus: 200, contentType: 'application/rss+xml',
          etag: null, lastModified: null, body: '<rss/>', bodyBytes: 6,
        };
    });
    await processEventFeedClaim({ ...claim, run_action: 'probe', robots_allowed: null }, repo, {
      safeFetch,
      parseDocument: vi.fn(() => ({ format: 'rss', events: [event], discoveredFeedUrls: [], warnings: [] })),
    });
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(repo.commitItem).toHaveBeenCalledTimes(1);
  });
});
