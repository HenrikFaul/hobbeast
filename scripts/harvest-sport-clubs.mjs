/**
 * Club directory harvest — sport and community alike.
 *
 * Sport is organised in clubs and the clubs are already listed publicly, by
 * sport, in the national club finder. Community clubs are not: a baba-mama
 * circle or a pensioners' choir lives on the website of the cultural centre
 * that hosts it. Both are harvested here, and BOTH worklists come from the
 * `club_directories` table rather than from this file, so adding a source is
 * an admin action rather than a deploy.
 *
 * A directory row is a fact about the world, not a claim by the club: it goes
 * live unclaimed, and stays that way until somebody from the club takes it
 * over. Nothing here invents a contact, an email or a training time.
 *
 * Usage:
 *   node scripts/harvest-sport-clubs.mjs --ingest                    # everything enabled
 *   node scripts/harvest-sport-clubs.mjs --ingest --directories pecsikult
 *   node scripts/harvest-sport-clubs.mjs --sport evezes              # one sport, no ingest
 *   node scripts/harvest-sport-clubs.mjs --out clubs.json
 *
 * --ingest needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; without them the
 * harvest still runs and reports, it just does not write.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { harvestCommunityDirectory } from './lib/communityClubs.mjs';

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
      topic: sportName,
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
      body: JSON.stringify({ p_clubs: batch, p_directory_key: directoryKey ?? null }),
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
  const wanted = args.includes('--directories')
    ? (args[args.indexOf('--directories') + 1] || '').split(',').map((value) => value.trim()).filter(Boolean)
    : [];

  // --sport is the single-sport debugging path and stays local.
  if (only) {
    const clubs = await fetchSport(only, SPORT_SLUGS[only] || only);
    process.stdout.write(`${only}: ${clubs.length} klub\n`);
    if (outPath) writeFileSync(outPath, JSON.stringify(clubs), 'utf8');
    return;
  }

  // The worklist lives in the database so a new source is an admin action.
  let directories;
  if (credentials()) {
    directories = await callRpc('list_club_directories_for_harvest', {
      p_keys: wanted.length ? wanted : null,
    });
  } else {
    process.stderr.write('No credentials — falling back to the built-in sport directory only.\n');
    directories = [{ key: 'sportagvalaszto', label: 'Nagy Sportágválasztó', harvest_kind: 'builtin' }];
  }

  const everything = [];
  for (const directory of directories) {
    let clubs = [];
    try {
      if (directory.harvest_kind === 'builtin' && directory.key === 'sportagvalaszto') {
        clubs = await harvestSportFinder();
      } else if (directory.harvest_kind === 'community_page') {
        clubs = await harvestCommunityDirectory(directory);
      } else {
        continue;
      }
    } catch (error) {
      process.stderr.write(`! ${directory.key}: ${error.message}\n`);
      continue;
    }

    process.stdout.write(`${directory.label.padEnd(40)} ${String(clubs.length).padStart(5)} klub\n`);
    everything.push(...clubs);

    if (shouldIngest && clubs.length) {
      const totals = await ingest(clubs, directory.key);
      if (totals) {
        process.stdout.write(`  → új ${totals.inserted}, frissítve ${totals.updated}, kihagyva ${totals.skipped}\n`);
        // Anything from this directory that stopped appearing is marked, never
        // deleted: a club missing from a listing has not left the world.
        const stale = await callRpc('mark_stale_directory_clubs', {
          p_directory_key: directory.key,
          p_stale_after_days: 45,
          p_retire_after_days: 120,
        });
        if (stale && (stale.marked_stale || stale.retired)) {
          process.stdout.write(`  → elavult ${stale.marked_stale}, levéve ${stale.retired}\n`);
        }
      }
    }
  }

  process.stdout.write(`\nÖsszesen ${everything.length} klub ${directories.length} katalógusból.\n`);
  if (outPath) {
    writeFileSync(outPath, JSON.stringify(everything), 'utf8');
    process.stdout.write(`Kiírva: ${outPath}\n`);
  }

  // Clubs we already have without knowing it: a programme title that repeats
  // week after week at the same place is a club, not a series.
  if (shouldIngest && credentials()) {
    try {
      const derived = await callRpc('derive_clubs_from_programmes', { p_min_occurrences: 3, p_limit: 300 });
      process.stdout.write(`Ismétlődő programokból: új ${derived.inserted}, frissítve ${derived.updated}\n`);
    } catch (error) {
      process.stderr.write(`! derive: ${error.message}\n`);
    }
  }
}

/** The national club finder, sport by sport. */
async function harvestSportFinder() {
  const all = [];
  const seen = new Set();
  for (const [slug, sportName] of Object.entries(SPORT_SLUGS)) {
    const clubs = await fetchSport(slug, sportName);
    for (const club of clubs) {
      // The same club appears under several sports; keep the first topic and
      // let the ingest fill gaps rather than creating a duplicate row.
      const key = `${club.name.toLowerCase()}|${(club.city || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(club);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return all;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
}
