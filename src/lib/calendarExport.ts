/**
 * Calendar export — the single strongest driver of actual attendance: a program
 * that lands in the member's own calendar is a program they show up to.
 * Mirrors what Luma, Eventbrite and Dice offer on every event page.
 *
 * No dependency: we emit RFC 5545 iCalendar text ourselves and also build a
 * Google Calendar template URL for members who live in Google Calendar.
 */

export interface CalendarEventInput {
  id: string;
  title: string;
  /** ISO date, e.g. "2026-09-14". */
  eventDate: string;
  /** Optional "HH:MM" or "HH:MM:SS". */
  eventTime?: string | null;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** Defaults to 2 hours when the source gives no end time. */
  durationMinutes?: number;
}

const DEFAULT_DURATION_MINUTES = 120;

/** RFC 5545 escaping: backslash, semicolon, comma and newline are special. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Long lines must be folded at 75 octets; a leading space continues the line. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

function parseStart(input: CalendarEventInput): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) return null;
  const time = input.eventTime && /^\d{2}:\d{2}/.test(input.eventTime)
    ? input.eventTime.slice(0, 5)
    : '00:00';
  // Hungarian programs are published in local time; the browser's zone is the
  // closest correct interpretation for a personal calendar entry.
  const date = new Date(`${input.eventDate}T${time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export function buildIcsContent(input: CalendarEventInput): string | null {
  const start = parseStart(input);
  if (!start) return null;
  const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hobbeast//Program//HU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.id}@expericentre.com`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.url) lines.push(`URL:${escapeText(input.url)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}

export function buildGoogleCalendarUrl(input: CalendarEventInput): string | null {
  const start = parseStart(input);
  if (!start) return null;
  const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
  });
  if (input.description) params.set('details', input.description.slice(0, 900));
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Trigger a download of the .ics file in the browser. */
export function downloadIcs(input: CalendarEventInput): boolean {
  const content = buildIcsContent(input);
  if (!content || typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${input.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'program'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
