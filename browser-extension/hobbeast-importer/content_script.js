/**
 * Reads the Facebook page the operator is already looking at.
 *
 * Runs only when they press the extension button, only on that tab, and never
 * on its own. Nothing is submitted from here: the popup shows what was found
 * and the operator corrects it before anything leaves the browser.
 *
 * Two kinds of page are understood:
 *   - an EVENT (/events/…), which states its own date and place
 *   - a POST (/posts/…, /permalink/…, /photo/…), which is just text an
 *     operator would otherwise copy into the "Bejegyzésből" admin panel
 *
 * Facebook's class names are generated and change constantly ("x1hecop
 * x1qlqyl8"), so nothing here matches on them. It reads what the page states
 * about itself, most machine-readable first.
 */

function metaContent(property) {
  const node = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return node?.getAttribute('content')?.trim() || null;
}

/** schema.org/Event embedded in the page, if the page publishes one. */
function fromJsonLd() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent || '');
    } catch {
      continue;
    }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
      if (!/event/i.test(String(node['@type'] || ''))) continue;
      const place = node.location || {};
      const address = place.address || {};
      return {
        title: node.name || null,
        startsAt: node.startDate || null,
        description: node.description || null,
        venue: place.name || null,
        city: address.addressLocality || null,
        address: [address.streetAddress, address.postalCode].filter(Boolean).join(', ') || null,
      };
    }
  }
  return null;
}

/**
 * The post's own text.
 *
 * A post has no structured data at all, so this looks for the longest run of
 * text on the page that reads like a message rather than chrome — Facebook's
 * own buttons and menus are short, and the post body is not.
 */
function postText() {
  const fromMeta = metaContent('og:description');
  let best = fromMeta && fromMeta.length > 80 ? fromMeta : '';

  for (const node of document.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"], div[dir="auto"]')) {
    const text = node.innerText?.trim();
    if (!text || text.length < 60) continue;
    // A run with several lines and no interface words is almost certainly the
    // post itself rather than a sidebar or a comment thread.
    if (/^(Tetszik|Hozzászólás|Megosztás|Like|Comment|Share)\b/i.test(text)) continue;
    if (text.length > best.length) best = text;
  }
  return best || fromMeta || '';
}

/** The page's own address, without the tracking and referrer parameters. */
function cleanUrl() {
  const event = location.pathname.match(/\/events\/(\d+)/);
  if (event) return `https://www.facebook.com/events/${event[1]}/`;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function pageKind() {
  if (/\/events\/\d+/.test(location.pathname)) return 'event';
  if (/\/(posts|permalink|photo|videos|reel)\//.test(location.pathname)) return 'post';
  if (/story_fbid=|\/share\/p\//.test(location.href)) return 'post';
  return 'other';
}

function extract() {
  const kind = pageKind();
  if (kind === 'other') {
    return { kind, url: cleanUrl(), pageTitle: document.title || null };
  }

  if (kind === 'post') {
    const text = postText();
    return {
      kind,
      url: cleanUrl(),
      text,
      // The publisher is the page that posted it — a useful organiser name.
      publisher: metaContent('og:title') || null,
      imageUrl: metaContent('og:image') || null,
      source: text ? 'post-text' : 'empty',
    };
  }

  const structured = fromJsonLd();
  return {
    kind,
    url: cleanUrl(),
    title: structured?.title || metaContent('og:title') || document.querySelector('h1')?.textContent?.trim() || null,
    startsAt: structured?.startsAt || null,
    venue: structured?.venue || null,
    city: structured?.city || null,
    address: structured?.address || null,
    description: structured?.description || metaContent('og:description') || null,
    imageUrl: metaContent('og:image') || null,
    // Says how much of this is the page's own statement rather than a guess,
    // so the popup can tell the operator what needs checking.
    source: structured ? 'jsonld' : metaContent('og:title') ? 'opengraph' : 'dom',
  };
}

// chrome.scripting.executeScript({ files: [...] }) hands back the value of the
// LAST EXPRESSION in the file. A top-level `return` here is a syntax error and
// the injection fails silently, so this line must stay a bare expression.
extract();
