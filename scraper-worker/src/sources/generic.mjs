// Generic event extractor for registry-driven sources.
//
// Pattern (proven on jegy.hu in v1.15.0, generalized here):
//   1. Render the source's LISTING page with Playwright (client-side sites too).
//   2. Collect same-host event-detail links via URL heuristics.
//   3. Static-fetch each DETAIL page (robots-gated) and parse its JSON-LD *Event*.
//   4. Enrich: image (JSON-LD or og:image), description (JSON-LD or og/meta),
//      ticket offer (price, currency, purchase URL), venue/address/city.
// Sources whose detail pages carry no structured Event data yield 0 — visible in
// the admin scraper stats, so weak sources can be triaged without code changes.

import crypto from 'node:crypto';
// The Hungarian date vocabulary lives in recipes.mjs so that the Edge Function,
// which bundles only that file, parses dates exactly the way the worker does.
import { foldHu, parseHuTextDate, decodeEntities, parseJsonLdBlock, jsonLdNodes } from './recipes.mjs';
// Non-Hungarian sources need their own path words, month names and nav words.
// localeFor() returns null for HU and for anything unrecognised, so a Hungarian
// source keeps exactly the behaviour it had before locales existed.
import {
  localeFor, localeEventPathRe, localeMonthPattern,
  parseLocaleTextDate, isLocaleNavigationTitle,
} from './locales.mjs';
// The persistent per-source detail queue. A planner in the crawlFrontier.mjs
// mould — pure, injectable, no network of its own — the worker supplies the
// queue and the fetch through the `frontier` option of scrapeGenericSource.
import { runCollectionFrontier } from './collectionFrontier.mjs';

export { foldHu, parseHuTextDate };

// Hungarian event-page URL vocabulary. "ajanlat" matters: programturizmus.hu
// (22 registered sources) publishes every event as /ajanlat-{slug}.html.
const EVENT_LINK_RE = /\/(program(?:ok|ajanlo)?|ajanlat|event(?:s)?|esemeny(?:ek)?|koncert(?:ek)?|musor|eloadas(?:ok)?|rendezveny(?:ek)?|tura(?:k)?|hikeplans|show|naptar|kalendarium|fesztival(?:ok)?|workshop(?:ok)?|kiallitas(?:ok)?|kviz|quiz|tanfolyam(?:ok)?|kurzus(?:ok)?|seta(?:k)?|buli(?:k)?|party)(?:[/\-_?#]|$)/i;
const DATED_LINK_RE = /20(2[5-9])[/\-.]?(0[1-9]|1[0-2])[/\-.]?(0[1-9]|[12]\d|3[01])?/;

// An opaque numeric id in the path is the one language-independent hint that a
// URL is an item page rather than a listing — /e/48213-koncert, /d/9912345.
// Ticketing and CMS sites abroad lean on it heavily, and no keyword vocabulary
// can catch them. Tightened from the grepsearch original (which accepts any
// 4+ digit segment): 5+ digits, or 4+ digits immediately followed by a slug
// hyphen. The looser form would swallow bare year segments like /blog/2019/
// and /wp-content/uploads/2018/.
const NUMERIC_ID_LINK_RE = /\/(?:\d{5,}(?:[/-]|$)|\d{4,}-[a-z])/i;

export function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

/**
 * A full ISO date sitting in a URL PATH, e.g.
 * /predstavenie/17366/2026-09-03/19-00/blazni-z-valencie. Language-independent
 * and unambiguous, unlike a rendered date string. Returns null for anything
 * that is not a real calendar date, so /2026-13-45/ is rejected rather than
 * becoming an event.
 */
export function dateFromUrlPath(url) {
  if (!url) return null;
  let pathname;
  try { pathname = new URL(url).pathname; } catch { pathname = String(url); }
  const m = pathname.match(/\/(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:\/|$)/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  // Rejects 2026-02-31, which the regex alone would happily accept.
  if (probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function normalizeEndpointUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, 'https:');
  try { return new URL(u).toString(); } catch { return null; }
}

// A JSON-LD startDate is supposed to be ISO 8601, but a site that builds its
// structured data in the browser often serialises a JS Date instead, giving
// "Sat Sep 05 2026 13:00:00 GMT+0200 (Central European Summer Time)". GoOut
// does exactly this: 36 perfectly good Prague events, every one discarded.
// Only dates the ISO branch already rejects reach the fallback, so this can
// add events but never change one that parses today.
const DATE_SANITY_MIN = Date.UTC(2015, 0, 1);
const DATE_SANITY_MAX = Date.UTC(2040, 0, 1);

export function parseEventDate(raw) {
  if (!raw || typeof raw !== 'string') return { date: null, time: null };
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/);
  if (m) return { date: m[1], time: m[2] ? `${m[2]}:00` : null };

  const parsed = Date.parse(raw.trim());
  // Bounded so a stray "2" or a phone number cannot become an event date.
  if (!Number.isFinite(parsed) || parsed < DATE_SANITY_MIN || parsed > DATE_SANITY_MAX) {
    return { date: null, time: null };
  }
  // Read the wall-clock fields the site wrote, not a UTC-shifted version of
  // them: an event at 00:30 local must not drift onto the previous day.
  const d = new Date(parsed);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = hh === '00' && mm === '00' ? null : `${hh}:${mm}:00`;
  return { date, time };
}

/**
 * Event-hub links on a site's home page: "/programok", "/esemenyek",
 * "/rendezvenyek", "/esemenynaptar". 97 registered sources point at a home page
 * rather than the calendar, so when a listing yields nothing we follow the most
 * promising hub once and report the better URL back for a durable fix.
 */
// The LAST path segment must be (or end with) a hub word, so "/programok" and
// "/aktualitasok/kiemelt-rendezvenyek" both qualify. The length guard rejects
// prose slugs that merely end in a hub word, e.g.
// "/letoltheto-tervek-koncepciok-kozep-es-hosszutavu-programok".
const HUB_SEGMENT_RE = /(^|-)(programok|programjaink|esemenyek|esemenynaptar|rendezvenyek|rendezvenynaptar|programnaptar|naptar|kalendarium|events|programs)$/i;
// An archive of past programs looks like a hub ("/events/past-events") but can
// only ever yield expired entries, which the ingest then discards.
const ARCHIVE_SEGMENT_RE = /(^|-)(past|previous|archiv|archive|korabbi|elmult|regi|volt)-/i;
const HUB_SEGMENT_MAX_LEN = 30;
const HUB_MAX_DEPTH = 3;

export function findEventHubUrl(links, listingUrl) {
  const current = listingUrl.split('?')[0].replace(/\/$/, '');
  let host;
  try { host = new URL(listingUrl).host.replace(/^www\./, ''); } catch { return null; }
  const seen = [];
  for (const raw of links || []) {
    let url;
    try { url = new URL(raw); } catch { continue; }
    if (url.host.replace(/^www\./, '') !== host) continue;
    if (url.toString().split('?')[0].replace(/\/$/, '') === current) continue;
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length || segments.length > HUB_MAX_DEPTH) continue;
    const last = segments[segments.length - 1];
    if (last.length > HUB_SEGMENT_MAX_LEN) continue;
    if (!HUB_SEGMENT_RE.test(last)) continue;
    if (ARCHIVE_SEGMENT_RE.test(last) || segments.some((seg) => ARCHIVE_SEGMENT_RE.test(seg))) continue;
    seen.push(url.toString());
  }
  // Shortest path first: "/programok" beats "/hirek/programok".
  seen.sort((a, b) => a.length - b.length);
  return seen[0] || null;
}

/**
 * Calendar day-links, pagers and "show all" controls carry a date and a title,
 * so they look exactly like event cards. A title that spells out a full date is
 * a "jump to this day" link, never an event name.
 */
export function isNavigationTitle(title) {
  const folded = foldHu(title);
  if (folded.length < 10) return true;
  if (/^(esemenynaptar|napta|kalendarium|kovetkezo|elozo|tovabb|osszes|vissza|kezdolap|fooldal|tobb|mutasd|betolt|reszletek)/.test(folded)) return true;
  return /20\d{2}\.?\s*(januar|februar|marcius|aprilis|majus|junius|julius|augusztus|szeptember|oktober|november|december)\.?\s*\d{1,2}/.test(folded);
}

function firstString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === 'object') return firstString(v.url || v.contentUrl || v.name);
  return null;
}

