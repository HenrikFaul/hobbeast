// Playwright-based editorial video library fetcher (Pexels — the project's
// documented stock source, see src/assets/editorial/MEDIA_PROVENANCE.md).
// Plain HTTPS gets 403 from the site, so pages are loaded in a real browser
// context and the CDN files are downloaded through the same context.
// Output: ../media-library/videos/*.mp4 + ../media-library/VIDEO_LIBRARY.md
//
// Run from scraper-worker/:
//   node fetch-videos.mjs               # download up to TARGET new clips
//   node fetch-videos.mjs --target 40   # smaller batch
//   node fetch-videos.mjs --manifest    # rebuild the manifest only, no network
//
// Re-runs are additive: files already on disk are kept, their manifest rows are
// carried over, and only missing themes are searched again.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';

const OUT_DIR = '../media-library/videos';
const MANIFEST = '../media-library/VIDEO_LIBRARY.md';
const args = process.argv.slice(2);
const flagNum = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) || dflt : dflt; };
const TARGET = flagNum('--target', 80);
const PER_THEME = flagNum('--per-theme', 3);
const MANIFEST_ONLY = args.includes('--manifest');

// Themes mirror the Hobbeast hobby taxonomy: every clip has to be usable as the
// moving backdrop of a category or of an event that arrived without an image.
const THEMES = [
  ['hiking-friends', 'friends hiking'],
  ['board-game', 'friends board game'],
  ['concert-crowd', 'concert crowd'],
  ['cooking-together', 'friends cooking'],
  ['dancing', 'friends dancing'],
  ['yoga-group', 'group yoga'],
  ['climbing', 'rock climbing'],
  ['cycling', 'friends cycling'],
  ['picnic', 'friends picnic'],
  ['painting-workshop', 'painting workshop'],
  ['camping', 'friends camping'],
  ['running-group', 'group running'],
  ['guitar-friends', 'friends playing guitar'],
  ['pottery', 'pottery workshop'],
  ['photography-walk', 'friends photography'],
  ['kayaking', 'kayaking friends'],
  // --- second wave: the categories the first pass never reached -------------
  ['chess', 'chess game'],
  ['coffee-friends', 'friends coffee shop talking'],
  ['wine-tasting', 'wine tasting'],
  ['craft-beer', 'craft beer bar friends'],
  ['farmers-market', 'farmers market'],
  ['baking-class', 'baking class'],
  ['street-food', 'street food festival'],
  ['book-club', 'book club reading'],
  ['film-screening', 'open air cinema'],
  ['theatre-stage', 'theatre stage performance'],
  ['standup-comedy', 'stand up comedy club'],
  ['live-jazz', 'jazz band live'],
  ['dj-set', 'dj set party'],
  ['karaoke', 'karaoke singing'],
  ['drum-circle', 'drum circle'],
  ['museum-visit', 'museum visitors'],
  ['city-walk', 'walking tour city'],
  ['escape-room', 'escape room puzzle'],
  ['bowling', 'bowling friends'],
  ['table-tennis', 'table tennis'],
  ['tennis', 'tennis players'],
  ['football-amateur', 'amateur football match'],
  ['basketball-street', 'street basketball'],
  ['badminton', 'badminton game'],
  ['bouldering-gym', 'bouldering gym'],
  ['swimming', 'swimming pool people'],
  ['thermal-bath', 'thermal bath spa'],
  ['horse-riding', 'horse riding'],
  ['fishing', 'fishing lake'],
  ['birdwatching', 'birdwatching binoculars'],
  ['stargazing', 'stargazing night sky people'],
  ['gardening', 'community gardening'],
  ['knitting', 'knitting craft'],
  ['ceramics-wheel', 'ceramics wheel hands'],
  ['dance-class', 'dance class studio'],
  ['meditation-group', 'group meditation'],
  ['volunteering', 'volunteers community'],
  ['dog-walk-group', 'dog walking park'],
  ['boat-river', 'river boat trip'],
  ['winter-hike', 'winter hiking snow'],
  ['sunrise-run', 'sunrise running'],
  ['festival-lights', 'festival lights night crowd'],
  ['skateboard', 'skateboarding friends'],
  ['language-exchange', 'people talking group table'],
];

