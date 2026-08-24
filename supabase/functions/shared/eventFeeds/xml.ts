import { asIsoDate, cleanXmlText, decodeHtmlEntities, escapeRegExp, parseEventDate } from './text.ts';
import { EVENT_FEED_LIMITS, EventFeedParseError, type EventFeedCandidate } from './types.ts';

const UNSAFE_XML_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

function localTagPattern(localName: string) {
  const escaped = escapeRegExp(localName);
  return `(?:[A-Za-z_][\\w.-]*:)?${escaped}`;
}

export function assertSafeXml(xml: string) {
  if (UNSAFE_XML_PATTERN.test(xml)) {
    throw new EventFeedParseError('XML payload contains a forbidden DTD or entity declaration', 'unsafe_xml');
  }
}

function elementBodies(xml: string, localName: string, limit = EVENT_FEED_LIMITS.maxItems) {
  const tag = localTagPattern(localName);
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  const bodies: string[] = [];
  let match: RegExpExecArray | null;
  while (bodies.length < limit && (match = pattern.exec(xml)) !== null) bodies.push(match[1]);
  return bodies;
}

function firstElementBody(xml: string, localNames: string[]) {
  for (const localName of localNames) {
    const body = elementBodies(xml, localName, 1)[0];
    if (body !== undefined) return body;
  }
  return null;
}

function firstText(xml: string, localNames: string[], maxChars = EVENT_FEED_LIMITS.maxFieldChars) {
  return cleanXmlText(firstElementBody(xml, localNames), maxChars);
}

function allText(xml: string, localNames: string[], maxItems = EVENT_FEED_LIMITS.maxTags) {
  const values: string[] = [];
  for (const localName of localNames) {
    for (const body of elementBodies(xml, localName, maxItems)) {
      const text = cleanXmlText(body, 160);
      if (text) values.push(text);
      if (values.length >= maxItems) return [...new Set(values)];
    }
  }
  return [...new Set(values)];
}

function readAttributes(raw: string) {
  const attributes = new Map<string, string>();
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attributes.set(match[1].toLowerCase(), decodeHtmlEntities(match[2] ?? match[3] ?? ''));
  }
  return attributes;
}

function elementsWithAttributes(xml: string, localName: string, limit = 20) {
  const tag = localTagPattern(localName);
  const pattern = new RegExp(`<${tag}\\b([^>]*)\\/?\\s*>`, 'gi');
  const results: Map<string, string>[] = [];
  let match: RegExpExecArray | null;
  while (results.length < limit && (match = pattern.exec(xml)) !== null) results.push(readAttributes(match[1]));
  return results;
}

function rssLink(item: string) {
  return firstText(item, ['link'], EVENT_FEED_LIMITS.maxFieldChars)
    || elementsWithAttributes(item, 'link', 1)[0]?.get('href')
    || null;
}

function atomLink(entry: string) {
  const links = elementsWithAttributes(entry, 'link');
  const preferred = links.find((attributes) => {
    const relation = attributes.get('rel')?.toLowerCase();
    return !relation || relation === 'alternate';
  });
  return preferred?.get('href') ?? links[0]?.get('href') ?? null;
}

function imageUrl(xml: string) {
  const media = elementsWithAttributes(xml, 'content')
    .find((attributes) => attributes.has('url') && (attributes.get('medium') === 'image' || attributes.get('type')?.startsWith('image/')));
  if (media?.get('url')) return media.get('url') ?? null;
  const enclosure = elementsWithAttributes(xml, 'enclosure')
    .find((attributes) => attributes.get('type')?.startsWith('image/'));
  return enclosure?.get('url') ?? firstText(xml, ['image'], EVENT_FEED_LIMITS.maxFieldChars) ?? null;
}

const START_FIELDS = [
  'start', 'startdate', 'start_date', 'eventstart', 'event_start', 'eventdate', 'event_date',
  'next_event_at', 'dtstart', 'starttime', 'start_time',
];
const END_FIELDS = ['end', 'enddate', 'end_date', 'eventend', 'event_end', 'dtend', 'endtime', 'end_time'];

function explicitEventDate(xml: string, fields: string[], sourceTimezone: string | null) {
  return parseEventDate(firstText(xml, fields, 128), sourceTimezone);
}

