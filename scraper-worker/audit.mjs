// Source audit: fetches every registered source once (static GET) and records
// what extraction strategy the site supports. Produces audit-results.jsonl and
// a summary. Run locally: node audit.mjs path/to/urls.json
//
// Detected signals per source:
//   http status / final URL, JSON-LD Event on listing, microdata Event, RSS/Atom
//   feed link, .ics link, WordPress (+ The Events Calendar REST probe), JS-app
//   suspicion (tiny body / SPA root), event-link count for the current link
//   regex, and (when listing has no JSON-LD) whether a sampled detail page has it.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const urlsFile = process.argv[2] || 'audit-urls.json';
const OUT = 'audit-results.jsonl';
const CONCURRENCY = 10;
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const EVENT_LINK_RE = /\/(program|programok|event|events|esemeny|esemenyek|koncert|musor|eloadas|rendezveny|tura|hikeplans|show)(?:[\/\-_?#]|$)/i;

function normalizeUrl(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fetchText(url, accept = 'text/html,*/*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept, 'accept-language': 'hu,en;q=0.8' },
    });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url, text, contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.size < 800) {
    try { links.add(new URL(m[1], baseUrl).toString()); } catch { /* ignore */ }
  }
  return [...links];
}

function analyzeHtml(html, finalUrl) {
  const lower = html.toLowerCase();
  const jsonldEvent = /"@type"\s*:\s*"(?:[a-z]*event[a-z]*)"/i.test(html)
    || /"@type"\s*:\s*\[[^\]]*event/i.test(html);
  const jsonldAny = lower.includes('application/ld+json');
  const microdataEvent = /itemtype\s*=\s*["'][^"']*schema\.org\/[a-z]*event/i.test(html);
  const rssHref = (html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i))?.[1] || null;
  const icsLink = (html.match(/href=["']([^"']+\.ics[^"']*)["']/i))?.[1] || null;
  const wpContent = lower.includes('/wp-content/') || lower.includes('/wp-includes/');
  const tribeMarkup = lower.includes('tribe-events') || lower.includes('tribe_events');
  const mec = lower.includes('modern-events-calendar') || lower.includes('mec-event');
  const eventon = lower.includes('evo_event') || lower.includes('eventon');
  const spa = /<div[^>]+id=["'](?:root|app|__next|___gatsby)["']/.test(html) && html.length < 40000;
  const tinyBody = html.length < 6000;
  const host = (() => { try { return new URL(finalUrl).host.replace(/^www\./, ''); } catch { return ''; } })();
  const links = extractLinks(html, finalUrl);
  const sameHost = links.filter((u) => { try { return new URL(u).host.replace(/^www\./, '') === host; } catch { return false; } });
  const eventLinks = sameHost.filter((u) => { try { return EVENT_LINK_RE.test(new URL(u).pathname); } catch { return false; } });
  const dateLinks = sameHost.filter((u) => /20(2[5-9])[\/\-.]?(0[1-9]|1[0-2])/.test(u));
  return {
    jsonldEvent, jsonldAny, microdataEvent, rssHref, icsLink, wpContent,
    tribeMarkup, mec, eventon, spa, tinyBody,
    htmlBytes: html.length, sameHostLinks: sameHost.length,
    eventLinkCount: eventLinks.length, dateLinkCount: dateLinks.length,
    sampleEventLink: eventLinks.find((u) => u.split('?')[0] !== finalUrl.split('?')[0]) || null,
  };
}

async function auditOne(id, rawUrl) {
  const url = normalizeUrl(rawUrl);
  const row = { id, url, checkedAt: new Date().toISOString() };
  if (!url) return { ...row, verdict: 'no_url' };
  try {
    const page = await fetchText(url);
    row.status = page.status;
    row.finalUrl = page.finalUrl;
    row.contentType = page.contentType.split(';')[0];
    if (page.status >= 400) { row.verdict = `http_${page.status}`; return row; }
    if (/xml|rss|atom/.test(row.contentType)) { row.verdict = 'is_feed'; return row; }
    Object.assign(row, analyzeHtml(page.text, page.finalUrl));

    // Detail-page probe when the listing itself has no Event JSON-LD.
    if (!row.jsonldEvent && row.sampleEventLink) {
      try {
        const detail = await fetchText(row.sampleEventLink);
        row.detailJsonldEvent = /"@type"\s*:\s*"(?:[a-z]*event[a-z]*)"/i.test(detail.text);
        row.detailMicrodataEvent = /itemtype\s*=\s*["'][^"']*schema\.org\/[a-z]*event/i.test(detail.text);
      } catch { row.detailProbeError = true; }
    }

    // WordPress: probe The Events Calendar REST API.
    if (row.wpContent || row.tribeMarkup) {
      try {
        const origin = new URL(page.finalUrl).origin;
        const probe = await fetchText(`${origin}/wp-json/tribe/events/v1/events?per_page=1`, 'application/json');
        row.tribeApi = probe.status === 200 && probe.text.trimStart().startsWith('{');
      } catch { row.tribeApi = false; }
    }

    row.verdict =
      row.jsonldEvent ? 'jsonld_listing'
      : row.detailJsonldEvent ? 'jsonld_detail'
      : row.tribeApi ? 'tribe_api'
      : (row.microdataEvent || row.detailMicrodataEvent) ? 'microdata'
      : row.rssHref ? 'rss'
      : row.icsLink ? 'ics'
      : (row.spa || row.tinyBody) ? 'js_app'
      : row.eventLinkCount > 0 ? 'links_no_schema'
      : 'no_signal';
  } catch (e) {
    row.verdict = 'fetch_error';
    row.error = String(e.message || e).slice(0, 120);
  }
  return row;
}

async function main() {
  const urls = JSON.parse(readFileSync(urlsFile, 'utf8'));
  const entries = Object.entries(urls);
  writeFileSync(OUT, '');
  let done = 0;
  const queue = [...entries];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [id, url] = queue.shift();
      const row = await auditOne(id, url);
      appendFileSync(OUT, JSON.stringify(row) + '\n');
      done += 1;
      if (done % 25 === 0) console.log(`${done}/${entries.length}`);
    }
  });
  await Promise.all(workers);

  const rows = readFileSync(OUT, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const byVerdict = {};
  for (const r of rows) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
  console.log('\nSUMMARY:', JSON.stringify(byVerdict, null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