export function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Read price, currency and ticket link out of a schema.org offers value.
 *
 * The old version returned on the FIRST offer object, so an offers[] whose
 * first entry is a bare `{"@type":"Offer","availability":"InStock"}` — very
 * common on ticketing sites — masked the real price sitting in entry two. This
 * keeps scanning until it finds a price, while still binding ticket_url to the
 * first offer that carries a link, because buildEvent derives external_url
 * from it and the first link is the canonical one.
 */
function parseOffers(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  let price_min = null;
  let currency = null;
  let ticket_url = null;
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    if (ticket_url === null && typeof o.url === 'string' && /^https?:\/\//.test(o.url)) {
      ticket_url = o.url;
    }
    if (currency === null && typeof o.priceCurrency === 'string') {
      currency = o.priceCurrency.slice(0, 8);
    }
    if (price_min !== null) continue;
    // highPrice covers AggregateOffer ranges and sold-out "from X" listings.
    const raw = o.lowPrice ?? o.price ?? o.highPrice;
    // "" and " " must not become 0 — Number('') is 0, which would publish a
    // paid event as free.
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    price_min = n;
    if (typeof o.priceCurrency === 'string') currency = o.priceCurrency.slice(0, 8);
  }
  return { price_min, currency, ticket_url };
}

export function extractJsonLdEvents(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseJsonLdBlock(b[1]);
    if (!parsed) continue;
    // Walk the whole document, not just the top level and @graph: venue sites
    // routinely hang their programme off mainEntity / hasPart / subEvent, and
    // the old two-level read found nothing there. The @type test below stays
    // deliberately loose (/Event/i) — a strict allowlist would drop
    // EventSeries and cost yield on both HU and foreign sources.
    const arr = jsonLdNodes(parsed);
    for (const it of arr) {
      if (!it || typeof it !== 'object' || !/Event/i.test(String(it['@type'] || ''))) continue;
      const loc = it.location && typeof it.location === 'object' ? it.location : null;
      const addr = loc?.address;
      out.push({
        name: firstString(it.name),
        startDate: firstString(it.startDate),
        category: eventCategoryHint(it),
        location: firstString(loc?.name) || (typeof it.location === 'string' ? it.location : null),
        address: typeof addr === 'string' ? addr : firstString(addr?.streetAddress),
        city: addr && typeof addr === 'object' ? firstString(addr.addressLocality) : null,
        url: firstString(it.url),
        image: firstString(it.image),
        description: it.description ? stripHtml(it.description).slice(0, 500) : null,
        offers: parseOffers(it.offers),
      });
    }
  }
  return out;
}

