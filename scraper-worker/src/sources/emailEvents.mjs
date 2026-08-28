/**
 * Reading events out of a newsletter email.
 *
 * A newsletter is just an HTML document, so this reuses the very engine the
 * crawler runs on a web page — nothing new is invented. It tries, in order of
 * how much the mail is promising:
 *
 *   1. JSON-LD (schema.org/Event) — the good newsletters embed it, and it is
 *      a machine-readable statement rather than a guess;
 *   2. heading sections — most Hungarian "programajánló" newsletters are a list
 *      of named, dated blocks (h2/h3 + a date), exactly the shape the WordPress
 *      article reader already handles;
 *   3. a single prose event — a one-programme announcement, read whole.
 *
 * It returns events in the same normalized shape the scraper ingests, so a
 * mail-sourced event is indistinguishable from a page-sourced one downstream.
 */

import {
  parseJsonLdEvents,
  parseProsePage,
  splitHeadingSections,
  looksLikeEventHeading,
  parseHuTextDate,
  foldHu,
  stripTags,
} from './recipes.mjs';

const md5ish = (s) => {
  // A small stable hash for the external id; collisions across a single source
  // would only merge genuinely identical (title|date) events, which is correct.
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

function splitDate(startDate) {
  const m = String(startDate || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (m) return { date: m[1], time: m[2] || null };
  const d = new Date(startDate);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: null };
  }
  return { date: null, time: null };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Turn a raw extracted event into the shape the ingest RPC expects. */
function normalize(raw, { publisherName, categories, sourceKey }) {
  const { date, time } = splitDate(raw.startDate);
  if (!raw.name || !date) return null;
  // A newsletter is inherently about the future; a date already past is almost
  // always last week's edition re-read, not a real listing.
  if (date < todayIso()) return null;

  return {
    external_source: 'email',
    external_id: `email:${sourceKey}:${md5ish(`${raw.name}|${date}`)}`,
    external_url: raw.url || null,
    title: String(raw.name).slice(0, 200),
    category: Array.isArray(categories) && categories.length ? categories[0] : 'Egyéb',
    subcategory: null,
    tags: (Array.isArray(categories) ? categories : []).slice(0, 4),
    description: raw.description || null,
    event_date: date,
    event_time: time,
    location_type: 'address',
    location_city: raw.city || null,
    location_address: raw.location || null,
    price_min: raw.offers?.price_min ?? null,
    currency: raw.offers?.currency ?? null,
    image_url: raw.image || null,
    image_candidates: raw.image ? [raw.image] : [],
    organizer_name: publisherName,
    source_payload: { channel: 'email', source: sourceKey },
  };
}

/**
 * Extracts events from one email.
 *
 * @param {object} email      { html, text, subject }
 * @param {object} source     { publisherName, categories, strategy, sourceKey }
 */
export function parseEmailEvents(email, source) {
  const html = String(email?.html || '');
  const text = String(email?.text || '');
  const strategy = source?.strategy || 'auto';
  const raw = [];

  // 1. JSON-LD — unless the operator pinned the source to prose.
  if (strategy === 'auto' || strategy === 'jsonld') {
    raw.push(...parseJsonLdEvents(html, null));
  }

  // 2. Heading sections — a list of named, dated blocks.
  if (!raw.length && (strategy === 'auto' || strategy === 'prose') && html) {
    for (const section of splitHeadingSections(html)) {
      if (!looksLikeEventHeading(section.heading, foldHu)) continue;
      const date = parseHuTextDate(stripTags(section.body));
      if (!date) continue;
      raw.push({
        name: section.heading,
        startDate: date,
        description: stripTags(section.body).slice(0, 400) || null,
        url: (section.body.match(/href=["'](https?:\/\/[^"']+)["']/i) || [])[1] || null,
      });
    }
  }

  // 3. A single prose event — a one-programme announcement.
  if (!raw.length && (strategy === 'auto' || strategy === 'prose')) {
    const body = html || `<h1>${email?.subject || ''}</h1><p>${text}</p>`;
    raw.push(...parseProsePage(body, null, { parseDate: parseHuTextDate }));
  }

  const sourceKey = source?.sourceKey || 'unknown';
  const seen = new Set();
  const events = [];
  for (const item of raw) {
    const normalized = normalize(item, { ...source, sourceKey });
    if (!normalized || seen.has(normalized.external_id)) continue;
    seen.add(normalized.external_id);
    events.push(normalized);
  }
  return events;
}
