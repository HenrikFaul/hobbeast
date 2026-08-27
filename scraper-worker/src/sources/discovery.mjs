/**
 * Finding new programme sources from the pages we already read.
 *
 * The collector has 309 known hosts and 115 that actually produce events. Every
 * one of them was added by hand. But those pages link outward constantly — a
 * venue lists its partners, a festival links its stages, a town hall links its
 * cultural centre — and those links are the best-qualified leads available:
 * they come from a site that already publishes Hungarian programmes.
 *
 * This module does the two pure parts of that, so both are testable without a
 * network or a database:
 *
 *   harvestLinks  — which outbound links are worth looking at at all
 *   scoreCandidate — how likely a page is to be a programme listing
 *
 * It deliberately reuses the engine's own vocabulary (absoluteUrl, foldHu,
 * isSocialUrl, normalizeSourceUrl) rather than inventing a parallel one.
 */

import { absoluteUrl, foldHu, isSocialUrl, normalizeSourceUrl, stripTags } from './recipes.mjs';

/** Paths that name a programme listing in Hungarian or English. */
const LISTING_PATH = /(esemeny|esemenyek|program|programok|programnaptar|naptar|rendezveny|rendezvenyek|eloadas|koncert|fellepo|jegyek|calendar|events?|whats-?on|agenda|schedule|szinhaz|kiallitas|workshop|tura|verseny)/;

/** Paths that never lead to a listing, however many events the site has. */
const DEAD_END_PATH = /(\/wp-(admin|login|json|content\/uploads)|\/(kosar|cart|checkout|fiok|account|login|bejelentkez|regisztr|adatvedelem|privacy|impresszum|imprint|aszf|terms|cookie|kapcsolat|contact|rolunk|about)\b|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp[34]|avi|mov)$)/;

/** Hosts that are never a source of their own: aggregators and infrastructure. */
const IGNORED_HOST = /(^|\.)(google\.|googleapis\.|gstatic\.|facebook\.|fbcdn\.|instagram\.|twitter\.|x\.com|linkedin\.|youtube\.|youtu\.be|tiktok\.|pinterest\.|w3\.org|schema\.org|gravatar\.|wordpress\.org|cloudflare\.|jsdelivr\.|unpkg\.|paypal\.|maps\.)/i;

/**
 * Query parameters that never change what a page says.
 *
 * Taken from the crawl notes in C:\Work\Smartsearchtool (K4 — "clean-params"):
 * tracking, session and view-state parameters are excluded from both the index
 * and frontier expansion. Without this the same listing arrives as a dozen
 * different candidates.
 */
const TRACKING_PARAM = /^(utm_|fbclid|gclid|msclkid|mc_[ce]id|_ga|_gl|yclid|igshid|ref|referrer|source|fb_action|campaign|piwik_|pk_|hsa_|s_kwcid|trk|spm)/i;

/** Parameters whose value is a session or a nonce — infinite by nature. */
const SESSION_PARAM = /^(sid|sessionid|session_id|phpsessid|jsessionid|token|nonce|csrf|_token)$/i;

/**
 * The traps K4 names, in the order they actually bite an events crawler.
 *
 * A calendar is the worst of them here: an events site will happily generate
 * `?date=2031-07-04` for ever, and each one looks like a fresh listing. Left
 * unguarded, one municipal calendar would fill the whole frontier.
 */
function isCrawlTrap(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const params = [...parsed.searchParams.keys()].map((key) => key.toLowerCase());

  // Calendar navigation: a bottomless supply of URLs.
  if (params.some((key) => /^(date|day|month|year|week|from|to|start|end|ev_[a-z]+|eventdate)$/.test(key))) return true;
  if (/\/(19|20)\d{2}\/\d{1,2}(\/\d{1,2})?\/?$/.test(parsed.pathname)) return true;

  // Internal search results are not a source; they are a query.
  if (params.some((key) => /^(q|s|search|keyword|query|kereses)$/.test(key))) return true;
  if (/\/(search|kereses|talalatok)\b/.test(parsed.pathname)) return true;

  if (params.some((key) => SESSION_PARAM.test(key))) return true;

  // Parameter explosion: a faceted filter combining itself.
  if (params.length > 6) return true;

  // Deep pagination is the same listing further down.
  const page = parsed.searchParams.get('page') ?? parsed.searchParams.get('oldal');
  if (page && Number(page) > 3) return true;

  // A repeated path token means the site is generating URLs from itself.
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length > 8) return true;
  const seen = new Set();
  for (const segment of segments) {
    if (seen.has(segment)) return true;
    seen.add(segment);
  }

  return false;
}

/**
 * One address for one page.
 *
 * K4's canonicalization rules: strip tracking parameters, sort what remains,
 * and fold the differences that never mean anything — scheme, `www.`, a
 * trailing slash. Two links to the same listing must become one candidate.
 */
