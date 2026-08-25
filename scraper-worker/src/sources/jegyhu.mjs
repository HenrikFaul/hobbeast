// jegy.hu source scraper.
//
// Pattern: the category LISTING page is client-rendered (needs a real browser to
// get the event links), but each event DETAIL page serves clean, static,
// server-side Event JSON-LD (@type MusicEventMarkup / *Event) with name,
// startDate, location and url. So: render the listing with Playwright to collect
// detail URLs, then STATIC-fetch each detail and parse its JSON-LD. No JS is run
// on the detail pages, keeping detail extraction cheap and robust.

const DETAIL_RE = /jegy\.hu\/(program|event)\//i;

// jegy.hu category listing pages worth harvesting (concerts first for the
// prototype; more can be added without code changes).
export const JEGYHU_LISTINGS = [
  { url: 'https://www.jegy.hu/event/category/koncert-zene-3', category: 'Zene', tags: ['Zene', 'Koncert'] },
];

function parseJegyDate(raw) {
  // jegy.hu emits "2026-10-16 19:30:00" (local Budapest time, no offset).
  if (!raw || typeof raw !== 'string') return { date: null, time: null };
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] ? `${m[2]}:00` : null };
}

function extractEventsFromHtml(html) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let parsed;
    try { parsed = JSON.parse(b[1].trim()); } catch { continue; }
    const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const type = String(it['@type'] || '');
      if (!/Event/.test(type)) continue;
      const loc = it.location;
      out.push({
        name: it.name,
        type,
        startDate: it.startDate,
        endDate: it.endDate || null,
        location: typeof loc === 'string' ? loc : (loc && loc.name) || null,
        address: loc && loc.address && (typeof loc.address === 'string' ? loc.address : loc.address.streetAddress) || null,
        url: it.url,
        image: Array.isArray(it.image) ? it.image[0] : it.image || null,
        offers: it.offers || null,
        description: it.description || null,
      });
    }
  }
  return out;
}

export async function scrapeJegyHu({ browser, fetchStatic, maxPerListing = 40, delayMs = 800, log = () => {} }) {
  const events = [];
  const seen = new Set();

  for (const listing of JEGYHU_LISTINGS) {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    });
    let detailUrls = [];
    try {
      await page.goto(listing.url, { waitUntil: 'networkidle', timeout: 45000 });
      detailUrls = await page.evaluate(() => {
        const set = new Set();
        for (const a of document.querySelectorAll('a[href]')) {
          const h = a.href;
          if (/jegy\.hu\/(program|event)\//i.test(h) && !/category/i.test(h)) set.add(h.split('?')[0].split('#')[0]);
        }
        return [...set];
      });
    } catch (e) {
      log(`  listing failed ${listing.url}: ${e.message}`);
    } finally {
      await page.close();
    }

    detailUrls = detailUrls.filter((u) => DETAIL_RE.test(u)).slice(0, maxPerListing);
    log(`  ${listing.url} -> ${detailUrls.length} detail URLs`);

    for (const url of detailUrls) {
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const html = await fetchStatic(url);
        const found = extractEventsFromHtml(html);
        for (const ev of found) {
          const { date, time } = parseJegyDate(ev.startDate);
          if (!date) continue;
          const idMatch = url.match(/-(\d+)(?:\/)?$/);
          const externalId = `jegyhu:${idMatch ? idMatch[1] : url}`;
          events.push({
            external_source: 'scraper',
            external_id: externalId,
            external_url: ev.url || url,
            title: ev.name,
            category: listing.category,
            subcategory: null,
            tags: listing.tags,
            description: ev.description ? String(ev.description).slice(0, 500) : null,
            event_date: date,
            event_time: time,
            location_type: 'address',
            location_city: null, // jegy.hu JSON-LD often omits city; venue name captured as address
            location_address: ev.location || ev.address || null,
            image_url: ev.image || null,
            organizer_name: 'jegy.hu',
            source_payload: { source: 'jegy.hu', listing: listing.url, jsonld: ev },
          });
        }
      } catch (e) {
        log(`    detail failed ${url}: ${e.message}`);
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return events;
}
