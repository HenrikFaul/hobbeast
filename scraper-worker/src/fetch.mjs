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

// Very small robots.txt evaluator for the User-agent:* group. Returns true if the
// exact path prefix is not disallowed. Fails OPEN only for a missing robots file
// (200-less), fails CLOSED on an explicit matching Disallow.
export async function robotsAllows(url) {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  if (!robotsCache.has(origin)) {
    let rules = { disallow: [] };
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
      if (res.ok) rules = parseRobots(await res.text());
    } catch { /* no robots -> allow */ }
    robotsCache.set(origin, rules);
  }
  const { disallow } = robotsCache.get(origin);
  const path = u.pathname + u.search;
  return !disallow.some((d) => d && path.startsWith(d));
}

function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  let inStar = false;
  const disallow = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [kRaw, ...rest] = line.split(':');
    const k = kRaw.trim().toLowerCase();
    const v = rest.join(':').trim();
    if (k === 'user-agent') inStar = v === '*';
    else if (inStar && k === 'disallow' && v) disallow.push(v);
    else if (inStar && k === 'allow') { /* allow entries ignored in this minimal check */ }
  }
  return { disallow };
}
