// Host-specific adapters (scrape_strategy = 'site'). Each adapter receives the
// same options as the generic strategies and returns { events, httpStatus }.
// Registered per hostname; the recon notes in external_event_feed_sources
// explain WHY each site needs its own logic.

import {
  buildEvent, extractOg, normalizeEndpointUrl, resolveEventImages, shuffled, stripHtml,
} from './generic.mjs';
import { scrapeTicketmaster } from './ticketmaster.mjs';
import { RENDER_UA } from '../fetch.mjs';

/**
 * telekomspots.hu — Next.js app, no schema.org markup. The listing renders
 * /events/{id}/{slug} cards after scrolling; each detail page embeds ISO
 * "startsAt" values in the framework payload and full og: metadata.
 */
async function scrapeTelekomSpots(source, { browser, fetchStatic, maxDetails = 40, delayMs = 400, log = () => {} }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url) || 'https://telekomspots.hu/events';
  const page = await browser.newPage({
    // Same identity as every other request this project makes; see RENDER_UA.
    userAgent: RENDER_UA,
    ignoreHTTPSErrors: true,
  });
  let links = [];
  let status = null;
  try {
    const resp = await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 45000 });
    status = resp ? resp.status() : null;
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 2600);
      await page.waitForTimeout(1000);
    }
    links = await page.evaluate(() => [...new Set(
      [...document.querySelectorAll('a[href^="/events/"], a[href*="telekomspots.hu/events/"]')]
        .map((a) => new URL(a.getAttribute('href'), location.origin).toString()),
    )]);
  } finally {
    await page.close().catch(() => {});
  }

  // /events/{id}/{slug} OR the numeric legacy form /events/{num}/{slug}.
  links = links.filter((u) => /\/events\/([a-z0-9]{10,}|\d{3,})\//.test(u));
  if (links.length > maxDetails) links = shuffled(links).slice(0, maxDetails);
  log(`    telekomspots: ${links.length} detail links this run`);
  const events = [];
  for (const url of links) {
    try {
      const html = await fetchStatic(url);
      const name = extractOg(html, 'title');
      // Document order: the page's own event payload precedes sidebar items.
      const starts = [...html.matchAll(/"startsAt"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[^"]*)"/g)]
        .map((m) => m[1])
        .filter((iso) => new Date(iso).getTime() > Date.now() - 86400000);
      if (!name || !starts.length) continue;
      const cleanName = stripHtml(name)
        .replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
        .replace(/^Telekom Spots\s*[-|]\s*/i, '')
        .replace(/\s*\|\s*Telekom.*$/i, '');
      const row = buildEvent(source, {
        name: cleanName,
        startDate: starts[0],
        url,
        image: extractOg(html, 'image'),
        description: extractOg(html, 'description') ? stripHtml(extractOg(html, 'description')).slice(0, 500) : null,
        offers: { price_min: null, currency: null, ticket_url: url },
      }, { listingUrl, detailUrl: url });
      if (row) events.push(row);
    } catch (e) {
      log(`    detail failed ${url}: ${String(e.message).slice(0, 50)}`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { events: resolveEventImages(events), httpStatus: status };
}

const ADAPTERS = {
  'telekomspots.hu': scrapeTelekomSpots,
  // Both go through the official Discovery API rather than the website: the
  // site itself answers 403 from a datacenter IP and their terms restrict
  // automated access. See src/sources/ticketmaster.mjs.
  'ticketmaster.cz': scrapeTicketmaster,
  'ticketmaster.pl': scrapeTicketmaster,
};

export function adapterForSource(source) {
  try {
    const host = new URL(normalizeEndpointUrl(source.endpoint_url)).host.replace(/^www\./, '');
    return ADAPTERS[host] || null;
  } catch {
    return null;
  }
}
