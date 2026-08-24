import { discoverHtmlFeedUrls } from './html.ts';
import { parseIcsCandidates } from './ics.ts';
import { parseHtmlJsonLdCandidates, parseJsonLdCandidates } from './jsonLd.ts';
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
  if (/<(?:[A-Za-z_][\w.-]*:)?feed\b/i.test(leading)) return 'atom';
  if (/<(?:[A-Za-z_][\w.-]*:)?(?:rss|channel)\b/i.test(leading)) return 'rss';
  throw new EventFeedParseError('Unsupported feed document format', 'unsupported_format');
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

  if (format === 'rss' || format === 'atom') assertSafeXml(body);
  if (format === 'rss') candidates = parseRssCandidates(body, limits.maxItems);
  else if (format === 'atom') candidates = parseAtomCandidates(body, limits.maxItems);
  else if (format === 'ics') candidates = parseIcsCandidates(body, limits.maxItems);
  else if (format === 'json-ld') candidates = parseJsonLdCandidates(body, limits.maxItems);
  else {
    candidates = parseHtmlJsonLdCandidates(body, limits.maxItems);
    discoveredFeedUrls = discoverHtmlFeedUrls(body, context.sourceUrl);
    if (candidates.length === 0 && discoveredFeedUrls.length === 0) warnings.push('html_without_event_data_or_feed_link');
  }

  return {
    format,
    events: candidates.map((candidate) => normalizeEventCandidate(candidate, {
      sourceId: context.sourceId,
      sourceUrl: context.sourceUrl,
      now,
    })),
    discoveredFeedUrls,
    warnings,
  };
}