export function extractOg(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
  return m ? m[1] : null;
}

export function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
  return m ? m[1] : null;
}

// Source sites routinely serve a "no image" filler, a logo or a tracking pixel
// where a photo belongs; those must never become an event image. Matching is
// anchored to path-segment boundaries so real photos are not caught by a
// substring — Songkick's ".../profile_images/artists/123/huge_avatar" is a
// genuine performer photo and must survive.
const JUNK_IMAGE_RE = /(^|[/_-])(no[-_]?image|placeholder|blank|spacer|pixel|1x1|transparent|sprite|favicon|logo|default[-_]?(img|image|thumb|avatar|photo))\d*([/_.-]|$)/i;

export function isUsableImage(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (JUNK_IMAGE_RE.test(url)) return false;
  // SVGs on event pages are almost always logos/icons, never photos.
  return !/\.svg(\?|#|$)/i.test(url);
}

/** Last-resort photo: the first content-looking <img> on the detail page. */
export function extractHeroImage(html, baseUrl) {
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const raw = tag[0].match(/\ssrc=["']([^"']+)["']/i)?.[1]
      || tag[0].match(/\sdata-src=["']([^"']+)["']/i)?.[1];
    if (!raw) continue;
    let absolute;
    try { absolute = new URL(raw, baseUrl).toString(); } catch { continue; }
    if (!isUsableImage(absolute)) continue;
    if (!/\.(jpe?g|png|webp)(\?|#|$)/i.test(absolute)) continue;
    return absolute;
  }
  return null;
}

/**
 * Decide each event's final image once the whole source is scraped.
 *
 * Some sites (eventland.eu is the proven case) put a single site-wide banner in
 * every event's JSON-LD `image`, while og:image carries the real per-event
 * photo. A candidate that many DIFFERENT event titles claim as their first
 * choice is therefore a site banner, not a photo — drop it and fall through to
 * the next candidate. Repeats of the SAME title (a recurring series) are
 * counted once, so a genuinely shared series image survives.
 */
export function resolveEventImages(events, { genericThreshold = 3 } = {}) {
  const titlesByUrl = new Map();
  for (const event of events) {
    const first = (event.image_candidates || [])[0];
    if (!first) continue;
    if (!titlesByUrl.has(first)) titlesByUrl.set(first, new Set());
    titlesByUrl.get(first).add(event.title);
  }
  const siteWide = new Set(
    [...titlesByUrl.entries()]
      .filter(([, titles]) => titles.size >= genericThreshold)
      .map(([url]) => url),
  );
  for (const event of events) {
    const candidates = event.image_candidates || [];
    event.image_url = candidates.find((url) => !siteWide.has(url)) || null;
    delete event.image_candidates;
  }
  return events;
}

/** Microdata fallback: a detail page marked up with itemtype schema.org/*Event. */
export function extractMicrodataEvent(html) {
  if (!/itemtype\s*=\s*["'][^"']*schema\.org\/[a-z]*event/i.test(html)) return null;
  const attr = (prop) => {
    const m = html.match(new RegExp(`itemprop=["']${prop}["'][^>]*(?:content|datetime)=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`(?:content|datetime)=["']([^"']+)["'][^>]*itemprop=["']${prop}["']`, 'i'));
    return m ? m[1] : null;
  };
  const inner = (prop) => {
    const m = html.match(new RegExp(`itemprop=["']${prop}["'][^>]*>([^<]{2,200})<`, 'i'));
    return m ? m[1].trim() : null;
  };
  const startDate = attr('startDate');
  const name = attr('name') || inner('name');
  if (!startDate || !name) return null;
  return {
    name,
    startDate,
    location: inner('location') || attr('location'),
    address: inner('streetAddress'),
    city: inner('addressLocality'),
    url: attr('url'),
    image: attr('image') || (html.match(/itemprop=["']image["'][^>]*src=["']([^"']+)["']/i)?.[1] ?? null),
    description: inner('description'),
    offers: { price_min: null, currency: null, ticket_url: null },
  };
}

export function hobbeastCategory(sourceCategories) {
  const t = (Array.isArray(sourceCategories) ? sourceCategories.join(' ') : String(sourceCategories || '')).toLowerCase();
  if (/koncert|zene|jazz|opera|fesztiv/.test(t)) return 'Zene';
  if (/túra|tura|hegym|boulder|falm|outdoor|kektura|természet|termeszet/.test(t)) return 'Természet & Túra';
  if (/társas|tarsas|kártya|kartya|kvíz|kviz|gamer|esport|lego/.test(t)) return 'Társasjáték';
  if (/színház|szinhaz|stand-?up|improviz/.test(t)) return 'Színház & Előadás';
  if (/gasztro|bor|street food|piknik|főzés|fozes/.test(t)) return 'Gasztro';
  if (/sport|futás|futas|jóga|joga|úszás|uszas|bicikli|wake/.test(t)) return 'Sport & Mozgás';
  if (/kiállítás|kiallitas|múzeum|muzeum|kultúra|kultura|irodalom/.test(t)) return 'Kultúra';
  if (/családi|csaladi|gyerek/.test(t)) return 'Családi';
  if (/tánc|tanc|salsa|bachata|swing/.test(t)) return 'Tánc';
  return 'Program';
}

// schema.org event subtypes, mapped to Hobbeast's own ten categories. The
// values here are deliberately Hobbeast's, never the raw schema.org word: the
// catalogue only understands these strings.
const TYPE_CATEGORY = {
  musicevent: 'Zene', festival: 'Zene',
  theaterevent: 'Színház & Előadás', comedyevent: 'Színház & Előadás',
  danceevent: 'Tánc',
  sportsevent: 'Sport & Mozgás',
  foodevent: 'Gasztro',
  childrensevent: 'Családi',
  exhibitionevent: 'Kultúra', visualartsevent: 'Kultúra',
  literaryevent: 'Kultúra', screeningevent: 'Kultúra',
};

/**
 * The event's OWN category, when its JSON-LD says what kind of thing it is.
 *
 * Until now every row took its category from the SOURCE's category list, which
 * is why a whole Prague aggregator landed under "Zene" — a tattoo market and a
 * drone expo included. schema.org @type is per-event and language-independent,
 * so it is a far better signal when present. Returns null when the node says
 * nothing useful, and the caller then falls back to the source-level guess.
 */
export function eventCategoryHint(node) {
  if (!node || typeof node !== 'object') return null;
  const raw = [].concat(node['@type'] ?? [])[0];
  const key = raw ? String(raw).replace(/^.*\//, '').toLowerCase() : '';
  if (TYPE_CATEGORY[key]) return TYPE_CATEGORY[key];
  // eventCategory/genre are free text; run them through the existing matcher so
  // only canonical Hobbeast values can ever come out.
  const free = firstString(node.eventCategory) || firstString(node.genre);
  if (free) {
    const guess = hobbeastCategory(free);
    if (guess !== 'Program') return guess;
  }
  return null;
}

/** Shared normalized-event builder used by every strategy (render/rss/tribe). */
export function buildEvent(source, ev, { listingUrl, detailUrl, idSeed = null }) {
  const { date, time } = parseEventDate(ev.startDate);
  if (!date || !ev.name) return null;
  const ticket = ev.offers || {};
  return {
    external_source: 'scraper',
    external_id: `${source.source_id}:${md5(idSeed || ev.url || detailUrl || `${ev.name}|${date}`).slice(0, 12)}`,
    external_url: ticket.ticket_url || ev.url || detailUrl,
    // JSON-LD routinely carries HTML-escaped text, and it reached the catalogue
    // raw: FALTER published a title reading `Claudia Märzendorfer &quot;A
    // Chicken Can&#039;t Lay a Duck&quot;`. Decoding is display-only and cannot
    // split or merge rows, because external_id is derived from the URL.
    title: decodeEntities(String(ev.name)).slice(0, 200),
    // The event's own schema.org type wins; the source's category list is the
    // fallback, exactly as before, so anything without a usable @type is
    // categorised the way it always was.
    category: ev.category || hobbeastCategory(source.categories),
    subcategory: null,
    tags: (Array.isArray(source.categories) ? source.categories : []).slice(0, 4),
    description: ev.description ? decodeEntities(String(ev.description)) : ev.description,
    event_date: date,
    event_time: time,
    location_type: 'address',
    location_city: ev.city || source.city || null,
    location_address: ev.location || ev.address || null,
    price_min: ticket.price_min,
    currency: ticket.currency,
    // Ranked candidates; resolveEventImages() picks the final one per source
    // once site-wide banners can be detected across the whole batch.
    image_candidates: [...new Set([ev.image, ...(ev.imageCandidates || [])].filter(isUsableImage))],
    image_url: [ev.image, ...(ev.imageCandidates || [])].find(isUsableImage) || null,
    organizer_name: source.publisher_name,
    source_payload: { source_id: source.source_id, listing: listingUrl, detail: detailUrl || null, jsonld: ev },
  };
}

/**
 * Detail-page parse shared by render and rss strategies: JSON-LD, then
 * microdata, then — when the page URL itself carries a full date (recon:
 * erasmuslifebudapest-style "/events/{slug}-2026-09-06" links) — og:title
 * plus that URL date as a last resort.
 */
export function extractDetailEvents(html, pageUrl = null) {
  const found = extractJsonLdEvents(html);
  if (!found.length) {
    const micro = extractMicrodataEvent(html);
    if (micro) found.push(micro);
  }
  if (!found.length && pageUrl) {
    const urlDate = pageUrl.match(/(20\d{2})[-.](0[1-9]|1[0-2])[-.](0[1-9]|[12]\d|3[01])/);
    const ogTitle = extractOg(html, 'title');
    if (urlDate && ogTitle) {
      found.push({
        name: stripHtml(ogTitle),
        startDate: `${urlDate[1]}-${urlDate[2]}-${urlDate[3]}`,
        url: pageUrl,
        image: null,
        description: null,
        offers: { price_min: null, currency: null, ticket_url: null },
      });
    }
  }
  const ogImage = extractOg(html, 'image');
  const ogDesc = extractOg(html, 'description');
  const twitterImage = extractMeta(html, 'twitter:image');
  const heroImage = pageUrl ? extractHeroImage(html, pageUrl) : null;
  for (const ev of found) {
    // og:image is generated per page by most CMSs, so it is the strongest
    // fallback when a site's JSON-LD image turns out to be a shared banner.
    ev.imageCandidates = [ogImage, twitterImage, heroImage].filter(Boolean);
    if (!ev.image && ogImage) ev.image = ogImage;
    if (!ev.description && ogDesc) ev.description = stripHtml(ogDesc).slice(0, 500);
  }
  return found;
}

/** Listing-level ItemList JSON-LD (todayinbudapest, myguide): follow its URLs. */
export function extractItemListUrls(html, baseUrl) {
  const urls = [];
  for (const b of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseJsonLdBlock(b[1]);
    if (!parsed) continue;
    const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const it of arr) {
      if (!it || String(it['@type']) !== 'ItemList' || !Array.isArray(it.itemListElement)) continue;
      for (const el of it.itemListElement) {
        const u = typeof el?.url === 'string' ? el.url : typeof el?.item === 'string' ? el.item : el?.item?.url;
        if (typeof u === 'string') {
          try { urls.push(new URL(u, baseUrl).toString()); } catch { /* ignore */ }
        }
      }
    }
  }
  return urls;
}

/**
 * Read event cards straight off the rendered listing.
 *
 * Many Hungarian sites (koncert.hu is the proven case: 1265 cards, 665 dates)
 * put the title and date on the listing and navigate via JavaScript, so every
 * card shares one href and the detail-page pipeline finds nothing. Here we walk
 * each link, climb at most a few ancestors to find the smallest block that also
 * contains a date, and return title + date text + link.
 */
function collectListingCards(page, localeMonths = null) {
  return page.evaluate((extraMonths) => {
    const HU_MONTH = '(janu[aá]r|febru[aá]r|m[aá]rcius|[aá]prilis|m[aá]jus|j[uú]nius|j[uú]lius|augusztus|szeptember|okt[oó]ber|november|december|jan|feb|m[aá]rc|[aá]pr|m[aá]j|j[uú]n|j[uú]l|aug|szept|okt|nov|dec)';
    const MONTH = extraMonths ? `(${HU_MONTH.slice(1, -1)}|${extraMonths})` : HU_MONTH;
    // The last two alternatives are day-first ("06.09.2026", "6. září"), which
    // is how every Central-European locale writes a date and which the
    // Hungarian year-first patterns never match. Added only when a locale is
    // in play, so a Hungarian listing sees the original three alternatives.
    const DAY_FIRST = extraMonths
      ? `|(\\d{1,2}\\s?[.\\-/]\\s?\\d{1,2}\\s?[.\\-/]\\s?20\\d{2})|(\\d{1,2}\\.?\\s*${MONTH})`
      : '';
    const DATE_RE = new RegExp(
      `(20\\d{2}[.\\-/]\\s?\\d{1,2}[.\\-/]\\s?\\d{1,2})|(20\\d{2}\\.?\\s*${MONTH}\\.?\\s*\\d{1,2})|(${MONTH}\\.?\\s*\\d{1,2}\\.?)${DAY_FIRST}`,
      'i',
    );
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const cards = [];
    const seen = new Set();

    // The date a link carries in its own path, e.g.
    // /predstavenie/17366/2026-09-03/19-00/blazni-z-valencie.
    const URL_DATE_RE = /\/20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(\/|$)/;

    /**
     * Some listings make the whole card an image link with NO text, and put the
     * title in a sibling — snd.sk wraps 43 performances that way. Climb to the
     * nearest ancestor that has text and take its FIRST LINE, which is where
     * such templates put the name ("Blázni z Valencie" ahead of the genre,
     * venue and times). Only consulted for an otherwise-empty anchor, so a card
     * that names itself is never second-guessed.
     */
    const titleFromAncestor = (anchor) => {
      let node = anchor.parentElement;
      for (let depth = 0; depth < 3 && node; depth += 1) {
        const raw = (node.innerText || '').trim();
        if (raw) {
          const first = clean(raw.split('\n')[0]);
          if (first.length >= 6 && first.length <= 160) return first;
        }
        node = node.parentElement;
      }
      return '';
    };

    for (const anchor of document.querySelectorAll('a[href]')) {
      const rawHref = anchor.getAttribute('href') || '';
      let title = clean(anchor.innerText);
      if (!title && URL_DATE_RE.test(rawHref)) title = titleFromAncestor(anchor);
      if (title.length < 6 || title.length > 160) continue;
      // A date on the card, not somewhere far up the page: climb a few levels
      // and stop at the first ancestor that is still small enough to be a card.
      let node = anchor;
      let dateText = '';
      for (let depth = 0; depth < 4 && node; depth += 1) {
        const text = clean(node.innerText);
        if (text.length > 400) break;
        if (DATE_RE.test(text)) { dateText = text; break; }
        node = node.parentElement;
      }
      // A card with no visible date can still be dated, if its own link says so.
      // snd.sk links every performance as
      // /predstavenie/{id}/{YYYY-MM-DD}/{HH-MM}/{slug}/... — the date is in the
      // URL, never in the card text, so requiring dateText discarded all 43.
      if (!dateText && !URL_DATE_RE.test(rawHref)) continue;
      const key = `${title}|${dateText.slice(0, 60)}|${rawHref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ title, dateText, href: anchor.href || null });
      if (cards.length >= 200) break;
    }
    return cards;
  }, localeMonths);
}

// Exported so the rule runner renders exactly the way every other strategy does.
export async function renderPage(browser, url, localeMonths = null) {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    // Municipal/venue sites often serve mismatched certs; we only read public data.
    ignoreHTTPSErrors: true,
  });
  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    } catch (e) {
      if (!/Timeout/i.test(String(e.message))) throw e;
      // Slow sites: settle for DOM-ready instead of failing the whole source.
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    const status = response ? response.status() : null;
    // Listings commonly lazy-load below the fold; a couple of scrolls is enough
    // to materialise the cards without paying for a full auto-scroll pass.
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 2400);
      await page.waitForTimeout(900);
    }
    const html = await page.content();
    const links = await page.evaluate(() => {
      const set = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        try { set.add(new URL(a.href, location.href).toString().split('#')[0]); } catch {}
      }
      return [...set];
    });
    const cards = await collectListingCards(page, localeMonths).catch(() => []);
    return { status, html, links, cards };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Last-resort listing reader that works on the RAW HTML instead of the DOM.
 *
 * Hobbeast's card collector walks up at most four DOM ancestors looking for a
 * date, which fails whenever a listing puts the date in a block that is far up
 * the tree but adjacent in the markup — the shape that left Filharmonia
 * Narodowa and Magiczny Kraków at zero. The grepsearch crawler solves it by
 * scanning a character window around each anchor in the source text, which has
 * no notion of tree distance at all.
 *
 * Three guards keep it honest, because a text window is a blunt instrument:
 *   - it is only ever called for a non-Hungarian source (locale is non-null),
 *     so the 377 Hungarian sources never reach this code;
 *   - it is only called when every other path produced NOTHING, so it can add
 *     events where there were none but can never displace a better parse;
 *   - the anchor must still look like an event link, and the title must still
 *     survive the locale's navigation-word filter.
 */
export function extractAnchorWindowEvents(html, listingUrl, { locale, isEventPath, isNavTitle, parseDate, limit = 80 }) {
  const out = [];
  if (!locale || !html) return out;
  let base;
  try { base = new URL(listingUrl); } catch { return out; }
  const baseHost = base.host.replace(/^www\./, '');
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;

  for (const m of html.matchAll(anchorRe)) {
    if (out.length >= limit) break;
    const label = decodeEntities(String(m[2]).replace(/<[^>]+>/g, ' '));
    if (label.length < 6 || label.length > 200) continue;
    if (isNavTitle(label)) continue;

    let target;
    try { target = new URL(m[1], base); } catch { continue; }
    if (target.host.replace(/^www\./, '') !== baseHost) continue;
    if (target.pathname === base.pathname) continue;
    if (!isEventPath(target.pathname)) continue;

    // The window is measured in CHARACTERS of markup, which is the whole point:
    // it finds a date that sits beside the anchor in the source even when the
    // DOM puts it many levels away.
    const from = Math.max(0, m.index - 700);
    const context = decodeEntities(html.slice(from, m.index + m[0].length + 700).replace(/<[^>]+>/g, ' '));
    const date = parseDate(context);
    if (!date) continue;

    const url = target.toString();
    const key = `${url}|${label.toLowerCase()}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: label.slice(0, 200), startDate: date, url, image: null, description: null, offers: {} });
  }
  return out;
}

/**
 * Same-host event-looking links on a DETAIL page, for the collection frontier
 * to enqueue one level deeper. Applies the listing filter in
 * scrapeGenericSource verbatim — same host, never the page itself, a real
 * path, worthFetching — so the frontier can only ever hold a URL the sampling
 * path would have fetched too. Regex over raw markup, because a detail page is
 * a static fetch rather than a rendered DOM. Capped hard: descending is a
 * privilege, not an obligation.
 */
export function sameHostEventLinks(html, pageUrl, listingHost, worthFetching, { limit = 200 } = {}) {
  const out = [];
  if (!html || !pageUrl) return out;
  const self = String(pageUrl).split('#')[0].split('?')[0];
  const seen = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    if (out.length >= limit) break;
    let url;
    try { url = new URL(decodeEntities(m[1]), pageUrl); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (url.host.replace(/^www\./, '') !== listingHost) continue;
    url.hash = '';
    const u = url.toString();
    if (u.split('?')[0] === self) continue;
    if (url.pathname.length <= 6) continue;
    if (!worthFetching(url.pathname)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Fisher-Yates: rotate WHICH details we fetch when a listing has more links
 * than the per-run budget, so repeated runs converge to full coverage instead
 * of re-reading the same first N. */
export function shuffled(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function scrapeGenericSource(source, { browser, fetchStatic, maxDetails = 40, delayMs = 400, log = () => {}, allowHubRetry = true, frontier = null }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url);
  if (!listingUrl) return { events: [], httpStatus: null };
  const listingHost = new URL(listingUrl).host.replace(/^www\./, '');
  // null for Hungarian and unknown countries, which keeps every branch below
  // on its original path.
  const locale = localeFor(source.country_code);
  const localeLinkRe = localeEventPathRe(locale);
  const localeMonths = localeMonthPattern(locale);
  // A link is an event link if EITHER vocabulary recognises it; the Hungarian
  // one is always consulted first and unchanged.
  const looksLikeEventPath = (pathname) => EVENT_LINK_RE.test(pathname)
    || DATED_LINK_RE.test(pathname)
    || (localeLinkRe !== null && localeLinkRe.test(pathname));
  // A SEPARATE, wider predicate used ONLY to decide what to fetch. A wrongly
  // fetched detail page costs one request and yields nothing unless it really
  // carries Event data; a wrongly accepted listing CARD becomes a row in the
  // catalogue, so the card filter below keeps the narrow predicate. Gated on
  // `locale`, which is null for HU and unknown countries, so the 377 Hungarian
  // sources evaluate exactly what they did before.
  const worthFetching = (pathname) => looksLikeEventPath(pathname)
    || (locale !== null && NUMERIC_ID_LINK_RE.test(pathname));
  // Each judgement is made by ONE vocabulary, never a union of both. Mixing
  // them is actively harmful: parseHuTextDate("6. September 2026") matches its
  // year-less branch and reads the "20" of 2026 as the day, quietly producing
  // 2026-09-20. The locale parser already understands ISO and year-first
  // dates, so it needs no Hungarian fallback.
  const isNavTitle = (title) => (locale ? isLocaleNavigationTitle(title, locale) : isNavigationTitle(title));
  const parseCardDate = (text) => (locale ? parseLocaleTextDate(text, locale) : parseHuTextDate(text));

  let { status: listingStatus, html: listingHtml, links: detailUrls, cards: listingCards } = await renderPage(browser, listingUrl, localeMonths);

  // Many registry paths are guesses; a 4xx listing falls back to the site root,
  // where the broadened link heuristics can still find the real event pages.
  if (listingStatus && listingStatus >= 400) {
    const root = new URL(listingUrl).origin + '/';
    if (root !== listingUrl) {
      log(`    listing ${listingStatus}, retrying root ${root}`);
      const retry = await renderPage(browser, root);
      if (!retry.status || retry.status < 400) ({ html: listingHtml, links: detailUrls, cards: listingCards } = retry);
    }
  }

  // ItemList JSON-LD on the listing supplies curated detail URLs first.
  detailUrls = [...new Set([...extractItemListUrls(listingHtml, listingUrl), ...detailUrls])];

  // Keep the raw link list: hub discovery needs links the event filter drops.
  const detailUrlsRaw = [...detailUrls];

  // Same-host event-looking links (path keywords OR a date in the URL);
  // never re-fetch the listing itself.
  detailUrls = detailUrls.filter((u) => {
    try {
      const url = new URL(u);
      if (url.host.replace(/^www\./, '') !== listingHost) return false;
      if (u.split('?')[0] === listingUrl.split('?')[0]) return false;
      if (url.pathname.length <= 6) return false;
      return worthFetching(url.pathname);
    } catch { return false; }
  });

  // The persistent per-source frontier, when the worker supplies one. The
  // sampling path below forgets everything at the end of a run, so an
  // over-budget listing is re-sampled every night; the frontier remembers
  // which detail URLs were fetched and converges on full coverage instead.
  // It wraps the DETAIL-FETCH step only — every extractor stays as it was —
  // and if it is absent, disabled or errors, the sampling path runs
  // unchanged. That is the regression guarantee. Skipped when the Crawl-delay
  // budget bought zero details: the queue floors a claim at one URL, and
  // "listing only" must mean exactly that.
  let frontierEvents = null;
  if (frontier && maxDetails > 0) {
    try {
      const res = await runCollectionFrontier({
        sourceId: source.source_id, listingUrl, listingHost,
        candidateUrls: detailUrls, // ALL of them, not a sample
        queue: frontier.queue,
        fetchDetail: frontier.fetchDetail, // robots-gated conditional GET, supplied by the worker
        extractFromDetail: (html, url) => extractDetailEvents(html, url),
        harvestLinks: (html, pageUrl) => sameHostEventLinks(html, pageUrl, listingHost, worthFetching),
        // Item pages first: a date or an opaque id in the path, or a long slug.
        isDetailShaped: (p) => DATED_LINK_RE.test(p) || NUMERIC_ID_LINK_RE.test(p) || /\/[^/]{19,}-[^/]*$/.test(p),
        maxDetails, maxDepth: frontier.maxDepth ?? 2, delayMs, timeBudgetMs: frontier.timeBudgetMs ?? 240000, log,
      });
      frontierEvents = res.events;
      log(`    frontier: fetched ${res.fetched}, 304 ${res.notModified}, enqueued ${res.enqueued}, released ${res.released}, errors ${res.errors}`);
      detailUrls = []; // the sequential loop below must NOT run as well
    } catch (e) {
      log(`    frontier unavailable (${String(e?.message ?? e).slice(0, 60)}); falling back to sampling`);
      // Fall through to the sampling path, unchanged.
    }
  }
  // Over-budget listings: shuffle so each run samples a DIFFERENT subset.
  if (detailUrls.length > maxDetails) detailUrls = shuffled(detailUrls).slice(0, maxDetails);

  const events = [];
  const push = (ev, detailUrl) => {
    if (ev?.name && isNavTitle(ev.name)) return;
    const row = buildEvent(source, ev, { listingUrl, detailUrl });
    if (row) events.push(row);
  };
  // The LISTING page itself may already carry Event JSON-LD (some sites inline it).
  for (const ev of extractJsonLdEvents(listingHtml)) push(ev, listingUrl);

  // Detail events the frontier fetched, in the slot the sequential loop below
  // fills on the sampling path, so event order is the same either way.
  if (frontierEvents) for (const { ev, detailUrl } of frontierEvents) push(ev, detailUrl);

  for (const url of detailUrls) {
    try {
      const html = await fetchStatic(url);
      for (const ev of extractDetailEvents(html, url)) push(ev, url);
    } catch (e) {
      log(`    detail failed ${url}: ${e.message.slice(0, 60)}`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Listing-level harvest: sites that navigate by JavaScript (koncert.hu and
  // friends) expose title+date on the card only. Detail-page events win, so a
  // card is kept only when its title+date is not already covered.
  const identity = (title, date) => `${foldHu(title).replace(/[^a-z0-9]+/g, ' ').trim()}|${date}`;
  const covered = new Set(events.map((e) => identity(e.title, e.event_date)));
  for (const card of listingCards || []) {
    if (isNavTitle(card.title)) continue;
    // A card linking to a taxonomy page (/megye-, /kerulet-, /telepules-) is a
    // filter, not an event. Cards with no usable href (JS navigation) are kept.
    if (card.href) {
      let path = null;
      try { path = new URL(card.href).pathname; } catch { path = null; }
      if (path && !looksLikeEventPath(path)) continue;
    }
    // Card text first; then the link itself. A URL-embedded ISO date is the
    // most reliable signal a listing can give — no language, no ambiguity —
    // and it is the only one snd.sk offers, whose detail pages carry neither
    // JSON-LD nor microdata nor even an og:title. Detail-page events still win:
    // `covered` dedups this card away whenever the real parse already found it.
    const date = parseCardDate(card.dateText) || dateFromUrlPath(card.href);
    if (!date) continue;
    const key = identity(card.title, date);
    if (covered.has(key)) continue;
    covered.add(key);
    const row = buildEvent(source, {
      name: card.title,
      startDate: date,
      url: card.href || listingUrl,
      image: null,
      description: null,
      offers: { price_min: null, currency: null, ticket_url: null },
    }, { listingUrl, detailUrl: card.href || listingUrl, idSeed: key });
    if (row) events.push(row);
  }

  // Nothing worked and this is a foreign source: try reading the raw markup
  // around each anchor. Deliberately placed after every structured path, so it
  // only ever fills a vacuum.
  if (events.length === 0 && locale) {
    const windowed = extractAnchorWindowEvents(listingHtml, listingUrl, {
      locale,
      isEventPath: looksLikeEventPath,
      isNavTitle,
      parseDate: parseCardDate,
    });
    for (const ev of windowed) {
      const row = buildEvent(source, ev, { listingUrl, detailUrl: ev.url, idSeed: `${ev.url}|${ev.startDate}` });
      if (row) events.push(row);
    }
    if (windowed.length) log(`    raw-markup fallback recovered ${windowed.length} listing entries`);
  }

  // Self-healing entry point: a listing that produced nothing may simply be the
  // site's home page. Follow the most promising event hub ONCE and, if that
  // yields events, report the better URL so the registry can be corrected.
  let discoveredUrl = null;
  if (events.length === 0 && allowHubRetry) {
    const hubUrl = findEventHubUrl(detailUrlsRaw, listingUrl);
    if (hubUrl) {
      log(`    no events here, trying event hub ${hubUrl}`);
      try {
        const viaHub = await scrapeGenericSource(
          { ...source, endpoint_url: hubUrl },
          { browser, fetchStatic, maxDetails, delayMs, log, allowHubRetry: false },
        );
        if (viaHub.events.length > 0) {
          return { events: viaHub.events, httpStatus: viaHub.httpStatus, discoveredUrl: hubUrl };
        }
      } catch (e) {
        log(`    hub retry failed: ${String(e.message).slice(0, 60)}`);
      }
    }
  }

  return { events: resolveEventImages(events), httpStatus: listingStatus, discoveredUrl };
}
