// Production runner for the fetch-based recipes the source inspector proposes.
//
// The parsing lives in recipes.mjs — the same module the admin panel's preview
// runs — so a source that showed 257 programs in the preview collects the same
// 257 here. This file only wires those parsers to the worker's fetch, robots
// gate and event-normalization contract.

import { buildEvent, normalizeEndpointUrl, resolveEventImages } from './generic.mjs';
import { parseIcs, parseJsonLdEvents, parseWpIcsCalendar } from './recipes.mjs';

const PARSERS = {
  ics: (text, url) => parseIcs(text),
  'wp-ics-calendar': (text, url) => parseWpIcsCalendar(text, url),
  jsonld: (text, url) => parseJsonLdEvents(text, url),
};

export function supportsRecipeStrategy(strategy) {
  return Object.prototype.hasOwnProperty.call(PARSERS, strategy);
}

export async function scrapeRecipeSource(source, { fetchStatic, log = () => {} }) {
  const strategy = source.scrape_strategy;
  const parse = PARSERS[strategy];
  if (!parse) throw new Error(`unsupported recipe strategy: ${strategy}`);

  const url = normalizeEndpointUrl(source.scrape_feed_url || source.endpoint_url);
  if (!url) throw new Error('invalid endpoint url');

  const text = await fetchStatic(url);
  // A rendered calendar shows whole months, so most entries are already past;
  // dropping them here keeps the ingest batch to what can actually be published.
  const today = new Date().toISOString().slice(0, 10);
  const raw = parse(text, url).filter((item) => String(item.startDate ?? '').slice(0, 10) >= today);
  log(`  recipe ${strategy}: ${raw.length} dated future entries`);

  const events = [];
  for (const item of raw) {
    // The listing carries every field, so the event id has to come from the
    // entry itself — a shared listing URL would collapse them into one row.
    // A calendar grid names the program but not the place — for a single-venue
    // source the place IS the publisher, and that name is geocodable.
    if (!item.location && source.publisher_name) item.location = source.publisher_name;
    const row = buildEvent(source, item, {
      listingUrl: url,
      detailUrl: item.url || url,
      idSeed: `${item.name}|${String(item.startDate).slice(0, 16)}`,
    });
    if (row) events.push(row);
  }
  return { events: resolveEventImages(events), httpStatus: 200 };
}
