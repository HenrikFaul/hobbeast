import {
  evaluateRobotsResponse,
  EVENT_FEED_LIMITS,
  EVENT_FEED_USER_AGENT,
  parseEventDocument,
  safeFetchRegisteredFeed,
  type EventFeedParseResult,
  type ParsedEventFeedItem,
  type SafeFeedFetchResult,
} from '../shared/eventFeeds/index.ts';

export interface EventFeedClaim {
  run_id: string;
  source_id: string;
  endpoint_url: string;
  endpoint_kind?: string | null;
  format?: string | null;
  parser_strategy?: string | null;
  publisher_name: string;
  city?: string | null;
  categories?: string[] | null;
  timezone?: string | null;
  review_state: string;
  enabled: boolean;
  legal_review_status: string;
  robots_allowed: boolean | null;
  min_publish_quality: number;
  fetch_hosts: string[];
  etag?: string | null;
  last_modified?: string | null;
  poll_interval_minutes: number;
  max_response_bytes: number;
  lease_token: string;
  lease_expires_at: string;
  attribution_required?: boolean | null;
  run_action?: 'probe' | 'sync' | 'backfill';
}

export interface EventFeedCommitResult {
  feed_item_id: string;
  external_event_id: string | null;
  item_state: string;
  published: boolean;
}

export interface EventFeedProcessorRepository {
  storeRawPayload(input: {
    claim: EventFeedClaim;
    contentType: string | null;
    rawBody: string;
    payloadSha256: string;
  }): Promise<string>;
  commitItem(input: {
    claim: EventFeedClaim;
    sourceItemId: string;
    item: Record<string, unknown>;
    qualityScore: number;
    qualityReasons: string[];
    rawPayloadId: string;
  }): Promise<EventFeedCommitResult>;
  completeRun(input: {
    claim: EventFeedClaim;
    status: 'succeeded' | 'not_modified' | 'partial' | 'failed' | 'cancelled';
    httpStatus?: number | null;
    etag?: string | null;
    lastModified?: string | null;
    discoveredCount?: number;
    quarantinedCount?: number;
    publishedCount?: number;
    duplicateCount?: number;
    errorKind?: string | null;
    errorCode?: string | null;
    failureSampleRedacted?: string | null;
    snapshotComplete?: boolean;
  }): Promise<unknown>;
}

interface EventFeedProcessorDependencies {
  safeFetch?: typeof safeFetchRegisteredFeed;
  parseDocument?: typeof parseEventDocument;
  now?: () => Date;
  resolveHost?: (hostname: string) => Promise<string[]>;
}

const CATEGORY_LABELS: Record<string, string> = {
  sport: 'Sport & Mozgás',
  extreme: 'Extrém & Kalandsport',
  nature: 'Természet & Túra',
  creative: 'Kreatív & Kézműves',
  music: 'Zene',
  dance: 'Tánc',
  'board-games': 'Társasjáték & Gondolkodás',
  gaming: 'Gaming & E-sport',
  gastronomy: 'Gasztronómia',
  'photo-film': 'Fotó & Film',
  tech: 'Technológia & Tudomány',
  learning: 'Irodalom & Tanulás',
  animals: 'Állatok',
  travel: 'Utazás & Felfedezés',
  fashion: 'Divat & Szépség',
  volunteering: 'Önkéntesség & Közösség',
  'performing-arts': 'Színház & Előadóművészet',
};

function digestHex(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    .then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
}

function localEventParts(startAt: string | null) {
  if (!startAt) return { event_date: null, event_time: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(startAt)) return { event_date: startAt, event_time: null };
  const instant = new Date(startAt);
  if (Number.isNaN(instant.getTime())) return { event_date: null, event_time: null };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    event_date: `${value('year')}-${value('month')}-${value('day')}`,
    event_time: `${value('hour')}:${value('minute')}`,
  };
}

function sourceItemId(event: ParsedEventFeedItem) {
  // The parser already folds an ICS RECURRENCE-ID into externalId. Keeping a
  // single canonical identifier avoids creating a second row when the same
  // occurrence is reparsed by a newer worker version.
  return event.externalId.slice(0, 500);
}

