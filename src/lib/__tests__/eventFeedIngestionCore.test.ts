import { describe, expect, it, vi } from 'vitest';

import {
  EventFeedParseError,
  SafeFeedFetchError,
  evaluateRobotsResponse,
  evaluateRobotsTxt,
  parseEventDocument,
  safeFetchRegisteredFeed,
  type RegisteredFeedSource,
} from '../../../supabase/functions/shared/eventFeeds/index.ts';

const NOW = new Date('2026-08-25T08:00:00.000Z');
const SOURCE_URL = 'https://events.example.hu/feed';

describe('event feed parsers', () => {
  it('parses an RSS event with an explicit custom event date and Hobbeast category', () => {
    const result = parseEventDocument(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:evt="https://hobbeast.hu/event">
        <channel><item>
          <guid>concert-42</guid>
          <title><![CDATA[Budapesti jazz &amp; koncert]]></title>
          <link>https://events.example.hu/jazz</link>
          <description><![CDATA[<b>Közös zenei este</b> mindenkinek.]]></description>
          <pubDate>Tue, 25 Aug 2026 09:00:00 GMT</pubDate>
          <evt:start_date>2027-02-03T19:00:00+01:00</evt:start_date>
          <evt:location>Budapest Music Center</evt:location>
          <category>Koncert</category>
        </item></channel>
      </rss>`, {
      sourceId: 'rss-source', sourceUrl: SOURCE_URL, contentType: 'application/rss+xml', now: NOW,
    });

    expect(result.format).toBe('rss');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: 'concert-42',
      title: 'Budapesti jazz & koncert',
      startAt: '2027-02-03T18:00:00.000Z',
      publishedAt: '2026-08-25T09:00:00.000Z',
      category: 'music',
      quality: { publishable: true, reasons: [] },
    });
  });

  it('never treats RSS pubDate as the event start and quarantines the item', () => {
    const [event] = parseEventDocument(`<rss><channel><item>
      <guid>news-only</guid><title>Futóklub híre</title>
      <link>https://events.example.hu/news</link>
      <pubDate>Wed, 03 Feb 2027 18:00:00 GMT</pubDate>
      <location>Margitsziget</location><category>Futás</category>
    </item></channel></rss>`, {
      sourceId: 'rss-source', sourceUrl: SOURCE_URL, now: NOW,
    }).events;

    expect(event.publishedAt).toBe('2027-02-03T18:00:00.000Z');
    expect(event.startAt).toBeNull();
    expect(event.quality.publishable).toBe(false);
    expect(event.quality.reasons).toContain('missing_start');
  });

  it('parses Atom alternate links and explicit namespaced event dates', () => {
    const [event] = parseEventDocument(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:evt="https://hobbeast.hu/event">
      <entry><id>tag:events.example.hu,2027:board-1</id>
        <title>Társasjáték est</title>
        <link rel="alternate" href="https://events.example.hu/board-1" />
        <updated>2026-08-25T07:00:00Z</updated>
        <evt:start>2027-03-04T18:00:00Z</evt:start>
        <evt:venue>Játszóház</evt:venue>
        <category term="Társasjáték" />
      </entry></feed>`, {
      sourceId: 'atom-source', sourceUrl: SOURCE_URL, contentType: 'application/atom+xml', now: NOW,
    }).events;

    expect(event).toMatchObject({
      externalId: 'tag:events.example.hu,2027:board-1',
      url: 'https://events.example.hu/board-1',
      startAt: '2027-03-04T18:00:00.000Z',
      category: 'board-games',
      quality: { publishable: true },
    });
  });

  it('keeps ICS UID plus RECURRENCE-ID identity and cancellation state', () => {
    const [event] = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
METHOD:PUBLISH\r
BEGIN:VEVENT\r
UID:run-series@example.hu\r
RECURRENCE-ID;TZID=Europe/Budapest:20270410T090000\r
DTSTART;TZID=Europe/Budapest:20270410T090000\r
DTEND;TZID=Europe/Budapest:20270410T103000\r
STATUS:CANCELLED\r
SUMMARY:Közösségi futás\r
LOCATION:Margitsziget\r
URL:https://events.example.hu/run-series\r
CATEGORIES:Futás,Sport\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'ics-source', sourceUrl: 'https://events.example.hu/calendar.ics', contentType: 'text/calendar', now: NOW,
    }).events;

    expect(event.externalId).toBe('run-series@example.hu::2027-04-10T07:00:00.000Z');
    expect(event.recurrenceId).toBe('2027-04-10T07:00:00.000Z');
    expect(event.startAt).toBe('2027-04-10T07:00:00.000Z');
    expect(event.status).toBe('cancelled');
    expect(event.quality.publishable).toBe(false);
    expect(event.quality.reasons).toContain('cancelled');
  });

  it('preserves ICS VALUE=DATE as an all-day date without manufacturing a UTC time', () => {
    const [event] = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:all-day@example.hu\r
DTSTART;VALUE=DATE:20270910\r
DTEND;VALUE=DATE:20270911\r
SUMMARY:Egész napos közösségi piknik\r
LOCATION:Városliget\r
URL:https://events.example.hu/piknik\r
CATEGORIES:Közösség\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'ics-source', sourceUrl: 'https://events.example.hu/calendar.ics',
      contentType: 'text/calendar', now: NOW,
    }).events;

    expect(event).toMatchObject({
      startAt: '2027-09-10', endAt: '2027-09-11',
      quality: { publishable: true, reasons: [] },
    });
  });

  it('uses X-WR-TIMEZONE for floating ICS dates across winter and summer DST', () => {
    const events = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-TIMEZONE:Europe/Budapest\r
BEGIN:VEVENT\r
UID:winter@example.hu\r
DTSTART:20270115T190000\r
SUMMARY:Téli társasest\r
LOCATION:Klub\r
URL:https://events.example.hu/winter\r
CATEGORIES:Társasjáték\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:summer@example.hu\r
DTSTART:20270715T190000\r
SUMMARY:Nyári társasest\r
LOCATION:Klub\r
URL:https://events.example.hu/summer\r
CATEGORIES:Társasjáték\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'ics-source', sourceUrl: 'https://events.example.hu/calendar.ics',
      contentType: 'text/calendar', now: NOW,
    }).events;

    expect(events.map((event) => event.startAt)).toEqual([
      '2027-01-15T18:00:00.000Z',
      '2027-07-15T17:00:00.000Z',
    ]);
  });

  it('quarantines a floating ICS DTSTART without calendar or audited source timezone', () => {
    const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:floating@example.hu\r
DTSTART:20270910T190000\r
SUMMARY:Lebegő időpontú koncert\r
LOCATION:Klub\r
URL:https://events.example.hu/floating\r
CATEGORIES:Koncert\r
END:VEVENT\r
END:VCALENDAR`;
    const [unresolved] = parseEventDocument(calendar, {
      sourceId: 'ics-source', sourceUrl: 'https://events.example.hu/calendar.ics',
      contentType: 'text/calendar', now: NOW,
    }).events;
    const [resolved] = parseEventDocument(calendar, {
      sourceId: 'ics-source', sourceUrl: 'https://events.example.hu/calendar.ics',
      contentType: 'text/calendar', now: NOW, sourceTimezone: 'Europe/Budapest',
    }).events;

    expect(unresolved.startAt).toBeNull();
    expect(unresolved.quality).toMatchObject({ publishable: false });
    expect(unresolved.quality.reasons).toEqual(expect.arrayContaining(['missing_timezone', 'missing_start']));
    expect(resolved.startAt).toBe('2027-09-10T17:00:00.000Z');
    expect(resolved.quality.publishable).toBe(true);
  });

  it('applies audited source city and category enrichment before the quality gate', () => {
    const [event] = parseEventDocument(`<rss><channel><item>
      <guid>minimal-1</guid><title>Nyitott közösségi program</title>
      <link>https://events.example.hu/minimal-1</link>
      <start_date>2027-09-10T18:00:00+02:00</start_date>
    </item></channel></rss>`, {
      sourceId: 'rss-source', sourceUrl: SOURCE_URL, now: NOW,
      sourceCity: 'Budapest', sourceCategories: ['Sport & Mozgás', 'Futás'],
    }).events;

    expect(event).toMatchObject({
      location: { city: 'Budapest' },
      category: 'sport',
      sourceCategories: ['Sport & Mozgás', 'Futás'],
      quality: { publishable: true, reasons: [] },
    });
    expect(event.tags).toEqual(expect.arrayContaining(['sport', 'futas', 'sport-mozgas']));
  });

  it('parses Event nodes nested in a JSON-LD @graph', () => {
    const [event] = parseEventDocument(JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Budapest Közösség' },
        {
          '@type': 'Event',
          '@id': 'https://events.example.hu/e/music-7',
          name: 'Akusztikus koncert',
          url: 'https://events.example.hu/e/music-7',
          startDate: '2027-05-01T20:00:00+02:00',
          location: {
            '@type': 'Place',
            name: 'Dürer Kert',
            address: { '@type': 'PostalAddress', streetAddress: 'Öböl utca', addressLocality: 'Budapest' },
          },
          keywords: ['zene', 'koncert'],
        },
      ],
    }), {
      sourceId: 'jsonld-source', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
    }).events;

    expect(event).toMatchObject({
      externalId: 'https://events.example.hu/e/music-7',
      category: 'music',
      location: { name: 'Dürer Kert', city: 'Budapest', online: false },
      quality: { publishable: true },
    });
  });

  it('extracts inline JSON-LD Events and discovers RSS/Atom links from HTML', () => {
    const result = parseEventDocument(`<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/programok/feed.xml">
      <script type="application/ld+json">{
        "@context":"https://schema.org","@type":"Event","name":"Kézműves workshop",
        "url":"https://events.example.hu/workshop","startDate":"2027-06-01T16:00:00Z",
        "location":{"@type":"Place","name":"Közösségi műhely"},"keywords":"kézműves, alkotás"
      }</script></head></html>`, {
      sourceId: 'html-source', sourceUrl: 'https://events.example.hu/programok', contentType: 'text/html', now: NOW,
    });

    expect(result.format).toBe('html');
    expect(result.discoveredFeedUrls).toEqual(['https://events.example.hu/programok/feed.xml']);
    expect(result.events[0]).toMatchObject({ category: 'creative', quality: { publishable: true } });
  });

  it('fails closed on XML DTD and ENTITY declarations', () => {
    expect(() => parseEventDocument(`<?xml version="1.0"?>
      <!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
      <rss><channel><item><title>&xxe;</title></item></channel></rss>`, {
      sourceId: 'unsafe', sourceUrl: SOURCE_URL,
    })).toThrowError(expect.objectContaining<EventFeedParseError>({ code: 'unsafe_xml' }));
  });

  it('enforces the parser body cap before format processing', () => {
    expect(() => parseEventDocument('<rss><channel /></rss>', {
      sourceId: 'oversize', sourceUrl: SOURCE_URL, limits: { maxBodyBytes: 8 },
    })).toThrowError(expect.objectContaining<EventFeedParseError>({ code: 'body_too_large' }));
  });
});

describe('robots.txt policy', () => {
  it('uses longest matching rule and lets Allow win an equal-length tie', () => {
    const robots = `User-agent: *
Disallow: /programok/*
Allow: /programok/public$
Disallow: /same
Allow: /same
`;
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/programok/secret').allowed).toBe(false);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/programok/public').allowed).toBe(true);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/same').allowed).toBe(true);
  });

  it('prefers the most specific user-agent group and combines duplicate groups', () => {
    const robots = `User-agent: *
Disallow: /all-bots

User-agent: HobbeastBot
Disallow: /private

User-agent: HobbeastBot
Allow: /private/open$
`;
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/all-bots').allowed).toBe(true);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/private/closed').allowed).toBe(false);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/private/open').allowed).toBe(true);
    expect(evaluateRobotsTxt(robots, 'OtherBot/1.0', '/all-bots').allowed).toBe(false);
  });

  it('requires an exact product-token group and falls back to the wildcard group', () => {
    const robots = `User-agent: Hobbeast
Allow: /private
User-agent: *
Disallow: /private
`;
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/private')).toMatchObject({
      allowed: false,
      matchedUserAgent: '*',
    });
  });

  it('normalizes percent-encoded unreserved and UTF-8 octets before path comparison', () => {
    const robots = `User-agent: *
Disallow: /private
Disallow: /árvíz
Disallow: /download/%2A
`;
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/pri%76ate').allowed).toBe(false);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/%C3%A1rv%C3%ADz').allowed).toBe(false);
    expect(evaluateRobotsTxt(robots, 'HobbeastBot/1.0', '/download/*').allowed).toBe(false);
  });

  it('keeps /robots.txt implicitly allowed', () => {
    expect(evaluateRobotsTxt('User-agent: *\nDisallow: /', 'HobbeastBot/1.0', '/robots.txt').allowed).toBe(true);
  });

  it('fails closed for robots 5xx/429 responses and treats ordinary 4xx as unavailable', () => {
    expect(evaluateRobotsResponse(503, '', 'HobbeastBot/1.0', '/feed')).toMatchObject({
      allowed: false, reason: 'robots_temporary_failure',
    });
    expect(evaluateRobotsResponse(429, '', 'HobbeastBot/1.0', '/feed').allowed).toBe(false);
    expect(evaluateRobotsResponse(404, '', 'HobbeastBot/1.0', '/feed')).toMatchObject({
      allowed: true, reason: 'robots_unavailable',
    });
  });
});

describe('registered feed safe fetch', () => {
  const source: RegisteredFeedSource = {
    sourceId: 'safe-source',
    endpointUrl: 'https://events.example.hu/feed.xml',
    allowedHost: 'events.example.hu',
    etag: '"v1"',
    lastModified: 'Tue, 25 Aug 2026 07:00:00 GMT',
  };
  const registry = new Map([[source.sourceId, source]]);
  const publicResolver = vi.fn(async () => ['93.184.216.34']);

  it('sends validators and handles 304 without reading a body', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.redirect).toBe('manual');
      expect(headers.get('if-none-match')).toBe('"v1"');
      expect(headers.get('if-modified-since')).toBe('Tue, 25 Aug 2026 07:00:00 GMT');
      return new Response(null, { status: 304, headers: { etag: '"v1"' } });
    });

    const result = await safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: publicResolver,
    });

    expect(result).toMatchObject({ status: 'not_modified', body: null, bodyBytes: 0, httpStatus: 304 });
  });

  it('accepts an explicitly allowed empty 204 robots response without a content type', async () => {
    const result = await safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
      resolveHost: publicResolver,
    }, { acceptEmptySuccess: true });

    expect(result).toMatchObject({ status: 'ok', httpStatus: 204, contentType: null, body: '', bodyBytes: 0 });
  });

  it('rejects literal/private hosts and DNS rebinding results', async () => {
    const literal = new Map([['literal', {
      sourceId: 'literal', endpointUrl: 'https://127.0.0.1/feed', allowedHost: '127.0.0.1',
    }]]);
    await expect(safeFetchRegisteredFeed('literal', literal, { resolveHost: publicResolver }))
      .rejects.toMatchObject({ code: 'unsafe_host' });

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      resolveHost: async () => ['10.0.0.8'],
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: 'unsafe_dns_result' });
  });

  it('revalidates every manual redirect and rejects a cross-host target', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example.net/feed' },
    }));

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: publicResolver,
    })).rejects.toMatchObject<Partial<SafeFeedFetchError>>({ code: 'host_mismatch' });
    expect(publicResolver).toHaveBeenCalled();
  });

  it('re-resolves an allowed host after a same-host redirect', async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce(['93.184.216.34'])
      .mockResolvedValueOnce(['10.0.0.12']);
    const pinnedFetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: '/moved.xml' },
    }));

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      pinnedFetchImpl,
      resolveHost: resolver,
    })).rejects.toMatchObject({ code: 'unsafe_dns_result' });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(pinnedFetchImpl).toHaveBeenCalledTimes(1);
    expect(pinnedFetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'events.example.hu' }),
      expect.any(Object),
      '93.184.216.34',
    );
  });

  it('uses the resolver-validated IP in the production transport instead of native fetch DNS', async () => {
    const pinnedFetchImpl = vi.fn(async (_url, init, address) => {
      expect(new Headers(init.headers).get('user-agent')).toBe('HobbeastBot/1.0');
      expect(address).toBe('93.184.216.34');
      return new Response('<rss/>', {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      });
    });

    const result = await safeFetchRegisteredFeed('safe-source', registry, {
      pinnedFetchImpl,
      resolveHost: async () => ['93.184.216.34'],
    });

    expect(result).toMatchObject({ status: 'ok', body: '<rss/>', bodyBytes: 6 });
    expect(pinnedFetchImpl).toHaveBeenCalledTimes(1);
  });

  it('runs caller authorization before following each same-host redirect', async () => {
    const authorizeRequest = vi.fn(async (url: URL) => {
      if (url.pathname === '/private/feed.xml') throw new Error('ROBOTS_DISALLOWED');
    });
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: '/private/feed.xml' },
    }));

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: publicResolver,
      authorizeRequest,
    })).rejects.toThrow('ROBOTS_DISALLOWED');
    expect(authorizeRequest).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops streaming a response as soon as the body cap is exceeded', async () => {
    const fetchImpl = vi.fn(async () => new Response('01234567890', {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' },
    }));

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: publicResolver,
    }, { maxBodyBytes: 10 })).rejects.toMatchObject({ code: 'body_too_large' });
  });
});