export function canonicalizeCandidateUrl(input) {
  const raw = String(input ?? '').trim();
  // A scheme that is not the web is not a candidate. Without this check
  // "mailto:a@b.hu" acquires an https:// prefix and parses into nonsense,
  // because it has no "//" for the normaliser to recognise.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;

  const normalized = normalizeSourceUrl(raw);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    // A host with no dot is a local name, not a site on the web.
    if (!url.hostname.includes('.')) return null;
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    url.username = '';
    url.password = '';
    url.hash = '';

    const kept = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM.test(key) && !SESSION_PARAM.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, value] of kept) url.searchParams.append(key, value);

    // A trailing slash on a path means nothing; on the root it is the norm.
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** A link's own words, cleaned of markup. */
function linkText(anchorHtml) {
  return stripTags(String(anchorHtml || '')).slice(0, 120).trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Every outbound link on a page that could plausibly be a new source.
 *
 * "Outbound" is the whole point: a link back into a host we already collect
 * teaches us nothing, and following it would just re-crawl our own registry.
 *
 * @param {string} html      the page as fetched
 * @param {string} pageUrl   where it came from, to resolve relative links
 * @param {object} options
 * @param {Set<string>|string[]} options.knownHosts hosts already in the registry
 * @param {number} [options.limit] most candidates to return from one page
 */
export function harvestLinks(html, pageUrl, { knownHosts = [], limit = 40 } = {}) {
  const known = knownHosts instanceof Set
    ? knownHosts
    : new Set([...knownHosts].map((host) => String(host).replace(/^www\./i, '').toLowerCase()));

  const origin = hostOf(pageUrl);
  if (origin) known.add(origin);

  const seen = new Map();

  const anchors = String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi);
  for (const match of anchors) {
    const resolved = absoluteUrl(pageUrl, match[1]);
    if (!resolved || !/^https?:\/\//i.test(resolved)) continue;

    const host = hostOf(resolved);
    if (!host || known.has(host)) continue;
    if (IGNORED_HOST.test(host)) continue;
    if (isSocialUrl(resolved)) continue;

    const path = foldHu(new URL(resolved).pathname + new URL(resolved).search);
    if (DEAD_END_PATH.test(path)) continue;

    // A calendar, an internal search or a faceted filter is a bottomless
    // supply of URLs, not a source. K4 calls these frontier guards.
    if (isCrawlTrap(resolved)) continue;

    const canonical = canonicalizeCandidateUrl(resolved);
    if (!canonical) continue;

    const text = linkText(match[2]);
    const folded = foldHu(text);

    // One candidate per host: the site's own listing page is found later by
    // looking at that host properly, not by hoarding forty of its links.
    const existing = seen.get(host);
    const looksLikeListing = LISTING_PATH.test(path) || LISTING_PATH.test(folded);
    if (existing && !(looksLikeListing && !existing.looksLikeListing)) continue;

    seen.set(host, {
      url: canonical,
      host,
      linkText: text || null,
      looksLikeListing,
      foundOn: pageUrl,
    });

    if (seen.size >= limit * 3) break;
  }

  return [...seen.values()]
    .sort((a, b) => Number(b.looksLikeListing) - Number(a.looksLikeListing))
    .slice(0, limit);
}

/**
 * How likely a page is to be a programme listing, 0–100, with the reasons.
 *
 * The reasons matter as much as the number: an operator deciding whether to
 * add a source should see WHY it was suggested, not just a score. Every signal
 * below is one the collector already relies on elsewhere.
 */
export function scoreCandidate({ url = '', title = '', html = '', linkText = '' } = {}) {
  const reasons = [];
  let score = 0;

  const path = (() => {
    try {
      const parsed = new URL(url);
      return foldHu(parsed.pathname + parsed.search);
    } catch {
      return foldHu(url);
    }
  })();

  if (LISTING_PATH.test(path)) {
    score += 25;
    reasons.push('A cím útvonala programlistára utal');
  }
  if (LISTING_PATH.test(foldHu(linkText))) {
    score += 10;
    reasons.push('A hivatkozás szövege programra utal');
  }
  if (LISTING_PATH.test(foldHu(title))) {
    score += 10;
    reasons.push('Az oldal címe programra utal');
  }

  const body = String(html || '');

  // The strongest signal there is: the page states its own events.
  const jsonLdEvents = (body.match(/"@type"\s*:\s*"[^"]*Event[^"]*"/gi) || []).length;
  if (jsonLdEvents > 0) {
    score += Math.min(35, 15 + jsonLdEvents * 4);
    reasons.push(`${jsonLdEvents} strukturált esemény az oldalon`);
  }

  // A calendar feed is a promise to keep publishing.
  if (/\.ics\b|text\/calendar|tribe_events|\/events\/feed/i.test(body)) {
    score += 15;
    reasons.push('Naptár- vagy eseményfolyam található rajta');
  }

  // Many dates close together is what a listing looks like without markup.
  const dates = (body.match(/\b20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/g) || []).length;
  if (dates >= 5) {
    score += Math.min(20, 8 + Math.floor(dates / 3));
    reasons.push(`${dates} dátum a lapon`);
  }

  const times = (body.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).length;
  if (dates >= 3 && times >= 3) {
    score += 5;
    reasons.push('Dátumok és időpontok együtt');
  }

  // A shop is not a programme source, however many dates it shows.
  if (/(kosarba|kosarba tesz|add to cart|termek\b|webshop)/.test(foldHu(body).slice(0, 20000))) {
    score -= 15;
    reasons.push('Webshop jelek — lehet, hogy nem programoldal');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    signals: { jsonLdEvents, dates, times },
  };
}

/**
 * Whether a candidate is worth an operator's attention.
 *
 * Deliberately not automatic: a discovered host is a suggestion, and adding it
 * to the collector stays a human decision. The threshold only decides what
 * reaches the list.
 */
export function isWorthReviewing(scored) {
  return scored.score >= 30;
}
