// Editorial video library fetcher (Pexels, the project's documented stock source
// — see src/assets/editorial/MEDIA_PROVENANCE.md for the licence policy).
// Collects hobby-themed, people-centric videos into media-library/videos/ with a
// provenance manifest. Files are raw acquisition material, NOT bundled runtime
// assets; each future production use still needs the normal editorial+licence
// review and ffmpeg normalization pass.
// Run: node scripts/fetch-video-library.mjs

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { get } from 'node:https';

const OUT_DIR = 'media-library/videos';
const MANIFEST = 'media-library/VIDEO_LIBRARY.md';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const TARGET = 56;
const PER_THEME = 4;
const MIN_S = 5, MAX_S = 40;

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
  ['guitar-friends', 'friends guitar'],
  ['pottery', 'pottery workshop'],
  ['photography-walk', 'friends photography'],
  ['kayaking', 'kayaking friends'],
];

// Reviewed creative shortlist from MEDIA_PROVENANCE.md ("Editorial candidate backlog").
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-language': 'en' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(new URL(res.headers.location, url).toString()));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

function download(url, path) {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'user-agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(new URL(res.headers.location, url).toString(), path));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { writeFileSync(path, Buffer.concat(chunks)); resolve(); });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
  });
}

/** Pull the embedded search/page data blob and mine video entries out of it. */
function mineVideos(html) {
  const out = [];
  // Direct video-file URLs with their video id in the path.
  for (const m of html.matchAll(/https:\/\/videos\.pexels\.com\/video-files\/(\d+)\/[^"'\\ ]+?\.mp4[^"'\\ ]*/g)) {
    out.push({ id: m[1], fileUrl: m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&') });
  }
  return out;
}

function pickFile(candidates) {
  // Prefer explicitly sized SD/HD files in the 640-1366 width band (small but usable).
  const scored = candidates.map((c) => {
    const w = Number(c.fileUrl.match(/_(\d{3,4})_(\d{3,4})_/)?.[1] || 0);
    return { ...c, w, score: w >= 640 && w <= 1366 ? 0 : w === 0 ? 1 : 2 };
  });
  scored.sort((a, b) => a.score - b.score || a.w - b.w);
  return scored[0];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  const seenIds = new Set();

  const acquire = async (theme, pageUrl, entries) => {
    const byId = new Map();
    for (const e of entries) {
      if (!byId.has(e.id)) byId.set(e.id, []);
      byId.get(e.id).push(e);
    }
    let taken = 0;
    for (const [id, files] of byId) {
      if (rows.length >= TARGET || taken >= PER_THEME) break;
      if (seenIds.has(id)) continue;
      const file = pickFile(files);
      const dest = `${OUT_DIR}/${theme}-${id}.mp4`;
      if (existsSync(dest)) { seenIds.add(id); continue; }
      try {
        await download(file.fileUrl, dest);
        const bytes = statSync(dest).size;
        if (bytes < 200000) continue; // broken/placeholder
        seenIds.add(id);
        taken += 1;
        rows.push({ theme, id, file: dest, bytes, page: pageUrl || `https://www.pexels.com/video/${id}/`, src: file.fileUrl });
        console.log(`+ ${dest} (${Math.round(bytes / 1024)} KB)`);
      } catch (e) {
        console.log(`  skip ${id}: ${e.message}`);
      }
      await sleep(1200);
    }
  };

  // 1) The reviewed backlog pages first.
  for (const pageUrl of BACKLOG_PAGES) {
    if (rows.length >= TARGET) break;
    try {
      const html = await fetchText(pageUrl);
      const slug = pageUrl.split('/').filter(Boolean).pop().replace(/-\d+$/, '').slice(0, 40);
      await acquire(`backlog-${slug}`, pageUrl, mineVideos(html));
    } catch (e) { console.log(`backlog failed ${pageUrl}: ${e.message}`); }
    await sleep(1500);
  }

  // 2) Theme searches until the target is reached.
  for (const [theme, query] of THEMES) {
    if (rows.length >= TARGET) break;
    try {
      const html = await fetchText(`https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`);
      await acquire(theme, null, mineVideos(html));
      console.log(`theme ${theme}: total ${rows.length}`);
    } catch (e) { console.log(`search failed ${query}: ${e.message}`); }
    await sleep(2000);
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
    ...rows.map((r) => `| \`${r.file}\` | ${r.theme} | ${r.bytes} | ${r.page} | ${r.src.split('?')[0]} |`),
    '',
  ].join('\n');
  writeFileSync(MANIFEST, manifest);
  console.log(`DONE: ${rows.length} videos, manifest at ${MANIFEST}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
