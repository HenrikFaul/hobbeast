// Collects free-licence stock STILLS for the 50 Hobbeast Instagram posts.
// Sources, in the order they are drawn from:
//   Pexels   - Pexels License, no attribution required
//   Pixabay  - Pixabay Content License, no attribution required
//   Openverse- last resort, restricted to cc0/pdm so it stays attribution-free
// Unsplash is not reachable: every scraping entry point answers 401 without an
// API key, so it is deliberately absent.
// Resumable: state_img.json remembers what already landed on disk.

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT_ROOT = 'C:/Work/Expericentre/instaposztokhoz/media/kepek';
const CACHE = 'cache_img';
const STATE = 'state_img.json';
const PER_POST = 8;
const MIN_LONG_EDGE = 1080;
const MAX_AR = 1.85;
const MIN_BYTES = 40 * 1024;
const MAX_BYTES = 12 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { rows: [], seen: [] };
const seen = new Set(state.seen);
const doneCount = new Map();
for (const r of state.rows) doneCount.set(r.post, (doneCount.get(r.post) || 0) + 1);

mkdirSync(CACHE, { recursive: true });

function cacheKey(url) {
  return join(CACHE, url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.txt');
}

function curl(args, timeout = 90000) {
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout });
}

async function fetchText(url, cache = true) {
  const ck = cacheKey(url);
  if (cache && existsSync(ck) && statSync(ck).size > 500) return readFileSync(ck, 'utf8');
  let last = '000';
  for (const backoff of [0, 8000, 25000, 60000]) {
    if (backoff) await sleep(backoff);
    const out = curl(['-sL', '--compressed', '-A', UA, '-H', 'accept-language: en-US,en;q=0.9', '--max-time', '45', '-w', '\\n#HTTP:%{http_code}', url]);
    const cut = out.lastIndexOf('\n#HTTP:');
    last = cut >= 0 ? out.slice(cut + 7).trim() : '000';
    const body = cut >= 0 ? out.slice(0, cut) : out;
    if (last === '200') {
      if (cache) writeFileSync(ck, body);
      return body;
    }
  }
  throw new Error('HTTP ' + last);
}

function headSize(url) {
  try {
    const out = curl(['-sIL', '-A', UA, '--max-time', '30', url], 45000);
    const m = [...out.matchAll(/^content-length:\s*(\d+)/gim)];
    return m.length ? Number(m[m.length - 1][1]) : 0;
  } catch {
    return 0;
  }
}

function download(url, dest) {
  const out = curl(['-sL', '-A', UA, '--max-time', '120', '-o', dest, '-w', '%{http_code}', url], 150000);
  if (String(out).trim() !== '200') {
    if (existsSync(dest)) unlinkSync(dest);
    throw new Error('HTTP ' + String(out).trim());
  }
  return statSync(dest).size;
}

function probe(path) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  const n = out.split(/[\s,]+/).filter(Boolean).map(Number);
  return { w: n[0] || 0, h: n[1] || 0 };
}

function orientationOf(w, h) {
  const ar = w / h;
  if (ar <= 0.87) return 'portrait';
  if (ar < 1.15) return 'square';
  if (ar <= MAX_AR) return 'landscape';
  return 'ultrawide';
}
const GROUP = { portrait: 0, square: 1, landscape: 2 };

/** Every object in the page payload that looks like a photo record. */
function collectPhotos(node, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) collectPhotos(n, out);
  } else if (node && typeof node === 'object') {
    if (typeof node.width === 'number' && typeof node.height === 'number' && node.id) {
      out.push(node);
    }
    for (const v of Object.values(node)) collectPhotos(v, out);
  }
  return out;
}

/** Pexels embeds a __NEXT_DATA__ payload carrying each hit's real dimensions,
 *  so stills can be ranked by shape before a single byte is downloaded. */
