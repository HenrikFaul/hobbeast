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
    warnings.push('Strukturált esemény-adatot nem találtunk az oldalon. A böngészős betöltés még működhet — mentés után indíts próbafuttatást.');
  }

  return { url: listingUrl, homepageUrl, publisherName, candidates, warnings };
}
