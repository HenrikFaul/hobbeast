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

const EVENT_LINK_RE = /\/(program(?:ok|ajanlo)?|event(?:s)?|esemeny(?:ek)?|koncert(?:ek)?|musor|eloadas(?:ok)?|rendezveny(?:ek)?|tura(?:k)?|hikeplans|show|naptar|kalendarium|fesztival(?:ok)?|workshop(?:ok)?|kiallitas(?:ok)?|kviz|quiz|tanfolyam(?:ok)?|kurzus(?:ok)?|seta(?:k)?|buli(?:k)?|party)(?:[/\-_?#]|$)/i;
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

const HU_MONTHS = {
  januar: 1, febru: 2, marcius: 3, aprilis: 4, majus: 5, junius: 6,
  julius: 7, augusztus: 8, szeptember: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, marc: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, szept: 9, szep: 9, okt: 10, nov: 11, dec: 12,
};

function foldHu(s) {
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
export function buildEvent(source, ev, { listingUrl, detailUrl }) {
  const { date, time } = parseEventDate(ev.startDate);
  if (!date || !ev.name) return null;
  const ticket = ev.offers || {};
  return {
    external_source: 'scraper',
    external_id: `${source.source_id}:${md5(ev.url || detailUrl || ev.name + date).slice(0, 12)}`,
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
    image_url: ev.image || null,
    organizer_name: source.publisher_name,
    source_payload: { source_id: source.source_id, listing: listingUrl, detail: detailUrl || null, jsonld: ev },
  };
}

/** Detail-page parse shared by render and rss strategies: JSON-LD, then microdata. */
export function extractDetailEvents(html) {
  const found = extractJsonLdEvents(html);
  if (!found.length) {
    const micro = extractMicrodataEvent(html);
    if (micro) found.push(micro);
  }
  const ogImage = extractOg(html, 'image');
  const ogDesc = extractOg(html, 'description');
  for (const ev of found) {
    if (!ev.image && ogImage) ev.image = ogImage;
    if (!ev.description && ogDesc) ev.description = stripHtml(ogDesc).slice(0, 500);
  }
  return found;
}

async function renderPage(browser, url) {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    const status = response ? response.status() : null;
    const html = await page.content();
    const links = await page.evaluate(() => {
      const set = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        try { set.add(new URL(a.href, location.href).toString().split('#')[0]); } catch {}
      }
      return [...set];
    });
    return { status, html, links };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function scrapeGenericSource(source, { browser, fetchStatic, maxDetails = 12, delayMs = 700, log = () => {} }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url);
  if (!listingUrl) return { events: [], httpStatus: null };
  const listingHost = new URL(listingUrl).host.replace(/^www\./, '');

  let { status: listingStatus, html: listingHtml, links: detailUrls } = await renderPage(browser, listingUrl);

  // Many registry paths are guesses; a 4xx listing falls back to the site root,
  // where the broadened link heuristics can still find the real event pages.
  if (listingStatus && listingStatus >= 400) {
    const root = new URL(listingUrl).origin + '/';
    if (root !== listingUrl) {
      log(`    listing ${listingStatus}, retrying root ${root}`);
      const retry = await renderPage(browser, root);
      if (!retry.status || retry.status < 400) ({ html: listingHtml, links: detailUrls } = retry);
    }
  }

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
  }).slice(0, maxDetails);

  const events = [];
  const push = (ev, detailUrl) => {
    const row = buildEvent(source, ev, { listingUrl, detailUrl });
    if (row) events.push(row);
  };
  // The LISTING page itself may already carry Event JSON-LD (some sites inline it).
  for (const ev of extractJsonLdEvents(listingHtml)) push(ev, listingUrl);

  for (const url of detailUrls) {
    try {
      const html = await fetchStatic(url);
      for (const ev of extractDetailEvents(html)) push(ev, url);
    } catch (e) {
      log(`    detail failed ${url}: ${e.message.slice(0, 60)}`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { events, httpStatus: listingStatus };
}
