// RSS/Atom strategy: the source audit found a working feed for these sources.
// Feed items give us fresh links; each item link is fetched and parsed with the
// shared detail extractor (JSON-LD -> microdata -> og:). When a detail page has
// no structured Event data, we fall back to a Hungarian free-text date found in
// the item title/description — items without any future date are skipped.

import {
  buildEvent, extractDetailEvents, normalizeEndpointUrl, parseHuTextDate,
  resolveEventImages, stripHtml,
} from './generic.mjs';

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

export function parseFeedItems(xml) {
  const items = [];
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)];
  for (const b of blocks) {
    const block = b[0];
    const title = tagText(block, 'title');
    let link = tagText(block, 'link');
    if (!link) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? decodeEntities(href[1]) : null;
    }
    const description = tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content:encoded') || tagText(block, 'content');
    const image = block.match(/<(?:media:content|enclosure)[^>]*url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)?.[1]
      || description?.match(/<img[^>]*src=["']([^"']+)["']/i)?.[1] || null;
    if (title && link && /^https?:\/\//i.test(link)) {
      items.push({ title, link, description: description ? stripHtml(description).slice(0, 500) : null, image });
    }
  }
  return items;
}

export async function scrapeRssSource(source, { fetchStatic, maxDetails = 40, delayMs = 350, log = () => {} }) {
  const feedUrl = normalizeEndpointUrl(source.scrape_feed_url || source.endpoint_url);
  if (!feedUrl) return { events: [], httpStatus: null };
  let xml;
  try {
    xml = await fetchStatic(feedUrl);
  } catch (e) {
    log(`    feed failed ${feedUrl}: ${e.message.slice(0, 60)}`);
    const m = e.message.match(/HTTP (\d{3})/);
    return { events: [], httpStatus: m ? Number(m[1]) : null };
  }

  const items = parseFeedItems(xml).slice(0, maxDetails);
  const events = [];
  for (const item of items) {
    let pushed = false;
    try {
      const html = await fetchStatic(item.link);
      for (const ev of extractDetailEvents(html, item.link)) {
        if (!ev.image && item.image) ev.image = item.image;
        const row = buildEvent(source, ev, { listingUrl: feedUrl, detailUrl: item.link });
        if (row) { events.push(row); pushed = true; }
      }
    } catch { /* detail fetch failed; fall through to text-date fallback */ }

    if (!pushed) {
      const date = parseHuTextDate(`${item.title} ${item.description || ''}`);
      if (date) {
        const row = buildEvent(source, {
          name: item.title,
          startDate: date,
          url: item.link,
          image: item.image,
          description: item.description,
          offers: { price_min: null, currency: null, ticket_url: null },
        }, { listingUrl: feedUrl, detailUrl: item.link });
        if (row) events.push(row);
      }
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { events: resolveEventImages(events), httpStatus: 200 };
}
