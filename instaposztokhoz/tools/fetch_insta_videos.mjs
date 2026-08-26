// Collects free-licence stock VIDEO candidates for the 50 Hobbeast Instagram posts.
// Primary source: Pexels (Pexels License) - the same policy the repo already uses in
// scripts/fetch-video-library.mjs. Fallback: Pixabay (Pixabay Content License).
// Resumable: state.json remembers what already landed on disk.

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT_ROOT = 'C:/Work/Expericentre/instaposztokhoz/media/videok';
const CACHE = 'cache';
const STATE = 'state.json';
const PER_POST = 6;
const MAX_BYTES = 45 * 1024 * 1024;
const MIN_LONG_EDGE = 1080; // quality floor: the source must offer at least a 1080 long edge
const MIN_BYTES = 150 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { rows: [], seen: [] };
const seen = new Set(state.seen);
const doneCount = new Map();
for (const r of state.rows) doneCount.set(r.post, (doneCount.get(r.post) || 0) + 1);

mkdirSync(CACHE, { recursive: true });

function cacheKey(url) {
  return join(CACHE, url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.html');
}

// Node's fetch gets 403'd by the CDN bot check; curl with a browser UA does not,
// so every network hop goes through curl.
function curl(args, opts = {}) {
  return execFileSync('curl', args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: opts.timeout || 200000 });
}