function minePexels(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const out = [];
  const seenLocal = new Set();
  for (const p of collectPhotos(data)) {
    const id = String(p.id);
    if (seenLocal.has(id) || !/^\d+$/.test(id)) continue;
    if (Math.max(p.width, p.height) < MIN_LONG_EDGE) continue;
    const orientation = orientationOf(p.width, p.height);
    if (orientation === 'ultrawide') continue;
    seenLocal.add(id);
    const base = 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id + '.jpeg';
    out.push({
      src: 'pexels',
      id,
      w: p.width,
      h: p.height,
      orientation,
      // Original first; the resized fallback keeps a huge upload under the cap.
      urls: [base, base + '?auto=compress&cs=tinysrgb&w=2000'],
      page: 'https://www.pexels.com/photo/' + id + '/',
      ext: 'jpg',
      alt: (p.title || p.description || p.slug || '').toString().slice(0, 140),
      known: true,
    });
  }
  return out;
}

/** Pixabay search HTML -> candidates, upgraded to the 1280 rendition (_1920 is 403). */
function minePixabay(html) {
  const pageById = new Map();
  for (const m of html.matchAll(/\/photos\/([a-z0-9-]+-(\d+))\//g)) pageById.set(m[2], m[1]);
  const out = [];
  const seenLocal = new Set();
  for (const m of html.matchAll(/https:\/\/cdn\.pixabay\.com\/photo\/[^"'\\ )]+?-(\d+)_\d+\.(jpg|jpeg|png)/g)) {
    const id = m[1];
    if (seenLocal.has(id)) continue;
    const slug = pageById.get(id);
    if (slug && slug.startsWith('ai-generated')) continue;
    seenLocal.add(id);
    const url = m[0].replace(/_\d+\.(jpg|jpeg|png)$/, '_1280.$1');
    out.push({
      src: 'pixabay',
      id,
      urls: [url],
      page: slug ? 'https://pixabay.com/photos/' + slug + '/' : 'https://pixabay.com/images/id-' + id + '/',
      ext: m[2].startsWith('jp') ? 'jpg' : 'png',
      known: Boolean(slug),
    });
  }
  return out;
}

/** Openverse, cc0/pdm only so nothing we keep carries an attribution duty. */
async function mineOpenverse(query) {
  const body = await fetchText('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(query) + '&license=cc0,pdm&page_size=20&size=large');
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  return (json.results || [])
    .filter((r) => Math.max(r.width || 0, r.height || 0) >= MIN_LONG_EDGE)
    .filter((r) => orientationOf(r.width, r.height) !== 'ultrawide')
    .map((r) => ({
      src: 'openverse',
      id: String(r.id).slice(0, 12),
      urls: [r.url],
      page: r.foreign_landing_url || r.url,
      ext: /\.png($|\?)/i.test(r.url) ? 'png' : 'jpg',
      licence: r.license,
      known: true,
    }));
}

/** Portrait first, then square, then landscape; relevance order kept inside each
 *  group. Candidates whose shape is not known yet (Pixabay) keep source order. */
function rank(cands) {
  return cands
    .filter((c) => c.known !== false)
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => (GROUP[a.orientation] ?? 1) - (GROUP[b.orientation] ?? 1) || a.i - b.i);
}

function fileName(post, n, cand, orientation) {
  return post.id + '_' + post.slug + '_img' + n + '_' + orientation + '_' + cand.src + '-' + cand.id + '.' + cand.ext;
}

async function tryTake(post, cand, query) {
  const dir = join(OUT_ROOT, post.folder);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, '_tmp_' + cand.src + '-' + cand.id + '.' + cand.ext);
  for (const url of cand.urls) {
    const size = headSize(url);
    if (size > MAX_BYTES) continue;
    let bytes;
    try {
      bytes = download(url, tmp);
    } catch {
      continue;
    }
    if (bytes < MIN_BYTES) {
      unlinkSync(tmp);
      continue;
    }
    let info;
    try {
      info = probe(tmp);
    } catch {
      unlinkSync(tmp);
      continue;
    }
    const orientation = orientationOf(info.w, info.h);
    if (orientation === 'ultrawide' || Math.max(info.w, info.h) < MIN_LONG_EDGE) {
      unlinkSync(tmp);
      return false;
    }
    const n = (doneCount.get(post.id) || 0) + 1;
    const name = fileName(post, n, cand, orientation);
    renameSync(tmp, join(dir, name));
    doneCount.set(post.id, n);
    seen.add(cand.src + ':' + cand.id);
    state.rows.push({
      post: post.id, cim: post.cim, cel: post.cel, folder: post.folder,
      file: post.folder + '/' + name, source: cand.src, media_id: cand.id,
      page: cand.page, direct: url, w: info.w, h: info.h, orientation, bytes,
      query, licence: cand.licence || '', alt: cand.alt || '',
    });
    writeFileSync(STATE, JSON.stringify({ rows: state.rows, seen: [...seen] }, null, 1));
    console.log('+ ' + post.id + ' img' + n + ' ' + orientation + ' ' + info.w + 'x' + info.h + ' ' + Math.round(bytes / 1024) + 'KB  ' + cand.src + '-' + cand.id);
    return true;
  }
  if (existsSync(tmp)) unlinkSync(tmp);
  return false;
}

/** One pool per (query, source). Pexels ignores its orientation param, but
 *  Pixabay honours ?orientation=vertical, so portrait passes ask for it. */
async function poolsFor(queries, { pexels = true, pixabay = true, vertical = true } = {}) {
  const pools = [];
  for (const q of queries) {
    if (pexels) {
      try {
        pools.push({ q, cands: rank(minePexels(await fetchText('https://www.pexels.com/search/' + encodeURIComponent(q) + '/'))), idx: 0 });
      } catch (e) {
        console.log('  pexels "' + q + '": ' + e.message);
      }
      await sleep(900);
    }
    if (pixabay) {
      const url = 'https://pixabay.com/images/search/' + encodeURIComponent(q) + '/' + (vertical ? '?orientation=vertical' : '');
      try {
        pools.push({ q, cands: rank(minePixabay(await fetchText(url))), idx: 0 });
      } catch (e) {
        console.log('  pixabay "' + q + '": ' + e.message);
      }
      await sleep(900);
    }
  }
  return pools;
}

/** Portrait first, then square, then landscape - decided only after the probe,
 *  so instead of pre-sorting we simply walk each pool and let tryTake reject. */
async function drain(post, pools, takenIds) {
  let guard = 0;
  while ((doneCount.get(post.id) || 0) < PER_POST && guard++ < 200) {
    let consumed = false;
    for (const pool of pools) {
      if ((doneCount.get(post.id) || 0) >= PER_POST) break;
      while (pool.idx < pool.cands.length) {
        const c = pool.cands[pool.idx++];
        consumed = true;
        if (seen.has(c.src + ':' + c.id)) continue;
        if (takenIds.some((t) => t.src === c.src && Math.abs(t.id - Number(c.id)) < 60)) continue;
        const ok = await tryTake(post, c, pool.q);
        if (ok) {
          takenIds.push({ src: c.src, id: Number(c.id) });
          await sleep(400);
          break;
        }
      }
    }
    if (!consumed) break;
  }
}

async function main() {
  const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
  for (const post of plan) {
    if (only && !only.has(post.id)) continue;
    if ((doneCount.get(post.id) || 0) >= PER_POST) {
      console.log('= ' + post.id + ' already has ' + doneCount.get(post.id));
      continue;
    }
    const takenIds = state.rows.filter((r) => r.post === post.id).map((r) => ({ src: r.source, id: Number(r.media_id) }));
    const need = () => (doneCount.get(post.id) || 0) < PER_POST;
    // Portrait-first passes, then a plain Pixabay pass for shape variety.
    await drain(post, await poolsFor(post.queries.slice(0, 3)), takenIds);
    if (need()) await drain(post, await poolsFor(post.queries.slice(3)), takenIds);
    if (need()) await drain(post, await poolsFor(post.queries.slice(0, 3), { pexels: false, vertical: false }), takenIds);
    if (need()) {
      for (const q of post.queries.slice(0, 3)) {
        if ((doneCount.get(post.id) || 0) >= PER_POST) break;
        try {
          await drain(post, [{ q, cands: await mineOpenverse(q), idx: 0 }], takenIds);
        } catch (e) {
          console.log('  openverse "' + q + '": ' + e.message);
        }
        await sleep(900);
      }
    }
    console.log('--- ' + post.id + ' done: ' + (doneCount.get(post.id) || 0) + '/' + PER_POST + ' (' + post.cim + ')');
  }
  const short = plan.filter((p) => (doneCount.get(p.id) || 0) < PER_POST).map((p) => p.id + ':' + (doneCount.get(p.id) || 0));
  console.log('TOTAL ' + state.rows.length + ' images. Short: ' + (short.join(', ') || 'none'));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
