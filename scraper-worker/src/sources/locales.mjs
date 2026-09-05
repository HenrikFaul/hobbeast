// Locale vocabulary for non-Hungarian sources.
//
// The generic extractor was written for a Hungarian registry and encodes
// Hungarian in three places: the event-link path words, the month names used to
// spot a date on a listing card, and the navigation words that tell a "tovább"
// link apart from an event. When the registry gained AT/CZ/PL/SI/SK sources in
// v1.56.0, twelve of the fourteen collected nothing — not because the sites are
// hard, but because /akce/, /udalost/, /repertuar/ and "6. září 2026" are
// invisible to a Hungarian vocabulary.
//
// Everything here is keyed by country_code and is ADDITIVE: `localeFor()`
// returns null for HU and for anything unknown, and every call site falls back
// to the exact Hungarian behaviour in that case. A Hungarian source therefore
// takes byte-identical code paths to before this module existed.

/**
 * Strip diacritics via NFD so "září"/"zari" and "více"/"vice" compare equal.
 * Deliberately NOT foldHu(): that one is tuned for Hungarian vowel pairs and is
 * shared with the Edge Function, so it must keep its exact behaviour.
 */
export function foldLatin(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase();
}

// Path words that mark an event-detail URL, per country. ASCII only: slugs are
// transliterated by every CMS we have seen, and the matcher folds anyway.
// Verified against the live listings on 2026-09-05 — the comment on each line
// names a site whose detail links actually use that word.
const EVENT_PATH_WORDS = {
  AT: [
    'veranstaltung', 'veranstaltungen', 'termin', 'termine', 'konzert', 'konzerte',
    'kalender', 'spielplan', 'programm', 'vorstellung', 'vorstellungen',
    'ausstellung', 'ausstellungen', 'festival', 'karten', 'tickets', 'buehne',
  ],
  CZ: [
    'akce', 'akci', 'udalost', 'udalosti', 'predstaveni', 'repertoar', // narodni-divadlo.cz/cs/predstaveni/...
    'koncert', 'koncerty', 'vstupenky', 'kalendar', 'festival', 'vystava',
    'divadlo', 'film', 'porad', 'porady',
  ],
  PL: [
    'wydarzenie', 'wydarzenia', 'repertuar', // filharmonia.pl/repertuar/...
    'koncert', 'koncerty', 'impreza', 'imprezy', 'bilety', 'spektakl', 'spektakle',
    'festiwal', 'wystawa', 'wystawy', 'kalendarz',
  ],
  SI: [
    'dogodek', 'dogodki', 'spored', 'predstava', 'predstave', 'film', 'filmi',
    'koncert', 'koncerti', 'razstava', 'razstave', 'festival', 'vstopnice',
    'prireditev', 'prireditve',
  ],
  SK: [
    'podujatie', 'podujatia', 'koncert', 'koncerty', 'predstavenie', 'predstavenia',
    'vstupenky', 'kalendar', 'festival', 'vystava', 'repertoar', 'program',
  ],
};

// Month names as they appear in running text. Czech, Polish and Slovak date
// phrases use the genitive ("6. září", "6 września", "6. septembra"), so both
// forms are listed; matching is by prefix, shortest distinctive stem first.
const MONTH_WORDS = {
  AT: {
    januar: 1, janner: 1, februar: 2, marz: 3, april: 4, mai: 5, juni: 6,
    juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
  },
  CZ: {
    leden: 1, ledna: 1, unor: 2, unora: 2, brezen: 3, brezna: 3, duben: 4, dubna: 4,
    kveten: 5, kvetna: 5, cerven: 6, cervna: 6, cervenec: 7, cervence: 7,
    srpen: 8, srpna: 8, zari: 9, rijen: 10, rijna: 10, listopad: 11, listopadu: 11,
    prosinec: 12, prosince: 12,
  },
  PL: {
    styczen: 1, stycznia: 1, luty: 2, lutego: 2, marzec: 3, marca: 3,
    kwiecien: 4, kwietnia: 4, maj: 5, maja: 5, czerwiec: 6, czerwca: 6,
    lipiec: 7, lipca: 7, sierpien: 8, sierpnia: 8, wrzesien: 9, wrzesnia: 9,
    pazdziernik: 10, pazdziernika: 10, listopad: 11, listopada: 11,
    grudzien: 12, grudnia: 12,
  },
  SI: {
    januar: 1, februar: 2, marec: 3, marca: 3, april: 4, aprila: 4, maj: 5, maja: 5,
    junij: 6, junija: 6, julij: 7, julija: 7, avgust: 8, avgusta: 8,
    september: 9, septembra: 9, oktober: 10, oktobra: 10, november: 11, novembra: 11,
    december: 12, decembra: 12,
  },
  SK: {
    januar: 1, januara: 1, februar: 2, februara: 2, marec: 3, marca: 3,
    april: 4, aprila: 4, maj: 5, maja: 5, jun: 6, juna: 6, jul: 7, jula: 7,
    august: 8, augusta: 8, september: 9, septembra: 9, oktober: 10, oktobra: 10,
    november: 11, novembra: 11, december: 12, decembra: 12,
  },
};

