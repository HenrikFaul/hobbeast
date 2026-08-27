/**
 * Community clubs from a "Klubjaink" page.
 *
 * Sport clubs live in national registries; a baba-mama circle does not. It
 * lives on the website of the cultural centre that hosts it, on a page listing
 * every group that meets there — a board-game club next to a pensioners' choir
 * next to a patchwork circle.
 *
 * Those pages have no shared markup, so this does not try to parse a layout.
 * It reads the LINKS and keeps the ones whose text names a club. A club names
 * itself: "Apáczai Sakk Klub", "Őszikék Nyugdíjas Klub", "Hunyor Foltvarró
 * Kör", "Nevkó Baba-Mama Klub". That pattern is the whole filter, and it is
 * the same idea as looksLikeEventHeading in the programme collector: the name
 * has to look like the NAME of something, not like a sentence about it.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * What makes a name a club name. Deliberately generous about the topic and
 * strict about the form: the word has to stand as its own word, so "klubdélután"
 * counts and "reklub" does not.
 */
const CLUB_NAME = new RegExp([
  '\\bklub\\b', '\\bklubja\\b', '\\bkor\\b', '\\bkore\\b', '\\bszakkor\\b',
  '\\begyesulet\\b', '\\btarsasag\\b', '\\bmuhely\\b', '\\bcsoport\\b',
  'baba-?mama', 'nyugdijas', 'szenior', 'tarsasjatek', 'nepdalkor', 'enekkar',
  'foltvarro', 'jatszohaz', 'onkepzo', 'olvasokor', 'tanchaz', 'fotoklub',
].join('|'));

/**
 * Names that match the pattern but are not a club: navigation, page furniture,
 * and the generic headings these sites use.
 */
const NOT_A_CLUB = new RegExp([
  // The bare category word is the page's own heading, not a club's name.
  '^(klub|klubja|kor|kore|csoport|muhely|egyesulet|tarsasag|szakkor)$',
  '^(klubjaink|kozossegeink|csoportjaink|klubok|csoportok|kozossegi terek)$',
  '^(tovabb|reszletek|bovebben|vissza|kezdolap|kapcsolat|rolunk|hirek)',
  'cookie|adatvedelem|impresszum|belepes|regisztracio',
  '^(minden|osszes) ',
].join('|'));

export function looksLikeClubName(name) {
  const text = String(name || '').trim();
  if (text.length < 4 || text.length > 90) return false;
  // A sentence is not a name.
  if (/[.!?]\s/.test(text) || text.split(/\s+/).length > 10) return false;
  const folded = fold(text);
  if (NOT_A_CLUB.test(folded)) return false;
  return CLUB_NAME.test(folded);
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/**
 * Every link on the page whose text names a club. The venue heading a club
 * sits under is not reliably recoverable across sites, so the city is taken
 * from the directory entry rather than guessed from the markup.
 */
export function extractCommunityClubs(html, options) {
  const { sourceUrl, city = null, postalCode = null } = options;
  const found = new Map();

  for (const match of String(html).matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const name = stripTags(match[2]);
    if (!looksLikeClubName(name)) continue;
    const key = fold(name);
    if (found.has(key)) continue;
    found.set(key, {
      name,
      club_type: 'community_club',
      city,
      postal_code: postalCode,
      website_url: absoluteUrl(match[1], sourceUrl),
      source_url: sourceUrl,
    });
  }

  // Headings too: some sites name the club in an <h3> and link only a photo.
  for (const match of String(html).matchAll(/<h[1-6]\b[^>]*>([\s\S]{0,300}?)<\/h[1-6]>/gi)) {
    const name = stripTags(match[1]);
    if (!looksLikeClubName(name)) continue;
    const key = fold(name);
    if (found.has(key)) continue;
    found.set(key, {
      name,
      club_type: 'community_club',
      city,
      postal_code: postalCode,
      website_url: null,
      source_url: sourceUrl,
    });
  }

  return [...found.values()];
}

export async function harvestCommunityDirectory(entry) {
  const response = await fetch(entry.list_url, {
    headers: { 'user-agent': UA, 'accept-language': 'hu' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${entry.list_url}`);
  }
  return extractCommunityClubs(await response.text(), {
    sourceUrl: entry.list_url,
    city: entry.city ?? null,
    postalCode: entry.postal_code ?? null,
  });
}
