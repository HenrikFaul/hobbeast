import { EVENT_FEED_LIMITS } from './types.ts';

const HTML_ENTITY_PATTERN = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi;

export function decodeHtmlEntities(value: string) {
  return value.replace(HTML_ENTITY_PATTERN, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'nbsp') return ' ';

    const radix = normalized.startsWith('#x') ? 16 : 10;
    const numberText = normalized.slice(radix === 16 ? 2 : 1);
    const codePoint = Number.parseInt(numberText, radix);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '';
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return '';
    }
  });
}

export function stripHtml(value: string) {
  const withoutExecutableMarkup = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const decoded = decodeHtmlEntities(withoutExecutableMarkup.replace(/<[^>]*>/g, ' '));
  const withoutControls = Array.from(decoded, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 ? '' : character;
  }).join('');

  return withoutControls
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanXmlText(value: string | null | undefined, maxChars = EVENT_FEED_LIMITS.maxFieldChars) {
  if (!value) return '';
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return truncate(stripHtml(withoutCdata), maxChars);
}

export function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu-HU')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stableId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `generated-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function asIsoDate(value: string | null | undefined) {
  const cleaned = cleanXmlText(value, 128);
  if (!cleaned) return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeUrl(value: string | null | undefined, baseUrl: string) {
  const cleaned = cleanXmlText(value, EVENT_FEED_LIMITS.maxFieldChars);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
