import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl, buildIcsContent } from '@/lib/calendarExport';

const base = {
  id: 'ext-123',
  title: 'Kőleves Open Mic',
  eventDate: '2026-09-14',
  eventTime: '19:30',
  location: 'Budapest, Kőleves Kert',
  url: 'https://example.hu/program/1',
};

describe('calendar export', () => {
  it('emits a valid VEVENT with CRLF line endings', () => {
    const ics = buildIcsContent(base)!;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('UID:ext-123@expericentre.com');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
  });

  it('escapes characters that would corrupt the file', () => {
    const ics = buildIcsContent({
      ...base,
      title: 'Jazz, blues; és más',
      description: 'Első sor\nMásodik sor',
    })!;
    expect(ics).toContain('SUMMARY:Jazz\\, blues\\; és más');
    expect(ics).toContain('DESCRIPTION:Első sor\\nMásodik sor');
  });

  it('folds lines longer than 75 characters', () => {
    const ics = buildIcsContent({ ...base, title: 'A'.repeat(200) })!;
    const tooLong = ics.split('\r\n').filter((line) => line.length > 75);
    expect(tooLong).toEqual([]);
  });

  it('defaults to a two-hour block and honours an explicit duration', () => {
    const read = (ics: string, key: string) => ics.match(new RegExp(`${key}:(\\d{8}T\\d{6})Z`))![1];
    const toDate = (stamp: string) => new Date(
      `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
    );
    const twoHours = buildIcsContent(base)!;
    const spanDefault = toDate(read(twoHours, 'DTEND')).getTime() - toDate(read(twoHours, 'DTSTART')).getTime();
    expect(spanDefault).toBe(120 * 60_000);

    const custom = buildIcsContent({ ...base, durationMinutes: 45 })!;
    const spanCustom = toDate(read(custom, 'DTEND')).getTime() - toDate(read(custom, 'DTSTART')).getTime();
    expect(spanCustom).toBe(45 * 60_000);
  });

  it('handles an all-day program with no start time', () => {
    const ics = buildIcsContent({ ...base, eventTime: null })!;
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('refuses to build from an unusable date', () => {
    expect(buildIcsContent({ ...base, eventDate: 'hamarosan' })).toBeNull();
    expect(buildGoogleCalendarUrl({ ...base, eventDate: '' })).toBeNull();
  });

  it('builds a Google Calendar template link', () => {
    const url = buildGoogleCalendarUrl(base)!;
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(url).toContain('action=TEMPLATE');
    // URLSearchParams encodes spaces as '+', which Google Calendar reads correctly.
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain('Kőleves Open Mic');
    expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  });
});
