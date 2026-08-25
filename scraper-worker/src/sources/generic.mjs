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

const EVENT_LINK_RE = /\/(program|programok|event|events|esemeny|esemenyek|koncert|musor|eloadas|rendezveny|tura|hikeplans|show)(?:[/\-_?#]|$)/i;

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

export function normalizeEndpointUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, 'https:');
  try { return new URL(u).toString(); } catch { return null; }
}

function parseEventDate(raw) {
  if (!raw || typeof raw !== 'string') return { date: null, time: null };
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] ? `${m[2]}:00` : null };
}

function firstString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === 'object') return firstString(v.url || v.contentUrl || v.name);
  return null;
}

function stripHtml(s) {
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

function extractJsonLdEvents(html) {
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

function extractOg(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
  return m ? m[1] : null;
}

function hobbeastCategory(sourceCategories) {
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

export async function scrapeGenericSource(source, { browser, fetchStatic, maxDetails = 12, delayMs = 700, log = () => {} }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url);
  if (!listingUrl) return { events: [], httpStatus: null };
  const listingHost = new URL(listingUrl).host.replace(/^www\./, '');

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  let detailUrls = [];
  let listingHtml = '';
  let listingStatus = null;
  try {
    const response = await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 40000 });
    listingStatus = response ? response.status() : null;
    listingHtml = await page.content();
    detailUrls = await page.evaluate(() => {
      const set = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        try { set.add(new URL(a.href, location.href).toString().split('#')[0]); } catch {}
      }
      return [...set];
    });
  } finally {
    await page.close().catch(() => {});
  }

  // Same-host event-looking links; never re-fetch the listing itself.
  detailUrls = detailUrls.filter((u) => {
    try {
      const url = new URL(u);
      if (url.host.replace(/^www\./, '') !== listingHost) return false;
      if (u.split('?')[0] === listingUrl.split('?')[0]) return false;
      return EVENT_LINK_RE.test(url.pathname) && url.pathname.length > 6;
    } catch { return false; }
  }).slice(0, maxDetails);

  // The LISTING page itself may already carry Event JSON-LD (some sites inline it).
  const events = [];
  const pushEvent = (ev, detailUrl) => {
    const { date, time } = parseEventDate(ev.startDate);
    if (!date || !ev.name) return;
    const ticket = ev.offers || {};
    events.push({
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
    });
  };
  for (const ev of extractJsonLdEvents(listingHtml)) pushEvent(ev, listingUrl);

  for (const url of detailUrls) {
    try {
      const html = await fetchStatic(url);
      const found = extractJsonLdEvents(html);
      const ogImage = extractOg(html, 'image');
      const ogDesc = extractOg(html, 'description');
      for (const ev of found) {
        if (!ev.image && ogImage) ev.image = ogImage;
        if (!ev.description && ogDesc) ev.description = stripHtml(ogDesc).slice(0, 500);
        pushEvent(ev, url);
      }
    } catch (e) {
      log(`    detail failed ${url}: ${e.message.slice(0, 60)}`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { events, httpStatus: listingStatus };
}
