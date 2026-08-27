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

import { readLine, stripDecoration, type PostField } from './socialPostFields';

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
  email: string | null;
  /** Who is putting it on, when the post says so. */
  organizer: string | null;
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


/**
 * A Hungarian street address: postcode, town, then the street line.
 * Kept as one source of truth so the address and the town agree.
 */
const ADDRESS_RE = /\b(\d{4})\s+([A-ZÁÉÍÓÖŐÚÜŰ][^\n,]{2,40}),\s*([^\n]{4,60})/;

/**
 * Towns worth recognising without a postcode.
 *
 * Every county seat, every town over about twenty thousand people, and the
 * resort towns that put on most of the summer programmes — because a post
 * saying "Ráckeve – Kis-Duna" names its town and nothing else.
 */
const CITIES = [
  'Budapest', 'Debrecen', 'Szeged', 'Miskolc', 'Pécs', 'Győr', 'Nyíregyháza',
  'Kecskemét', 'Székesfehérvár', 'Szombathely', 'Szolnok', 'Tatabánya', 'Kaposvár',
  'Békéscsaba', 'Érd', 'Veszprém', 'Zalaegerszeg', 'Sopron', 'Eger', 'Nagykanizsa',
  'Dunaújváros', 'Hódmezővásárhely', 'Salgótarján', 'Cegléd', 'Baja', 'Ózd',
  'Vác', 'Mosonmagyaróvár', 'Szigetszentmiklós', 'Gyula', 'Kiskunfélegyháza',
  'Ajka', 'Gödöllő', 'Pápa', 'Gyöngyös', 'Kazincbarcika', 'Hajdúböszörmény',
  'Szentendre', 'Dunakeszi', 'Jászberény', 'Orosháza', 'Komló', 'Kiskunhalas',
  'Esztergom', 'Békés', 'Törökszentmiklós', 'Várpalota', 'Siófok', 'Keszthely',
  'Balatonfüred', 'Hévíz', 'Ráckeve', 'Szentes', 'Mohács', 'Hatvan', 'Bonyhád',
  'Tapolca', 'Sárvár', 'Bük', 'Zamárdi', 'Balatonlelle', 'Balatonboglár',
  'Fonyód', 'Velence', 'Gárdony', 'Visegrád', 'Eger', 'Szekszárd', 'Kőszeg',
  'Makó', 'Mezőtúr', 'Karcag', 'Berettyóújfalu', 'Püspökladány', 'Tiszaújváros',
  'Sátoraljaújhely', 'Sárospatak', 'Kisvárda', 'Mátészalka', 'Nagykőrös',
];

// The boundaries must be escaped twice: inside a template literal a lone \b is
// the backspace character, and the town names then matched nothing at all.
const CITY_RE = new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i');

/** The town a line names, in the spelling this project uses. */
function findCity(value: string): string | null {
  const match = value.match(CITY_RE);
  if (!match) return null;
  const folded = foldHu(match[1]);
  return CITIES.find((city) => foldHu(city) === folded) ?? match[1];
}

/** The first web address in a fragment, with a bare "www." made absolute. */
function firstUrl(value: string): string | null {
  const absolute = value.match(/https?:\/\/[^\s)<>"']+/)?.[0];
  if (absolute) return absolute;
  const bare = value.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0];
  return bare ? `https://${bare}` : null;
}

/**
 * Every labelled line in the post, by what it labels.
 *
 * The first line to claim a field wins: posts repeat themselves at the bottom
 * ("bővebben: …") and the headline block is the one that means it. A word
 * label always beats a bare emoji, whichever came first.
 */
function collectLabelled(lines: string[]): Map<PostField, string> {
  const found = new Map<PostField, string>();
  const fromWordLabel = new Set<PostField>();

  for (const line of lines) {
    const read = readLine(line);
    if (!read.field || !read.value) continue;
    if (read.explicit) {
      if (fromWordLabel.has(read.field)) continue;
      found.set(read.field, read.value);
      fromWordLabel.add(read.field);
      continue;
    }
    if (!found.has(read.field)) found.set(read.field, read.value);
  }
  return found;
}

/**
 * A line that is only a bullet in a list of who it suits — "Családoknak",
 * "Pároknak" — is not a title, however early it appears. A real advert came
 * through titled "Családoknak" because it was simply the first short line.
 */
const AUDIENCE_BULLET = /^(csal[aá]dokna?k|p[aá]rokna?k|bar[aá]ti\s+t[aá]rsas[aá]gokna?k|id[oő]sebbekne?k|kezd[oő]kne?k|halad[oó]kna?k|gyerekekne?k|feln[oő]tteknek|mindenkine?k|di[aá]kokna?k|nyugd[ií]jasokna?k)$/i;

/** A line that is plainly a fact about the event, not its name. */
function looksLikeField(line: string): boolean {
  const read = readLine(line);
  if (read.field) return true;
  if (/^(https?:|www\.)/i.test(line)) return true;
  if (/^\+?\d[\d\s/-]{6,}$/.test(line)) return true;
  return false;
}

