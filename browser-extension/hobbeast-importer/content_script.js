/**
 * Reads an already-open Facebook event page.
 *
 * Runs only when the operator presses the extension button, only on the tab
 * they are already looking at, and never on its own. Nothing is submitted from
 * here: the popup shows what was found and the operator corrects it before
 * anything leaves the browser.
 *
 * Facebook's class names are generated and change constantly ("x1hecop
 * x1qlqyl8"), so nothing here matches on them. It reads, in order of how much
 * the page is promising:
 *   1. JSON-LD (schema.org/Event) — a machine-readable statement by the page
 *   2. OpenGraph meta tags — what the page tells every link preview
 *   3. the <h1> and the visible date text — a last resort
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
      const type = String(node['@type'] || '');
      if (!/event/i.test(type)) continue;
      const place = node.location || {};
      const address = place.address || {};
      return {
        title: node.name || null,
        startsAt: node.startDate || null,
        endsAt: node.endDate || null,
        description: node.description || null,
        venue: place.name || null,
        city: address.addressLocality || null,
        address: [address.streetAddress, address.postalCode].filter(Boolean).join(', ') || null,
        imageUrl: typeof node.image === 'string' ? node.image : node.image?.url || null,
        confidence: 'jsonld',
      };
    }
  }
  return null;
}

/**
 * The visible date line. Facebook writes it in the page's own language, so
 * both the Hungarian and the English shapes are read, and anything ambiguous
 * is handed to the operator rather than guessed.
 */
function visibleDateText() {
  const candidates = [];
  for (const node of document.querySelectorAll('span, div, h2')) {
    const text = node.textContent?.trim();
    if (!text || text.length > 120) continue;
    if (/\b\d{4}\.\s*\w+\s*\d{1,2}/.test(text)) candidates.push(text);
    else if (/\b\d{1,2}:\d{2}\b/.test(text) && /\w{3,}/.test(text)) candidates.push(text);
    if (candidates.length > 4) break;
  }
  return candidates[0] || null;
}

/** The event's own address, without the tracking and referrer parameters. */
function cleanEventUrl() {
  const match = location.pathname.match(/\/events\/(\d+)/);
  if (match) return `https://www.facebook.com/events/${match[1]}/`;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function extract() {
  const structured = fromJsonLd();
  const title = structured?.title
    || metaContent('og:title')
    || document.querySelector('h1')?.textContent?.trim()
    || null;

  const description = structured?.description
    || metaContent('og:description')
    || null;

  return {
    title,
    startsAt: structured?.startsAt || null,
    endsAt: structured?.endsAt || null,
    dateText: structured?.startsAt ? null : visibleDateText(),
    venue: structured?.venue || null,
    city: structured?.city || null,
    address: structured?.address || null,
    description,
    imageUrl: structured?.imageUrl || metaContent('og:image') || null,
    url: cleanEventUrl(),
    // Says how much of this is the page's own statement rather than a guess,
    // so the popup can tell the operator what needs checking.
    confidence: structured ? 'jsonld' : (metaContent('og:title') ? 'opengraph' : 'dom'),
  };
}

return extract();
