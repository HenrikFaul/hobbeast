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

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FLOATING_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const OFFSET_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):?(\d{2}))$/i;

function validDateParts(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  if (month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    && candidate.getUTCHours() === hour
    && candidate.getUTCMinutes() === minute
    && candidate.getUTCSeconds() === second;
}

function zonedDateTimeToIso(parts: RegExpMatchArray, timezone: string) {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6] ?? 0);
  const millisecond = Number((parts[7] ?? '').slice(0, 3).padEnd(3, '0'));
  if (!validDateParts(year, month, day, hour, minute, second)) return null;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const displayedAt = (instant: number) => Object.fromEntries(
      formatter.formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const offsetAt = (instant: number) => {
      const displayed = displayedAt(instant);
      return Date.UTC(
        displayed.year,
        displayed.month - 1,
        displayed.day,
        displayed.hour,
        displayed.minute,
        displayed.second,
      ) - instant;
    };
    const offsets = new Set([
      offsetAt(desiredAsUtc - 36 * 60 * 60 * 1_000),
      offsetAt(desiredAsUtc),
      offsetAt(desiredAsUtc + 36 * 60 * 60 * 1_000),
    ]);
    const matches = [...offsets]
      .map((offset) => desiredAsUtc - offset)
      .filter((instant) => {
        const displayed = displayedAt(instant);
        return displayed.year === year && displayed.month === month && displayed.day === day
          && displayed.hour === hour && displayed.minute === minute && displayed.second === second;
      })
      .sort((left, right) => left - right);
    if (matches.length === 0) {
      // A nonexistent wall time (for example during a DST spring-forward gap)
      // must not be silently shifted into a different local event time.
      return null;
    }
    // RFC 5545 selects the first occurrence when a wall time repeats during a
    // fall-back transition. The earliest matching instant also gives stable
    // behavior for RSS/Atom/JSON-LD floating dates.
    return new Date(matches[0] + millisecond).toISOString();
  } catch {
    return null;
  }
}

export function asIsoDate(value: string | null | undefined) {
  const cleaned = cleanXmlText(value, 128);
  if (!cleaned) return null;
  const dateOnly = cleaned.match(DATE_ONLY_PATTERN);
  if (dateOnly) {
    return validDateParts(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])) ? cleaned : null;
  }
  // JavaScript interprets an offset-free ISO date-time in the runtime's local
  // timezone. Feed normalization must never depend on worker host settings.
  if (FLOATING_DATE_TIME_PATTERN.test(cleaned)) return null;
  const offsetDateTime = cleaned.match(OFFSET_DATE_TIME_PATTERN);
  if (offsetDateTime && (!validDateParts(
    Number(offsetDateTime[1]),
    Number(offsetDateTime[2]),
    Number(offsetDateTime[3]),
    Number(offsetDateTime[4]),
    Number(offsetDateTime[5]),
    Number(offsetDateTime[6] ?? 0),
  ) || Number(offsetDateTime[9] ?? 0) > 23 || Number(offsetDateTime[10] ?? 0) > 59)) return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseEventDate(value: string | null | undefined, sourceTimezone: string | null = null) {
  const cleaned = cleanXmlText(value, 128);
  if (!cleaned) return { value: null, unresolvedTimezone: false };
  const floating = cleaned.match(FLOATING_DATE_TIME_PATTERN);
  if (!floating) return { value: asIsoDate(cleaned), unresolvedTimezone: false };
  if (!validDateParts(
    Number(floating[1]),
    Number(floating[2]),
    Number(floating[3]),
    Number(floating[4]),
    Number(floating[5]),
    Number(floating[6] ?? 0),
  )) return { value: null, unresolvedTimezone: false };
  if (!sourceTimezone) return { value: null, unresolvedTimezone: true };
  const parsed = zonedDateTimeToIso(floating, sourceTimezone);
  return { value: parsed, unresolvedTimezone: parsed === null };
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
