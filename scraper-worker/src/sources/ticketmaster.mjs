/**
 * Ticketmaster via the official Discovery API — the sanctioned route.
 *
 * Scraping ticketmaster.cz/.pl does not work and should not be made to work:
 * their listings answer HTTP 403 from a datacenter IP (200 from a residential
 * one), the detail pages answer 401 even locally, and their terms restrict
 * automated access generally. Working around that is not on the table. The
 * Discovery API is what they publish for exactly this purpose, it is free, and
 * it returns the same catalogue as clean paginated JSON with venue, city,
 * classification and price already separated.
 *
 * Needs TICKETMASTER_API_KEY in the environment. Without it the adapter logs
 * and returns nothing rather than throwing, so a missing secret degrades to
 * "this source found nothing" instead of failing the run.
 */

import { buildEvent, resolveEventImages } from './generic.mjs';

const API = 'https://app.ticketmaster.com/discovery/v2/events.json';

/** Which national catalogue a registered source stands for. */
const COUNTRY_BY_HOST = {
  'ticketmaster.cz': 'CZ',
  'ticketmaster.pl': 'PL',
};

// Discovery refuses page * size beyond 1000, so five pages of 200 is the whole
// window it will serve. That is ~1000 events per run against catalogues of
// roughly 400 (CZ) and 900 (PL) — enough to cover both.
const PAGE_SIZE = 200;
const MAX_PAGES = 5;
// Their published ceiling is 5 requests/second; one every 250 ms sits well
// under it and the whole run is at most five calls anyway.
const PAGE_DELAY_MS = 250;

/**
 * Upsell rows share a parent event's date and venue and would otherwise be
 * published as separate programmes: "Hollywood Vampires — VIP Packages",
 * "… Parking Ticket", "… Fast Track". The vetting pass flagged these
 * explicitly on both hosts.
 */
// Each alternative is deliberately narrow. A bare "parking" would throw away
// "Parking Lot Party", and "package" must tolerate its plural, so the pattern
// matches the upsell PHRASES rather than any word inside them.
const UPSELL_RE = new RegExp([
  '\\bvip\\s*(?:package|balíčk|balicek|upgrade)',   // VIP Packages, VIP balíčky, VIP Upgrade
  'parkovac',                                       // parkovací lístek (accented, so no \\w tail)
  '\\bparking\\s*(?:ticket|pass|l[ií]stek)',        // Parking Ticket — never "parking" alone
  'karnet\\s*parking',
  '\\bfast\\s*track\\b',
  '\\bhospitality\\b',
  'meet\\s*(?:&|and)\\s*greet',
  'premium\\s*upgrade',
].join('|'), 'i');

/** Ticketmaster's segment/genre vocabulary onto Hobbeast's ten categories. */
function categoryFor(event) {
  const c = event?.classifications?.[0] ?? {};
  const segment = String(c.segment?.name ?? '').toLowerCase();
  const genre = String(c.genre?.name ?? '').toLowerCase();
  if (segment === 'music') return 'Zene';
  if (segment === 'sports') return 'Sport & Mozgás';
  if (segment === 'film') return 'Kultúra';
  if (segment === 'arts & theatre') {
    if (/dance|ballet/.test(genre)) return 'Tánc';
    if (/comedy/.test(genre)) return 'Színház & Előadás';
    if (/children|family/.test(genre)) return 'Családi';
    return 'Színház & Előadás';
  }
  if (/family|children/.test(genre)) return 'Családi';
  if (/food|wine|culinar/.test(genre)) return 'Gasztro';
  return null; // let buildEvent fall back to the source's own categories
}