export function eventFeedItemPayload(event: ParsedEventFeedItem, claim: EventFeedClaim) {
  const start = localEventParts(event.startAt);
  const locationType = event.location.online
    ? 'online'
    : event.location.address
      ? 'address'
      : event.location.city || claim.city
        ? 'city'
        : 'free';
  const category = event.category ? CATEGORY_LABELS[event.category] || event.category : null;
  return {
    title: event.title,
    description: event.description,
    event_date: start.event_date,
    event_time: start.event_time,
    external_url: event.url,
    category,
    subcategory: null,
    tags: [...new Set([...(event.tags || []), ...(event.sourceCategories || [])])].slice(0, 12),
    location_type: locationType,
    location_city: event.location.city || claim.city || null,
    location_address: event.location.address,
    location_free_text: event.location.name,
    image_url: event.imageUrl,
    organizer_name: event.organizerName || claim.publisher_name,
    provider_updated_at: event.publishedAt,
    status: event.status,
    feed_format: event.format,
    source_category_id: event.category,
    end_at: event.endAt,
  };
}

function registryFor(claim: EventFeedClaim, endpointUrl = claim.endpoint_url, includeValidators = true) {
  const endpoint = new URL(endpointUrl);
  const allowedHosts = new Set((claim.fetch_hosts || []).map((host) => host.toLowerCase()));
  if (!allowedHosts.has(endpoint.hostname.toLowerCase())) throw new Error('FEED_SOURCE_HOST_NOT_APPROVED');
  return {
    [claim.source_id]: {
      sourceId: claim.source_id,
      endpointUrl: endpoint.toString(),
      allowedHost: endpoint.hostname,
      etag: includeValidators ? claim.etag : null,
      lastModified: includeValidators ? claim.last_modified : null,
    },
  };
}

async function fetchAndParse(
  claim: EventFeedClaim,
  dependencies: EventFeedProcessorDependencies,
): Promise<{ fetched: SafeFeedFetchResult; parsed: EventFeedParseResult | null }> {
  const safeFetch = dependencies.safeFetch ?? safeFetchRegisteredFeed;
  const parseDocument = dependencies.parseDocument ?? parseEventDocument;
  const fetchDependenciesFor = (approvedUrl: string) => {
    const approvedTarget = new URL(approvedUrl).toString();
    return {
      ...(dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {}),
      authorizeRequest: async (requestUrl: URL) => {
        if (requestUrl.toString() !== approvedTarget) {
          await assertRobotsAllowsFetch(claim, dependencies, requestUrl.toString());
        }
      },
    };
  };
  let fetched = await safeFetch(claim.source_id, registryFor(claim), fetchDependenciesFor(claim.endpoint_url), {
    maxBodyBytes: claim.max_response_bytes,
    maxRedirects: 3,
    timeoutMs: 12_000,
  });
  if (fetched.status === 'not_modified' || fetched.body === null) return { fetched, parsed: null };

  let parsed = parseDocument(fetched.body, {
    sourceId: claim.source_id,
    sourceUrl: fetched.finalUrl,
    contentType: fetched.contentType,
    now: dependencies.now?.() ?? new Date(),
    sourceTimezone: claim.timezone,
    sourceCity: claim.city,
    sourceCategories: claim.categories,
    limits: { maxBodyBytes: claim.max_response_bytes },
  });

  if (parsed.events.length === 0 && parsed.discoveredFeedUrls.length > 0) {
    const discoveredUrl = parsed.discoveredFeedUrls.find((candidate) => {
      try {
        return new URL(candidate).hostname.toLowerCase() === new URL(claim.endpoint_url).hostname.toLowerCase();
      } catch {
        return false;
      }
    });
    if (discoveredUrl) {
      // A discovered feed can live below a different robots path than the HTML
      // landing page. Re-evaluate the live policy for the exact target before
      // issuing the second request.
      await assertRobotsAllowsFetch(claim, dependencies, discoveredUrl);
      fetched = await safeFetch(
        claim.source_id,
        registryFor(claim, discoveredUrl, false),
        fetchDependenciesFor(discoveredUrl),
        {
        maxBodyBytes: claim.max_response_bytes,
        maxRedirects: 3,
        timeoutMs: 12_000,
        },
      );
      if (fetched.status === 'ok' && fetched.body !== null) {
        parsed = parseDocument(fetched.body, {
          sourceId: claim.source_id,
          sourceUrl: fetched.finalUrl,
          contentType: fetched.contentType,
          now: dependencies.now?.() ?? new Date(),
          sourceTimezone: claim.timezone,
          sourceCity: claim.city,
          sourceCategories: claim.categories,
          limits: { maxBodyBytes: claim.max_response_bytes },
        });
      }
    }
  }

  return { fetched, parsed };
}

