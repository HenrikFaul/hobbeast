import { describe, expect, it, vi } from 'vitest';
import {
  eventFeedItemPayload,
  processEventFeedClaim,
  type EventFeedClaim,
  type EventFeedProcessorRepository,
} from '../../../supabase/functions/event-feed-ingest/processor';
import {
  parseEventDocument,
  type ParsedEventFeedItem,
} from '../../../supabase/functions/shared/eventFeeds';

const claim: EventFeedClaim = {
  run_id: 'run-1', source_id: 'src_12345678', endpoint_url: 'https://events.example/feed.xml',
  publisher_name: 'Példa szervező', city: 'Budapest', review_state: 'approved', enabled: true,
  legal_review_status: 'approved', robots_allowed: true, min_publish_quality: 80,
  fetch_hosts: ['events.example'], poll_interval_minutes: 1440, max_response_bytes: 2_097_152,
  lease_token: 'lease-1', lease_expires_at: '2026-08-25T09:00:00Z', run_action: 'sync',
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

  it('keeps all-day dates without an event_time in the database payload', () => {
    expect(eventFeedItemPayload({ ...event, startAt: '2027-09-10' }, claim)).toMatchObject({
      event_date: '2027-09-10', event_time: null,
    });
  });

  it('keeps a parsed JSON-LD date-only start as event_time NULL', () => {
    const parsed = parseEventDocument(JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Egész napos közösségi futás',
      url: 'https://events.example/all-day', startDate: '2027-09-10',
      location: { '@type': 'Place', name: 'Városliget' }, keywords: 'futás',
    }), {
      sourceId: claim.source_id, sourceUrl: claim.endpoint_url,
      contentType: 'application/ld+json', now: new Date('2026-08-25T08:00:00Z'),
    });

    expect(eventFeedItemPayload(parsed.events[0], claim)).toMatchObject({
      event_date: '2027-09-10', event_time: null,
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
      parseDocument: vi.fn(() => ({
        format: 'rss', events: [event], discoveredFeedUrls: [], warnings: [], recognizedCollection: true,
      })),
      now: () => new Date('2026-08-25T08:00:00Z'),
    });

    expect(result).toMatchObject({ status: 'succeeded', discovered: 1, published: 1, quarantined: 0 });
    expect(repo.storeRawPayload).toHaveBeenCalledTimes(1);
    expect(repo.commitItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemId: 'item-1', qualityScore: 100, qualityReasons: [],
    }));
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', publishedCount: 1, snapshotComplete: true,
    }));
  });

  it('never marks probe, HTML or parser-capped runs as complete snapshots', async () => {
    const cases = [
      { run_action: 'probe' as const, format: 'rss' as const, events: [event] },
      { run_action: 'sync' as const, format: 'html' as const, events: [] },
      { run_action: 'sync' as const, format: 'rss' as const, events: Array.from({ length: 200 }, () => event) },
    ];
    for (const candidate of cases) {
      const repo = repository();
      await processEventFeedClaim({ ...claim, run_action: candidate.run_action }, repo, {
        safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
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
        }),
        parseDocument: vi.fn(() => ({
          format: candidate.format, events: candidate.events, discoveredFeedUrls: [], warnings: [],
        })),
      });
      expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
        status: 'succeeded', snapshotComplete: false,
      }));
    }
  });

  it('marks a valid empty structured RSS sync as a complete absence snapshot', async () => {
    const repo = repository();
    await processEventFeedClaim(claim, repo, {
      safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
        const endpointUrl = registry[claim.source_id].endpointUrl;
        return endpointUrl.endsWith('/robots.txt')
          ? {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
            etag: null, lastModified: null, body: '', bodyBytes: 0,
          }
          : {
            status: 'ok' as const, finalUrl: claim.endpoint_url, httpStatus: 200,
            contentType: 'application/rss+xml', etag: null, lastModified: null,
            body: '<rss><channel /></rss>', bodyBytes: 22,
          };
      }),
      now: () => new Date('2026-08-25T08:00:00Z'),
    });

    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', discoveredCount: 0, snapshotComplete: true,
    }));
  });

  it('does not treat an arbitrary JSON API error as a complete absence snapshot', async () => {
    const repo = repository();
    await processEventFeedClaim(claim, repo, {
      safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
        const endpointUrl = registry[claim.source_id].endpointUrl;
        return endpointUrl.endsWith('/robots.txt')
          ? {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
            etag: null, lastModified: null, body: '', bodyBytes: 0,
          }
          : {
            status: 'ok' as const, finalUrl: claim.endpoint_url, httpStatus: 200,
            contentType: 'application/json', etag: null, lastModified: null,
            body: '{"error":"rate limited"}', bodyBytes: 24,
          };
      }),
      now: () => new Date('2026-08-25T08:00:00Z'),
    });

    expect(repo.commitItem).not.toHaveBeenCalled();
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partial', discoveredCount: 0, snapshotComplete: false,
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

  it('uses the five-hop robots redirect budget and accepts an empty successful robots response', async () => {
    const repo = repository();
    const safeFetch = vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>, _dependencies, options) => {
      const endpointUrl = registry[claim.source_id].endpointUrl;
      if (endpointUrl.endsWith('/robots.txt')) {
        expect(options).toMatchObject({ maxRedirects: 5, returnHttpErrors: true, acceptEmptySuccess: true });
        return {
          status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 204, contentType: null,
          etag: null, lastModified: null, body: '', bodyBytes: 0,
        };
      }
      return {
        status: 'ok' as const, finalUrl: claim.endpoint_url, httpStatus: 200, contentType: 'application/rss+xml',
        etag: null, lastModified: null, body: '<rss/>', bodyBytes: 6,
      };
    });
    await processEventFeedClaim(claim, repo, {
      safeFetch,
      parseDocument: vi.fn(() => ({ format: 'rss', events: [event], discoveredFeedUrls: [], warnings: [] })),
    });
    expect(repo.commitItem).toHaveBeenCalledTimes(1);
  });

  it('re-checks robots for the exact HTML-discovered feed path before fetching it', async () => {
    const repo = repository();
    const robotsTargets: string[] = [];
    const fetchedTargets: string[] = [];
    let robotsRequest = 0;
    const safeFetch = vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
      const endpointUrl = registry[claim.source_id].endpointUrl;
      if (endpointUrl.endsWith('/robots.txt')) {
        robotsRequest += 1;
        return {
          status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 200, contentType: 'text/plain',
          etag: null, lastModified: null,
          body: robotsRequest === 1
            ? 'User-agent: *\nAllow: /feed.xml'
            : 'User-agent: *\nDisallow: /private',
          bodyBytes: 32,
        };
      }
      fetchedTargets.push(endpointUrl);
      return {
        status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 200, contentType: 'text/html',
        etag: null, lastModified: null, body: '<html/>', bodyBytes: 7,
      };
    });
    const parseDocument = vi.fn((_body, options) => {
      robotsTargets.push(options.sourceUrl);
      return {
        format: 'html' as const,
        events: [],
        discoveredFeedUrls: ['https://events.example/private/feed.xml'],
        warnings: [],
      };
    });

    await expect(processEventFeedClaim(claim, repo, { safeFetch, parseDocument }))
      .rejects.toThrow('ROBOTS_DISALLOWED');
    expect(fetchedTargets).toEqual([claim.endpoint_url]);
    expect(robotsRequest).toBe(2);
    expect(robotsTargets).toEqual([claim.endpoint_url]);
    expect(repo.storeRawPayload).not.toHaveBeenCalled();
    expect(repo.commitItem).not.toHaveBeenCalled();
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', errorCode: 'ROBOTS_DISALLOWED',
    }));
  });

  it('wires live robots authorization into same-host feed redirects before the next request', async () => {
    const repo = repository();
    let robotsRequest = 0;
    let redirectedRequestIssued = false;
    const safeFetch = vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>, dependencies) => {
      const endpointUrl = registry[claim.source_id].endpointUrl;
      if (endpointUrl.endsWith('/robots.txt')) {
        robotsRequest += 1;
        return {
          status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 200, contentType: 'text/plain',
          etag: null, lastModified: null,
          body: robotsRequest === 1
            ? 'User-agent: *\nAllow: /feed.xml'
            : 'User-agent: *\nDisallow: /private',
          bodyBytes: 32,
        };
      }
      await dependencies.authorizeRequest(new URL('https://events.example/private/feed.xml'), 1);
      redirectedRequestIssued = true;
      throw new Error('unexpected redirected request');
    });

    await expect(processEventFeedClaim(claim, repo, { safeFetch }))
      .rejects.toThrow('ROBOTS_DISALLOWED');
    expect(robotsRequest).toBe(2);
    expect(redirectedRequestIssued).toBe(false);
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', errorCode: 'ROBOTS_DISALLOWED',
    }));
  });

  it('clears a discovered feed validator and never reuses it for the HTML landing URL', async () => {
    const htmlClaim = {
      ...claim,
      format: 'html',
      etag: '"stale-discovered"',
      last_modified: 'Tue, 25 Aug 2026 07:00:00 GMT',
    };
    const seenLandingValidators: Array<string | null | undefined> = [];
    const controller = new AbortController();
    const safeFetch = vi.fn(async (
      _sourceId,
      registry: Record<string, { endpointUrl: string; etag?: string | null }>,
      _dependencies,
      options,
    ) => {
      expect(options.signal).toBe(controller.signal);
      const source = registry[claim.source_id];
      if (source.endpointUrl.endsWith('/robots.txt')) {
        return {
          status: 'ok' as const, finalUrl: source.endpointUrl, httpStatus: 404, contentType: 'text/plain',
          etag: null, lastModified: null, body: '', bodyBytes: 0,
        };
      }
      if (source.endpointUrl === claim.endpoint_url) {
        seenLandingValidators.push(source.etag);
        return {
          status: 'ok' as const, finalUrl: source.endpointUrl, httpStatus: 200, contentType: 'text/html',
          etag: '"landing"', lastModified: null,
          body: '<html><head><link rel="alternate" type="application/rss+xml" href="/canonical.xml"></head></html>',
          bodyBytes: 99,
        };
      }
      expect(source.etag).toBeNull();
      return {
        status: 'ok' as const, finalUrl: source.endpointUrl, httpStatus: 200, contentType: 'application/rss+xml',
        etag: '"discovered"', lastModified: 'Tue, 25 Aug 2026 08:00:00 GMT',
        body: '<rss><channel /></rss>', bodyBytes: 23,
      };
    });

    const firstRepo = repository();
    await processEventFeedClaim(htmlClaim, firstRepo, { safeFetch, signal: controller.signal });
    expect(firstRepo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', etag: '', lastModified: '',
    }));

    const nextRepo = repository();
    await processEventFeedClaim({ ...htmlClaim, etag: '', last_modified: '' }, nextRepo, {
      safeFetch,
      signal: controller.signal,
    });
    expect(seenLandingValidators).toEqual([null, null]);
  });

  it('clears validators received from a same-host redirected resource', async () => {
    const repo = repository();
    await processEventFeedClaim({ ...claim, format: 'rss' }, repo, {
      safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
        const endpointUrl = registry[claim.source_id].endpointUrl;
        return endpointUrl.endsWith('/robots.txt')
          ? {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
            etag: null, lastModified: null, body: '', bodyBytes: 0,
          }
          : {
            status: 'ok' as const, finalUrl: 'https://events.example/canonical.xml', httpStatus: 200,
            contentType: 'application/rss+xml', etag: '"redirected"',
            lastModified: 'Tue, 25 Aug 2026 08:00:00 GMT',
            body: '<rss><channel /></rss>', bodyBytes: 23,
          };
      }),
    });

    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', etag: '', lastModified: '',
    }));
  });

  it('treats a redirected 304 as a partial validator-resource mismatch', async () => {
    const repo = repository();
    const result = await processEventFeedClaim({ ...claim, format: 'rss' }, repo, {
      safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
        const endpointUrl = registry[claim.source_id].endpointUrl;
        return endpointUrl.endsWith('/robots.txt')
          ? {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
            etag: null, lastModified: null, body: '', bodyBytes: 0,
          }
          : {
            status: 'not_modified' as const, finalUrl: 'https://events.example/canonical.xml', httpStatus: 304,
            contentType: null, etag: '"redirected"', lastModified: null, body: null, bodyBytes: 0,
          };
      }),
    });

    expect(result.status).toBe('partial');
    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partial', etag: '', lastModified: '', errorCode: 'VALIDATOR_RESOURCE_MISMATCH',
      snapshotComplete: false,
    }));
  });

  it('fails malformed structured XML without producing a complete snapshot', async () => {
    const repo = repository();
    await expect(processEventFeedClaim({ ...claim, format: 'rss' }, repo, {
      safeFetch: vi.fn(async (_sourceId, registry: Record<string, { endpointUrl: string }>) => {
        const endpointUrl = registry[claim.source_id].endpointUrl;
        return endpointUrl.endsWith('/robots.txt')
          ? {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 404, contentType: 'text/plain',
            etag: null, lastModified: null, body: '', bodyBytes: 0,
          }
          : {
            status: 'ok' as const, finalUrl: endpointUrl, httpStatus: 200,
            contentType: 'application/rss+xml', etag: null, lastModified: null,
            body: '<rss><channel><item></channel></rss>', bodyBytes: 38,
          };
      }),
    })).rejects.toMatchObject({ code: 'malformed_xml' });

    expect(repo.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', errorCode: 'malformed_xml', snapshotComplete: false,
    }));
  });
});
