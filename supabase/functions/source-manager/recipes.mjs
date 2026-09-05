// GENERATED COPY — edit scraper-worker/src/sources/recipes.mjs instead.
// Kept in sync by scripts/sync-edge-recipes.mjs (npm run edge:sync-recipes).
// Predefined extraction recipes + the inspector that picks one for a URL.
//
// This is the module behind "paste a link, get programs". A new source is never
// configured by hand: the inspector fetches the page, looks for every structured
// signal a Hungarian event site tends to expose, runs each matching recipe for
// real, and ranks the recipes by how many dated future programs they actually
// produced. The operator sees the sample and picks.
//
// Deliberately dependency-free and free of Node built-ins: the scraper worker
// (Node) and the source-manager Edge Function (Deno) run this SAME file, so a
// preview in the admin panel and the production run cannot drift apart.

export const RECIPES = {
  ics: {
    id: 'ics',
    label: 'Naptár-feed (iCalendar)',
    hint: 'A legmegbízhatóbb: a szervező naptára gépi formában.',
    needsBrowser: false,
  },
  tribe: {
    id: 'tribe',
    label: 'WordPress esemény-API',
    hint: 'The Events Calendar bővítmény hivatalos API-ja.',
    needsBrowser: false,
  },
  'wp-ics-calendar': {
    id: 'wp-ics-calendar',
    label: 'WordPress naptár-rács',
    hint: 'Az ICS Calendar bővítmény havi naptárából olvassuk ki a programokat.',
    needsBrowser: false,
  },
  jsonld: {
    id: 'jsonld',
    label: 'Strukturált esemény-adat',
    hint: 'A oldal maga közli az eseményeit szabványos (schema.org) formában.',
    needsBrowser: false,
  },
  rss: {
    id: 'rss',
    label: 'Hírfolyam (RSS/Atom)',
    hint: 'A feed adja a linkeket, a részleteket az egyes oldalakról olvassuk.',
    needsBrowser: false,
  },
  'wp-posts': {
    id: 'wp-posts',
    label: 'WordPress cikkek (programajánló)',
    hint: 'A magazinjellegű oldalak a programokat cikkekben közlik — a cikkek törzséből olvassuk ki őket.',
    needsBrowser: false,
  },
  'page-prose': {
    id: 'page-prose',
    label: 'Egyetlen esemény oldala',
    hint: 'Nem katalógus: egy rendezvény saját oldala, a dátum a szövegben.',
    needsBrowser: false,
  },
  selector: {
    id: 'selector',
    label: 'Egyedi szabály (szelektorok)',
    hint: 'Te (vagy az AI) megmondod, melyik elem ismétlődik és hol a cím, a dátum, a link. A szabály adat, nem kód.',
    needsBrowser: false,
  },
  render: {
    id: 'render',
    label: 'Böngészős betöltés',
    hint: 'Teljes böngészővel töltjük be az oldalt. Előnézet nélkül, a próbafuttatás mutatja meg az eredményt.',
    needsBrowser: true,
  },
  social: {
    id: 'social',
    label: 'Közösségi oldal',
    hint: 'Bejelentkezés nélkül nem olvasható. Add meg inkább a szervező saját weboldalát.',
    needsBrowser: true,
    unsupported: true,
  },
};

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)$/i;

// --- small shared helpers ---------------------------------------------------

const NAMED_ENTITIES = {
  raquo: '»', laquo: '«', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  middot: '·', bull: '•', apos: "'",
};

