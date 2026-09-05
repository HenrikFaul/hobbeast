/**
 * A persistent frontier for the collector's detail-fetch step.
 *
 * scrapeGenericSource renders a listing, collects its same-host event links,
 * shuffles them, fetches the first N — and forgets everything when the run
 * ends. A listing with 300 event pages and a budget of 40 is re-sampled from
 * scratch every night: the same pages come round again while others are never
 * reached. This is the queue the grepsearch crawler keeps instead
 * (event-crawler.server eventCrawlTick + the event_queue table: pending /
 * running / done, priority by link shape, depth, found_events), scoped per
 * source: every link is enqueued once, each run claims the top-N by priority
 * and depth, marks them done with what it found, and enqueues what the detail
 * pages themselves link to one level deeper. Successive runs CONVERGE on full
 * coverage instead of resampling.
 *
 * It is a PLANNER in the crawlFrontier.mjs mould: the queue (six RPC-shaped
 * methods), the conditional fetch and the extractor are injected, so the whole
 * walk — priorities, revisits, 304 handling, host backoff, the time budget —
 * is testable against an in-memory queue and a fake site with no network and
 * no database. The worker supplies the real ones.
 *
 * Failure discipline, because this wraps a path that already works:
 *   - enqueueing the seeds and claiming THROW, so the caller can fall back to
 *     the shuffle path having fetched nothing yet;
 *   - every later queue call is best-effort — counted, logged, never fatal —
 *     because by then pages have been fetched and their events must survive;
 *   - a 429/503 backs the host off and hands the rest of its rows back for a
 *     later run; the time budget hands back whatever is left.
 * Honest UA and robots both live in the injected fetch, not here.
 */

/** Rows per enqueue call; well inside the RPC's 2000-element cap. */
const ENQUEUE_CHUNK = 500;
/** Most links harvested from one detail page. Descending is a privilege. */
const KIDS_PER_PAGE = 200;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function chunked(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Order-preserving dedup of a list that may hold junk. */
function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls || []) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * How long a host is left alone after a 429/503: four delays, floored at 2s
 * so a fast source still gets a real pause, capped at 60s so a slow one
 * (jegy.hu asks for 20s) does not lock itself out for an hour.
 */
export function backoffSeconds(delayMs) {
  return Math.ceil(Math.min(Math.max((Number(delayMs) || 0) * 4, 2000), 60000) / 1000);
}

/**
 * Seeds the frontier with the listing's links, claims this run's share,
 * fetches them in claim order and returns the extracted events with the URL
 * each came from. The caller runs buildEvent; this knows nothing of sources.
 *
 * @param {object} options
 * @param {string} options.sourceId
 * @param {string} options.listingUrl
 * @param {string} options.listingHost
 * @param {string[]} options.candidateUrls   already worthFetching-filtered; may be hundreds
 * @param {{ enqueue: Function, claim: Function, finish: Function, release: Function, hostBackoff: Function, clearBackoff: Function }} options.queue
 * @param {(url: string, validators: { etag: string|null, lastModified: string|null }) => Promise<{ html: string|null, status?: number, notModified?: boolean, etag?: string|null, lastModified?: string|null }>} options.fetchDetail
 * @param {(html: string, url: string) => object[]} options.extractFromDetail
 * @param {(html: string, pageUrl: string) => string[]} [options.harvestLinks]  same-host links on a DETAIL page, for depth+1
 * @param {(pathname: string) => boolean} [options.isDetailShaped]  priority 2 if true, else 0.5
 * @param {number} [options.maxDetails]    rows claimed per run (default 40)
 * @param {number} [options.maxDepth]      deepest row that still harvests (default 2)
 * @param {number} [options.delayMs]       pause between fetches (default 400)
 * @param {number} [options.timeBudgetMs]  wall-clock cap for the fetch loop (default 240000)
 * @param {(msg: string) => void} [options.log]
 */
