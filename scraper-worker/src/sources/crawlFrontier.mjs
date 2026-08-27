/**
 * A depth-limited crawl that grows the trusted-source list.
 *
 * The one-hop harvest in discovery.mjs looks at a single listing page. This is
 * the real thing the crawl notes in C:\Work\Smartsearchtool describe (K4 — URL
 * frontier, per-host sub-queues, priority by depth; grepsearch crawler.server
 * crawlOne/crawlBatch; hercules priority = quality − depth·10): a proper
 * frontier that walks outward from proven sources, following links a couple of
 * levels deep, to discover event publishers we do not yet know.
 *
 * It is a PLANNER: the fetch and the robots check are injected, so the whole
 * traversal — budgets, dedup, depth, host caps — is testable against a fake
 * site with no network at all. The worker supplies the real fetch.
 *
 * Two kinds of link matter, and they are treated differently:
 *   - an OUTBOUND link to a host we do not collect is a candidate (the goal);
 *   - an INTERNAL link that looks like a listing is worth descending into, to
 *     reach more of the same site's event pages — but the site itself is not a
 *     new candidate, we already have it.
 *
 * Everything about it is bounded on purpose. A crawl that cannot exhaust itself
 * is the difference between discovery and a runaway bot: total page budget,
 * per-host cap, depth limit, robots at every fetch, near-duplicate skip.
 */

import { harvestLinks, scoreCandidate, isWorthReviewing, canonicalizeCandidateUrl } from './discovery.mjs';
import { simhash64, findNearDuplicate } from './fingerprint.mjs';
import { absoluteUrl, foldHu, isSocialUrl, stripTags } from './recipes.mjs';

/** Paths on a known-good host worth descending into to find more listings. */
const LISTING_PATH = /(esemeny|program|naptar|rendezveny|eloadas|koncert|calendar|events?|whats-?on|agenda|szinhaz|kiallitas|workshop|tura)/;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Internal links on a known-good host that look like more listing pages.
 * Capped hard: descending is a privilege, not an obligation.
 */
function internalListingLinks(html, pageUrl, host, limit = 8) {
  const found = new Map();
  const anchors = String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi);
  for (const match of anchors) {
    const resolved = absoluteUrl(pageUrl, match[1]);
    if (!resolved || !/^https?:\/\//i.test(resolved)) continue;
    if (hostOf(resolved) !== host) continue;
    if (isSocialUrl(resolved)) continue;

    const canonical = canonicalizeCandidateUrl(resolved);
    if (!canonical || canonical === pageUrl) continue;

    const path = foldHu(new URL(canonical).pathname);
    if (!LISTING_PATH.test(path)) continue;

    if (!found.has(canonical)) found.set(canonical, canonical);
    if (found.size >= limit) break;
  }
  return [...found.values()];
}

/**
 * Walks the frontier and returns the new-host candidates it found.
 *
 * @param {object} options
 * @param {string[]} options.seeds       URLs of proven sources to start from
 * @param {(url: string) => Promise<{ html: string|null, status?: number }>} options.fetchPage
 * @param {(url: string) => Promise<boolean>} [options.robotsAllows] defaults to always-allow
 * @param {Set<string>|string[]} [options.knownHosts] hosts already collected
 * @param {number} [options.maxDepth]    how many hops from a seed (default 2)
 * @param {number} [options.maxPages]    total fetch budget (default 40)
 * @param {number} [options.perHostCap]  most pages fetched from one host (default 6)
 * @param {(msg: string) => void} [options.log]
 */
export async function crawlFrontier({
  seeds = [],
  fetchPage,
  robotsAllows = async () => true,
  knownHosts = [],
  maxDepth = 2,
  maxPages = 40,
  perHostCap = 6,
  log = () => {},
} = {}) {
  if (typeof fetchPage !== 'function') throw new Error('crawlFrontier needs a fetchPage function');

  const known = knownHosts instanceof Set
    ? new Set([...knownHosts])
    : new Set([...knownHosts].map((host) => String(host).replace(/^www\./i, '').toLowerCase()));

  const visited = new Set();
  const hostFetches = new Map();
  const fingerprints = [];
  const candidatesByHost = new Map();
  let pagesFetched = 0;
  let nearDuplicatesSkipped = 0;

  // Seeds enter at depth 0; their own host is known by definition.
  const queue = [];
  for (const seed of seeds) {
    const canonical = canonicalizeCandidateUrl(seed);
    if (canonical) {
      queue.push({ url: canonical, depth: 0 });
      const host = hostOf(canonical);
      if (host) known.add(host);
    }
  }

  while (queue.length && pagesFetched < maxPages) {
    // Shallowest first: breadth-first keeps the crawl close to proven sources.
    queue.sort((a, b) => a.depth - b.depth);
    const { url, depth } = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    const host = hostOf(url);
    if (!host) continue;
    if ((hostFetches.get(host) ?? 0) >= perHostCap) continue;

    if (!(await robotsAllows(url))) {
      log(`  crawl: robots disallow ${url}`);
      continue;
    }

    let page;
    try {
      page = await fetchPage(url);
    } catch (error) {
      log(`  crawl: fetch failed ${url} (${String(error?.message || '').slice(0, 60)})`);
      continue;
    }
    pagesFetched += 1;
    hostFetches.set(host, (hostFetches.get(host) ?? 0) + 1);
    const html = page?.html;
    if (!html) continue;

    // Near-duplicate content — a re-slugged copy of a page already seen — adds
    // nothing. K4: without fingerprint dedup the frontier floods with copies.
    const fingerprint = simhash64(stripTags(html).slice(0, 20000));
    if (findNearDuplicate(fingerprint, fingerprints)) {
      nearDuplicatesSkipped += 1;
      log(`  crawl: near-duplicate skipped ${url}`);
      continue;
    }
    fingerprints.push(fingerprint);

    // Outbound links to hosts we do not know are the candidates we are after.
    const leads = harvestLinks(html, url, { knownHosts: known, limit: 20 });
    for (const lead of leads) {
      const scored = scoreCandidate({ url: lead.url, linkText: lead.linkText ?? '' });
      if (!isWorthReviewing(scored)) continue;

      const existing = candidatesByHost.get(lead.host);
      if (existing && existing.score >= scored.score) continue;
      candidatesByHost.set(lead.host, {
        host: lead.host,
        url: lead.url,
        link_text: lead.linkText,
        score: scored.score,
        reasons: scored.reasons,
        signals: scored.signals,
        depth: depth + 1,
        discovered_from_url: url,
        content_simhash: null,
      });
    }

    // Descend into the same host's other listing pages, up to the depth limit,
    // to reach event pages this crawl has not seen yet.
    if (depth < maxDepth) {
      for (const internal of internalListingLinks(html, url, host)) {
        if (!visited.has(internal)) queue.push({ url: internal, depth: depth + 1 });
      }
    }
  }

  return {
    candidates: [...candidatesByHost.values()],
    pagesFetched,
    hostsSeen: hostFetches.size,
    nearDuplicatesSkipped,
  };
}