/**
 * The headline.
 *
 * The first substantial line of a post is the headline far more often than
 * not, and it is allowed to be a shout — "HÉTVÉGI VÍZI KALAND? IRÁNY
 * RÁCKEVE!" is the name of the thing, not marketing filler, even though it
 * ends in an exclamation mark. The previous version rejected any line ending
 * in ? or !, which is exactly how that advert ended up titled "Családoknak".
 *
 * A line ENDING in a question mark is the exception: "Te is várod már, hogy
 * újra megteljen sörrel a fesztiválpoharad?" is a hook written to pull the
 * reader in, and the name is the line underneath it.
 */
function findTitle(lines: string[]): string | null {
  const candidates: Array<{ text: string; score: number }> = [];

  lines.forEach((raw, index) => {
    const clean = stripDecoration(raw);
    if (clean.length < 5 || clean.length > 120) return;
    if (AUDIENCE_BULLET.test(clean)) return;
    if (looksLikeField(raw)) return;
    if (/[:：]\s*$/.test(clean)) return;
    if (clean.split(/\s+/).length > 16) return;

    let score = 0;
    // Position: the headline is at the top.
    score += Math.max(0, 12 - index * 3);
    // Shouting and decoration are how a headline announces itself.
    if (raw !== clean) score += 3;
    if (clean === clean.toUpperCase() && /\p{L}/u.test(clean)) score += 4;
    // A full stop mid-line means prose — but only after a WORD. Hungarian
    // event names are routinely numbered ("10. Belvárosi Sörfesztivál"), and
    // penalising that ordinal handed the title to the line below it.
    if (/\p{L}\.\s+\p{Lu}/u.test(clean)) score -= 5;
    // A numbered edition is a strong sign of a name rather than a sentence.
    if (/^\d{1,3}\.\s+\p{Lu}/u.test(clean)) score += 4;
    // A line that ENDS in a question is a hook, and the name follows it.
    if (/\?\s*$/.test(clean)) score -= 10;
    if (clean.split(/\s+/).length > 10) score -= 2;
    candidates.push({ text: clean, score });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].text;
}

export function parseSocialPost(input: string, today: Date = new Date()): SocialPostDraft {
  const text = String(input || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const folded = foldHu(text);
  const warnings: string[] = [];

  const fields = collectLabelled(lines);

  const dates = findDates(fields.get('date') || text, today);
  const datesFallback = dates.start ? dates : findDates(text, today);
  const times = findTimes(fields.get('time') || fields.get('date') || text);
  const timesFallback = times.start ? times : findTimes(text);
  const url = firstUrl(fields.get('url') || fields.get('registration') || '')
    || text.match(/https?:\/\/[^\s)<>"']+/)?.[0]
    || (text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0]
      ? `https://${text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0]}`
      : null);
  const phone = text.match(/(\+36[\s\d/-]{7,}|\b06[\s\d/-]{7,})/)?.[0]?.trim() || null;

  // A labelled line is a statement; the loose scan of the whole text is a
  // guess. The statement wins wherever there is one.
  const venue = fields.get('venue') || null;
  const priceText = fields.get('price') || fields.get('ticket') || null;
  const organizer = fields.get('organizer') || null;
  const email = fields.get('email')?.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]
    || text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0]
    || null;

  const address = ADDRESS_RE.exec(fields.get('address') || fields.get('venue') || text)?.[0]
    || ADDRESS_RE.exec(text)?.[0]
    || null;

  // A venue line often carries the town too — "Ráckeve – Kis-Duna".
  const city = address?.match(/\b\d{4}\s+([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű-]+)/)?.[1]
    || findCity(fields.get('venue') || '')
    || findCity(fields.get('address') || '')
    || findCity(text)
    || null;

  const free = /ingyenes|d[ií]jmentes|a r[eé]szv[eé]tel ingyenes/i.test(text);
  const paid = /\b\d{3,6}\s?(ft|huf)\b/i.test(text) || /bel[eé]p[oő]\s*[:：]/i.test(text);
  const recurring = WEEKDAY_RECURRENCE.test(folded);

  if (!datesFallback.start) warnings.push('Nem találtam dátumot — add meg kézzel.');
  if (!timesFallback.start && !recurring) warnings.push('Nem találtam kezdési időpontot.');
  if (!venue && !address) warnings.push('Nem találtam helyszínt.');
  if (recurring) warnings.push('Ez ismétlődő alkalomnak tűnik — lehet, hogy inkább klubként érdemes felvenni.');
  if (free && paid) warnings.push('A poszt ingyenességet és árat is említ — nézd át.');

  return {
    title: findTitle(lines),
    eventDate: datesFallback.start,
    endDate: datesFallback.end,
    eventTime: timesFallback.start,
    endTime: timesFallback.end,
    venue,
    city,
    address,
    isFree: free && !paid ? true : paid ? false : null,
    priceText,
    registrationRequired: /regisztr[aá]ci[oó]|jelentkez[eé]s|foglal[aá]s|bejelentkez[eé]s/i.test(text),
    url,
    phone,
    email,
    organizer,
    recurring,
    description: text.trim().slice(0, 4000),
    warnings,
  };
}