const BACKLOG_PAGES = [
  'https://www.pexels.com/video/peaceful-sunset-by-the-lake-with-two-friends-35177979/',
  'https://www.pexels.com/video/group-of-friends-at-dusk-by-the-lake-37082325/',
  'https://www.pexels.com/video/couple-lying-on-a-hammock-5364829/',
  'https://www.pexels.com/video/friends-playing-board-game-8058014/',
  'https://www.pexels.com/video/friends-playing-connect-four-8757837/',
  'https://www.pexels.com/video/a-group-of-people-dancing-in-the-street-27580032/',
  'https://www.pexels.com/video/friends-walking-in-the-street-6139250/',
  'https://www.pexels.com/video/a-group-of-friends-admiring-a-mountain-landscape-11759805/',
  'https://www.pexels.com/video/group-of-friends-dancing-together-while-holding-beer-5935438/',
  'https://www.pexels.com/video/a-group-of-people-hiking-up-a-snowy-mountain-20320769/',
  'https://www.pexels.com/video/a-woman-teaching-her-partner-how-to-play-guitar-4647497/',
  'https://www.pexels.com/video/a-man-and-woman-playing-guitar-in-a-room-17688623/',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mineVideos(html) {
  const out = [];
  for (const m of html.matchAll(/https:\/\/videos\.pexels\.com\/video-files\/(\d+)\/[^"'\\\s)]+?\.mp4[^"'\\\s)]*/g)) {
    out.push({ id: m[1], fileUrl: m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&') });
  }
  return out;
}

function pickFile(candidates) {
  const scored = candidates.map((c) => {
    const w = Number(c.fileUrl.match(/_(\d{3,4})_(\d{3,4})_/)?.[1] || 0);
    return { ...c, w, score: w >= 640 && w <= 1366 ? 0 : w === 0 ? 1 : 2 };
  });
  scored.sort((a, b) => a.score - b.score || a.w - b.w);
  return scored[0];
}

// Rows already recorded in the manifest keep their provenance across re-runs.
function readExistingRows() {
  if (!existsSync(MANIFEST)) return new Map();
  const rows = new Map();
  for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (m) rows.set(m[1], { file: m[1], theme: m[2], bytes: Number(m[3]), page: m[4], src: m[5] });
  }
  return rows;
}

function writeManifest(rows) {
  const sorted = [...rows.values()].sort((a, b) => a.file.localeCompare(b.file));
  const themes = new Set(sorted.map((r) => r.theme));
  const manifest = [
    '# Hobbeast editorial video library (raw acquisition material)',
    '',
    `Last updated ${new Date().toISOString().slice(0, 10)} — ${sorted.length} files across ${themes.size} themes, from Pexels.`,
    'Licence: Pexels License (https://www.pexels.com/license/) — same policy as',
    'src/assets/editorial/MEDIA_PROVENANCE.md. These are RAW candidates for random',
    'editorial use; before any production use, run the normal licence/model review',
    'and the ffmpeg normalization envelope from the provenance ledger.',
    '',
    'Publishing pipeline: `node scripts/publish-editorial-videos.mjs` normalizes these',
    'to 720p/no-audio web loops and uploads them to the public `editorial-video`',
    'Storage bucket, registering each clip in public.editorial_videos.',
    '',
    '| File | Theme | Bytes | Canonical page | Direct source |',
    '| --- | --- | ---: | --- | --- |',
    ...sorted.map((r) => `| \`${r.file}\` | ${r.theme} | ${r.bytes} | ${r.page} | ${r.src} |`),
    '',
  ].join('\n');
  writeFileSync(MANIFEST, manifest);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = readExistingRows();
  // Files on disk without a manifest row still count as "already have it".
  const onDisk = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp4')) : [];
  const seenIds = new Set(onDisk.map((f) => f.match(/-(\d+)\.mp4$/)?.[1]).filter(Boolean));
  const themeCount = new Map();
  for (const f of onDisk) {
    const theme = f.replace(/-\d+\.mp4$/, '');
    themeCount.set(theme, (themeCount.get(theme) || 0) + 1);
  }

  if (MANIFEST_ONLY) {
    writeManifest(rows);
    console.log(`manifest rebuilt: ${rows.size} rows`);
    return;
  }

  let added = 0;
  let browser = null;
  let context = null;
  let page = null;
  // Cloudflare tolerates roughly one search per browser session, so every theme
  // gets a FRESH browser instance; downloads reuse that session's cookies.
  const freshBrowser = async () => {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      viewport: { width: 1366, height: 900 },
    });
    page = await context.newPage();
  };

  // Cloudflare-aware page load: a challenge page is small — wait and retry once.
  const loadHtml = async (url, scrolls = 0) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    let html = await page.content();
    if (html.length < 120000) {
      await page.waitForTimeout(8000);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
      html = await page.content();
    }
    for (let i = 0; i < scrolls; i += 1) {
      await page.mouse.wheel(0, 2400);
      await page.waitForTimeout(1300);
    }
    return scrolls ? page.content() : html;
  };

  const downloadOne = async (theme, id, files, pageUrl) => {
    if (seenIds.has(id)) return false;
    const file = pickFile(files);
    const dest = `${OUT_DIR}/${theme}-${id}.mp4`;
    if (existsSync(dest)) { seenIds.add(id); return false; }
    try {
      const res = await context.request.get(file.fileUrl, { timeout: 120000 });
      if (!res.ok()) { console.log(`  skip ${id}: HTTP ${res.status()}`); return false; }
      const body = await res.body();
      if (body.length < 200000 || body.length > 30000000) return false;
      writeFileSync(dest, body);
      seenIds.add(id);
      added += 1;
      rows.set(dest.replace('../', ''), {
        file: dest.replace('../', ''), theme, bytes: body.length,
        page: pageUrl || `https://www.pexels.com/video/${id}/`, src: file.fileUrl.split('?')[0],
      });
      console.log(`+ ${dest} (${Math.round(body.length / 1024)} KB) [${added}/${TARGET} new, ${rows.size} total]`);
      return true;
    } catch (e) {
      console.log(`  skip ${id}: ${String(e.message).slice(0, 60)}`);
      return false;
    }
  };

  try {
    // One search per fresh browser: the page embeds the results' direct file URLs.
    for (const [theme, query] of THEMES) {
      if (added >= TARGET) break;
      // Themes that already reached their quota on an earlier run are skipped,
      // so a re-run spends its budget on the gaps.
      if ((themeCount.get(theme) || 0) >= PER_THEME) continue;
      let entries = [];
      try {
        await freshBrowser();
        entries = mineVideos(await loadHtml(`https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`, 1));
      } catch (e) { console.log(`search failed ${query}: ${String(e.message).slice(0, 60)}`); continue; }
      const byId = new Map();
      for (const e of entries) {
        if (!byId.has(e.id)) byId.set(e.id, []);
        byId.get(e.id).push(e);
      }
      console.log(`theme ${theme}: ${byId.size} candidates (have ${themeCount.get(theme) || 0})`);
      let taken = themeCount.get(theme) || 0;
      for (const [id, files] of byId) {
        if (added >= TARGET || taken >= PER_THEME) break;
        if (await downloadOne(theme, id, files, null)) taken += 1;
        await sleep(700);
      }
      writeManifest(rows);
      await sleep(5000);
    }
    // Curated backlog pages fill any remaining slots (own-id file only).
    for (const pageUrl of BACKLOG_PAGES) {
      if (added >= TARGET) break;
      const pageId = pageUrl.match(/-(\d+)\/?$/)?.[1];
      if (!pageId || seenIds.has(pageId)) continue;
      const slug = pageUrl.split('/').filter(Boolean).pop().replace(/-\d+$/, '').slice(0, 34);
      try {
        await freshBrowser();
        const own = mineVideos(await loadHtml(pageUrl)).filter((v) => v.id === pageId);
        if (own.length) await downloadOne(`backlog-${slug}`, pageId, own, pageUrl);
      } catch (e) { console.log(`backlog failed: ${String(e.message).slice(0, 50)}`); }
      await sleep(5000);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  writeManifest(rows);
  console.log(`DONE: ${added} new videos, ${rows.size} in the library`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
