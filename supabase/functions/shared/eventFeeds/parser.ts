import { discoverHtmlFeedUrls } from './html.ts';
import { parseIcsCandidates } from './ics.ts';
import { parseHtmlJsonLdCandidates, parseJsonLdDocument } from './jsonLd.ts';
import { normalizeEventCandidate } from './quality.ts';
import {
  EVENT_FEED_LIMITS,
  EventFeedParseError,
  type EventFeedFormat,
  type EventFeedParseContext,
  type EventFeedParseResult,
} from './types.ts';
import { assertSafeXml, parseAtomCandidates, parseRssCandidates } from './xml.ts';

function detectFormat(body: string, contentType: string): EventFeedFormat {
  const normalizedType = contentType.toLowerCase().split(';', 1)[0].trim();
  const leading = body.slice(0, 2_048).trimStart();
  if (normalizedType === 'text/calendar' || normalizedType === 'application/ics' || /^BEGIN:VCALENDAR/i.test(leading)) return 'ics';
  if (normalizedType === 'application/ld+json' || normalizedType === 'application/json' || leading.startsWith('{') || leading.startsWith('[')) return 'json-ld';
  if (normalizedType === 'text/html' || /^(?:<!doctype\s+html|<html\b)/i.test(leading)) return 'html';
  if (normalizedType === 'application/rss+xml' || normalizedType === 'application/rdf+xml') return 'rss';
  if (/<(?:[A-Za-z_][\w.-]*:)?feed\b/i.test(leading)) return 'atom';
  if (/<(?:[A-Za-z_][\w.-]*:)?(?:rss|channel)\b/i.test(leading)) return 'rss';
  throw new EventFeedParseError('Unsupported feed document format', 'unsupported_format');
}

function localXmlName(name: string) {
  return name.split(':').pop()?.toLowerCase() ?? '';
}

const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RSS1_NAMESPACE = 'http://purl.org/rss/1.0/';

function rootNamespaceDeclarations(openingTag: string) {
  const namespaces = new Map<string, string>();
  const pattern = /\sxmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(openingTag)) !== null) {
    namespaces.set((match[1] ?? '').toLowerCase(), match[2] ?? match[3] ?? '');
  }
  return namespaces;
}

function namespaceForXmlName(name: string, namespaces: Map<string, string>) {
  const separator = name.indexOf(':');
  return namespaces.get(separator < 0 ? '' : name.slice(0, separator).toLowerCase()) ?? '';
}

function findXmlTagEnd(xml: string, start: number) {
  let quote = '';
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function analyzeXmlEnvelope(xml: string) {
  const stack: string[] = [];
  let cursor = 0;
  let rootName = '';
  let rootNamespaces = new Map<string, string>();
  let rootClosed = false;
  let rssChannel = false;
  let rdfChannel = false;
  let invalidRdfItemPlacement = false;

  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor);
    const textEnd = open < 0 ? xml.length : open;
    if (stack.length === 0 && xml.slice(cursor, textEnd).trim()) return null;
    if (open < 0) break;

    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open + 4);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      if (stack.length === 0) return null;
      const end = xml.indexOf(']]>', open + 9);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', open)) {
      const end = xml.indexOf('?>', open + 2);
      if (end < 0) return null;
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<!', open)) return null;

    const end = findXmlTagEnd(xml, open + 1);
    if (end < 0) return null;
    const raw = xml.slice(open + 1, end);
    const closing = /^\s*\/([A-Za-z_][\w.:-]*)\s*$/.exec(raw);
    if (closing) {
      if (stack.pop() !== closing[1]) return null;
      if (stack.length === 0) rootClosed = true;
      cursor = end + 1;
      continue;
    }

    const selfClosing = /\/\s*$/.test(raw);
    const content = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    const opening = /^\s*([A-Za-z_][\w.:-]*)(?:\s[\s\S]*)?$/.exec(content);
    if (!opening || (stack.length === 0 && rootClosed)) return null;
    const name = opening[1];
    if (stack.length === 0) {
      if (rootName) return null;
      rootName = name;
      rootNamespaces = rootNamespaceDeclarations(content);
    } else if (stack.length === 1
      && localXmlName(rootName) === 'rss'
      && localXmlName(name) === 'channel') {
      rssChannel = true;
    }
    if (localXmlName(rootName) === 'rdf' && namespaceForXmlName(rootName, rootNamespaces) === RDF_NAMESPACE) {
      const localName = localXmlName(name);
      const namespace = namespaceForXmlName(name, rootNamespaces);
      if (localName === 'channel' && namespace === RSS1_NAMESPACE) {
        if (stack.length !== 1) return null;
        rdfChannel = true;
      }
      if (localName === 'item' && namespace === RSS1_NAMESPACE && stack.length !== 1) {
        invalidRdfItemPlacement = true;
      }
    }
    if (!selfClosing) stack.push(name);
    else if (stack.length === 0) rootClosed = true;
    cursor = end + 1;
  }

  if (!rootName || !rootClosed || stack.length !== 0) return null;
  return {
    rootName: localXmlName(rootName),
    rssChannel,
    rdfRoot: namespaceForXmlName(rootName, rootNamespaces) === RDF_NAMESPACE,
    rdfChannel,
    invalidRdfItemPlacement,
  };
}

