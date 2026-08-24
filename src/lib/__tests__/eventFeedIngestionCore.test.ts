import { describe, expect, it, vi } from 'vitest';

import {
  EventFeedParseError,
  PinnedHttpsTransportError,
  SafeFeedFetchError,
  evaluateRobotsResponse,
  evaluateRobotsTxt,
  parseEventDocument,
  pinnedHttpsFetch,
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

  it('parses a closed RSS 1.0 RDF collection with the required namespaces and direct items', () => {
    const result = parseEventDocument(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/" xmlns:evt="https://hobbeast.hu/event">
        <channel rdf:about="https://events.example.hu/feed"><title>Programok</title></channel>
        <item rdf:about="https://events.example.hu/rdf-run">
          <title>Közösségi futás</title><link>https://events.example.hu/rdf-run</link>
          <evt:start_date>2027-09-10T18:00:00+02:00</evt:start_date>
          <evt:location>Városliget</evt:location><category>Futás</category>
        </item>
      </rdf:RDF>`, {
      sourceId: 'rdf-source', sourceUrl: SOURCE_URL, contentType: 'application/rdf+xml', now: NOW,
    });

    expect(result).toMatchObject({ format: 'rss', recognizedCollection: true });
    expect(result.events[0]).toMatchObject({
      title: 'Közösségi futás', startAt: '2027-09-10T16:00:00.000Z',
      category: 'sport', quality: { publishable: true },
    });
  });

  it('rejects truncated, mismatched or wrong-namespace RSS 1.0 RDF envelopes', () => {
    const root = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">';
    for (const body of [
      `${root}<channel></channel><item><title>Truncated</title></rdf:RDF>`,
      `${root}<channel></item></channel></rdf:RDF>`,
      '<rdf:RDF xmlns:rdf="https://wrong.example/rdf" xmlns="http://purl.org/rss/1.0/"><channel/></rdf:RDF>',
    ]) {
      expect(() => parseEventDocument(body, {
        sourceId: 'rdf-malformed', sourceUrl: SOURCE_URL, contentType: 'application/rdf+xml', now: NOW,
      })).toThrowError(expect.objectContaining<EventFeedParseError>({ code: 'malformed_xml' }));
    }
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
    const result = parseEventDocument(JSON.stringify({
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
    });
    const [event] = result.events;

    expect(result.recognizedCollection).toBe(true);
    expect(event).toMatchObject({
      externalId: 'https://events.example.hu/e/music-7',
      category: 'music',
      location: { name: 'Dürer Kert', city: 'Budapest', online: false },
      quality: { publishable: true },
    });
  });

  it('preserves RSS, Atom and JSON-LD date-only starts without manufacturing a local time', () => {
    const rss = parseEventDocument(`<rss><channel><item>
      <guid>rss-all-day</guid><title>Egész napos futónap</title>
      <link>https://events.example.hu/rss-all-day</link><start_date>2027-09-10</start_date>
      <location>Városliget</location><category>Futás</category>
    </item></channel></rss>`, {
      sourceId: 'rss-source', sourceUrl: SOURCE_URL, now: NOW,
    }).events[0];
    const atom = parseEventDocument(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:evt="https://hobbeast.hu/event">
      <entry><id>atom-all-day</id><title>Egész napos társasnap</title>
      <link href="https://events.example.hu/atom-all-day"/><evt:start>2027-09-11</evt:start>
      <evt:venue>Játszóház</evt:venue><category term="Társasjáték"/></entry>
    </feed>`, {
      sourceId: 'atom-source', sourceUrl: SOURCE_URL, now: NOW,
    }).events[0];
    const jsonLd = parseEventDocument(JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Egész napos koncert',
      url: 'https://events.example.hu/json-all-day', startDate: '2027-09-12',
      location: { '@type': 'Place', name: 'Park' }, keywords: 'koncert',
    }), {
      sourceId: 'json-source', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
    }).events[0];

    expect([rss.startAt, atom.startAt, jsonLd.startAt]).toEqual(['2027-09-10', '2027-09-11', '2027-09-12']);
    expect([rss, atom, jsonLd].every((event) => event.quality.publishable)).toBe(true);
  });

  it('quarantines floating JSON-LD times unless an audited source timezone resolves winter and summer DST', () => {
    const document = JSON.stringify([
      {
        '@context': 'https://schema.org', '@type': 'Event', name: 'Téli koncert',
        url: 'https://events.example.hu/winter-floating', startDate: '2027-01-15T19:00:00',
        location: { '@type': 'Place', name: 'Klub' }, keywords: 'koncert',
      },
      {
        '@context': 'https://schema.org', '@type': 'Event', name: 'Nyári koncert',
        url: 'https://events.example.hu/summer-floating', startDate: '2027-07-15T19:00:00',
        location: { '@type': 'Place', name: 'Klub' }, keywords: 'koncert',
      },
    ]);
    const unresolved = parseEventDocument(document, {
      sourceId: 'json-source', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
    }).events;
    const resolved = parseEventDocument(document, {
      sourceId: 'json-source', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
      sourceTimezone: 'Europe/Budapest',
    }).events;

    expect(unresolved.map((event) => event.startAt)).toEqual([null, null]);
    expect(unresolved[0].quality.reasons).toEqual(expect.arrayContaining(['missing_timezone', 'missing_start']));
    expect(resolved.map((event) => event.startAt)).toEqual([
      '2027-01-15T18:00:00.000Z',
      '2027-07-15T17:00:00.000Z',
    ]);
  });

  it('quarantines floating RSS and Atom event times without an audited source timezone', () => {
    const rssBody = `<rss><channel><item><guid>rss-floating</guid><title>Esti futás</title>
      <link>https://events.example.hu/rss-floating</link><start_date>2027-07-15T19:00:00</start_date>
      <location>Városliget</location><category>Futás</category></item></channel></rss>`;
    const atomBody = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:evt="https://hobbeast.hu/event">
      <entry><id>atom-floating</id><title>Esti társas</title>
      <link href="https://events.example.hu/atom-floating"/><evt:start>2027-01-15T19:00:00</evt:start>
      <evt:venue>Klub</evt:venue><category term="Társasjáték"/></entry></feed>`;
    const context = { sourceId: 'floating-source', sourceUrl: SOURCE_URL, now: NOW };

    const unresolved = [
      parseEventDocument(rssBody, context).events[0],
      parseEventDocument(atomBody, context).events[0],
    ];
    const resolved = [
      parseEventDocument(rssBody, { ...context, sourceTimezone: 'Europe/Budapest' }).events[0],
      parseEventDocument(atomBody, { ...context, sourceTimezone: 'Europe/Budapest' }).events[0],
    ];

    expect(unresolved.map((event) => event.startAt)).toEqual([null, null]);
    expect(unresolved.every((event) => event.quality.reasons.includes('missing_timezone'))).toBe(true);
    expect(resolved.map((event) => event.startAt)).toEqual([
      '2027-07-15T17:00:00.000Z',
      '2027-01-15T18:00:00.000Z',
    ]);
  });

  it('only recognizes structured event contracts as complete snapshot evidence', () => {
    const parse = (body: string, contentType: string) => parseEventDocument(body, {
      sourceId: 'snapshot-source', sourceUrl: SOURCE_URL, contentType, now: NOW,
    });

    expect(parse('{"error":"rate limited"}', 'application/json')).toMatchObject({
      format: 'json-ld', events: [], recognizedEventContract: false, recognizedCollection: false,
    });
    expect(parse('[]', 'application/json')).toMatchObject({
      format: 'json-ld', events: [], recognizedEventContract: false, recognizedCollection: false,
    });
    expect(parse('<rss><channel /></rss>', 'application/rss+xml').recognizedCollection).toBe(true);
    expect(parse('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', 'application/atom+xml').recognizedCollection).toBe(true);
    expect(parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR', 'text/calendar').recognizedCollection).toBe(true);
    expect(parse(JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Standalone event',
      startDate: '2027-09-10',
    }), 'application/ld+json')).toMatchObject({
      recognizedEventContract: true, recognizedCollection: false,
    });
    expect(parse(JSON.stringify({
      '@context': 'https://schema.org', '@type': 'EventSeries', subEvent: [],
    }), 'application/ld+json').recognizedCollection).toBe(true);
    expect(parse(JSON.stringify({
      '@context': 'https://schema.org', '@graph': [{ '@type': 'Prevent', name: 'Not an event' }],
    }), 'application/ld+json').recognizedCollection).toBe(false);
    expect(parse(JSON.stringify({
      '@context': 'https://evil.example/vocabulary',
      '@graph': [{ '@type': 'https://evil.example/Event', name: 'Wrong vocabulary' }],
    }), 'application/ld+json').recognizedCollection).toBe(false);
  });

  it('never lets long fractional floating timestamps fall back to the worker host timezone', () => {
    const document = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Pontos időpontú koncert',
      url: 'https://events.example.hu/fractional', startDate: '2027-09-10T19:00:00.1234',
      location: { '@type': 'Place', name: 'Klub' }, keywords: 'koncert',
    });
    const unresolved = parseEventDocument(document, {
      sourceId: 'fractional', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
    }).events[0];
    const resolved = parseEventDocument(document, {
      sourceId: 'fractional', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
      sourceTimezone: 'Europe/Budapest',
    }).events[0];

    expect(unresolved.startAt).toBeNull();
    expect(unresolved.quality.reasons).toContain('missing_timezone');
    expect(resolved.startAt).toBe('2027-09-10T17:00:00.123Z');
  });

  it('rejects invalid explicit ISO and iCalendar calendar dates instead of normalizing them', () => {
    const jsonEvent = parseEventDocument(JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: 'Hibás dátumú koncert',
      url: 'https://events.example.hu/invalid-date', startDate: '2027-02-31T12:00:00Z',
      location: { '@type': 'Place', name: 'Klub' }, keywords: 'koncert',
    }), {
      sourceId: 'invalid-json', sourceUrl: SOURCE_URL, contentType: 'application/ld+json', now: NOW,
    }).events[0];
    const icsEvent = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:invalid-date@example.hu\r
DTSTART;VALUE=DATE:20270231\r
SUMMARY:Hibás naptári nap\r
LOCATION:Klub\r
URL:https://events.example.hu/invalid-ics-date\r
CATEGORIES:Koncert\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'invalid-ics', sourceUrl: SOURCE_URL, contentType: 'text/calendar', now: NOW,
    }).events[0];

    expect(jsonEvent.startAt).toBeNull();
    expect(icsEvent.startAt).toBeNull();
    expect(jsonEvent.quality.reasons).toContain('missing_start');
    expect(icsEvent.quality.reasons).toContain('missing_start');
  });

  it('keeps an all-day event publishable throughout its Budapest calendar day', () => {
    const [event] = parseEventDocument(`<rss><channel><item>
      <guid>today-all-day</guid><title>Mai közösségi futónap</title>
      <link>https://events.example.hu/today-all-day</link><start_date>2027-09-10</start_date>
      <location>Városliget</location><category>Futás</category>
    </item></channel></rss>`, {
      sourceId: 'today-source', sourceUrl: SOURCE_URL,
      now: new Date('2027-09-10T20:00:00Z'),
    }).events;

    expect(event.quality.reasons).not.toContain('not_future');
    expect(event.quality.publishable).toBe(true);
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

  it('rejects malformed XML nesting and truncated structured feeds', () => {
    for (const body of [
      '<rss><channel><item><title>truncated</title></channel></rss>',
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>',
    ]) {
      expect(() => parseEventDocument(body, {
        sourceId: 'malformed', sourceUrl: SOURCE_URL,
      })).toThrowError(expect.objectContaining<EventFeedParseError>({ code: 'malformed_xml' }));
    }
  });

  it('rejects stray, nested and unclosed iCalendar components', () => {
    for (const body of [
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VEVENT\r\nEND:VCALENDAR',
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR',
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR',
    ]) {
      expect(() => parseEventDocument(body, {
        sourceId: 'malformed-ics', sourceUrl: SOURCE_URL, contentType: 'text/calendar',
      })).toThrowError(expect.objectContaining<EventFeedParseError>({ code: 'malformed_payload' }));
    }
  });

  it('rejects a nonexistent floating wall time during the Budapest DST spring gap', () => {
    const [event] = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-TIMEZONE:Europe/Budapest\r
BEGIN:VEVENT\r
UID:dst-gap@example.hu\r
DTSTART:20270328T023000\r
SUMMARY:DST-rés esemény\r
LOCATION:Klub\r
URL:https://events.example.hu/dst-gap\r
CATEGORIES:Koncert\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'ics-source', sourceUrl: SOURCE_URL, contentType: 'text/calendar', now: NOW,
    }).events;

    expect(event.startAt).toBeNull();
    expect(event.quality.reasons).toEqual(expect.arrayContaining(['missing_timezone', 'missing_start']));
  });

  it('selects the first occurrence of an ambiguous ICS wall time during the Budapest DST fall-back', () => {
    const [event] = parseEventDocument(`BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-TIMEZONE:Europe/Budapest\r
BEGIN:VEVENT\r
UID:dst-overlap@example.hu\r
DTSTART:20271031T023000\r
SUMMARY:Őszi közösségi esemény\r
LOCATION:Klub\r
URL:https://events.example.hu/dst-overlap\r
CATEGORIES:Közösség\r
END:VEVENT\r
END:VCALENDAR`, {
      sourceId: 'ics-source', sourceUrl: SOURCE_URL, contentType: 'text/calendar', now: NOW,
    }).events;

    expect(event.startAt).toBe('2027-10-31T00:30:00.000Z');
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
      2 * 1024 * 1024,
    );
  });

  it('removes resource validators before issuing a same-host redirect hop', async () => {
    let request = 0;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      request += 1;
      const headers = new Headers(init?.headers);
      if (request === 1) {
        expect(headers.get('if-none-match')).toBe('"v1"');
        expect(headers.get('if-modified-since')).toBe('Tue, 25 Aug 2026 07:00:00 GMT');
        return new Response(null, { status: 302, headers: { location: '/canonical.xml' } });
      }
      expect(headers.get('if-none-match')).toBeNull();
      expect(headers.get('if-modified-since')).toBeNull();
      return new Response('<rss><channel /></rss>', {
        status: 200, headers: { 'content-type': 'application/rss+xml', etag: '"canonical"' },
      });
    });

    const result = await safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: async () => ['93.184.216.34'],
    });

    expect(result).toMatchObject({ status: 'ok', finalUrl: 'https://events.example.hu/canonical.xml' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an unbound 304 returned after a redirect', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/canonical.xml' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as typeof fetch,
      resolveHost: async () => ['93.184.216.34'],
    })).rejects.toMatchObject({ code: 'http_error' });
  });

  it('uses the resolver-validated IP in the production transport instead of native fetch DNS', async () => {
    const pinnedFetchImpl = vi.fn(async (_url, init, address, maxBodyBytes) => {
      expect(new Headers(init.headers).get('user-agent')).toBe('HobbeastBot/1.0');
      expect(address).toBe('93.184.216.34');
      expect(maxBodyBytes).toBe(2 * 1024 * 1024);
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

  it('propagates a caller abort separately from the per-request timeout', async () => {
    const controller = new AbortController();
    controller.abort('dispatcher deadline');
    const fetchImpl = vi.fn();

    await expect(safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: publicResolver,
    }, { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('abandons a never-settling DNS resolver promptly when the caller aborts', async () => {
    const controller = new AbortController();
    const resolver = vi.fn(() => new Promise<string[]>(() => undefined));
    const fetchImpl = vi.fn();
    const startedAt = Date.now();
    const pending = safeFetchRegisteredFeed('safe-source', registry, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolver,
    }, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    controller.abort('dispatcher deadline');

    await rejected;
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function fakeNativeConnection(response = '', remoteHostname = '93.184.216.34', readSize = 7) {
  const bytes = new TextEncoder().encode(response);
  let offset = 0;
  return {
    remoteAddr: { hostname: remoteHostname, port: 443, transport: 'tcp' },
    read: vi.fn(async (target: Uint8Array) => {
      if (offset >= bytes.byteLength) return null;
      const count = Math.min(target.byteLength, readSize, bytes.byteLength - offset);
      target.set(bytes.subarray(offset, offset + count));
      offset += count;
      return count;
    }),
    write: vi.fn(async (chunk: Uint8Array) => chunk.byteLength),
    close: vi.fn(),
  };
}

async function withFakeDeno<T>(
  runtime: { connect: ReturnType<typeof vi.fn>; startTls: ReturnType<typeof vi.fn> },
  callback: () => Promise<T>,
) {
  const target = globalThis as typeof globalThis & { Deno?: unknown };
  const original = target.Deno;
  target.Deno = runtime;
  try {
    return await callback();
  } finally {
    if (original === undefined) delete target.Deno;
    else target.Deno = original;
  }
}

describe('Deno-native pinned HTTPS transport', () => {
  it('connects to the validated IP while preserving the original TLS hostname and Host header', async () => {
    const tcp = fakeNativeConnection();
    const tls = fakeNativeConnection(
      'HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Length: 6\r\n\r\n<rss/>',
    );
    const runtime = {
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    };

    const response = await withFakeDeno(runtime, () => pinnedHttpsFetch(
      new URL('https://events.example.hu/feed.xml?city=budapest'),
      { method: 'GET', headers: { 'User-Agent': 'HobbeastBot/1.0' } },
      '93.184.216.34',
      32,
    ));

    expect(runtime.connect).toHaveBeenCalledWith({
      hostname: '93.184.216.34', port: 443, transport: 'tcp',
    });
    expect(runtime.startTls).toHaveBeenCalledWith(tcp, {
      hostname: 'events.example.hu', alpnProtocols: ['http/1.1'],
    });
    const request = new TextDecoder().decode(tls.write.mock.calls[0][0]);
    expect(request).toContain('GET /feed.xml?city=budapest HTTP/1.1\r\n');
    expect(request).toContain('host: events.example.hu\r\n');
    expect(request).toContain('accept-encoding: identity\r\n');
    expect(await response.text()).toBe('<rss/>');
    expect(tls.close).toHaveBeenCalledTimes(1);
  });

  it('decodes a chunked body without exceeding the configured cap', async () => {
    const tcp = fakeNativeConnection();
    const tls = fakeNativeConnection(
      'HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nTransfer-Encoding: chunked\r\n\r\n'
        + '4\r\n<rss\r\n2\r\n/>\r\n0\r\nX-Audit: yes\r\n\r\n',
      '93.184.216.34',
      3,
    );

    const response = await withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 6));

    expect(await response.text()).toBe('<rss/>');
    expect(response.headers.has('transfer-encoding')).toBe(false);
  });

  it('rejects excessive one-byte chunk fragmentation at the fixed chunk-count cap', async () => {
    const tcp = fakeNativeConnection();
    const fragmented = Array.from({ length: 4_097 }, () => '1\r\nx\r\n').join('') + '0\r\n\r\n';
    const tls = fakeNativeConnection(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n' + fragmented,
      '93.184.216.34',
      16 * 1024,
    );

    await expect(withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 8 * 1024)))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects cumulative chunk framing over 256 KiB even with a small decoded body', async () => {
    const tcp = fakeNativeConnection();
    const framedChunk = `1;${'a'.repeat(8_000)}\r\nx\r\n`;
    const tls = fakeNativeConnection(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n'
        + framedChunk.repeat(33)
        + '0\r\n\r\n',
      '93.184.216.34',
      16 * 1024,
    );

    await expect(withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 64)))
      .rejects.toMatchObject({ code: 'body_too_large' });
  });

  it('fails closed when the actual TCP peer differs from the validated IP', async () => {
    const tcp = fakeNativeConnection('', '10.0.0.8');
    const startTls = vi.fn();

    await expect(withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls,
    }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 64)))
      .rejects.toMatchObject<Partial<PinnedHttpsTransportError>>({ code: 'remote_address_mismatch' });
    expect(startTls).not.toHaveBeenCalled();
    expect(tcp.close).toHaveBeenCalledTimes(1);
  });

  it('rejects declared and streamed bodies over the cap before unbounded buffering', async () => {
    const run = (response: string) => {
      const tcp = fakeNativeConnection();
      const tls = fakeNativeConnection(response);
      return withFakeDeno({
        connect: vi.fn(async () => tcp),
        startTls: vi.fn(async () => tls),
      }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 5));
    };

    await expect(run('HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\n123456'))
      .rejects.toMatchObject({ code: 'body_too_large' });
    await expect(run('HTTP/1.1 200 OK\r\n\r\n123456'))
      .rejects.toMatchObject({ code: 'body_too_large' });
  });

  it('rejects response headers over the fixed metadata cap', async () => {
    const tcp = fakeNativeConnection();
    const tls = fakeNativeConnection(
      'HTTP/1.1 200 OK\r\nX-Oversized: ' + 'a'.repeat(70 * 1024) + '\r\n\r\n',
      '93.184.216.34',
      16 * 1024,
    );

    await expect(withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    }, () => pinnedHttpsFetch(new URL(SOURCE_URL), { method: 'GET' }, '93.184.216.34', 64)))
      .rejects.toMatchObject({ code: 'headers_too_large' });
  });

  it('closes an active pinned TLS connection when the caller aborts', async () => {
    const tcp = fakeNativeConnection();
    let rejectRead: ((error: Error) => void) | null = null;
    const tls = {
      ...fakeNativeConnection(),
      read: vi.fn(() => new Promise<number | null>((_resolve, reject) => {
        rejectRead = reject;
      })),
      close: vi.fn(() => rejectRead?.(new Error('connection closed'))),
    };
    const controller = new AbortController();

    const pending = withFakeDeno({
      connect: vi.fn(async () => tcp),
      startTls: vi.fn(async () => tls),
    }, () => pinnedHttpsFetch(
      new URL(SOURCE_URL),
      { method: 'GET', signal: controller.signal },
      '93.184.216.34',
      64,
    ));
    const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
    await vi.waitFor(() => expect(tls.read).toHaveBeenCalled());
    controller.abort();

    await rejected;
    expect(tls.close).toHaveBeenCalled();
  });
});
