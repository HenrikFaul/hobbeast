// Turns the raw stock clips in media-library/videos (large, audio-bearing,
// licence-reviewed) into the small silent loops the app actually ships, and
// writes the manifest the UI reads.
//
//   node scripts/build-editorial-videos.mjs            # build everything
//   node scripts/build-editorial-videos.mjs --per 1    # one clip per theme
//
// Output:
//   public/editorial/video/<theme>-<id>.mp4   ~5s, 720px wide, no audio
//   public/editorial/video/<theme>-<id>.jpg   poster frame
//   src/assets/editorial/videoLibrary.ts      category -> clips manifest
//
// Shipping these from our own origin rather than a bucket keeps them free of
// CORS, egress cost and a second deploy step; at ~100 KB each that is a trade
// worth making.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';

const SRC_DIR = 'media-library/videos';
const OUT_DIR = 'public/editorial/video';
const MANIFEST = 'src/assets/editorial/videoLibrary.ts';
const args = process.argv.slice(2);
const perTheme = Number(args[args.indexOf('--per') + 1]) || 2;

// Every theme maps onto the category resolver the collector uses, so a program
// without an image gets a backdrop that matches what it actually is.
const THEME_CATEGORY = {
  'concert-crowd': 'Zene', 'live-jazz': 'Zene', 'dj-set': 'Zene', 'karaoke': 'Zene',
  'drum-circle': 'Zene', 'guitar-friends': 'Zene', 'festival-lights': 'Zene',

  'hiking-friends': 'Természet & Túra', 'camping': 'Természet & Túra', 'winter-hike': 'Természet & Túra',
  'birdwatching': 'Természet & Túra', 'stargazing': 'Természet & Túra', 'kayaking': 'Természet & Túra',
  'boat-river': 'Természet & Túra', 'fishing': 'Természet & Túra',

  'board-game': 'Társasjáték', 'chess': 'Társasjáték', 'escape-room': 'Társasjáték',

  'theatre-stage': 'Színház & Előadás', 'standup-comedy': 'Színház & Előadás',
  'film-screening': 'Színház & Előadás',

  'cooking-together': 'Gasztro', 'baking-class': 'Gasztro', 'wine-tasting': 'Gasztro',
  'craft-beer': 'Gasztro', 'farmers-market': 'Gasztro', 'street-food': 'Gasztro',
  'picnic': 'Gasztro', 'coffee-friends': 'Gasztro',

  'running-group': 'Sport & Mozgás', 'cycling': 'Sport & Mozgás', 'climbing': 'Sport & Mozgás',
  'bouldering-gym': 'Sport & Mozgás', 'yoga-group': 'Sport & Mozgás', 'swimming': 'Sport & Mozgás',
  'tennis': 'Sport & Mozgás', 'table-tennis': 'Sport & Mozgás', 'football-amateur': 'Sport & Mozgás',
  'basketball-street': 'Sport & Mozgás', 'badminton': 'Sport & Mozgás', 'skateboard': 'Sport & Mozgás',
  'horse-riding': 'Sport & Mozgás', 'sunrise-run': 'Sport & Mozgás', 'meditation-group': 'Sport & Mozgás',

  'museum-visit': 'Kultúra', 'book-club': 'Kultúra', 'photography-walk': 'Kultúra',
  'painting-workshop': 'Kultúra', 'pottery': 'Kultúra', 'ceramics-wheel': 'Kultúra', 'knitting': 'Kultúra',

  'dog-walk-group': 'Családi', 'gardening': 'Családi', 'volunteering': 'Családi',

  'dancing': 'Tánc', 'dance-class': 'Tánc',

  'city-walk': 'Program', 'language-exchange': 'Program', 'bowling': 'Program', 'thermal-bath': 'Program',
};

function categoryFor(theme) {
  if (THEME_CATEGORY[theme]) return THEME_CATEGORY[theme];
  // The curated backlog clips are generic "people together" footage.
  return 'Program';
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

function main() {
  if (!existsSync(SRC_DIR)) throw new Error(`${SRC_DIR} is missing — run scraper-worker/fetch-videos.mjs first`);
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync('src/assets/editorial', { recursive: true });

  const byTheme = new Map();
  for (const file of readdirSync(SRC_DIR).filter((f) => f.endsWith('.mp4')).sort()) {
    const theme = file.replace(/-\d+\.mp4$/, '');
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme).push(file);
  }

  const clips = [];
  let bytes = 0;
  for (const [theme, files] of [...byTheme].sort()) {
    // Prefer the smaller originals: they are shorter and encode to a tighter
    // loop, and every clip here is only ever a backdrop.
    const chosen = files
      .map((file) => ({ file, size: statSync(`${SRC_DIR}/${file}`).size }))
      .sort((a, b) => a.size - b.size)
      .slice(0, perTheme);

    for (const { file } of chosen) {
      const base = file.replace(/\.mp4$/, '');
      const mp4 = `${OUT_DIR}/${base}.mp4`;
      const jpg = `${OUT_DIR}/${base}.jpg`;
      ffmpeg(['-t', '5', '-i', `${SRC_DIR}/${file}`,
        '-vf', 'scale=720:-2:flags=lanczos,fps=24',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '33',
        // A hard ceiling on the bitrate: a busy clip (snow, confetti, crowds)
        // otherwise encodes four times larger than a calm one for no visible
        // gain at backdrop size.
        '-maxrate', '400k', '-bufsize', '800k',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      ffmpeg(['-i', mp4, '-frames:v', '1', '-q:v', '6', jpg]);
      const size = statSync(mp4).size + statSync(jpg).size;
      bytes += size;
      clips.push({ theme, base, category: categoryFor(theme) });
      console.log(`+ ${base} (${Math.round(size / 1024)} KB) [${theme} -> ${categoryFor(theme)}]`);
    }
  }

  const byCategory = new Map();
  for (const clip of clips) {
    if (!byCategory.has(clip.category)) byCategory.set(clip.category, []);
    byCategory.get(clip.category).push(clip.base);
  }

  const manifest = `// GENERATED by scripts/build-editorial-videos.mjs — do not edit by hand.
//
// Silent 5-second loops used as the backdrop of a program that arrived without
// an image. Source: Pexels (Pexels License); provenance for every clip is in
// media-library/VIDEO_LIBRARY.md.

export const EDITORIAL_VIDEO_BASE = '/editorial/video';

/** Clip file stems per Hobbeast category, in a stable order. */
export const EDITORIAL_VIDEOS: Record<string, readonly string[]> = {
${[...byCategory].sort().map(([category, names]) => `  ${JSON.stringify(category)}: [\n${names.sort().map((n) => `    '${n}',`).join('\n')}\n  ],`).join('\n')}
};

export const EDITORIAL_VIDEO_COUNT = ${clips.length};
`;
  writeFileSync(MANIFEST, manifest);
  console.log(`DONE: ${clips.length} clips, ${(bytes / 1024 / 1024).toFixed(1)} MB, manifest -> ${MANIFEST}`);
}

main();