function locationFromXml(xml: string) {
  const name = firstText(xml, ['location', 'venue', 'place'], 256) || null;
  const address = firstText(xml, ['address', 'street_address'], 512) || null;
  const city = firstText(xml, ['city', 'locality'], 160) || null;
  const attendance = firstText(xml, ['event_attendance_mode', 'attendance_mode', 'location_type'], 160);
  const searchable = `${name ?? ''} ${address ?? ''} ${attendance}`.toLowerCase();
  const online = /\b(?:online|virtual|webinar|zoom|teams)\b/.test(searchable);
  return { name, address, city, online };
}

function statusFromXml(xml: string) {
  const status = firstText(xml, ['event_status', 'status'], 160).toLowerCase();
  return status.includes('cancel') || status.includes('torolve') ? 'cancelled' as const : 'scheduled' as const;
}

export function parseRssCandidates(
  xml: string,
  maxItems = EVENT_FEED_LIMITS.maxItems,
  sourceTimezone: string | null = null,
): EventFeedCandidate[] {
  assertSafeXml(xml);
  return elementBodies(xml, 'item', maxItems).map((item) => {
    const authorBody = firstElementBody(item, ['author']);
    const categories = allText(item, ['category', 'keywords']);
    const publishedAt = asIsoDate(firstText(item, ['pubDate', 'published', 'updated'], 128));
    const externalId = firstText(item, ['guid', 'id'], 512) || rssLink(item);
    const start = explicitEventDate(item, START_FIELDS, sourceTimezone);
    const end = explicitEventDate(item, END_FIELDS, sourceTimezone);

    return {
      format: 'rss',
      externalId,
      title: firstText(item, ['title'], EVENT_FEED_LIMITS.maxTitleChars),
      description: firstText(item, ['description', 'summary', 'content'], EVENT_FEED_LIMITS.maxDescriptionChars),
      url: rssLink(item),
      imageUrl: imageUrl(item),
      startAt: start.value,
      endAt: end.value,
      // pubDate is publication metadata. It is deliberately never promoted to startAt.
      publishedAt,
      status: statusFromXml(item),
      organizerName: authorBody ? firstText(authorBody, ['name'], 256) || cleanXmlText(authorBody, 256) : firstText(item, ['author', 'creator'], 256),
      location: locationFromXml(item),
      sourceCategories: categories,
      classificationText: categories,
      qualityBlockers: start.unresolvedTimezone ? ['missing_timezone'] : [],
    };
  });
}

export function parseAtomCandidates(
  xml: string,
  maxItems = EVENT_FEED_LIMITS.maxItems,
  sourceTimezone: string | null = null,
): EventFeedCandidate[] {
  assertSafeXml(xml);
  return elementBodies(xml, 'entry', maxItems).map((entry) => {
    const authorBody = firstElementBody(entry, ['author']);
    const categories = elementsWithAttributes(entry, 'category')
      .map((attributes) => attributes.get('term') ?? attributes.get('label') ?? '')
      .filter(Boolean)
      .slice(0, EVENT_FEED_LIMITS.maxTags);
    const start = explicitEventDate(entry, START_FIELDS, sourceTimezone);
    const end = explicitEventDate(entry, END_FIELDS, sourceTimezone);

    return {
      format: 'atom',
      externalId: firstText(entry, ['id'], 512) || atomLink(entry),
      title: firstText(entry, ['title'], EVENT_FEED_LIMITS.maxTitleChars),
      description: firstText(entry, ['summary', 'content'], EVENT_FEED_LIMITS.maxDescriptionChars),
      url: atomLink(entry),
      imageUrl: imageUrl(entry),
      startAt: start.value,
      endAt: end.value,
      // Atom published/updated are entry lifecycle timestamps, not event start times.
      publishedAt: asIsoDate(firstText(entry, ['published', 'updated'], 128)),
      status: statusFromXml(entry),
      organizerName: authorBody ? firstText(authorBody, ['name'], 256) : null,
      location: locationFromXml(entry),
      sourceCategories: categories,
      classificationText: categories,
      qualityBlockers: start.unresolvedTimezone ? ['missing_timezone'] : [],
    };
  });
}
