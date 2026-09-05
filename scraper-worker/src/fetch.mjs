// Minimal polite static fetcher + robots.txt gate. HTTPS only.
const UA = 'HobbeastBot/1.0 (+https://expericentre.com; event aggregation)';
const robotsCache = new Map();

export async function fetchStatic(url, { timeoutMs = 15000 } = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('non-https url rejected');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * A conditional fetch for the crawler (K4/K7 — conditional GET for cheap
 * freshness).
 *
 * If we hold an ETag or Last-Modified from the last time we saw this page, we
 * send them back as If-None-Match / If-Modified-Since. A page that has not
 * changed answers 304 with no body, and re-parsing it is skipped entirely —
 * which, across a registry of hundreds of listing pages recrawled nightly, is
 * most of the bandwidth. Returns the validators for next time.
 */
export async function fetchConditional(url, { timeoutMs = 15000, etag = null, lastModified = null } = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('non-https url rejected');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
  if (etag) headers['if-none-match'] = etag;
  if (lastModified) headers['if-modified-since'] = lastModified;
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
    const nextEtag = res.headers.get('etag');
    const nextModified = res.headers.get('last-modified');
    if (res.status === 304) {
      return { status: 304, notModified: true, html: null, etag: nextEtag ?? etag, lastModified: nextModified ?? lastModified };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { status: res.status, notModified: false, html, etag: nextEtag, lastModified: nextModified };
  } finally {
    clearTimeout(t);
  }
}

// robots.txt evaluator for the User-agent:* group. Fails OPEN only for a missing
// or unreadable robots file, fails CLOSED on a matching Disallow.
//
// Wildcards are honoured, which plain prefix matching cannot do. This matters:
// konzerthaus.at publishes `Disallow: /*?`, goout.net `Disallow: /*/profile/`
// and kinodvor.org `Disallow: /potrditve/*`. Read as literal prefixes those
// patterns match nothing at all, so the worker would have crawled exactly the
// URLs those sites asked it to leave alone.
async function robotsFor(url) {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  if (!robotsCache.has(origin)) {
    let rules = { rules: [], crawlDelay: null };
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
      if (res.ok) rules = parseRobots(await res.text());
    } catch { /* no robots -> allow */ }
    robotsCache.set(origin, rules);
  }
  return robotsCache.get(origin);
}

export async function robotsAllows(url) {
  const u = new URL(url);
  const { rules } = await robotsFor(url);
  return allowsPath(rules, u.pathname + u.search);
}

/**
 * Standard precedence: the most specific matching rule wins, and Allow beats
 * Disallow on an equal-length match. Without this, a site that disallows a
 * whole tree and re-allows one page inside it would lose the exception.
 * Exported pure so it can be tested without touching the network.
 */
export function allowsPath(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!rule.re.test(path)) continue;
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

/** Crawl-delay in ms for this host's `User-agent: *` group, or null. */
export async function robotsCrawlDelayMs(url) {
  const { crawlDelay } = await robotsFor(url);
  return Number.isFinite(crawlDelay) && crawlDelay > 0 ? crawlDelay * 1000 : null;
}

/**
 * A robots path pattern as a regex. `*` matches any run of characters and a
 * trailing `$` anchors the end; everything else is literal. The pattern is
 * always anchored at the start, which is what makes an unanchored prefix like
 * `/admin` still match `/admin/users`.
 */
function robotsPatternToRegExp(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

export function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  let inStar = false;
  const rules = [];
  let crawlDelay = null;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [kRaw, ...rest] = line.split(':');
    const k = kRaw.trim().toLowerCase();
    const v = rest.join(':').trim();
    if (k === 'user-agent') { inStar = v === '*'; continue; }
    if (!inStar) continue;
    if (k === 'crawl-delay') {
      const n = Number(v);
      if (Number.isFinite(n)) crawlDelay = Math.max(crawlDelay ?? 0, n);
    } else if ((k === 'disallow' || k === 'allow') && v) {
      // "Disallow:" with an empty value means "nothing is disallowed" and is
      // correctly skipped by the `&& v` guard above.
      rules.push({ allow: k === 'allow', length: v.length, re: robotsPatternToRegExp(v) });
    }
  }
  return { rules, crawlDelay };
}
