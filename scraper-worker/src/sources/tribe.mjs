// WordPress "The Events Calendar" strategy: the audit confirmed these sites
// expose the standard tribe REST API, which returns clean JSON events — no
// rendering or HTML parsing needed.

import { buildEvent, normalizeEndpointUrl, resolveEventImages, stripHtml } from './generic.mjs';

export async function scrapeTribeSource(source, { fetchStatic, maxDetails = 12, log = () => {} }) {
  const listingUrl = normalizeEndpointUrl(source.endpoint_url);
  if (!listingUrl) return { events: [], httpStatus: null };
  const origin = new URL(listingUrl).origin;
  const today = new Date().toISOString().slice(0, 10);
  const apiUrl = `${origin}/wp-json/tribe/events/v1/events?per_page=${Math.min(maxDetails * 2, 50)}&start_date=${today}`;

  let payload;
  try {
    payload = JSON.parse(await fetchStatic(apiUrl));
  } catch (e) {
    log(`    tribe api failed ${apiUrl}: ${e.message.slice(0, 60)}`);
    const m = e.message.match(/HTTP (\d{3})/);
    return { events: [], httpStatus: m ? Number(m[1]) : null };
  }

  const events = [];
  for (const ev of payload.events || []) {
    const cost = String(ev.cost || '');
    const priceMatch = cost.match(/(\d[\d\s.]*)\s*(?:Ft|HUF)/i);
    const row = buildEvent(source, {
      name: stripHtml(ev.title),
      startDate: String(ev.start_date || '').replace(' ', 'T'),
      location: ev.venue && !Array.isArray(ev.venue) ? ev.venue.venue : null,
      address: ev.venue && !Array.isArray(ev.venue) ? ev.venue.address : null,
      city: ev.venue && !Array.isArray(ev.venue) ? ev.venue.city : null,
      url: ev.url,
      image: ev.image && typeof ev.image === 'object' ? ev.image.url : null,
      description: ev.description ? stripHtml(ev.description).slice(0, 500) : null,
      offers: {
        price_min: priceMatch ? Number(priceMatch[1].replace(/[\s.]/g, '')) : null,
        currency: priceMatch ? 'HUF' : null,
        ticket_url: typeof ev.website === 'string' && /^https?:\/\//.test(ev.website) ? ev.website : null,
      },
    }, { listingUrl: apiUrl, detailUrl: ev.url });
    if (row) events.push(row);
    if (events.length >= maxDetails * 2) break;
  }
  return { events: resolveEventImages(events), httpStatus: 200 };
}