export function decodeEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&(raquo|laquo|ndash|mdash|hellip|rsquo|lsquo|ldquo|rdquo|middot|bull|apos);/gi,
      (_, name) => NAMED_ENTITIES[name.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

export function absoluteUrl(base, href) {
  try {
    return new URL(String(href).replace(/^webcal:\/\//i, 'https://'), base).toString();
  } catch {
    return null;
  }
}

export function normalizeSourceUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function isSocialUrl(url) {
  try {
    return SOCIAL_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function isFutureIsoDate(value) {
  const date = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayIso();
}

// --- recipe: iCalendar ------------------------------------------------------

// RFC 5545 line unfolding: a continuation line starts with a space or tab.
export function unfoldIcs(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function icsValue(line) {
  const idx = line.indexOf(':');
  return idx < 0 ? '' : line
    .slice(idx + 1)
    .replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
    .trim();
}

function icsDate(line) {
  const value = icsValue(line);
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
}

export function parseIcs(text) {
  const lines = unfoldIcs(text).split('\n');
  const events = [];
  let current = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { current = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (current?.name && current?.startDate) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    if (/^SUMMARY[;:]/i.test(line)) current.name = icsValue(line).slice(0, 200);
    else if (/^DTSTART[;:]/i.test(line)) {
      const parsed = icsDate(line);
      if (parsed) current.startDate = parsed.time ? `${parsed.date}T${parsed.time}` : parsed.date;
    } else if (/^DESCRIPTION[;:]/i.test(line)) current.description = icsValue(line).slice(0, 800);
    else if (/^LOCATION[;:]/i.test(line)) current.location = icsValue(line).slice(0, 160);
    else if (/^URL[;:]/i.test(line)) current.url = icsValue(line);
  }
  return events;
}

// --- recipe: WordPress "The Events Calendar" REST ---------------------------

export function parseTribeEvents(payload, fallbackUrl) {
  const list = Array.isArray(payload?.events) ? payload.events : [];
  return list.map((e) => ({
    name: e.title ? decodeEntities(e.title) : null,
    startDate: e.start_date ? String(e.start_date).replace(' ', 'T') : null,
    url: e.url || fallbackUrl,
    description: e.description ? stripTags(e.description).slice(0, 800) : null,
    image: e.image?.url || e.image || null,
    location: e.venue?.venue ? decodeEntities(e.venue.venue) : null,
    city: e.venue?.city ? decodeEntities(e.venue.city) : null,
    offers: e.cost_details?.values?.length
      ? { price_min: Number(e.cost_details.values[0]) || null, currency: e.cost_details.currency_code || 'HUF' }
      : {},
  })).filter((e) => e.name && e.startDate);
}

// --- recipe: WordPress "ICS Calendar" rendered grid -------------------------
//
// The plugin renders a month grid where every day cell carries the ISO date in
// aria-labelledby ("r6a8e...-20260904") and every entry is <li class="event
// tHHMMSS"> with a <span class="title"> and an optional <div class="eventdesc">.
// That is a complete event record without a single detail page fetch.

export function parseWpIcsCalendar(html, pageUrl) {
  const source = String(html ?? '');
  const events = [];
  const dayRe = /<ul class="events"[^>]*aria-labelledby="[^"]*?-(\d{8})"[^>]*>([\s\S]*?)<\/ul>/gi;
  for (const day of source.matchAll(dayRe)) {
    const iso = `${day[1].slice(0, 4)}-${day[1].slice(4, 6)}-${day[1].slice(6, 8)}`;
    const itemRe = /<li class="event[^"]*?(?:\st(\d{6}))?"[\s\S]*?<\/li>/gi;
    for (const item of day[2].matchAll(itemRe)) {
      const block = item[0];
      const hhmmss = item[1] || block.match(/class="event[^"]*\st(\d{6})/)?.[1] || null;
      const title = block.match(/<span[^>]*class="title[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
      if (!title) continue;
      // Titles carry inline markup (<wbr />, <em>) that must not reach the card.
      const name = stripTags(title);
      if (!name || name.length < 2) continue;
      const desc = block.match(/<div[^>]*class="eventdesc"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
      const link = block.match(/<a[^>]+href="([^"]+)"/i)?.[1];
      const time = hhmmss ? `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}` : null;
      events.push({
        name: name.slice(0, 200),
        startDate: time ? `${iso}T${time}` : iso,
        url: link ? absoluteUrl(pageUrl, link) : pageUrl,
        description: desc ? stripTags(desc).slice(0, 800) : null,
        location: block.match(/<div[^>]*class="[^"]*eventloc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
          ? stripTags(block.match(/<div[^>]*class="[^"]*eventloc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)[1]).slice(0, 160)
          : null,
      });
    }
  }
  // The same recurring entry appears in every rendered month; one row per
  // (title, date) is enough and keeps the preview honest.
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.name}|${e.startDate.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- recipe: JSON-LD --------------------------------------------------------

const EVENT_TYPE_RE = /^(Event|MusicEvent|TheaterEvent|SportsEvent|ScreeningEvent|SocialEvent|FestivalEvent|Festival|ExhibitionEvent|EducationEvent|BusinessEvent|ChildrensEvent|ComedyEvent|DanceEvent|FoodEvent|LiteraryEvent|VisualArtsEvent|CourseInstance)$/i;

function jsonLdNodes(value, out = []) {
  if (Array.isArray(value)) { value.forEach((v) => jsonLdNodes(v, out)); return out; }
  if (value && typeof value === 'object') {
    out.push(value);
    for (const key of ['@graph', 'itemListElement', 'item', 'subEvent', 'events']) {
      if (value[key]) jsonLdNodes(value[key], out);
    }
  }
  return out;
}

export function parseJsonLdEvents(html, pageUrl) {
  const events = [];
  for (const block of String(html ?? '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(block[1].trim()); } catch { continue; }
    for (const node of jsonLdNodes(parsed)) {
      const types = [].concat(node['@type'] ?? []);
      if (!types.some((t) => EVENT_TYPE_RE.test(String(t)))) continue;
      const name = node.name ? decodeEntities(String(node.name)) : null;
      const startDate = node.startDate ? String(node.startDate) : null;
      if (!name || !startDate) continue;
      const place = node.location ?? {};
      const offer = [].concat(node.offers ?? [])[0] ?? {};
      events.push({
        name: name.slice(0, 200),
        startDate,
        url: node.url ? absoluteUrl(pageUrl, node.url) : pageUrl,
        description: node.description ? stripTags(String(node.description)).slice(0, 800) : null,
        image: Array.isArray(node.image) ? node.image[0] : (node.image?.url || node.image || null),
        location: place.name ? decodeEntities(String(place.name)).slice(0, 160) : null,
        city: place.address?.addressLocality ? decodeEntities(String(place.address.addressLocality)) : null,
        offers: offer.price != null
          ? { price_min: Number(offer.price) || null, currency: offer.priceCurrency || 'HUF', ticket_url: offer.url || null }
          : {},
      });
    }
  }
  return events;
}

// --- recipe: RSS/Atom -------------------------------------------------------

export function parseFeed(xml) {
  const items = [];
  const blocks = [
    ...String(xml ?? '').matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...String(xml ?? '').matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ];
  for (const block of blocks) {
    const b = block[0];
    const tag = (name) => {
      const m = b.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
      return m ? decodeEntities(m[1]) : null;
    };
    const title = tag('title');
    const link = tag('link') || (b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null);
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    items.push({
      title,
      link,
      description: tag('description') || tag('summary') || null,
      published: tag('pubDate') || tag('updated') || tag('published') || null,
    });
  }
  return items;
}

// --- hub discovery ----------------------------------------------------------

const HUB_SEGMENT_RE = /^(esemenyek|esemeny|programok|program|programajanlo|rendezvenyek|rendezveny|naptar|events|event|calendar|whats-on|ajanlat|koncertek|eloadasok)$/i;
const ARCHIVE_RE = /(past|archiv|korabbi|regi)[-_]/i;

export function findEventHub(html, pageUrl) {
  const links = [...String(html ?? '').matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const base = normalizeSourceUrl(pageUrl);
  if (!base) return null;
  const origin = new URL(base).origin;
  const currentPath = new URL(base).pathname.replace(/\/+$/, '');
  const seen = new Set();
  for (const href of links) {
    const abs = absoluteUrl(base, href);
    if (!abs || !abs.startsWith(origin) || seen.has(abs)) continue;
    seen.add(abs);
    const path = new URL(abs).pathname.replace(/\/+$/, '');
    if (!path || path === currentPath) continue;
    if (ARCHIVE_RE.test(path)) continue;
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 2) continue;
    if (segments.some((s) => HUB_SEGMENT_RE.test(s.toLowerCase().replace(/[áéíóöőúüű]/g, (c) => 'aeiooouuu'['áéíóöőúüű'.indexOf(c)])))) {
      return `${origin}${path}`;
    }
  }
  return null;
}


// --- publisher identity -----------------------------------------------------

export function guessPublisherName(html, url) {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = decodeEntities(og || title || '');
  // Page titles are usually "Something | Site" or "Something - Site"; the site
  // name is the shortest side, and that is the half worth keeping.
  const parts = raw.split(/\s*[|»–—·•]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const best = og ? raw : (parts.length > 1 ? parts[parts.length - 1] : raw);
  if (best && best.length >= 2 && best.length <= 120) return best;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// --- Hungarian free-text dates ---------------------------------------------
// Shared with the worker (generic.mjs re-exports these) so a preview and a
// production run can never disagree about what "2026. szeptember 4-6." means.

const HU_MONTHS = {
  januar: 1, febru: 2, marcius: 3, aprilis: 4, majus: 5, junius: 6,
  julius: 7, augusztus: 8, szeptember: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, marc: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, szept: 9, szep: 9, okt: 10, nov: 11, dec: 12,
};

export function foldHu(s) {
  return String(s || '').toLowerCase()
    .replace(/[áa]/g, 'a').replace(/[éě]/g, 'e').replace(/í/g, 'i')
    .replace(/[óöő]/g, 'o').replace(/[úüű]/g, 'u');
}

/** Best-effort Hungarian free-text date: "2026. augusztus 30.", "2026.08.30", "aug. 30." */
export function parseHuTextDate(text) {
  const t = foldHu(text).slice(0, 400);
  let m = t.match(/(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/);
  if (m) return isoOrNull(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/(20\d{2})\.?\s*([a-z]{3,10})\.?\s*(\d{1,2})/);
  if (m && monthOf(m[2])) return isoOrNull(Number(m[1]), monthOf(m[2]), Number(m[3]));
  m = t.match(/\b([a-z]{3,10})\.?\s*(\d{1,2})\b/);
  if (m && monthOf(m[1])) {
    const now = new Date();
    const month = monthOf(m[1]);
    const day = Number(m[2]);
    let year = now.getFullYear();
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getTime() < now.getTime() - 32 * 86400000) year += 1;
    return isoOrNull(year, month, day);
  }
  return null;
}

function monthOf(word) {
  for (const [key, num] of Object.entries(HU_MONTHS)) if (word.startsWith(key)) return num;
  return null;
}

function isoOrNull(y, mo, d) {
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A dated section heading is not automatically an event.
//
// sportagvalaszto.hu proved it: "Miért érdemes csatlakozni?" and "Melyik sportág
// illik a testalkatodhoz?" are article sections that happen to sit above a
// paragraph containing a date. Publishing those as programs would be worse than
// finding nothing, so a heading has to look like the NAME of something before it
// is accepted.

const QUESTION_RE = /\?\s*$/;

const SECTION_WORDS = new Set([
  'miert', 'hogyan', 'mit', 'mikor', 'hol', 'kinek', 'melyik', 'mennyi', 'ki',
  'gyakori', 'kerdesek', 'jelentkezes', 'regisztracio', 'kapcsolat', 'rolunk',
  'program', 'programok', 'informaciok', 'tudnivalok', 'reszletek', 'helyszin',
  'jegyek', 'jegyinfo', 'belepo', 'megkozelites', 'parkolas', 'gyik', 'sajto',
  'tamogatoink', 'partnereink', 'galeria', 'osszefoglalo', 'ajanlo', 'bevezeto',
]);

/** Marks that a heading names a specific thing rather than a section of prose. */
const NAME_MARKERS = /[/@|]|\s[–—-]\s|\d/;

export function looksLikeEventHeading(heading, fold) {
  const raw = String(heading ?? '').trim();
  if (raw.length < 8 || raw.length > 180) return false;
  // "Miért érdemes csatlakozni?" — a question is a section, never an event name.
  if (QUESTION_RE.test(raw)) return false;

  const words = fold(raw).split(' ').filter(Boolean);
  if (!words.length) return false;
  // A heading whose opening word is a section word is prose scaffolding.
  if (SECTION_WORDS.has(words[0])) return false;
  // …and so is one built entirely from them.
  if (words.every((w) => SECTION_WORDS.has(w))) return false;

  // A proper name shows itself: an inner capital, a separator, or a number.
  const innerCapital = raw.split(/\s+/).slice(1).some((w) => /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(w));
  return innerCapital || NAME_MARKERS.test(raw);
}

// --- recipe: WordPress posts (magazine listings) ----------------------------
//
// Most Hungarian "programajánló" sites are not calendars at all — they are
// magazines. funzine.hu is the clearest case: its /category/programok archive
// holds editorial articles, its REST namespaces contain no events plugin, and
// the programs themselves live INSIDE the article bodies, as h2/h3 sections of
// a listicle ("20 csodás szüreti program…", each heading a named, dated event).
//
// Reading only the listing page finds nothing there. Reading the article bodies
// through the always-present wp/v2/posts endpoint turns one article into twenty
// programs.

const DATE_TAIL_RE = /\s*[([][^()[\]]*20\d{2}[^()[\]]*[)\]]\s*$/;

function sectionImage(html) {
  const m = String(html ?? '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** Splits an article body into (heading, following markup) pairs. */
export function splitHeadingSections(html) {
  const source = String(html ?? '');
  const out = [];
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const marks = [];
  for (const m of source.matchAll(re)) {
    marks.push({ heading: stripTags(m[2]), start: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? source.lastIndexOf('<h', marks[i + 1].start) : source.length;
    out.push({ heading: marks[i].heading, body: source.slice(marks[i].start, Math.max(end, marks[i].start)) });
  }
  return out;
}

/**
 * Turns WordPress posts into events. `parseDate` is injected so the worker and
 * the Edge Function can share this file while the Hungarian free-text date
 * parser stays in generic.mjs.
 */
/**
 * The start date of a WordPress post that models a real event, read from the
 * custom field rather than from prose. Accepts a Unix timestamp (seconds or
 * milliseconds) or an ISO string, under `event_date` or inside `acf`.
 * Returns null for a plain article, which keeps every existing Hungarian
 * wp-posts source on its original path — none of them carry these fields.
 */
function structuredPostDate(post) {
  const candidates = [
    post?.event_date?.start_date, post?.event_date?.start, post?.event_date,
    post?.acf?.event_date?.start_date, post?.acf?.start_date, post?.acf?.event_date,
  ];
  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    let ms = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // Seconds vs milliseconds: a seconds value for any plausible event year
      // is ten digits, a milliseconds value thirteen.
      ms = raw > 1e11 ? raw : raw * 1000;
    } else if (typeof raw === 'string') {
      const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) ms = n > 1e11 ? n : n * 1000;
    }
    if (ms === null) continue;
    if (ms < Date.UTC(2015, 0, 1) || ms > Date.UTC(2040, 0, 1)) continue;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return null;
}

export function parseWpPosts(posts, { parseDate = parseHuTextDate, fallbackToArticle = true } = {}) {
  const list = Array.isArray(posts) ? posts : [];
  const events = [];
  const seen = new Set();
  const toDate = typeof parseDate === 'function' ? parseDate : () => null;

  const push = (name, startDate, url, description, image) => {
    const clean = String(name ?? '').replace(DATE_TAIL_RE, '').trim();
    if (!clean || clean.length < 6 || !startDate) return;
    const key = `${clean.toLowerCase()}|${startDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Hungarian listicles name the venue after a double slash:
    // "Tábor Fesztivál // Alsóörs", "BotanicArt // Művészetek Háza, Veszprém".
    const parts = clean.split(/\s*\/\/\s*/);
    const title = parts[0].trim();
    const location = parts.length > 1 ? parts.slice(1).join(' // ').trim() : null;
    events.push({
      name: (title.length >= 6 ? title : clean).slice(0, 200),
      startDate,
      url,
      description: description ? description.slice(0, 800) : null,
      image,
      location: location ? location.slice(0, 160) : null,
      city: location && location.includes(',') ? location.split(',').pop().trim() : null,
    });
  };

  for (const post of list) {
    const link = post?.link ?? null;

    // A real WordPress EVENT post type carries its date as a field, not as
    // prose. visitbratislava.com exposes /wp-json/wp/v2/event with
    // event_date:{start_date:<unix>}, which is far better than anything the
    // heading heuristics below could recover — the rendered cards there write
    // "5. 9." with no year at all. When that field is present the title IS the
    // event name by definition, so the article-headline gate is skipped.
    const structured = structuredPostDate(post);
    if (structured) {
      push(
        stripTags(post?.title?.rendered ?? ''),
        structured,
        link,
        stripTags(post?.excerpt?.rendered ?? ''),
        null,
      );
      continue;
    }

    const body = post?.content?.rendered ?? '';
    const sections = splitHeadingSections(body);
    let found = 0;

    for (const section of sections) {
      const text = stripTags(section.body).slice(0, 500);
      // The date is usually in the heading itself ("… (2026. szeptember 4-6.)")
      // and otherwise in the first lines under it.
      const date = toDate(section.heading) || toDate(text);
      if (!date) continue;
      if (!looksLikeEventHeading(section.heading, foldHu)) continue;
      push(section.heading, date, link, text, sectionImage(section.body));
      found += 1;
    }

    // A single-topic article still describes one program.
    if (!found && fallbackToArticle) {
      const title = stripTags(post?.title?.rendered ?? '');
      const excerpt = stripTags(post?.excerpt?.rendered ?? '');
      const date = toDate(title) || toDate(excerpt);
      // The same gate: a quiz headline ("Melyik sportág illik a testalkatodhoz?")
      // is an article, not a program, however many dates its body contains.
      if (date && looksLikeEventHeading(title, foldHu)) push(title, date, link, excerpt, null);
    }
  }
  return events;
}

// --- recipe: single-event page ----------------------------------------------
//
// sportagvalaszto.hu/nagy-sportagvalaszto/ is not a catalogue: it is one
// recurring event's landing page, its date written in prose ("2026. szeptember
// 18-19-én"). Reporting "no programs found" there is wrong — there is exactly
// one, and saying so is more useful than an empty result.

export function parseProsePage(html, pageUrl, { parseDate = parseHuTextDate } = {}) {
  const source = String(html ?? '');
  const toDate = typeof parseDate === 'function' ? parseDate : () => null;

  const ogTitle = source.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const h1 = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const docTitle = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name = decodeEntities(ogTitle || (h1 ? stripTags(h1) : '') || (docTitle ? stripTags(docTitle) : ''));
  if (!name || name.length < 4) return [];

  const text = stripTags(source);
  const date = toDate(text);
  if (!date) return [];

  const ogImage = source.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
  // Page-builder sites leak shortcodes into og:description ("[/vc_column"), so
  // the visible text is the more reliable summary.
  const description = text.slice(0, 400);

  return [{
    name: name.slice(0, 200),
    startDate: date,
    url: pageUrl,
    description,
    image: ogImage,
  }];
}

// --- WordPress discovery -----------------------------------------------------

export function looksLikeWordPress(html) {
  const source = String(html ?? '');
  return /<meta name=["']generator["'][^>]+WordPress/i.test(source)
    || /\/wp-json\//i.test(source)
    || /\/wp-content\//i.test(source);
}

/** The category id a WordPress archive page announces about itself. */
export function wpCategoryId(html) {
  const m = String(html ?? '').match(/wp-json\/wp\/v2\/categories\/(\d+)/i);
  return m ? m[1] : null;
}

// --- a rule instead of a script ---------------------------------------------
//
// When a site exposes no structured data, the honest way to teach the collector
// about it is a DECLARATIVE RULE: which element repeats, and which selector
// inside it holds the title, the date, the link. A rule is data — readable,
// versionable, correctable by hand, and safe to accept from an AI, because
// nothing it says is ever executed. The alternative (an AI writing a scraper
// script that the server runs) is remote code execution by design: the model's
// input is a stranger's HTML.
//
// The interpreter below is deliberately self-contained. The same file runs in
// the Edge Function preview and in the worker — the worker renders the page with
// Playwright first and then hands this code the resulting HTML — so what the
// operator sees when testing a rule is what production will extract.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

// Tags that implicitly close a previous sibling of the same name.
const SELF_CLOSING_SIBLINGS = new Set(['li', 'p', 'tr', 'td', 'th', 'option', 'dd', 'dt']);

const ATTR_RE = /([a-zA-Z_:@][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(raw) {
  const attrs = {};
  if (!raw) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(raw))) {
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[m[1].toLowerCase()] = value;
  }
  return attrs;
}

/**
 * Tolerant tag-soup parser. Real pages are not well-formed, so unmatched close
 * tags pop up to the nearest match and are otherwise ignored.
 */
export function parseHtml(html) {
  const source = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const tagRe = /<(\/)?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let last = 0;
  let m;

  const addText = (text) => {
    if (!text) return;
    const trimmed = text.replace(/\s+/g, ' ');
    if (!trimmed.trim()) return;
    stack[stack.length - 1].children.push({ tag: '#text', text: trimmed });
  };

  while ((m = tagRe.exec(source))) {
    addText(source.slice(last, m.index));
    last = tagRe.lastIndex;
    const closing = Boolean(m[1]);
    const tag = m[2].toLowerCase();
    const rest = m[3] || '';

    if (closing) {
      // Pop to the nearest matching open tag; ignore a stray close tag.
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }

    if (SELF_CLOSING_SIBLINGS.has(tag) && stack[stack.length - 1].tag === tag) stack.pop();

    const node = { tag, attrs: parseAttrs(rest), children: [], parent: stack[stack.length - 1] };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(rest)) stack.push(node);
  }
  addText(source.slice(last));
  return root;
}

export function textOf(node) {
  if (!node) return '';
  if (node.tag === '#text') return node.text ?? '';
  return (node.children ?? []).map(textOf).join(' ');
}

function elements(node, out = []) {
  for (const child of node.children ?? []) {
    if (child.tag === '#text') continue;
    out.push(child);
    elements(child, out);
  }
  return out;
}

// --- the selector subset -----------------------------------------------------
// tag, *, .class, #id, [attr], [attr=v], [attr*=v], [attr^=v], [attr$=v],
// combined into compounds, joined by descendant (space) or child (>) combinators,
// and grouped with commas. Deliberately no pseudo-classes: a rule must stay
// something a person can read and correct.

// One pseudo-class earns its place: ":nth-of-type(2)" is how you say "the second
// meta line", and Hungarian listings repeat an identical wrapper for date and
// venue. Anything more expressive (:has, :not, 2n+1) stays out.
const COMPOUND_RE = /^(\*|[a-zA-Z][\w:-]*)?((?:[.#][\w-]+|\[[^\]]+\])*)(:nth-of-type\((\d{1,3})\))?$/;
const PART_RE = /([.#][\w-]+)|(\[[^\]]+\])/g;

function parseCompound(text) {
  const trimmed = text.trim();
  const m = COMPOUND_RE.exec(trimmed);
  if (!m) return null;
  const compound = {
    tag: m[1] && m[1] !== '*' ? m[1].toLowerCase() : null,
    classes: [], id: null, attrs: [],
    nthOfType: m[4] ? Number(m[4]) : null,
  };
  PART_RE.lastIndex = 0;
  let part;
  while ((part = PART_RE.exec(m[2] || ''))) {
    if (part[1]?.startsWith('.')) compound.classes.push(part[1].slice(1));
    else if (part[1]?.startsWith('#')) compound.id = part[1].slice(1);
    else if (part[2]) {
      const body = part[2].slice(1, -1);
      const attr = body.match(/^([-\w:]+)\s*(?:([*^$]?)=\s*"?'?([^"']*)"?'?)?$/);
      if (!attr) return null;
      compound.attrs.push({ name: attr[1].toLowerCase(), op: attr[2] || (attr[3] !== undefined ? '' : null), value: attr[3] ?? null });
    }
  }
  return compound;
}

export function parseSelector(selector) {
  const groups = [];
  for (const group of String(selector ?? '').split(',')) {
    const tokens = group.trim().split(/\s*(>)\s*|\s+/).filter((t) => t !== undefined && t !== '');
    if (!tokens.length) continue;
    const steps = [];
    let combinator = ' ';
    let ok = true;
    for (const token of tokens) {
      if (token === '>') { combinator = '>'; continue; }
      const compound = parseCompound(token);
      if (!compound) { ok = false; break; }
      steps.push({ compound, combinator });
      combinator = ' ';
    }
    if (ok && steps.length) groups.push(steps);
  }
  return groups;
}

function matchesCompound(node, compound) {
  if (!node || node.tag === '#text' || node.tag === '#root') return false;
  if (compound.tag && node.tag !== compound.tag) return false;
  if (compound.id && node.attrs.id !== compound.id) return false;
  if (compound.classes.length) {
    const classes = String(node.attrs.class ?? '').split(/\s+/);
    if (!compound.classes.every((c) => classes.includes(c))) return false;
  }
  for (const attr of compound.attrs) {
    const value = node.attrs[attr.name];
    if (value === undefined) return false;
    if (attr.op === null || attr.value === null) continue;
    if (attr.op === '' && value !== attr.value) return false;
    if (attr.op === '*' && !value.includes(attr.value)) return false;
    if (attr.op === '^' && !value.startsWith(attr.value)) return false;
    if (attr.op === '$' && !value.endsWith(attr.value)) return false;
  }
  if (compound.nthOfType) {
    const siblings = (node.parent?.children ?? []).filter((c) => c.tag === node.tag);
    if (siblings.indexOf(node) !== compound.nthOfType - 1) return false;
  }
  return true;
}

function matchesSteps(node, steps) {
  let index = steps.length - 1;
  if (!matchesCompound(node, steps[index].compound)) return false;
  let current = node;
  for (index -= 1; index >= 0; index -= 1) {
    const { compound, combinator } = steps[index + 1];
    if (combinator === '>') {
      current = current.parent;
      if (!current || !matchesCompound(current, steps[index].compound)) return false;
    } else {
      let ancestor = current.parent;
      let found = false;
      while (ancestor) {
        if (matchesCompound(ancestor, steps[index].compound)) { found = true; break; }
        ancestor = ancestor.parent;
      }
      if (!found) return false;
      current = ancestor;
    }
  }
  return true;
}

export function queryAll(root, selector) {
  const groups = parseSelector(selector);
  if (!groups.length) return [];
  return elements(root).filter((node) => groups.some((steps) => matchesSteps(node, steps)));
}

export function queryFirst(root, selector) {
  return queryAll(root, selector)[0] ?? null;
}

// --- rule validation and application ----------------------------------------

const FIELD_NAMES = ['title', 'date', 'time', 'url', 'image', 'location', 'city', 'price', 'description'];
const ATTR_NAME_RE = /^[a-zA-Z_:@][-\w:.]*$/;
const DATE_FORMATS = new Set(['auto', 'hu', 'iso']);

/**
 * A rule is data, so it is checked like data: every selector must parse, every
 * field must be one we know, and anything unexpected is reported rather than
 * silently ignored. A rule that "matches nothing" because of a typo is the
 * failure mode this catches.
 */
export function validateRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { ok: false, errors: ['A szabály nem objektum.'] };
  }
  if (rule.version !== undefined && rule.version !== 1) errors.push('Ismeretlen szabály-verzió (csak 1 támogatott).');

  if (typeof rule.container !== 'string' || !rule.container.trim()) {
    errors.push('Hiányzik a "container" szelektor.');
  } else if (!parseSelector(rule.container).length) {
    errors.push(`A "container" szelektor nem értelmezhető: ${rule.container}`);
  }

  const fields = rule.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    errors.push('Hiányzik a "fields" objektum.');
  } else {
    for (const [name, field] of Object.entries(fields)) {
      if (!FIELD_NAMES.includes(name)) {
        errors.push(`Ismeretlen mező: ${name} (használható: ${FIELD_NAMES.join(', ')})`);
        continue;
      }
      if (!field || typeof field !== 'object') {
        errors.push(`A(z) "${name}" mező nem objektum.`);
        continue;
      }
      if (field.selector !== undefined) {
        if (typeof field.selector !== 'string' || !parseSelector(field.selector).length) {
          errors.push(`A(z) "${name}" szelektora nem értelmezhető: ${field.selector}`);
        }
      }
      if (field.attr !== undefined && (typeof field.attr !== 'string' || !ATTR_NAME_RE.test(field.attr))) {
        errors.push(`A(z) "${name}" mező "attr" értéke érvénytelen.`);
      }
    }
    if (!fields.title) errors.push('A "title" mező kötelező.');
    if (!fields.date) errors.push('A "date" mező kötelező.');
  }

  if (rule.dateFormat !== undefined && !DATE_FORMATS.has(rule.dateFormat)) {
    errors.push(`Ismeretlen "dateFormat": ${rule.dateFormat} (auto | hu | iso)`);
  }
  if (rule.limit !== undefined && (!Number.isInteger(rule.limit) || rule.limit < 1 || rule.limit > 500)) {
    errors.push('A "limit" 1 és 500 közötti egész szám lehet.');
  }
  return { ok: errors.length === 0, errors };
}

function readField(container, field, pageUrl) {
  if (!field) return null;
  const node = field.selector ? queryFirst(container, field.selector) : container;
  if (!node) return null;
  const attr = field.attr || 'text';
  if (attr === 'text') {
    const value = decodeEntities(textOf(node));
    return value || null;
  }
  const raw = node.attrs?.[attr.toLowerCase()];
  if (raw === undefined || raw === '') return null;
  return attr === 'href' || attr === 'src' ? (absoluteUrl(pageUrl, raw) ?? raw) : decodeEntities(raw);
}

// An ISO timestamp carries its own time; reading it back out of the string
// with a generic clock pattern picks up the seconds instead.
const ISO_DATETIME_RE = /(\d{4})-(\d{2})-(\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d))?/;
const TIME_RE = /(?<![\d:])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d:])/;
const PRICE_RE = /(\d[\d\s.,]{1,12})\s*(Ft|HUF|EUR|€)/i;

function toDateTime(value, format, parseHu) {
  if (!value) return null;
  const text = String(value);
  const iso = text.match(ISO_DATETIME_RE);
  if (iso && format !== 'hu') {
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: iso[4] ? `${iso[4]}:${iso[5]}` : null };
  }
  if (format === 'iso') return null;
  const parsed = parseHu(text);
  return parsed ? { date: parsed, time: null } : null;
}

function toPrice(value) {
  if (!value) return {};
  const m = String(value).match(PRICE_RE);
  if (!m) return {};
  const amount = Number(m[1].replace(/[\s.]/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return {};
  const unit = m[2].toUpperCase();
  return { price_min: amount, currency: unit === 'FT' ? 'HUF' : (unit === '€' ? 'EUR' : unit) };
}

/**
 * Applies a validated rule to a page. The worker passes the HTML Playwright
 * produced, the Edge Function passes the HTML it fetched — same code, same
 * result for the same input.
 */
export function extractWithRule(html, rule, pageUrl, { parseDate = parseHuTextDate } = {}) {
  const check = validateRule(rule);
  if (!check.ok) return { events: [], errors: check.errors };

  const root = parseHtml(html);
  const containers = queryAll(root, rule.container).slice(0, rule.limit ?? 200);
  const format = rule.dateFormat ?? 'auto';
  const events = [];
  const seen = new Set();

  for (const container of containers) {
    const name = readField(container, rule.fields.title, pageUrl);
    const dateText = readField(container, rule.fields.date, pageUrl);
    const parsed = toDateTime(dateText, format, parseDate);
    if (!name || name.length < 3 || !parsed) continue;
    const startDate = parsed.date;

    // A dedicated time field wins; then the timestamp's own time; only then a
    // clock pattern found in the date text.
    const timeField = readField(container, rule.fields.time, pageUrl);
    const fieldClock = timeField ? timeField.match(TIME_RE) : null;
    const textClock = dateText ? dateText.match(TIME_RE) : null;
    const asClock = (m) => `${m[1].padStart(2, '0')}:${m[2]}`;
    // A timestamp's own time beats a pattern found in free text, where a UTC
    // offset ("+02:00") reads exactly like a clock.
    const time = fieldClock ? asClock(fieldClock) : (parsed.time ?? (textClock ? asClock(textClock) : null));
    const key = `${name.toLowerCase()}|${startDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const location = readField(container, rule.fields.location, pageUrl);
    events.push({
      name: name.slice(0, 200),
      startDate: time ? `${startDate}T${time}` : startDate,
      url: readField(container, rule.fields.url, pageUrl) ?? pageUrl,
      description: (readField(container, rule.fields.description, pageUrl) ?? '').slice(0, 800) || null,
      image: readField(container, rule.fields.image, pageUrl),
      location: location ? location.slice(0, 160) : null,
      city: readField(container, rule.fields.city, pageUrl),
      offers: toPrice(readField(container, rule.fields.price, pageUrl)),
    });
  }

  const errors = [];
  if (!containers.length) errors.push(`A "container" szelektor egyetlen elemre sem illeszkedik: ${rule.container}`);
  else if (!events.length) errors.push('Vannak illeszkedő elemek, de egyikből sem jött ki cím és dátum — ellenőrizd a "title" és a "date" szelektort.');
  return { events, errors };
}

// --- picking the part of the page worth showing a model ----------------------
//
// A rule generator does not need the whole document, and sending it is both
// expensive and less accurate. What matters is the block where one structure
// REPEATS. This finds the class that occurs most often on the page, slices the
// markup around its first few occurrences, and hands back both the snippet and
// the class as a starting suggestion — so even without a model, an operator has
// a candidate container selector to try.

const NOISE_RE = /<(script|style|svg|noscript|iframe|head)[\s\S]*?<\/\1>/gi;
const CLASS_RE = /class=["']([^"']+)["']/gi;

// Utility-first frameworks put dozens of classes on every element; a container
// class is a name, not a style stack.
const UTILITY_RE = /^(?:[a-z]+-\d|[mp][txyblr]?-|w-|h-|flex|grid|text-|bg-|border|rounded|shadow|gap-|items-|justify-|hidden|block|inline|absolute|relative|z-\d|col-|row-|container|wrapper|clearfix|sr-only|fa[srlbd]?$|fa-|icon|dropdown|navbar|nav-|menu|btn|swiper|slick|modal|offcanvas|carousel|collapse|tooltip|popover|badge|breadcrumb)/i;

function candidateClasses(html) {
  const counts = new Map();
  CLASS_RE.lastIndex = 0;
  let m;
  while ((m = CLASS_RE.exec(html))) {
    for (const name of m[1].split(/\s+/)) {
      if (!name || name.length < 3 || name.length > 40) continue;
      if (UTILITY_RE.test(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3 && n <= 400)
    // An event card class is repeated often and usually says what it is.
    .sort((a, b) => (scoreClass(b[0], b[1]) - scoreClass(a[0], a[1])))
    .slice(0, 6);
}

const MEANINGFUL_RE = /(event|program|esemeny|rendezveny|card|item|entry|post|listing|teaser|koncert|eloadas)/i;

function scoreClass(name, count) {
  return count + (MEANINGFUL_RE.test(name) ? 40 : 0);
}

/**
 * Returns a representative slice of the page plus the most likely container
 * class, capped so it stays cheap to send and quick to read.
 */
export function sampleRepeatingBlock(html, { maxChars = 12000 } = {}) {
  const source = String(html ?? '').replace(NOISE_RE, ' ');
  const ranked = candidateClasses(source);
  const hint = ranked.length ? `.${ranked[0][0]}` : null;

  if (!hint) {
    const body = source.indexOf('<body');
    return { snippet: source.slice(body >= 0 ? body : 0, (body >= 0 ? body : 0) + maxChars), hintSelector: null, candidates: [] };
  }

  const needle = ranked[0][0];
  const first = source.search(new RegExp(`class=["'][^"']*\\b${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`));
  const start = Math.max(0, (first < 0 ? 0 : first) - 400);
  return {
    snippet: source.slice(start, start + maxChars),
    hintSelector: hint,
    candidates: ranked.map(([name, count]) => ({ selector: `.${name}`, occurrences: count })),
  };
}

// --- the inspector ----------------------------------------------------------

function futureCount(events) {
  return events.filter((e) => isFutureIsoDate(e.startDate)).length;
}

function sample(events, limit = 6) {
  return events
    .filter((e) => isFutureIsoDate(e.startDate))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
    .slice(0, limit)
    .map((e) => ({
      title: e.name,
      date: String(e.startDate).slice(0, 10),
      time: String(e.startDate).slice(11, 16) || null,
      url: e.url || null,
      location: e.location || e.city || null,
    }));
}

/**
 * Inspects one URL and returns every recipe that produced dated future programs,
 * best first. `fetchText(url)` must resolve to { ok, status, text, contentType }.
 */
export async function inspectSource(inputUrl, { fetchText, maxDetailFetches = 6 } = {}) {
  const url = normalizeSourceUrl(inputUrl);
  const warnings = [];
  if (!url) {
    return { url: null, homepageUrl: null, publisherName: null, candidates: [], warnings: ['Érvénytelen webcím.'] };
  }

  if (isSocialUrl(url)) {
    return {
      url,
      homepageUrl: new URL(url).origin,
      publisherName: new URL(url).pathname.split('/').filter(Boolean)[0] || null,
      candidates: [{
        strategy: 'social',
        ...RECIPES.social,
        confidence: 0,
        endpointUrl: url,
        eventCount: 0,
        samples: [],
        evidence: 'A Facebook és az Instagram bejelentkezés nélkül nem adja ki az események listáját.',
      }],
      warnings: [
        'Közösségi oldalról nem tudunk automatikusan programot gyűjteni: az oldal bejelentkezést kér, és a felhasználói fiókkal történő lekérés a platform szabályzatába ütközik.',
        'Add meg helyette a szervező saját weboldalát (ott szinte mindig van esemény- vagy naptároldal), vagy vedd fel a programot kézzel.',
      ],
    };
  }

  const page = await fetchText(url);
  if (!page.ok) {
    return {
      url, homepageUrl: new URL(url).origin, publisherName: null,
      candidates: [], warnings: [`Az oldal nem érhető el (HTTP ${page.status}).`],
    };
  }

  let html = page.text;
  let listingUrl = url;
  const publisherName = guessPublisherName(html, url);
  const homepageUrl = new URL(url).origin;
  const candidates = [];
  const origin = new URL(url).origin;

  const addCandidate = (strategy, endpointUrl, events, evidence) => {
    const count = futureCount(events);
    if (!count) return;
    candidates.push({
      strategy,
      ...RECIPES[strategy],
      endpointUrl,
      eventCount: count,
      samples: sample(events),
      evidence,
      confidence: Math.min(100, 55 + Math.min(40, count * 2) + (RECIPES[strategy].needsBrowser ? 0 : 5)),
    });
  };

  // The link may point at a home page; follow the site's own events link once.
  const tryHub = async () => {
    const hub = findEventHub(html, listingUrl);
    if (!hub || hub === listingUrl) return false;
    const hubPage = await fetchText(hub);
    if (!hubPage.ok || !hubPage.text) return false;
    html = hubPage.text;
    listingUrl = hub;
    warnings.push(`A megadott oldalon nem volt program, ezért az oldal saját eseménylistáját használjuk: ${hub}`);
    return true;
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // 1. iCalendar feed
    const icsHref = html.match(/<link[^>]+type=["']text\/calendar["'][^>]+href=["']([^"']+)["']/i)?.[1]
      || html.match(/href=["'](webcal:\/\/[^"']+)["']/i)?.[1]
      || html.match(/href=["']([^"']+\.ics(?:\?[^"']*)?)["']/i)?.[1];
    if (icsHref) {
      const icsUrl = absoluteUrl(listingUrl, icsHref);
      const feed = icsUrl ? await fetchText(icsUrl) : null;
      if (feed?.ok && /BEGIN:VCALENDAR/i.test(feed.text)) {
        addCandidate('ics', icsUrl, parseIcs(feed.text), 'A oldal iCalendar naptár-feedet közöl.');
      }
    }

    // 2. The Events Calendar REST API
    if (/tribe[-_]events|the-events-calendar/i.test(html)) {
      const apiUrl = `${origin}/wp-json/tribe/events/v1/events?per_page=50&start_date=${todayIso()}`;
      const api = await fetchText(apiUrl);
      if (api.ok) {
        try {
          addCandidate('tribe', apiUrl, parseTribeEvents(JSON.parse(api.text), listingUrl),
            'WordPress "The Events Calendar" API válaszol.');
        } catch { /* not JSON — the plugin is present but the API is closed */ }
      }
    }

    // 2b. WordPress without an events plugin: the programs are in the articles.
    if (!candidates.length && looksLikeWordPress(html)) {
      const category = wpCategoryId(html);
      const postsUrl = `${origin}/wp-json/wp/v2/posts?per_page=20`
        + (category ? `&categories=${category}` : '')
        + '&_fields=id,link,title,excerpt,content';
      const api = await fetchText(postsUrl);
      if (api.ok) {
        try {
          const posts = JSON.parse(api.text);
          const mined = parseWpPosts(posts);
          addCandidate('wp-posts', postsUrl, mined,
            `A WordPress cikk-API ${Array.isArray(posts) ? posts.length : 0} cikkét átnézve `
            + `${futureCount(mined)} datált program jött ki a cikkek szövegéből.`);
        } catch { /* not JSON — the REST API is closed */ }
      }
    }

    // 3. ICS Calendar plugin grid
    if (/ics-calendar|ics_calendar/i.test(html)) {
      addCandidate('wp-ics-calendar', listingUrl, parseWpIcsCalendar(html, listingUrl),
        'WordPress "ICS Calendar" naptár-rács található az oldalon.');
    }

    // 4. JSON-LD on the listing itself
    addCandidate('jsonld', listingUrl, parseJsonLdEvents(html, listingUrl),
      'Az oldal schema.org Event adatokat közöl.');

    // 5. RSS/Atom — only counts if the items really are dated programs
    const feedHref = html.match(/<link[^>]+type=["']application\/(?:rss\+xml|atom\+xml)["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (feedHref && !/comments?[-_/]?feed/i.test(feedHref)) {
      const feedUrl = absoluteUrl(listingUrl, feedHref);
      const feed = feedUrl ? await fetchText(feedUrl) : null;
      if (feed?.ok) {
        const items = parseFeed(feed.text).slice(0, maxDetailFetches);
        const events = [];
        for (const item of items) {
          const detail = await fetchText(item.link);
          if (!detail.ok) continue;
          events.push(...parseJsonLdEvents(detail.text, item.link));
        }
        addCandidate('rss', feedUrl, events,
          `A hírfolyam ${items.length} elemét megnyitva ${futureCount(events)} datált program jött ki.`);
      }
    }

    if (candidates.length || attempt === 1) break;
    if (!(await tryHub())) break;
  }

  // A page that is one event's own page is not a catalogue, and reporting
  // "nothing found" there is simply wrong.
  if (!candidates.length) {
    addCandidate('page-prose', listingUrl, parseProsePage(html, listingUrl),
      'Ez egy rendezvény saját oldala, nem programlista — a dátum a szövegben szerepel.');
  }

  // Nothing matched a known format: offer the declarative-rule route with a
  // starting point, so the operator (or a model) has something to correct
  // rather than a blank field.
  if (!candidates.length) {
    const block = sampleRepeatingBlock(html);
    candidates.push({
      strategy: 'selector',
      ...RECIPES.selector,
      endpointUrl: listingUrl,
      eventCount: 0,
      samples: [],
      evidence: block.hintSelector
        ? `Nincs ismert formátum, de a leggyakrabban ismétlődő elem: ${block.hintSelector} `
          + `(${block.candidates[0]?.occurrences ?? 0} db). Innen indulhat a szabály.`
        : 'Nincs ismert formátum, és ismétlődő elemet sem találtunk — a szabályt kézzel kell megadni.',
      confidence: 30,
      ruleTemplate: {
        version: 1,
        container: block.hintSelector ?? '.event',
        fields: {
          title: { selector: 'h1, h2, h3, .title' },
          date: { selector: 'time, .date, .datum' },
          url: { selector: 'a', attr: 'href' },
        },
        dateFormat: 'auto',
      },
      containerCandidates: block.candidates,
    });
  }

  // Rendering is always possible; offer it whenever nothing better was proven,
  // and as a second option when something was.
  candidates.push({
    strategy: 'render',
    ...RECIPES.render,
    endpointUrl: listingUrl,
    eventCount: 0,
    samples: [],
    evidence: 'Tartalék megoldás: teljes böngészővel töltjük be az oldalt, és a próbafuttatás mutatja meg az eredményt.',
    confidence: candidates.length ? 20 : 40,
  });

  candidates.sort((a, b) => b.confidence - a.confidence || b.eventCount - a.eventCount);
  if (candidates.length === 1) {
    // Say what the page actually is; "no structured data" sends the operator
    // looking for a hidden API that is usually not there.
    warnings.push(looksLikeWordPress(html)
      ? 'Ez az oldal WordPress, de nincs rajta eseménynaptár-bővítmény, és a cikkeiből sem jött ki datált program. Valószínűleg magazin- vagy hírkategória, nem programlista — keresd meg a szervező eseménynaptárát, vagy indíts próbafuttatást a böngészős betöltéssel.'
      : 'Nem találtunk datált programot az oldalon: sem strukturált esemény-adatot, sem szövegben felismerhető dátumot. A böngészős betöltés még működhet — mentés után indíts próbafuttatást.');
  }

  return { url: listingUrl, homepageUrl, publisherName, candidates, warnings };
}
