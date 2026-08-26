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
import { foldHu, parseHuTextDate } from './recipes.mjs';

export { foldHu, parseHuTextDate };

// Hungarian event-page URL vocabulary. "ajanlat" matters: programturizmus.hu
// (22 registered sources) publishes every event as /ajanlat-{slug}.html.
const EVENT_LINK_RE = /\/(program(?:ok|ajanlo)?|ajanlat|event(?:s)?|esemeny(?:ek)?|koncert(?:ek)?|musor|eloadas(?:ok)?|rendezveny(?:ek)?|tura(?:k)?|hikeplans|show|naptar|kalendarium|fesztival(?:ok)?|workshop(?:ok)?|kiallitas(?:ok)?|kviz|quiz|tanfolyam(?:ok)?|kurzus(?:ok)?|seta(?:k)?|buli(?:k)?|party)(?:[/\-_?#]|$)/i;
const DATED_LINK_RE = /20(2[5-9])[/\-.]?(0[1-9]|1[0-2])[/\-.]?(0[1-9]|[12]\d|3[01])?/;

export function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

export function normalizeEndpointUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, 'https:');
  try { return new URL(u).toString(); } catch { return null; }
}

export function parseEventDate(raw) {
  if (!raw || typeof raw !== 'string') return { date: null, time: null };
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] ? `${m[2]}:00` : null };
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

function parseOffers(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const price = Number(o.lowPrice ?? o.price);
    return {
      price_min: Number.isFinite(price) && price >= 0 ? price : null,
      currency: typeof o.priceCurrency === 'string' ? o.priceCurrency.slice(0, 8) : null,
      ticket_url: typeof o.url === 'string' && /^https?:\/\//.test(o.url) ? o.url : null,
    };
  }
  return { price_min: null, currency: null, ticket_url: null };
}

export function extractJsonLdEvents(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(b[1].trim()); } catch { continue; }
    const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const it of arr) {
      if (!it || typeof it !== 'object' || !/Event/i.test(String(it['@type'] || ''))) continue;
      const loc = it.location && typeof it.location === 'object' ? it.location : null;
      const addr = loc?.address;
      out.push({
        name: firstString(it.name),
        startDate: firstString(it.startDate),
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

/** Shared normalized-event builder used by every strategy (render/rss/tribe). */
export function buildEvent(source, ev, { listingUrl, detailUrl, idSeed = null }) {
  const { date, time } = parseEventDate(ev.startDate);
  if (!date || !ev.name) return null;
  const ticket = ev.offers || {};
  return {
    external_source: 'scraper',
    external_id: `${source.source_id}:${md5(idSeed || ev.url || detailUrl || `${ev.name}|${date}`).slice(0, 12)}`,
    external_url: ticket.ticket_url || ev.url || detailUrl,
    title: String(ev.name).slice(0, 200),
    category: hobbeastCategory(source.categories),
    subcategory: null,
    tags: (Array.isArray(source.categories) ? source.categories : []).slice(0, 4),
    description: ev.description,
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
    let parsed;
    try { parsed = JSON.parse(b[1].trim()); } catch { continue; }
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
function collectListingCards(page) {
  return page.evaluate(() => {
    const MONTH = '(janu[aá]r|febru[aá]r|m[aá]rcius|[aá]prilis|m[aá]jus|j[uú]nius|j[uú]lius|augusztus|szeptember|okt[oó]ber|november|december|jan|feb|m[aá]rc|[aá]pr|m[aá]j|j[uú]n|j[uú]l|aug|szept|okt|nov|dec)';
    const DATE_RE = new RegExp(
      `(20\\d{2}[.\\-/]\\s?\\d{1,2}[.\\-/]\\s?\\d{1,2})|(20\\d{2}\\.?\\s*${MONTH}\\.?\\s*\\d{1,2})|(${MONTH}\\.?\\s*\\d{1,2}\\.?)`,
      'i',
    );
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const cards = [];
    const seen = new Set();

    for (const anchor of document.querySelectorAll('a[href]')) {
      const title = clean(anchor.innerText);
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
      if (!dateText) continue;
      const key = `${title}|${dateText.slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ title, dateText, href: anchor.href || null });
      if (cards.length >= 200) break;
    }
    return cards;
  });
}

// Exported so the rule runner renders exactly the way every other strategy does.
export async function renderPage(browser, url) {
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
    const cards = await collectListingCards(page).catch(() => []);
    return { status, html, links, cards };
  } finally {
    await page.close().catch(() => {});
  }
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

export async function scrapeGenericSource(source, { browser, fetchStatic, maxDetails = 40, delayMs = 400, log = () => {}, allowHubRetry = true }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url);
  if (!listingUrl) return { events: [], httpStatus: null };
  const listingHost = new URL(listingUrl).host.replace(/^www\./, '');

  let { status: listingStatus, html: listingHtml, links: detailUrls, cards: listingCards } = await renderPage(browser, listingUrl);

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
      return EVENT_LINK_RE.test(url.pathname) || DATED_LINK_RE.test(url.pathname);
    } catch { return false; }
  });
  // Over-budget listings: shuffle so each run samples a DIFFERENT subset.
  if (detailUrls.length > maxDetails) detailUrls = shuffled(detailUrls).slice(0, maxDetails);

  const events = [];
  const push = (ev, detailUrl) => {
    if (ev?.name && isNavigationTitle(ev.name)) return;
    const row = buildEvent(source, ev, { listingUrl, detailUrl });
    if (row) events.push(row);
  };
  // The LISTING page itself may already carry Event JSON-LD (some sites inline it).
  for (const ev of extractJsonLdEvents(listingHtml)) push(ev, listingUrl);

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
    if (isNavigationTitle(card.title)) continue;
    // A card linking to a taxonomy page (/megye-, /kerulet-, /telepules-) is a
    // filter, not an event. Cards with no usable href (JS navigation) are kept.
    if (card.href) {
      let path = null;
      try { path = new URL(card.href).pathname; } catch { path = null; }
      if (path && !EVENT_LINK_RE.test(path) && !DATED_LINK_RE.test(path)) continue;
    }
    const date = parseHuTextDate(card.dateText);
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
