/**
 * Sport club directory harvest.
 *
 * Hungarian sport is organised in clubs, and the clubs are already listed —
 * publicly, by sport, by the national "Nagy Sportágválasztó" club finder. This
 * reads those listings and hands them to `ingest_directory_clubs`, which
 * inserts what is new and only ever fills gaps on what already exists.
 *
 * A directory row is a fact about the world, not a claim by the club: it goes
 * live unclaimed, and stays that way until somebody from the club takes it
 * over. Nothing here invents a contact, an email or a training time.
 *
 * Usage:
 *   node scripts/harvest-sport-clubs.mjs                 # harvest to stdout summary
 *   node scripts/harvest-sport-clubs.mjs --out clubs.json
 *   node scripts/harvest-sport-clubs.mjs --ingest        # needs SUPABASE_SERVICE_ROLE_KEY
 *   node scripts/harvest-sport-clubs.mjs --sport evezes  # one sport only
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = 'https://sportagvalaszto.hu/klubkereso';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** slug → the sport name we store. Taken from the club finder's own menu. */
export const SPORT_SLUGS = {
  'aikido': 'Aikido',
  'akrobatikus-kosarlabda': 'Akrobatikus kosárlabda',
  'amerikai-futball': 'Amerikai futball',
  'asztalitenisz': 'Asztalitenisz',
  'atletika': 'Atlétika',
  'baranta': 'Baranta',
  'birkozas': 'Birkózás',
  'bridzs': 'Bridzs',
  'cheerleading': 'Cheerleading',
  'funkcionalis-fitneszversenyzes-crossfit': 'CrossFit',
  'csikung': 'Csikung',
  'curling': 'Curling',
  'dodgeball': 'Dodgeball',
  'evezes': 'Evezés',
  'fallabda-squash': 'Fallabda',
  'golf': 'Golf',
  'gorkorcsolya': 'Görkorcsolya',
  'horgasz-versenysport': 'Horgászat',
  'ijaszat': 'Íjászat',
  'jegkorong': 'Jégkorong',
  'judo': 'Judo',
  'kajak': 'Kajak',
  'kelemen-ryu-ju-jitsu': 'Ju-jitsu',
  'kempo': 'Kempo',
  'kenu': 'Kenu',
  'kerekparsport': 'Kerékpársport',
  'kezilabda': 'Kézilabda',
  'korfball': 'Korfball',
  'labdarugas': 'Labdarúgás',
  'motorcsonak': 'Motorcsónak',
  'ninjutsu': 'Ninjutsu',
  'petanque': 'Pétanque',
  'pickleball': 'Pickleball',
  'sakk': 'Sakk',
  'sarkanyhajo': 'Sárkányhajó',
  'sieles': 'Síelés',
  'sportloveszet': 'Sportlövészet',
  'sumo': 'Sumo',
  'szinkronuszas': 'Szinkronúszás',
  'szorf': 'Szörf',
  'teke': 'Teke',
  'teqball': 'Teqball',
  'tollaslabda': 'Tollaslabda',
  'torna': 'Torna',
  'triatlon': 'Triatlon',
  'uszas': 'Úszás',
  'versenytanc': 'Versenytánc',
  'vivas': 'Vívás',
  'viz-alatti-rogbi': 'Víz alatti rögbi',
  'vizilabda': 'Vízilabda',
  'wt-taekwondo': 'Taekwondo',
};

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * The directory writes links inconsistently: some carry a scheme, some are bare
 * hosts ("www.facebook.com/CowbellsFootball"), some are mailto or a stray
 * fragment. A bare host is still a usable link once the scheme is added;
 * anything else is dropped rather than stored as a half-URL.
 */
export function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Each club is one `div.klub_tabla` row of four columns: name, postal code,
 * city, then the icon links. The row markup is deeply nested WPBakery output,
 * so the columns are read positionally rather than by class.
 */
export function parseClubRows(html, sportName, sourceUrl) {
  const rows = [];
  const rowPattern = /klub_tabla"\s*>([\s\S]*?)(?=<div class="vc_row wpb_row[^"]*klub_tabla"|$)/g;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    const columns = [...row.matchAll(/vc_column_container[^>]*>([\s\S]*?)(?=<div class="wpb_column|$)/g)]
      .map((column) => stripTags(column[1]));

    const name = columns[0] || '';
    const postalCode = (columns[1] || '').match(/\b\d{4}\b/)?.[0] || null;
    const city = columns[2] || null;
    if (name.length < 2 || /^klub|^ir\.?sz|^telep|^város/i.test(name)) continue;

    const links = [...row.matchAll(/href="([^"]+)"/g)].map((link) => normalizeUrl(link[1]));
    const facebook = links.find((link) => link && /facebook\.com/i.test(link)) || null;
    const website = links.find((link) => link && !/facebook\.com|sportagvalaszto\.hu/i.test(link)) || null;

    rows.push({
      name,
      sport: sportName,
      city: city && city.length <= 60 ? city : null,
      postal_code: postalCode,
      website_url: website,
      facebook_url: facebook,
      source_url: sourceUrl,
      club_type: 'sport_club',
    });
  }
  return rows;
}

async function fetchSport(slug, sportName) {
  const url = `${BASE}/${slug}/`;
  const response = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'hu' } });
  if (!response.ok) {
    process.stderr.write(`  ! ${slug}: HTTP ${response.status}\n`);
    return [];
  }
  return parseClubRows(await response.text(), sportName, url);
}

async function ingest(clubs) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    process.stderr.write('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — skipping ingest.\n');
    return null;
  }
  const totals = { inserted: 0, updated: 0, skipped: 0 };
  // Batched so one oversized request cannot fail the whole harvest.
  for (let index = 0; index < clubs.length; index += 200) {
    const batch = clubs.slice(index, index + 200);
    const response = await fetch(`${url}/rest/v1/rpc/ingest_directory_clubs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_clubs: batch }),
    });
    if (!response.ok) {
      throw new Error(`ingest failed: HTTP ${response.status} ${await response.text()}`);
    }
    const result = await response.json();
    totals.inserted += result.inserted || 0;
    totals.updated += result.updated || 0;
    totals.skipped += result.skipped || 0;
  }
  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--sport') ? args[args.indexOf('--sport') + 1] : null;
  const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const shouldIngest = args.includes('--ingest');

  const entries = Object.entries(SPORT_SLUGS).filter(([slug]) => !only || slug === only);
  const all = [];
  const seen = new Set();

  for (const [slug, sportName] of entries) {
    const clubs = await fetchSport(slug, sportName);
    let added = 0;
    for (const club of clubs) {
      // The same club appears under several sports; keep the first sport and
      // let the ingest fill gaps rather than creating a duplicate row.
      const key = `${club.name.toLowerCase()}|${(club.city || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(club);
      added += 1;
    }
    process.stdout.write(`${sportName.padEnd(24)} ${String(clubs.length).padStart(4)} sor, ${String(added).padStart(4)} új\n`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  process.stdout.write(`\nÖsszesen ${all.length} egyedi klub ${entries.length} sportágból.\n`);
  if (outPath) {
    writeFileSync(outPath, JSON.stringify(all, null, 0), 'utf8');
    process.stdout.write(`Kiírva: ${outPath}\n`);
  }
  if (shouldIngest) {
    const totals = await ingest(all);
    if (totals) process.stdout.write(`Betöltve: ${JSON.stringify(totals)}\n`);
  }
}

// pathToFileURL, not a hand-built file:// string: on Windows the drive letter
// makes the naive form ("file://C:/...") differ from Node's ("file:///C:/...")
// and the script silently does nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
}
