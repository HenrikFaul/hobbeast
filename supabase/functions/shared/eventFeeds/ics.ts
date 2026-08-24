import { cleanXmlText } from './text.ts';
import { EVENT_FEED_LIMITS, EventFeedParseError, type EventFeedCandidate } from './types.ts';

interface IcsProperty {
  name: string;
  params: Map<string, string>;
  value: string;
}

function unfoldLines(input: string) {
  return input.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function findValueSeparator(line: string) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ':' && !quoted) return index;
  }
  return -1;
}

function parseProperty(line: string): IcsProperty | null {
  const separator = findValueSeparator(line);
  if (separator <= 0) return null;
  const head = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawName, ...rawParams] = head.split(';');
  const name = rawName.trim().toUpperCase();
  if (!name) return null;
  const params = new Map<string, string>();
  for (const rawParam of rawParams) {
    const equals = rawParam.indexOf('=');
    if (equals <= 0) continue;
    const key = rawParam.slice(0, equals).trim().toUpperCase();
    const paramValue = rawParam.slice(equals + 1).trim().replace(/^"|"$/g, '');
    if (key) params.set(key, paramValue);
  }
  return { name, params, value };
}

function unescapeIcsText(value: string) {
  return value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function isoFromParts(parts: RegExpMatchArray, timezone: string | null) {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4] ?? 0);
  const minute = Number(parts[5] ?? 0);
  const second = Number(parts[6] ?? 0);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  if (!timezone) return new Date(utcGuess).toISOString();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    const zonedParts = Object.fromEntries(
      formatter.formatToParts(new Date(utcGuess))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const displayedAsUtc = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    );
    let result = utcGuess - (displayedAsUtc - utcGuess);

    // Re-evaluate once at the candidate instant so DST transitions do not use
    // the offset at the initial UTC guess.
    const correctedParts = Object.fromEntries(
      formatter.formatToParts(new Date(result))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const correctedAsUtc = Date.UTC(
      correctedParts.year,
      correctedParts.month - 1,
      correctedParts.day,
      correctedParts.hour,
      correctedParts.minute,
      correctedParts.second,
    );
    result -= correctedAsUtc - utcGuess;
    return new Date(result).toISOString();
  } catch {
    return null;
  }
}

interface ParsedIcsDate {
  value: string | null;
  unresolvedTimezone: boolean;
}

function parseIcsDate(property: IcsProperty | null, defaultTimezone: string | null): ParsedIcsDate {
  if (!property) return { value: null, unresolvedTimezone: false };
  const value = property.value.trim();
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    // Preserve all-day values as calendar dates. Converting them to midnight
    // UTC would manufacture a local event time (and can shift the date).
    return { value: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, unresolvedTimezone: false };
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i);
  if (!dateTime) return { value: null, unresolvedTimezone: false };
  if (dateTime[7]) return { value: isoFromParts(dateTime, null), unresolvedTimezone: false };

  const timezone = property.params.get('TZID') || defaultTimezone;
  if (!timezone) return { value: null, unresolvedTimezone: true };
  const parsed = isoFromParts(dateTime, timezone);
  return { value: parsed, unresolvedTimezone: parsed === null };
}

function first(properties: IcsProperty[], name: string) {
  return properties.find((property) => property.name === name) ?? null;
}

function textValue(properties: IcsProperty[], name: string) {
  return cleanXmlText(unescapeIcsText(first(properties, name)?.value ?? ''), EVENT_FEED_LIMITS.maxDescriptionChars);
}

function parseCategories(properties: IcsProperty[]) {
  return properties
    .filter((property) => property.name === 'CATEGORIES')
    .flatMap((property) => property.value.split(/(?<!\\),/))
    .map((value) => cleanXmlText(unescapeIcsText(value), 160))
    .filter(Boolean)
    .slice(0, EVENT_FEED_LIMITS.maxTags);
}

function organizerName(properties: IcsProperty[]) {
  const organizer = first(properties, 'ORGANIZER');
  if (!organizer) return null;
  const commonName = organizer.params.get('CN');
  if (commonName) return cleanXmlText(unescapeIcsText(commonName), 256);
  return cleanXmlText(organizer.value.replace(/^mailto:/i, ''), 256) || null;
}

function candidateFromProperties(
  properties: IcsProperty[],
  calendarCancelled: boolean,
  defaultTimezone: string | null,
): EventFeedCandidate {
  const uid = textValue(properties, 'UID');
  const recurrenceProperty = first(properties, 'RECURRENCE-ID');
  const recurrenceId = parseIcsDate(recurrenceProperty, defaultTimezone).value
    || cleanXmlText(recurrenceProperty?.value, 256)
    || null;
  const start = parseIcsDate(first(properties, 'DTSTART'), defaultTimezone);
  const location = textValue(properties, 'LOCATION');
  const url = textValue(properties, 'URL');
  const categories = parseCategories(properties);
  const status = textValue(properties, 'STATUS').toUpperCase();
  const online = /\b(?:online|virtual|webinar|zoom|teams)\b/i.test(`${location} ${url}`);

  return {
    format: 'ics',
    externalId: uid ? (recurrenceId ? `${uid}::${recurrenceId}` : uid) : null,
    recurrenceId,
    title: textValue(properties, 'SUMMARY'),
    description: textValue(properties, 'DESCRIPTION'),
    url,
    imageUrl: textValue(properties, 'IMAGE') || null,
    startAt: start.value,
    endAt: parseIcsDate(first(properties, 'DTEND'), defaultTimezone).value,
    publishedAt: parseIcsDate(first(properties, 'LAST-MODIFIED'), defaultTimezone).value
      || parseIcsDate(first(properties, 'DTSTAMP'), defaultTimezone).value,
    status: calendarCancelled || status === 'CANCELLED' ? 'cancelled' : 'scheduled',
    organizerName: organizerName(properties),
    location: { name: location || null, address: null, city: null, online },
    sourceCategories: categories,
    classificationText: categories,
    qualityBlockers: start.unresolvedTimezone ? ['missing_timezone'] : [],
  };
}

export function parseIcsCandidates(
  input: string,
  maxItems = EVENT_FEED_LIMITS.maxItems,
  sourceTimezone: string | null = null,
): EventFeedCandidate[] {
  if (!/BEGIN:VCALENDAR/i.test(input)) {
    throw new EventFeedParseError('Payload is not an iCalendar document', 'malformed_payload');
  }

  const lines = unfoldLines(input);
  const calendarCancelled = lines.some((line) => /^METHOD:CANCEL\s*$/i.test(line));
  const calendarTimezone = lines
    .map(parseProperty)
    .find((property) => property?.name === 'X-WR-TIMEZONE');
  const defaultTimezone = cleanXmlText(calendarTimezone?.value, 128) || sourceTimezone;
  const events: EventFeedCandidate[] = [];
  let current: IcsProperty[] | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) {
      current = [];
      continue;
    }
    if (/^END:VEVENT\s*$/i.test(line)) {
      if (current && events.length < maxItems) {
        events.push(candidateFromProperties(current, calendarCancelled, defaultTimezone));
      }
      current = null;
      if (events.length >= maxItems) break;
      continue;
    }
    if (current) {
      const property = parseProperty(line);
      if (property) current.push(property);
    }
  }

  if (current) throw new EventFeedParseError('Unclosed VEVENT component', 'malformed_payload');
  return events;
}
