// Minimal polite static fetcher + robots.txt gate. HTTPS only.

/**
 * The token that names us, and the single place it is written.
 *
 * Every request this project makes — plain fetch, robots.txt lookup, and the
 * Playwright render path — carries it, so a site can always tell who is asking
 * and can address a robots.txt rule to us. ROBOTS_SELF_TOKENS is what we match
 * such a rule against, kept lowercase for comparison.
 */
export const BOT_TOKEN = 'HobbeastBot/1.0 (+https://expericentre.com; event aggregation)';
export const ROBOTS_SELF_TOKENS = ['hobbeastbot'];

const UA = BOT_TOKEN;

/**
 * The user-agent for the Playwright render path.
 *
 * It keeps the Chrome compatibility string because a real browser is what is
 * doing the rendering and some sites branch their markup on it — but our token
 * is appended, which is the standard way to be honest about an automated
 * client without breaking UA sniffing. It must never be used to look like
 * something we are not: if a site refuses this, the answer is to disable the
 * source and record why, never to strip the token off.
 */
export const RENDER_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 ${BOT_TOKEN}`;

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

// Phrases a bot-check interstitial puts in the body. Borrowed from the
// grepsearch crawler, which added the Hungarian one for local sites.
const CHALLENGE_HINTS = [
  'csak egy gyors ellenőrzés',
  'just a moment',
  'checking your browser',
  'attention required',
  'cf-browser-verification',
  'cloudflare',
];

/**
 * Did the site REFUSE us, as opposed to serving a page we simply found nothing
 * in? A pure classifier — it changes no behaviour and triggers no retry.
 *
 * The distinction matters for reporting. Ticketmaster CZ and PL log "succeeded,
 * 0 discovered" today, which reads exactly like a parser that needs work; in
 * fact they answer 403 from the CI datacenter IP. Telling the two apart stops
 * anyone burning an afternoon writing selectors for a page they were never
 * served. It is explicitly NOT a hook for evading the block.
 *
 * The length guard is what keeps a genuine article about Cloudflare from being
 * misread as a challenge: interstitials are tiny, real pages are not.
 */
export function looksLikeBotChallenge(status, html) {
  if (status === 403 || status === 429 || status === 503) return true;
  if (!html) return false;
  const head = String(html).toLowerCase().slice(0, 4000);
  return String(html).length < 20000 && CHALLENGE_HINTS.some((s) => head.includes(s));
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

export function parseRobots(text, selfTokens = ROBOTS_SELF_TOKENS) {
  // Parse into groups first. Consecutive User-agent lines head ONE group, which
  // is why `expectingAgents` exists: "User-agent: a\nUser-agent: b\nDisallow: /"
  // is a single group naming two agents, not two groups.
  const groups = [];
  let current = null;
  let expectingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [kRaw, ...rest] = line.split(':');
    const k = kRaw.trim().toLowerCase();
    const v = rest.join(':').trim();

    if (k === 'user-agent') {
      if (!expectingAgents) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(v.toLowerCase());
      continue;
    }
    expectingAgents = false;
    if (!current) continue; // a directive before any User-agent line belongs to nobody

    if (k === 'crawl-delay') {
      const n = Number(v);
      if (Number.isFinite(n)) current.crawlDelay = Math.max(current.crawlDelay ?? 0, n);
    } else if ((k === 'disallow' || k === 'allow') && v) {
      // "Disallow:" with an empty value means "nothing is disallowed" and is
      // correctly skipped by the `&& v` guard above.
      current.rules.push({ allow: k === 'allow', length: v.length, re: robotsPatternToRegExp(v) });
    }
  }

  // Standard precedence: a group that NAMES us wins outright over the wildcard
  // group. This is the other half of identifying honestly — once we say who we
  // are, a site can address a rule to us, and we have to be able to read it.
  // Until v1.68.0 only `User-agent: *` was consulted, so such a rule would have
  // been silently ignored.
  const tokens = (selfTokens ?? []).map((t) => t.toLowerCase());
  const named = groups.filter((g) => g.agents.some(
    (a) => a !== '*' && tokens.some((t) => a.includes(t)),
  ));
  // Several `User-agent: *` blocks in one file are common (visitkoper.si has
  // two: one carries Crawl-delay, the other the Disallow list). Merge them, as
  // the pre-group implementation effectively did, so nothing is lost.
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes('*'));

  const rules = chosen.flatMap((g) => g.rules);
  const delays = chosen.map((g) => g.crawlDelay).filter((d) => Number.isFinite(d));
  return {
    rules,
    crawlDelay: delays.length ? Math.max(...delays) : null,
    matchedAgent: named.length ? 'self' : (chosen.length ? '*' : 'none'),
  };
}