async function assertRobotsAllowsFetch(
  claim: EventFeedClaim,
  dependencies: EventFeedProcessorDependencies,
  targetUrl = claim.endpoint_url,
) {
  if (claim.run_action !== 'probe' && claim.robots_allowed !== true) {
    throw new Error('ROBOTS_APPROVAL_REQUIRED');
  }
  const endpoint = new URL(targetUrl);
  const robotsUrl = new URL('/robots.txt', endpoint);
  const safeFetch = dependencies.safeFetch ?? safeFetchRegisteredFeed;
  const fetchDependencies = dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {};
  const fetched = await safeFetch(
    claim.source_id,
    registryFor(claim, robotsUrl.toString(), false),
    fetchDependencies,
    {
      maxBodyBytes: 512 * 1024,
      maxRedirects: 5,
      timeoutMs: 8_000,
      userAgent: EVENT_FEED_USER_AGENT,
      returnHttpErrors: true,
      acceptEmptySuccess: true,
    },
  );
  const decision = evaluateRobotsResponse(
    fetched.httpStatus,
    fetched.body || '',
    EVENT_FEED_USER_AGENT,
    `${endpoint.pathname}${endpoint.search}`,
  );
  if (!decision.allowed) {
    throw new Error(decision.reason === 'robots_temporary_failure'
      ? 'ROBOTS_TEMPORARY_FAILURE'
      : 'ROBOTS_DISALLOWED');
  }
  return decision;
}

export async function processEventFeedClaim(
  claim: EventFeedClaim,
  repository: EventFeedProcessorRepository,
  dependencies: EventFeedProcessorDependencies = {},
) {
  let httpStatus: number | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let discovered = 0;
  let quarantined = 0;
  let published = 0;
  let duplicates = 0;

  try {
    await assertRobotsAllowsFetch(claim, dependencies);
    const { fetched, parsed } = await fetchAndParse(claim, dependencies);
    httpStatus = fetched.httpStatus;
    etag = fetched.etag;
    lastModified = fetched.lastModified;
    if (fetched.status === 'not_modified') {
      await repository.completeRun({
        claim, status: 'not_modified', httpStatus, etag, lastModified,
        snapshotComplete: false,
      });
      return { source_id: claim.source_id, status: 'not_modified', discovered, quarantined, published, duplicates };
    }
    if (!fetched.body || !parsed) throw new Error('EMPTY_FEED_RESPONSE');

    const rawPayloadId = await repository.storeRawPayload({
      claim,
      contentType: fetched.contentType,
      rawBody: fetched.body,
      payloadSha256: await digestHex(fetched.body),
    });
    discovered = parsed.events.length;

    for (const event of parsed.events) {
      const result = await repository.commitItem({
        claim,
        sourceItemId: sourceItemId(event),
        item: eventFeedItemPayload(event, claim),
        qualityScore: event.quality.score,
        qualityReasons: event.quality.reasons,
        rawPayloadId,
      });
      if (result.published) published += 1;
      else if (result.item_state === 'duplicate') duplicates += 1;
      else quarantined += 1;
    }

    await repository.completeRun({
      claim,
      status: 'succeeded',
      httpStatus, etag, lastModified,
      discoveredCount: discovered,
      quarantinedCount: quarantined,
      publishedCount: published,
      duplicateCount: duplicates,
      snapshotComplete: claim.run_action === 'sync'
        && parsed.format !== 'html'
        && parsed.events.length < EVENT_FEED_LIMITS.maxItems,
    });
    return { source_id: claim.source_id, status: 'succeeded', discovered, quarantined, published, duplicates };
  } catch (error) {
    const errorCode = error instanceof Error
      ? ('code' in error && typeof error.code === 'string' ? error.code : error.message)
      : 'UNKNOWN_FEED_FAILURE';
    await repository.completeRun({
      claim,
      status: 'failed',
      httpStatus, etag, lastModified,
      discoveredCount: discovered,
      quarantinedCount: quarantined,
      publishedCount: published,
      duplicateCount: duplicates,
      errorKind: 'feed_ingest_failure',
      errorCode: String(errorCode).slice(0, 120),
      failureSampleRedacted: `${claim.source_id} feed_ingest_failure`,
      snapshotComplete: false,
    }).catch(() => undefined);
    throw error;
  }
}