// "Show more", "back", "all" and friends: a card whose title is one of these is
// a pager control, not a programme. Mirrors the Hungarian list in generic.mjs.
//
// The ticket call-to-action entries are not optional politeness. On cd-cc.si
// the card nearest each date is the "NAKUP VSTOPNIC" (BUY TICKETS) button, so
// without them the extractor cheerfully publishes a row of events all named
// "BUY TICKETS". Genre headings ("Razstave" = Exhibitions) are here for the
// same reason: they head a section, they do not name a programme.
const NAV_WORDS = {
  AT: [
    'weiter', 'mehr', 'alle', 'zuruck', 'startseite', 'ubersicht', 'anzeigen',
    'details', 'kalender', 'mehr erfahren', 'programm',
    'tickets', 'karten', 'jetzt buchen', 'zum event', 'mehr infos', 'veranstaltungen',
  ],
  CZ: [
    'vice', 'dalsi', 'vsechny', 'vse', 'zpet', 'domu', 'kalendar', 'program',
    'zobrazit', 'nacist',
    'vstupenky', 'koupit vstupenku', 'detail', 'vice informaci', 'akce', 'vystavy',
  ],
  PL: [
    'wiecej', 'wszystkie', 'dalej', 'wstecz', 'strona glowna', 'kalendarz',
    'pokaz', 'zobacz wszystkie',
    'bilety', 'kup bilet', 'kup bilety', 'szczegoly', 'wiecej informacji', 'wystawy',
  ],
  SI: [
    'vec', 'vsi', 'vse', 'naprej', 'nazaj', 'domov', 'koledar', 'spored', 'prikazi',
    'nakup vstopnic', 'vstopnice', 'kupi vstopnico', 'kupi', 'razstave',
    'prireditve', 'vec o dogodku', 'gledalisce in ples', 'glasba', 'film',
    // The venue's placeholder for a third-party hire ("event of another
    // organiser"), used verbatim on every such booking — a label, not a name.
    'prireditev drugega organizatorja',
  ],
  SK: [
    'viac', 'dalsie', 'vsetky', 'spat', 'domov', 'kalendar', 'program', 'zobrazit',
    'vstupenky', 'kupit vstupenku', 'detail', 'viac informacii', 'podujatia', 'vystavy',
  ],
};

// A foreign event name can legitimately be very short — GoOut listed the films
// "Kouř" and "Jony" and the club night "Kanine". The Hungarian guard rejects
// anything under 10 characters, which discards all three. Foreign titles get a
// lower floor because the locale nav-word list does the real filtering.
const MIN_TITLE_LEN = 3;

/**
 * The locale bundle for a source's country, or null when the Hungarian
 * behaviour should apply unchanged (country_code null, 'HU', or unrecognised).
 */
export function localeFor(countryCode) {
  const cc = String(countryCode || '').trim().toUpperCase();
  if (!cc || cc === 'HU') return null;
  if (!EVENT_PATH_WORDS[cc]) return null;
  return {
    country: cc,
    pathWords: EVENT_PATH_WORDS[cc],
    months: MONTH_WORDS[cc],
    navWords: NAV_WORDS[cc],
  };
}

export function knownLocaleCountries() {
  return Object.keys(EVENT_PATH_WORDS).sort();
}

/**
 * An event-link matcher for one locale, shaped exactly like EVENT_LINK_RE in
 * generic.mjs: the word must be a whole path segment (or start one), so
 * "/akce/leznyvlkk" matches while "/nakceni" does not.
 */