function isCompleteIcsCalendar(body: string) {
  const stack: string[] = [];
  let seenCalendar = false;
  let closedCalendar = false;
  for (const rawLine of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const begin = /^BEGIN:([A-Z0-9-]+)$/i.exec(line);
    if (begin) {
      const name = begin[1].toUpperCase();
      if (stack.length === 0) {
        if (seenCalendar || closedCalendar || name !== 'VCALENDAR') return false;
        seenCalendar = true;
      } else if (name === 'VCALENDAR' || (name === 'VEVENT' && stack[0] !== 'VCALENDAR')
        || (name === 'VEVENT' && stack.length !== 1)) {
        return false;
      }
      stack.push(name);
      continue;
    }
    const end = /^END:([A-Z0-9-]+)$/i.exec(line);
    if (end) {
      if (stack.pop() !== end[1].toUpperCase()) return false;
      if (stack.length === 0) closedCalendar = true;
      continue;
    }
    if (stack.length === 0) return false;
  }
  return seenCalendar && closedCalendar && stack.length === 0;
}

function recognizesStructuredCollection(format: EventFeedFormat, body: string) {
  if (format === 'rss' || format === 'atom') {
    const envelope = analyzeXmlEnvelope(body);
    if (!envelope) return false;
    return format === 'rss'
      ? (envelope.rootName === 'rss' && envelope.rssChannel)
        || (envelope.rootName === 'rdf' && envelope.rdfRoot
          && envelope.rdfChannel && !envelope.invalidRdfItemPlacement)
      : envelope.rootName === 'feed';
  }
  if (format === 'ics') return isCompleteIcsCalendar(body);
  return false;
}

export function parseEventDocument(body: string, context: EventFeedParseContext): EventFeedParseResult {
  const limits = {
    maxBodyBytes: Math.max(1, Math.min(context.limits?.maxBodyBytes ?? EVENT_FEED_LIMITS.maxBodyBytes, EVENT_FEED_LIMITS.maxBodyBytes)),
    maxItems: Math.max(1, Math.min(context.limits?.maxItems ?? EVENT_FEED_LIMITS.maxItems, EVENT_FEED_LIMITS.maxItems)),
  };
  const size = new TextEncoder().encode(body).byteLength;
  if (size > limits.maxBodyBytes) {
    throw new EventFeedParseError(`Feed body exceeds ${limits.maxBodyBytes} bytes`, 'body_too_large');
  }

  const format = detectFormat(body, context.contentType ?? '');
  const now = context.now ?? new Date();
  let candidates;
  let discoveredFeedUrls: string[] = [];
  const warnings: string[] = [];
  let recognizedEventContract = false;
  let recognizedCollection = false;

  if (format === 'rss' || format === 'atom') {
    assertSafeXml(body);
    if (!recognizesStructuredCollection(format, body)) {
      throw new EventFeedParseError('Malformed or incomplete XML feed envelope', 'malformed_xml');
    }
  }
  if (format === 'rss') {
    candidates = parseRssCandidates(body, limits.maxItems, context.sourceTimezone ?? null);
    recognizedEventContract = true;
    recognizedCollection = true;
  } else if (format === 'atom') {
    candidates = parseAtomCandidates(body, limits.maxItems, context.sourceTimezone ?? null);
    recognizedEventContract = true;
    recognizedCollection = true;
  } else if (format === 'ics') {
    if (!recognizesStructuredCollection(format, body)) {
      throw new EventFeedParseError('Malformed or incomplete iCalendar component nesting', 'malformed_payload');
    }
    candidates = parseIcsCandidates(body, limits.maxItems, context.sourceTimezone ?? null);
    recognizedEventContract = true;
    recognizedCollection = true;
  } else if (format === 'json-ld') {
    const parsedJsonLd = parseJsonLdDocument(body, limits.maxItems, context.sourceTimezone ?? null);
    candidates = parsedJsonLd.candidates;
    recognizedEventContract = parsedJsonLd.recognizedEventContract;
    recognizedCollection = parsedJsonLd.recognizedCollection;
  } else {
    candidates = parseHtmlJsonLdCandidates(body, limits.maxItems, context.sourceTimezone ?? null);
    discoveredFeedUrls = discoverHtmlFeedUrls(body, context.sourceUrl);
    recognizedEventContract = candidates.length > 0 || discoveredFeedUrls.length > 0;
    if (candidates.length === 0 && discoveredFeedUrls.length === 0) warnings.push('html_without_event_data_or_feed_link');
  }

  return {
    format,
    events: candidates.map((candidate) => normalizeEventCandidate(candidate, {
      sourceId: context.sourceId,
      sourceUrl: context.sourceUrl,
      now,
      sourceCity: context.sourceCity,
      sourceCategories: context.sourceCategories,
    })),
    discoveredFeedUrls,
    warnings,
    recognizedEventContract,
    recognizedCollection,
  };
}
