// Production runner for the fetch-based recipes the source inspector proposes.
//
// The parsing lives in recipes.mjs — the same module the admin panel's preview
// runs — so a source that showed 257 programs in the preview collects the same
// 257 here. This file only wires those parsers to the worker's fetch, robots
// gate and event-normalization contract.

import { buildEvent, normalizeEndpointUrl, renderPage, resolveEventImages } from './generic.mjs';
import {
  extractWithRule, parseIcs, parseJsonLdEvents, parseProsePage, parseWpIcsCalendar,
  parseWpPosts, validateRule,
} from './recipes.mjs';

const PARSERS = {
  ics: (text) => parseIcs(text),
  'wp-ics-calendar': (text, url) => parseWpIcsCalendar(text, url),
  jsonld: (text, url) => parseJsonLdEvents(text, url),
  // The endpoint is the WordPress REST collection, so the payload is JSON.
  'wp-posts': (text) => parseWpPosts(JSON.parse(text)),
  'page-prose': (text, url) => parseProsePage(text, url),
};

// Strategies whose source is one place. Everything else lists other people's venues.
const SINGLE_VENUE_STRATEGIES = new Set(['ics', 'wp-ics-calendar', 'page-prose']);

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
    // source the place IS the publisher, and that name is geocodable. An
    // aggregator is the opposite: forty programs at forty addresses must never
    // all be pinned on the magazine's own name.
    if (!item.location && source.publisher_name && SINGLE_VENUE_STRATEGIES.has(strategy)) {
      item.location = source.publisher_name;
    }
    const row = buildEvent(source, item, {
      listingUrl: url,
      detailUrl: item.url || url,
      idSeed: `${item.name}|${String(item.startDate).slice(0, 16)}`,
    });
    if (row) events.push(row);
  }
  return { events: resolveEventImages(events), httpStatus: 200 };
}

/**
 * The 'selector' strategy: a declarative rule decides what to read.
 *
 * The page is rendered with Playwright first, so a listing built by JavaScript
 * is visible to the rule, and the SAME interpreter the admin preview uses is
 * then applied to that HTML. Nothing from the rule is executed — it only names
 * elements and attributes.
 */
export async function scrapeSelectorSource(source, { browser, fetchStatic, log = () => {} }) {
  const url = normalizeEndpointUrl(source.endpoint_url);
  if (!url) throw new Error('invalid endpoint url');

  const rule = source.scrape_rule;
  const check = validateRule(rule);
  if (!check.ok) throw new Error(`invalid rule: ${check.errors.join('; ').slice(0, 160)}`);

  let html = null;
  let httpStatus = null;
  if (browser) {
    const rendered = await renderPage(browser, url);
    html = rendered.html;
    httpStatus = rendered.status;
  } else {
    html = await fetchStatic(url);
    httpStatus = 200;
  }

  const { events: raw, errors } = extractWithRule(html, rule, url);
  for (const message of errors) log(`  rule: ${message}`);
  log(`  recipe selector: ${raw.length} entries from ${rule.container}`);

  const today = new Date().toISOString().slice(0, 10);
  const events = [];
  for (const item of raw) {
    if (String(item.startDate ?? '').slice(0, 10) < today) continue;
    const row = buildEvent(source, item, {
      listingUrl: url,
      detailUrl: item.url || url,
      idSeed: `${item.name}|${String(item.startDate).slice(0, 16)}`,
    });
    if (row) events.push(row);
  }
  return { events: resolveEventImages(events), httpStatus };
}