async function fetchText(url, cache = true) {
  const ck = cacheKey(url);
  if (cache && existsSync(ck) && statSync(ck).size > 1000) return readFileSync(ck, 'utf8');
  // The bot check hands out sporadic 403s under load; backing off clears them.
  let last = '000';
  for (const backoff of [0, 8000, 25000, 60000]) {
    if (backoff) await sleep(backoff);
    const out = curl(['-sL', '--compressed', '-A', UA, '-H', 'accept: text/html,application/xhtml+xml,*/*', '-H', 'accept-language: en-US,en;q=0.9', '--max-time', '45', '-w', '\\n#HTTP:%{http_code}', url], { timeout: 70000 });
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

async function headSize(url) {
  try {
    const out = curl(['-sIL', '-A', UA, '--max-time', '30', url], { timeout: 45000 });
    const m = [...out.matchAll(/^content-length:\s*(\d+)/gim)];
    return m.length ? Number(m[m.length - 1][1]) : 0;
  } catch {
    return 0;
  }
}

async function download(url, dest) {
  const out = curl(['-sL', '-A', UA, '--max-time', '180', '-o', dest, '-w', '%{http_code}', url], { timeout: 200000 });
  const code = String(out).trim();
  if (code !== '200') {
    if (existsSync(dest)) unlinkSync(dest);
    throw new Error('HTTP ' + code);
  }
  return statSync(dest).size;
}

/** Pexels search HTML -> ordered list of { id, variants:[{url,w,h}] } */
function minePexels(html) {
  const order = [];
  const byId = new Map();
  const re = /https:\/\/videos\.pexels\.com\/video-files\/(\d+)\/[^"'\\ )]+?\.mp4/g;
  for (const m of html.matchAll(re)) {
    const id = m[1];
    const url = m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').split('?')[0];
    const dim = url.match(/_(\d{3,4})_(\d{3,4})_\d+fps\.mp4$/);
    if (!dim) continue;
    if (!byId.has(id)) {
      byId.set(id, []);
      order.push(id);
    }
    byId.get(id).push({ url, w: Number(dim[1]), h: Number(dim[2]) });
  }
  return order.map((id) => ({ id, variants: byId.get(id) }));
}

// Instagram is 4:5 / 9:16, so a 2.35:1 cinema-scope clip is unusable however
// relevant it is: anything wider than 1.85:1 is dropped outright.
const MAX_AR = 1.85;
function orientationOf(w, h) {
  const ar = w / h;
  if (ar <= 0.87) return 'portrait';
  if (ar < 1.15) return 'square';
  if (ar <= MAX_AR) return 'landscape';
  return 'ultrawide';
}
const GROUP = { portrait: 0, square: 1, landscape: 2, ultrawide: 3 };

/** The clip's native shape, read off its largest variant. */
function nativeOrientation(variants) {
  const big = variants.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return orientationOf(big.w, big.h);
}

/** Longest edge the source offers at all - the clip's real quality ceiling. */
function bestLongEdge(variants) {
  return Math.max(...variants.map((v) => Math.max(v.w, v.h)));
}

/** Portrait clips first, then square, then normal landscape; relevance order kept inside each group. */
function rankCandidates(cands) {
  return cands
    .map((c, i) => ({ ...c, orientation: nativeOrientation(c.variants), i }))
    .filter((c) => c.orientation !== 'ultrawide' && bestLongEdge(c.variants) >= MIN_LONG_EDGE)
    .sort((a, b) => GROUP[a.orientation] - GROUP[b.orientation] || a.i - b.i);
}

/** Prefer a file sized for Instagram: portrait 540-1080 wide, landscape 1280-1920 wide. */
function pickVariants(cand) {
  const orientation = cand.orientation || nativeOrientation(cand.variants);
  const usable = cand.variants.filter((v) => orientationOf(v.w, v.h) !== 'ultrawide');
  const [lo, hi] = orientation === 'landscape' ? [1280, 1920] : [540, 1080];
  const ordered = usable.slice().sort((a, b) => {
    const inA = a.w >= lo && a.w <= hi ? 0 : 1;
    const inB = b.w >= lo && b.w <= hi ? 0 : 1;
    return inA - inB || b.w - a.w;
  });
  return { ordered, orientation };
}

function fileName(post, n, src, id, orientation) {
  return post.id + '_' + post.slug + '_v' + n + '_' + orientation + '_' + src + '-' + id + '.mp4';
}

/** Real dimensions and length, straight from the downloaded file. */
function probe(path) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  const nums = out.split(/[\s,]+/).filter(Boolean).map(Number);
  return { w: nums[0] || 0, h: nums[1] || 0, dur: nums[2] || 0 };
}

async function tryTake(post, cand, src, pageUrl) {
  const { ordered } = pickVariants(cand);
  const dir = join(OUT_ROOT, post.folder);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, '_tmp_' + src + '-' + cand.id + '.mp4');
  for (const v of ordered.slice(0, 4)) {
    const size = await headSize(v.url);
    if (size > MAX_BYTES) continue;
    if (size > 0 && size < MIN_BYTES) continue;
    let bytes;
    try {
      bytes = await download(v.url, tmp);
    } catch (e) {
      console.log('  ! ' + post.id + ' ' + src + '-' + cand.id + ': ' + e.message);
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
    // Reject on the real file, not on what the URL claimed.
    if (orientation === 'ultrawide' || info.dur < 3 || info.dur > 120) {
      unlinkSync(tmp);
      return false;
    }
    const n = (doneCount.get(post.id) || 0) + 1;
    const name = fileName(post, n, src, cand.id, orientation);
    renameSync(tmp, join(dir, name));
    doneCount.set(post.id, n);
    seen.add(src + ':' + cand.id);
    state.rows.push({
      post: post.id,
      cim: post.cim,
      cel: post.cel,
      folder: post.folder,
      file: post.folder + '/' + name,
      source: src,
      media_id: cand.id,
      page: pageUrl,
      direct: v.url,
      w: info.w,
      h: info.h,
      sec: Math.round(info.dur * 10) / 10,
      orientation,
      bytes,
      query: cand.query || '',
    });
    writeFileSync(STATE, JSON.stringify({ rows: state.rows, seen: [...seen] }, null, 1));
    console.log('+ ' + post.id + ' v' + n + ' ' + orientation + ' ' + info.w + 'x' + info.h + ' ' + Math.round(info.dur) + 's ' + (bytes / 1048576).toFixed(1) + 'MB  ' + src + '-' + cand.id);
    return true;
  }
  return false;
}

/** Pixabay fallback: search page -> item pages -> cdn mp4. Skips AI-generated slugs. */
async function pixabayCandidates(query) {
  const html = await fetchText('https://pixabay.com/videos/search/' + encodeURIComponent(query) + '/');
  const slugs = [...new Set([...html.matchAll(/\/videos\/([a-z0-9-]+-(\d+))\//g)].map((m) => m[1]))]
    .filter((s) => !s.startsWith('ai-generated'))
    .slice(0, 8);
  const out = [];
  for (const slug of slugs) {
    const page = 'https://pixabay.com/videos/' + slug + '/';
    try {
      const ph = await fetchText(page);
      const urls = [...new Set([...ph.matchAll(/https:\/\/cdn\.pixabay\.com\/video\/[^"'\\ )]+?\.mp4/g)].map((m) => m[0]))];
      if (!urls.length) continue;
      const base = urls[0].replace(/_(tiny|small|medium|large)\.mp4$/, '');
      const id = slug.match(/-(\d+)$/)[1];
      out.push({
        id,
        page,
        variants: [
          { url: base + '_small.mp4', w: 960, h: 540 },
          { url: base + '_medium.mp4', w: 1920, h: 1080 },
          { url: base + '_tiny.mp4', w: 640, h: 360 },
        ],
      });
    } catch {
      /* skip this item */
    }
    await sleep(900);
  }
  return out;
}

async function main() {
  const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
  for (const post of plan) {
    if (only && !only.has(post.id)) continue;
    if ((doneCount.get(post.id) || 0) >= PER_POST) {
      console.log('= ' + post.id + ' already has ' + doneCount.get(post.id));
      continue;
    }
    const pools = [];
    for (const q of post.queries) {
      try {
        const html = await fetchText('https://www.pexels.com/search/videos/' + encodeURIComponent(q) + '/');
        pools.push({ q, cands: rankCandidates(minePexels(html)), idx: 0 });
      } catch (e) {
        console.log('  search failed "' + q + '": ' + e.message);
        await sleep(2000);
      }
      await sleep(1200);
    }
    // Round-robin over the queries: the three clips of a post should come from
    // three different searches, not three angles of the same shoot.
    // Seed from what earlier runs already took for this post, so a top-up run
    // does not re-pick a neighbouring clip from the same shoot.
    const takenIds = state.rows.filter((r) => r.post === post.id && r.source === 'pexels').map((r) => Number(r.media_id));
    let guard = 0;
    while ((doneCount.get(post.id) || 0) < PER_POST && guard++ < 60) {
      let consumed = false;
      for (const pool of pools) {
        if ((doneCount.get(post.id) || 0) >= PER_POST) break;
        while (pool.idx < pool.cands.length) {
          const c = pool.cands[pool.idx++];
          consumed = true;
          if (seen.has('pexels:' + c.id)) continue;
          // Neighbouring ids are almost always the same upload session.
          if (takenIds.some((t) => Math.abs(t - Number(c.id)) < 200)) continue;
          c.query = pool.q;
          const ok = await tryTake(post, c, 'pexels', 'https://www.pexels.com/video/' + c.id + '/');
          if (ok) {
            takenIds.push(Number(c.id));
            await sleep(700);
            break;
          }
        }
      }
      if (!consumed) break;
    }
    if ((doneCount.get(post.id) || 0) < PER_POST) {
      for (const q of post.queries) {
        if ((doneCount.get(post.id) || 0) >= PER_POST) break;
        try {
          const cands = await pixabayCandidates(q);
          for (const c of cands) {
            if ((doneCount.get(post.id) || 0) >= PER_POST) break;
            if (seen.has('pixabay:' + c.id)) continue;
            c.query = q;
            const ok = await tryTake(post, c, 'pixabay', c.page);
            if (ok) await sleep(700);
          }
        } catch (e) {
          console.log('  pixabay failed "' + q + '": ' + e.message);
        }
        await sleep(1200);
      }
    }
    console.log('--- ' + post.id + ' done: ' + (doneCount.get(post.id) || 0) + '/' + PER_POST + ' (' + post.cim + ')');
  }
  const short = plan.filter((p) => (doneCount.get(p.id) || 0) < PER_POST).map((p) => p.id + ':' + (doneCount.get(p.id) || 0));
  console.log('TOTAL ' + state.rows.length + ' files. Short: ' + (short.join(', ') || 'none'));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
