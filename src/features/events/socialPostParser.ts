/**
 * Turning a social-media post into a programme.
 *
 * A Facebook page post cannot be collected automatically: logged out, the page
 * does not serve the post at all, and fetching it with a member's own account
 * is against the platform's terms and risks that account. The source wizard
 * says so and refuses the URL.
 *
 * What a person CAN lawfully do is read the post they were shown and paste it
 * here. This reads that text the way the collector reads a page: it finds the
 * date, the time, the venue, the price and the link, and hands back a draft
 * for a human to check. Nothing is published from it without that check.
 *
 * The formats below are taken from real posts, not invented:
 *   📅 Időpont: 2026.08.30. 18:00–20:30
 *   🗓 Időpont: 2026. szeptember 4., 19:00
 *   Szeptember 16-án … 19:00
 *   2026. szeptember 1-6.
 *   Péntekenként 15:00–17:30
 *   📍 Helyszín: Chill Island Club
 *   💰 A részvétel ingyenes, de regisztrációhoz kötött.
 *   Részvételi díj: 25000Ft/hó
 */

const HU_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, marcius: 3, aprilis: 4, majus: 5, junius: 6,
  julius: 7, augusztus: 8, szeptember: 9, oktober: 10, november: 11, december: 12,
};

const WEEKDAY_RECURRENCE = /(hetfonk|keddenk|szerdank|csutortokonk|pentekenk|szombatonk|vasarnaponk|minden\s+(hetfo|kedd|szerda|csutortok|pentek|szombat|vasarnap))/;

