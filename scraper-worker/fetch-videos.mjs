// Playwright-based editorial video library fetcher (Pexels — the project's
// documented stock source, see src/assets/editorial/MEDIA_PROVENANCE.md).
// Plain HTTPS gets 403 from the site, so pages are loaded in a real browser
// context and the CDN files are downloaded through the same context.
// Output: ../media-library/videos/*.mp4 + ../media-library/VIDEO_LIBRARY.md
// Run from scraper-worker/: node fetch-videos.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';

const OUT_DIR = '../media-library/videos';
const MANIFEST = '../media-library/VIDEO_LIBRARY.md';
const TARGET = 56;
const PER_THEME = 4;

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  const rows = [];
  const seenIds = new Set();

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
      rows.push({
        theme, id, file: dest.replace('../', ''), bytes: body.length,
        page: pageUrl || `https://www.pexels.com/video/${id}/`, src: file.fileUrl.split('?')[0],
      });
      console.log(`+ ${dest} (${Math.round(body.length / 1024)} KB) [${rows.length}/${TARGET}]`);
      return true;
    } catch (e) {
      console.log(`  skip ${id}: ${String(e.message).slice(0, 60)}`);
      return false;
    }
  };

  try {
    // Search pages embed the result videos' direct file URLs — one page load
    // yields a whole theme. Slow pacing keeps Cloudflare happy.
    for (const [theme, query] of THEMES) {
      if (rows.length >= TARGET) break;
      let entries = [];
      try {
        entries = mineVideos(await loadHtml(`https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`, 1));
      } catch (e) { console.log(`search failed ${query}: ${String(e.message).slice(0, 60)}`); continue; }
      const byId = new Map();
      for (const e of entries) {
        if (!byId.has(e.id)) byId.set(e.id, []);
        byId.get(e.id).push(e);
      }
      console.log(`theme ${theme}: ${byId.size} candidates`);
      let taken = 0;
      for (const [id, files] of byId) {
        if (rows.length >= TARGET || taken >= PER_THEME) break;
        if (await downloadOne(theme, id, files, null)) taken += 1;
        await sleep(700);
      }
      await sleep(3500);
    }
    // Curated backlog pages fill any remaining slots (own-id file only).
    for (const pageUrl of BACKLOG_PAGES) {
      if (rows.length >= TARGET) break;
      const pageId = pageUrl.match(/-(\d+)\/?$/)?.[1];
      const slug = pageUrl.split('/').filter(Boolean).pop().replace(/-\d+$/, '').slice(0, 34);
      try {
        const own = mineVideos(await loadHtml(pageUrl)).filter((v) => v.id === pageId);
        if (own.length) await downloadOne(`backlog-${slug}`, pageId, own, pageUrl);
      } catch (e) { console.log(`backlog failed: ${String(e.message).slice(0, 50)}`); }
      await sleep(3500);
    }
  } finally {
    await browser.close();
  }

  const manifest = [
    '# Hobbeast editorial video library (raw acquisition material)',
    '',
    `Acquired ${new Date().toISOString().slice(0, 10)} from Pexels (${rows.length} files).`,
    'Licence: Pexels License (https://www.pexels.com/license/) — same policy as',
    'src/assets/editorial/MEDIA_PROVENANCE.md. These are RAW candidates for random',
    'editorial use; before any production use, run the normal licence/model review',
    'and the ffmpeg normalization envelope from the provenance ledger.',
    '',
    '| File | Theme | Bytes | Canonical page | Direct source |',
    '| --- | --- | ---: | --- | --- |',
    ...rows.map((r) => `| \`${r.file}\` | ${r.theme} | ${r.bytes} | ${r.page} | ${r.src} |`),
    '',
  ].join('\n');
  writeFileSync(MANIFEST, manifest);
  console.log(`DONE: ${rows.length} videos`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