export async function runCollectionFrontier({
  sourceId,
  listingUrl,
  listingHost,
  candidateUrls = [],
  queue,
  fetchDetail,
  extractFromDetail,
  harvestLinks = () => [],
  isDetailShaped = () => false,
  maxDetails = 40,
  maxDepth = 2,
  delayMs = 400,
  timeBudgetMs = 240000,
  log = () => {},
  // The clock and the pause are injectable so the budget and the pacing are
  // testable without waiting. The worker never passes them.
  now = () => Date.now(),
  sleep = defaultSleep,
} = {}) {
  if (!sourceId) throw new Error('runCollectionFrontier needs a sourceId');
  if (!queue || typeof queue.enqueue !== 'function' || typeof queue.claim !== 'function') {
    throw new Error('runCollectionFrontier needs a queue with enqueue and claim');
  }
  if (typeof fetchDetail !== 'function') throw new Error('runCollectionFrontier needs a fetchDetail function');
  if (typeof extractFromDetail !== 'function') throw new Error('runCollectionFrontier needs an extractFromDetail function');

  const events = [];
  let fetched = 0;
  let notModified = 0;
  let enqueued = 0;
  let released = 0;
  let errors = 0;
  let backoffs = 0;

  const priorityOf = (url) => (isDetailShaped(pathOf(url)) ? 2 : 0.5);
  const toRows = (urls, { host, depth, discoveredFrom }) => urls.map((url) => ({
    url, host, depth, priority: priorityOf(url), discovered_from: discoveredFrom,
  }));

  /** A queue call whose failure must not cost us the pages already fetched. */
  const bestEffort = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      errors += 1;
      log(`    frontier: queue.${label} failed (${String(error?.message || '').slice(0, 60)})`);
      return undefined;
    }
  };

  // 1. Seed: every candidate the listing offered, at depth 1. The far side is
  //    ON CONFLICT DO NOTHING, so re-seeding every run is cheap and idempotent;
  //    only rows that are genuinely new count. A throw here propagates.
  const seeds = toRows(
    uniqueUrls(candidateUrls).filter((url) => url !== listingUrl),
    { host: listingHost, depth: 1, discoveredFrom: listingUrl },
  );
  for (const batch of chunked(seeds, ENQUEUE_CHUNK)) {
    enqueued += Number(await queue.enqueue(sourceId, batch)) || 0;
  }

  // 2. Claim this run's share: pending first, then stale revisits, by priority
  //    and depth. A throw here propagates too — nothing has been fetched.
  const claimed = [...((await queue.claim(sourceId, maxDetails)) || [])]
    .filter((row) => row && row.id && row.url);

  // 3. Walk in claim order. Rows we cannot get to — budget spent, host backed
  //    off — go back to pending in one release at the end.
  const started = now();
  const hostsBackedOff = new Set();
  const hostsCleared = new Set();
  const toRelease = [];
  let attempted = 0;

  for (let i = 0; i < claimed.length; i += 1) {
    const row = claimed[i];

    if (now() - started > timeBudgetMs) {
      for (const rest of claimed.slice(i)) toRelease.push(rest.id);
      log(`    frontier: time budget spent, releasing ${claimed.length - i}`);
      break;
    }
    if (hostsBackedOff.has(row.host)) {
      toRelease.push(row.id);
      continue;
    }

    // Pace BETWEEN requests only: never before the first, never after the last.
    if (delayMs && attempted > 0) await sleep(delayMs);
    attempted += 1;

    let page;
    try {
      page = await fetchDetail(row.url, { etag: row.etag ?? null, lastModified: row.last_modified ?? null });
    } catch (error) {
      const message = String(error?.message || error || '');
      if (/^HTTP (429|503)\b/.test(message)) {
        // The site is telling us to slow down. Note it for every source on
        // this host and leave the rest of its rows for a later run.
        const seconds = backoffSeconds(delayMs);
        await bestEffort('hostBackoff', () => queue.hostBackoff(row.host, seconds));
        hostsBackedOff.add(row.host);
        backoffs += 1;
        log(`    frontier: ${message} from ${row.host}, backing off ${seconds}s`);
      } else {
        log(`    detail failed ${row.url}: ${message.slice(0, 60)}`);
      }
      await bestEffort('finish', () => queue.finish(row.id, { status: 'error', error: message.slice(0, 300) }));
      errors += 1;
      continue;
    }

    // A conditional GET that came back 304: the page has not changed since we
    // last read it, so what we found then still stands. No re-extract.
    if (page?.notModified) {
      await bestEffort('finish', () => queue.finish(row.id, {
        status: 'done',
        foundEvents: row.found_events ?? null,
        etag: page.etag ?? null,
        lastModified: page.lastModified ?? null,
      }));
      notModified += 1;
      continue;
    }

    fetched += 1;
    const html = page?.html ?? '';
    let extracted;
    try {
      extracted = [...(extractFromDetail(html, row.url) || [])];
    } catch (error) {
      const message = String(error?.message || '');
      log(`    detail failed ${row.url}: ${message.slice(0, 60)}`);
      await bestEffort('finish', () => queue.finish(row.id, { status: 'error', error: message.slice(0, 300) }));
      errors += 1;
      continue;
    }
    for (const ev of extracted) events.push({ ev, detailUrl: row.url });
    await bestEffort('finish', () => queue.finish(row.id, {
      status: 'done',
      foundEvents: extracted.length,
      etag: page.etag ?? null,
      lastModified: page.lastModified ?? null,
    }));

    // One good answer clears any earlier backoff on the host. Clearing is a
    // no-op when there was none, so once per host per run is enough.
    if (!hostsCleared.has(row.host)) {
      await bestEffort('clearBackoff', () => queue.clearBackoff(row.host));
      hostsCleared.add(row.host);
    }

    // Descend: what this detail page links to, one level deeper, up to the
    // depth limit. Best-effort — a failed enqueue must not discard the events
    // above, and the links will be offered again next run.
    if ((row.depth ?? 1) < maxDepth) {
      let kids = [];
      try {
        kids = uniqueUrls(harvestLinks(html, row.url));
      } catch (error) {
        errors += 1;
        log(`    frontier: harvest failed ${row.url} (${String(error?.message || '').slice(0, 60)})`);
      }
      kids = kids.filter((url) => url !== row.url && url !== listingUrl).slice(0, KIDS_PER_PAGE);
      const rows = toRows(kids, { host: row.host, depth: (row.depth ?? 1) + 1, discoveredFrom: row.url });
      for (const batch of chunked(rows, ENQUEUE_CHUNK)) {
        const inserted = await bestEffort('enqueue', () => queue.enqueue(sourceId, batch));
        enqueued += Number(inserted) || 0;
      }
    }
  }

  if (toRelease.length) {
    const count = await bestEffort('release', () => queue.release(toRelease));
    released += Number(count) || 0;
  }

  return {
    events,
    claimed: claimed.length,
    fetched,
    notModified,
    enqueued,
    released,
    errors,
    backoffs,
  };
}