/** The largest usable image; Discovery ships a whole ladder of ratios. */
function bestImage(event) {
  const images = Array.isArray(event?.images) ? event.images : [];
  const usable = images
    .filter((i) => typeof i?.url === 'string' && /^https?:\/\//.test(i.url))
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  return usable[0]?.url ?? null;
}

/** Normalise one Discovery event into the shape buildEvent expects. */
export function mapDiscoveryEvent(event) {
  const name = typeof event?.name === 'string' ? event.name.trim() : '';
  if (!name || UPSELL_RE.test(name)) return null;

  const start = event?.dates?.start ?? {};
  // localDate is the authoritative day; dateTime is UTC and can land on the
  // previous day for a late-evening show.
  const date = typeof start.localDate === 'string' ? start.localDate : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = typeof start.localTime === 'string' && /^\d{2}:\d{2}/.test(start.localTime)
    ? start.localTime.slice(0, 5)
    : null;

  const venue = event?._embedded?.venues?.[0] ?? {};
  const price = Array.isArray(event?.priceRanges) ? event.priceRanges[0] : null;

  return {
    name,
    startDate: time ? `${date}T${time}` : date,
    url: typeof event?.url === 'string' ? event.url : null,
    image: bestImage(event),
    description: null, // Discovery's "info" is marketing copy; we link back instead
    category: categoryFor(event),
    location: typeof venue?.name === 'string' ? venue.name : null,
    address: typeof venue?.address?.line1 === 'string' ? venue.address.line1 : null,
    city: typeof venue?.city?.name === 'string' ? venue.city.name : null,
    offers: {
      price_min: price && Number.isFinite(Number(price.min)) ? Number(price.min) : null,
      currency: typeof price?.currency === 'string' ? price.currency.slice(0, 8) : null,
      ticket_url: typeof event?.url === 'string' ? event.url : null,
    },
    // Discovery's own id is stable across pages and languages, so it is the
    // right dedupe seed — far better than hashing a URL that carries slugs.
    _id: typeof event?.id === 'string' ? event.id : null,
  };
}

export async function scrapeTicketmaster(source, { log = () => {}, fetchJson = null, apiKey = null } = {}) {
  const host = (() => {
    try { return new URL(source.endpoint_url).host.replace(/^www\./, ''); } catch { return ''; }
  })();
  const country = COUNTRY_BY_HOST[host];
  if (!country) {
    log(`    ticketmaster: no country mapping for ${host || '(bad endpoint)'}`);
    return { events: [], httpStatus: null };
  }

  const key = apiKey ?? process.env.TICKETMASTER_API_KEY;
  if (!key) {
    log('    ticketmaster: TICKETMASTER_API_KEY is not set — skipping (not a parse failure)');
    return { events: [], httpStatus: null };
  }

  const get = fetchJson ?? (async (url) => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  const events = [];
  const seen = new Set();
  let httpStatus = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${API}?apikey=${encodeURIComponent(key)}&countryCode=${country}`
      + `&size=${PAGE_SIZE}&page=${page}&sort=date,asc`;
    let payload;
    try {
      payload = await get(url);
      httpStatus = 200;
    } catch (error) {
      log(`    ticketmaster ${country}: page ${page} failed (${String(error?.message ?? error).slice(0, 60)})`);
      const code = /HTTP (\d{3})/.exec(String(error?.message ?? ''));
      if (code) httpStatus = Number(code[1]);
      break;
    }

    const batch = payload?._embedded?.events;
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const raw of batch) {
      const mapped = mapDiscoveryEvent(raw);
      if (!mapped) continue;
      const idSeed = mapped._id ?? `${mapped.name}|${mapped.startDate}`;
      if (seen.has(idSeed)) continue;
      seen.add(idSeed);
      const row = buildEvent(source, mapped, {
        listingUrl: source.endpoint_url,
        detailUrl: mapped.url ?? source.endpoint_url,
        idSeed,
      });
      if (row) events.push(row);
    }

    const totalPages = Number(payload?.page?.totalPages) || 0;
    if (page + 1 >= totalPages) break;
    if (PAGE_DELAY_MS) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  log(`    ticketmaster ${country}: ${events.length} events from the Discovery API`);
  return { events: resolveEventImages(events), httpStatus };
}
