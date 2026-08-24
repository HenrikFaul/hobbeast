import { asIsoDate, cleanXmlText, decodeHtmlEntities } from './text.ts';
import { EVENT_FEED_LIMITS, EventFeedParseError, type EventFeedCandidate } from './types.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function values(value: unknown) {
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

function stringValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isRecord(value)) {
    const nested = value.value ?? value['@value'] ?? value.name ?? value.url ?? value['@id'];
    return typeof nested === 'string' || typeof nested === 'number' ? String(nested) : '';
  }
  return '';
}

function isEventNode(node: JsonRecord) {
  return values(node['@type']).some((type) => {
    const normalized = stringValue(type).toLowerCase().split(/[/#:]/).pop() ?? '';
    return normalized === 'event' || normalized.endsWith('event');
  });
}

function collectEventNodes(root: unknown, maxNodes = 5_000) {
  const events: JsonRecord[] = [];
  const queue: unknown[] = [root];
  let visited = 0;
  while (queue.length && visited < maxNodes && events.length < EVENT_FEED_LIMITS.maxItems) {
    const value = queue.shift();
    visited += 1;
    if (Array.isArray(value)) {
      queue.push(...value.slice(0, maxNodes - visited));
      continue;
    }
    if (!isRecord(value)) continue;
    if (isEventNode(value)) events.push(value);
    if (value['@graph']) queue.push(value['@graph']);
    if (value.itemListElement) queue.push(value.itemListElement);
    if (isRecord(value.item) || Array.isArray(value.item)) queue.push(value.item);
  }
  return events;
}

function postalAddress(value: unknown) {
  if (typeof value === 'string') return { address: value, city: null as string | null };
  if (!isRecord(value)) return { address: null, city: null };
  const city = stringValue(value.addressLocality) || null;
  const parts = [
    stringValue(value.streetAddress),
    stringValue(value.postalCode),
    city,
    stringValue(value.addressRegion),
    stringValue(value.addressCountry),
  ].filter(Boolean);
  return { address: parts.join(', ') || null, city };
}

function parseLocation(rawLocation: unknown, attendanceMode: unknown) {
  let name: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let online = values(attendanceMode).some((mode) => /online/i.test(stringValue(mode)));

  for (const location of values(rawLocation)) {
    if (typeof location === 'string') {
      name ||= location;
      online ||= /\b(?:online|virtual|webinar|zoom|teams)\b/i.test(location);
      continue;
    }
    if (!isRecord(location)) continue;
    const types = values(location['@type']).map((type) => stringValue(type).toLowerCase());
    online ||= types.includes('virtuallocation');
    name ||= stringValue(location.name) || null;
    const parsedAddress = postalAddress(location.address);
    address ||= parsedAddress.address;
    city ||= parsedAddress.city;
    online ||= /\b(?:online|virtual|webinar|zoom|teams)\b/i.test(`${name ?? ''} ${stringValue(location.url)}`);
  }
  return { name, address, city, online };
}

function categoryValues(node: JsonRecord) {
  const raw = [node.keywords, node.genre, node.about]
    .flatMap((entry) => values(entry))
    .flatMap((entry) => stringValue(entry).split(','))
    .map((entry) => cleanXmlText(entry, 160))
    .filter(Boolean);
  return [...new Set(raw)].slice(0, EVENT_FEED_LIMITS.maxTags);
}

function imageValue(raw: unknown) {
  for (const image of values(raw)) {
    const result = stringValue(image);
    if (result) return result;
  }
  return null;
}

function organizerValue(raw: unknown) {
  for (const organizer of values(raw)) {
    const result = stringValue(organizer);
    if (result) return result;
  }
  return null;
}

function eventUrl(node: JsonRecord) {
  const direct = stringValue(node.url);
  if (direct) return direct;
  for (const offer of values(node.offers)) {
    if (!isRecord(offer)) continue;
    const url = stringValue(offer.url);
    if (url) return url;
  }
  return null;
}

function identifierValue(node: JsonRecord) {
  return stringValue(node.identifier) || stringValue(node['@id']) || eventUrl(node);
}

function candidateFromNode(node: JsonRecord): EventFeedCandidate {
  const categories = categoryValues(node);
  const eventStatus = stringValue(node.eventStatus).toLowerCase();
  return {
    format: 'json-ld',
    externalId: identifierValue(node),
    title: stringValue(node.name) || stringValue(node.headline),
    description: stringValue(node.description),
    url: eventUrl(node),
    imageUrl: imageValue(node.image),
    startAt: asIsoDate(stringValue(node.startDate)),
    endAt: asIsoDate(stringValue(node.endDate)),
    publishedAt: asIsoDate(stringValue(node.datePublished) || stringValue(node.dateModified)),
    status: eventStatus.includes('cancelled') || eventStatus.includes('canceled') ? 'cancelled' : 'scheduled',
    organizerName: organizerValue(node.organizer),
    location: parseLocation(node.location, node.eventAttendanceMode),
    sourceCategories: categories,
    classificationText: categories,
  };
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EventFeedParseError('Malformed JSON-LD payload', 'malformed_payload');
  }
}

export function parseJsonLdCandidates(jsonText: string, maxItems = EVENT_FEED_LIMITS.maxItems): EventFeedCandidate[] {
  return collectEventNodes(parseJson(jsonText)).slice(0, maxItems).map(candidateFromNode);
}

export function parseHtmlJsonLdCandidates(html: string, maxItems = EVENT_FEED_LIMITS.maxItems) {
  const candidates: EventFeedCandidate[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;
  while (candidates.length < maxItems && (match = pattern.exec(html)) !== null) {
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1]);
    const scriptType = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').toLowerCase().split(';', 1)[0].trim();
    if (scriptType !== 'application/ld+json') continue;
    const payload = decodeHtmlEntities(match[2]).trim();
    if (!payload) continue;
    try {
      candidates.push(...parseJsonLdCandidates(payload, maxItems - candidates.length));
    } catch (error) {
      if (!(error instanceof EventFeedParseError)) throw error;
      // One broken JSON-LD script must not hide valid Event scripts later on the page.
    }
  }
  return candidates;
}