export function foldHu(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function monthOf(word: string): number | null {
  const folded = foldHu(word);
  for (const [key, num] of Object.entries(HU_MONTHS)) {
    if (folded.startsWith(key.slice(0, 3)) && key.startsWith(folded.slice(0, 3))) return num;
  }
  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A day with no year means the next time that day comes round. */
function resolveYear(month: number, day: number, today: Date): number {
  const year = today.getFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const cutoff = today.getTime() - 32 * 86400000;
  return candidate.getTime() < cutoff ? year + 1 : year;
}

export interface SocialPostDraft {
  title: string | null;
  eventDate: string | null;
  /** Set when the post gives a range: "szeptember 1-6." or "08.30–08.31". */
  endDate: string | null;
  eventTime: string | null;
  endTime: string | null;
  venue: string | null;
  city: string | null;
  address: string | null;
  isFree: boolean | null;
  priceText: string | null;
  registrationRequired: boolean;
  url: string | null;
  phone: string | null;
  /** "Péntekenként 15:00" — a club, not a one-off programme. */
  recurring: boolean;
  description: string;
  /** What the reader still has to supply or check, in plain Hungarian. */
  warnings: string[];
}

/** Emoji and list bullets carry no meaning once the fields are extracted. */
function cleanLine(line: string): string {
  return line
    .replace(/\p{Extended_Pictographic}|️|[←-⇿⬀-⯿]/gu, ' ')
    .replace(/^[\s•·▪◆–—>*-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDates(text: string, today: Date): { start: string | null; end: string | null } {
  const folded = foldHu(text);

  // 2026.08.30. or 2026-08-30, optionally a second one for the range.
  const numeric = [...folded.matchAll(/(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/g)]
    .map((match) => iso(Number(match[1]), Number(match[2]), Number(match[3])))
    .filter((value): value is string => Boolean(value));
  if (numeric.length) {
    return { start: numeric[0], end: numeric[1] && numeric[1] !== numeric[0] ? numeric[1] : null };
  }

  // "2026. szeptember 1-6." — a range written with one month.
  const spanWithYear = folded.match(/(20\d{2})\.?\s*([a-z]{3,10})\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/);
  if (spanWithYear) {
    const month = monthOf(spanWithYear[2]);
    if (month) {
      return {
        start: iso(Number(spanWithYear[1]), month, Number(spanWithYear[3])),
        end: iso(Number(spanWithYear[1]), month, Number(spanWithYear[4])),
      };
    }
  }

  // "2026. szeptember 4." with an explicit year.
  const withYear = folded.match(/(20\d{2})\.?\s*([a-z]{3,10})\.?\s*(\d{1,2})\b/);
  if (withYear) {
    const month = monthOf(withYear[2]);
    if (month) return { start: iso(Number(withYear[1]), month, Number(withYear[3])), end: null };
  }

  // "Szeptember 16-án" / "szeptember 11–13." with no year.
  const span = folded.match(/\b([a-z]{3,10})\.?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/);
  if (span) {
    const month = monthOf(span[1]);
    if (month) {
      const year = resolveYear(month, Number(span[2]), today);
      return { start: iso(year, month, Number(span[2])), end: iso(year, month, Number(span[3])) };
    }
  }
  const single = folded.match(/\b([a-z]{3,10})\.?\s*(\d{1,2})(?:-?[aeá]n|-?[eé]n|\.)?\b/);
  if (single) {
    const month = monthOf(single[1]);
    if (month) {
      const day = Number(single[2]);
      return { start: iso(resolveYear(month, day, today), month, day), end: null };
    }
  }
  return { start: null, end: null };
}

function findTimes(text: string): { start: string | null; end: string | null } {
  // "2026.08.30. 18:00" — the date's own 08.30 reads perfectly well as half
  // past eight, so the dates are blanked out before the clock is looked for.
  // Found by a real post; the previous version returned 08:30 for that line.
  const withoutDates = text
    .replace(/20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ');
  const times = [...withoutDates.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)]
    .map((match) => `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`);
  if (!times.length) return { start: null, end: null };
  return { start: times[0], end: times[1] && times[1] !== times[0] ? times[1] : null };
}

const LABELLED = [
  { key: 'venue', pattern: /(?:^|\n)[^\n]*?helysz[ií]n\s*[:：]\s*([^\n]+)/i },
  { key: 'price', pattern: /(?:^|\n)[^\n]*?(?:r[eé]szv[eé]teli\s+d[ií]j|bel[eé]p[oő]|[aá]r)\s*[:：]\s*([^\n]+)/i },
] as const;

function labelled(text: string, key: 'venue' | 'price'): string | null {
  const rule = LABELLED.find((entry) => entry.key === key);
  const match = rule ? text.match(rule.pattern) : null;
  return match ? cleanLine(match[1]) || null : null;
}

/** The first line that reads like a name rather than a sentence. */
function findTitle(lines: string[]): string | null {
  for (const line of lines) {
    const clean = cleanLine(line);
    if (clean.length < 6 || clean.length > 110) continue;
    if (/[:：]\s*$/.test(clean)) continue;
    // A question or a full sentence is marketing copy, not the name.
    if (/[?!]$/.test(clean)) continue;
    if (clean.split(/\s+/).length > 14) continue;
    if (/^(https?:|www\.)/i.test(clean)) continue;
    return clean;
  }
  return null;
}

export function parseSocialPost(input: string, today: Date = new Date()): SocialPostDraft {
  const text = String(input || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const folded = foldHu(text);
  const warnings: string[] = [];

  const dates = findDates(text, today);
  const times = findTimes(text);
  const url = text.match(/https?:\/\/[^\s)<>"']+/)?.[0]
    || (text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0]
      ? `https://${text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0]}`
      : null);
  const phone = text.match(/(\+36[\s\d/-]{7,}|\b06[\s\d/-]{7,})/)?.[0]?.trim() || null;

  const venue = labelled(text, 'venue');
  const priceText = labelled(text, 'price');
  const address = text.match(/\b(\d{4})\s+([A-ZÁÉÍÓÖŐÚÜŰ][^\n,]{2,40}),\s*([^\n]{4,60})/)?.[0] || null;
  const city = address?.match(/\b\d{4}\s+([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű-]+)/)?.[1]
    || text.match(/\b(Budapest|Debrecen|Szeged|P[eé]cs|Gy[oő]r|Miskolc|Kecskem[eé]t|Sz[eé]kesfeh[eé]rv[aá]r|Veszpr[eé]m|R[aá]ckeve|Velence|G[oö]d)\b/)?.[1]
    || null;

  const free = /ingyenes|d[ií]jmentes|a r[eé]szv[eé]tel ingyenes/i.test(text);
  const paid = /\b\d{3,6}\s?(ft|huf)\b/i.test(text) || /bel[eé]p[oő]\s*[:：]/i.test(text);
  const recurring = WEEKDAY_RECURRENCE.test(folded);

  if (!dates.start) warnings.push('Nem találtam dátumot — add meg kézzel.');
  if (!times.start && !recurring) warnings.push('Nem találtam kezdési időpontot.');
  if (!venue && !address) warnings.push('Nem találtam helyszínt.');
  if (recurring) warnings.push('Ez ismétlődő alkalomnak tűnik — lehet, hogy inkább klubként érdemes felvenni.');
  if (free && paid) warnings.push('A poszt ingyenességet és árat is említ — nézd át.');

  return {
    title: findTitle(lines),
    eventDate: dates.start,
    endDate: dates.end,
    eventTime: times.start,
    endTime: times.end,
    venue,
    city,
    address,
    isFree: free && !paid ? true : paid ? false : null,
    priceText,
    registrationRequired: /regisztr[aá]ci[oó]|jelentkez[eé]s|foglal[aá]s|bejelentkez[eé]s/i.test(text),
    url,
    phone,
    recurring,
    description: text.trim().slice(0, 4000),
    warnings,
  };
}
