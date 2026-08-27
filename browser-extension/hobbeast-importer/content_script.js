/**
 * Reads the Facebook page the operator is already looking at.
 *
 * Runs only when they press the extension button, only on that tab, and never
 * on its own. Nothing is submitted from here: the popup shows what was found
 * and the operator corrects it on the Hobbeast side before anything is saved.
 *
 * Two kinds of page are understood:
 *   - an EVENT (/events/…), which states its own date and place
 *   - a POST (/posts/…, /permalink/…, /photo/…), which is just text
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
      const organizer = node.organizer || node.performer || {};
      return {
        title: node.name || null,
        startsAt: node.startDate || null,
        endsAt: node.endDate || null,
        description: node.description || null,
        venue: place.name || null,
        city: address.addressLocality || null,
        address: [address.streetAddress, address.postalCode].filter(Boolean).join(', ') || null,
        organizer: organizer.name || null,
        organizerUrl: organizer.url || null,
        image: typeof node.image === 'string' ? node.image : node.image?.url || null,
        isFree: node.isAccessibleForFree ?? null,
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

  const selectors = [
    '[data-ad-preview="message"]',
    '[data-ad-comet-preview="message"]',
    'div[dir="auto"]',
  ].join(', ');

  for (const node of document.querySelectorAll(selectors)) {
    const text = node.innerText?.trim();
    if (!text || text.length < 60) continue;
    if (/^(Tetszik|Hozzászólás|Megosztás|Like|Comment|Share)\b/i.test(text)) continue;
    if (text.length > best.length) best = text;
  }
  return best || fromMeta || '';
}

/**
 * The page that published this — the thing worth coming back to.
 *
 * Facebook writes the page's own address into the post header; the first link
 * that looks like a page (not a profile, not a photo, not a dialog) is it.
 */
function publisher() {
  const name = metaContent('og:title');

  const skip = /\/(events|posts|photo|photos|videos|reel|permalink|groups|watch|marketplace|stories|share|login|help|policies|privacy|business|ads)\b/i;
  for (const anchor of document.querySelectorAll('a[href*="facebook.com/"], a[href^="/"]')) {
    const href = anchor.getAttribute('href') || '';
    let url;
    try {
      url = new URL(href, 'https://www.facebook.com');
    } catch {
      continue;
    }
    if (!/facebook\.com$/i.test(url.hostname.replace(/^(www|m|web)\./, 'facebook.com'))) continue;
    const path = url.pathname.replace(/\/+$/, '');
    if (!path || path === '/' || skip.test(path)) continue;
    // A page address is a single path segment: /kisdunahajokolcsonzo
    if (path.split('/').filter(Boolean).length !== 1) continue;
    const text = anchor.innerText?.trim();
    // The header link carries the page's name, which is how it is told apart
    // from the hundreds of navigation links on the page.
    if (!text || text.length < 2 || text.length > 80) continue;
    return { name: name || text, url: `https://www.facebook.com${path}` };
  }
  return name ? { name, url: null } : null;
}

/** The page's own address, without the tracking and referrer parameters. */
function cleanUrl() {
  const event = location.pathname.match(/\/events\/(\d+)/);
  if (event) return `https://www.facebook.com/events/${event[1]}/`;
  const post = location.pathname.match(/^\/([^/]+)\/posts\/([^/?#]+)/);
  if (post) return `https://www.facebook.com/${post[1]}/posts/${post[2]}`;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

/**
 * The cover picture.
 *
 * og:image is the picture Facebook itself shows for this page in every link
 * preview, so it is the right one — and it is a plain https URL that the
 * catalogue can render directly.
 */
function coverImage(structured) {
  const candidate = structured?.image || metaContent('og:image');
  if (!candidate || !/^https:\/\//i.test(candidate)) return null;
  return candidate;
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

  const page = publisher();
  const structured = kind === 'event' ? fromJsonLd() : null;

  const common = {
    kind,
    url: cleanUrl(),
    imageUrl: coverImage(structured),
    publisher: page?.name || null,
    publisherUrl: page?.url || null,
  };

  if (kind === 'post') {
    const text = postText();
    return { ...common, text, source: text ? 'post-text' : 'empty' };
  }

  return {
    ...common,
    title: structured?.title || metaContent('og:title') || document.querySelector('h1')?.textContent?.trim() || null,
    startsAt: structured?.startsAt || null,
    endsAt: structured?.endsAt || null,
    venue: structured?.venue || null,
    city: structured?.city || null,
    address: structured?.address || null,
    organizer: structured?.organizer || page?.name || null,
    description: structured?.description || metaContent('og:description') || null,
    // Says how much of this is the page's own statement rather than a guess.
    source: structured ? 'jsonld' : metaContent('og:title') ? 'opengraph' : 'dom',
  };
}

// chrome.scripting.executeScript({ files: [...] }) hands back the value of the
// LAST EXPRESSION in the file. A top-level `return` here is a syntax error and
// the injection fails silently, so this line must stay a bare expression.
extract();