export function localeEventPathRe(locale) {
  if (!locale) return null;
  const alternation = locale.pathWords
    .slice()
    .sort((a, b) => b.length - a.length) // longest first: "koncerty" before "koncert"
    .join('|');
  return new RegExp(`/(${alternation})(?:[/\\-_?#]|$)`, 'i');
}

/** The month-name alternation for this locale, for use inside the browser. */
export function localeMonthPattern(locale) {
  if (!locale) return null;
  return Object.keys(locale.months).sort((a, b) => b.length - a.length).join('|');
}

function monthOf(word, months) {
  const w = foldLatin(word);
  if (w.length < 3) return null;
  // Longest key first so "cervence" (July) is not swallowed by "cerven" (June),
  // and so an inflected form ("septembra", "wrzesnia") still finds its stem.
  const keys = Object.keys(months).sort((a, b) => b.length - a.length);
  for (const key of keys) if (w.startsWith(key)) return months[key];

  // The other direction: the text holds an ABBREVIATION of the month rather
  // than the whole word. Slovenian listings write "16. sept. 2026" and
  // "13. okt.", and a one-way prefix test rejects every one of them.
  // Accepted only when the abbreviation is unambiguous — "cerv" could be
  // either Czech June or July, so it resolves to neither.
  const candidates = new Set();
  for (const key of keys) if (key.startsWith(w)) candidates.add(months[key]);
  return candidates.size === 1 ? [...candidates][0] : null;
}

function isoOrNull(y, mo, d) {
  if (!y || !mo || !d || mo > 12 || d > 31 || d < 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Free-text date in a Central-European locale.
 *
 * The decisive difference from parseHuTextDate is ORDER: Hungarian writes the
 * year first ("2026. szeptember 6."), while German, Czech, Polish, Slovenian
 * and Slovak all write the day first ("6. September 2026", "6. září 2026",
 * "6 września 2026"). Feeding "06.09.2026" to the Hungarian parser yields
 * nothing, which is why every card-based foreign source returned zero.
 *
 * Recognised, in order:
 *   1. ISO            2026-09-06
 *   2. year-first     2026.09.06        (unambiguous by position)
 *   3. day-first      06.09.2026        6/9/2026
 *   4. day + month    6. september 2026
 *   5. day + month    6. september      (year inferred, same rule as Hungarian)
 */
export function parseLocaleTextDate(text, locale) {
  if (!locale) return null;
  const t = foldLatin(text).slice(0, 400);

  let m = t.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoOrNull(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/);
  if (m) return isoOrNull(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/\b(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(20\d{2})/);
  if (m) return isoOrNull(Number(m[3]), Number(m[2]), Number(m[1]));

  m = t.match(/\b(\d{1,2})\.?\s+([a-z]{3,12})\.?,?\s+(20\d{2})/);
  if (m && monthOf(m[2], locale.months)) {
    return isoOrNull(Number(m[3]), monthOf(m[2], locale.months), Number(m[1]));
  }

  m = t.match(/\b(\d{1,2})\.?\s+([a-z]{3,12})\b/);
  if (m && monthOf(m[2], locale.months)) {
    const month = monthOf(m[2], locale.months);
    const day = Number(m[1]);
    const now = new Date();
    let year = now.getFullYear();
    // Same roll-forward rule the Hungarian parser uses: a date more than a
    // month in the past means the listing meant next year.
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getTime() < now.getTime() - 32 * 86400000) year += 1;
    return isoOrNull(year, month, day);
  }

  return null;
}

/** Locale-aware sibling of isNavigationTitle() in generic.mjs. */
export function isLocaleNavigationTitle(title, locale) {
  if (!locale) return false;
  const folded = foldLatin(title).replace(/\s+/g, ' ').trim();
  if (folded.length < MIN_TITLE_LEN) return true;
  if (locale.navWords.some((w) => folded === w || folded.startsWith(`${w} `))) return true;
  // "Sobota 6. září 2026" as a title is a jump-to-this-day link, never a name.
  const monthPattern = Object.keys(locale.months).sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`^\\d{0,2}\\.?\\s*(${monthPattern})\\.?\\s*\\d{0,4}$`, 'i').test(folded);
}
