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
