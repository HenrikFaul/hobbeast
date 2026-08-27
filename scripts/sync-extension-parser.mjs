/**
 * The extension reads Facebook POSTS as well as events, and a post is just
 * text — the same text the "Bejegyzésből" admin panel already knows how to
 * read. Rather than keep a second parser that slowly drifts from the first,
 * the app's own parser is transpiled into the extension folder as plain ESM.
 *
 * Run `npm run extension:sync` after touching socialPostParser.ts.
 * `--check` fails instead of writing, so CI notices drift.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { transformSync } from 'esbuild';

const SOURCE = 'src/features/events/socialPostParser.ts';
const TARGET = 'browser-extension/hobbeast-importer/vendor/socialPostParser.js';
const BANNER = `// GENERATED from ${SOURCE} by scripts/sync-extension-parser.mjs — do not edit.\n`;

const { code } = transformSync(readFileSync(SOURCE, 'utf8'), {
  loader: 'ts',
  format: 'esm',
  target: 'es2022',
});
const next = BANNER + code;

if (process.argv.includes('--check')) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  if (current !== next) {
    console.error(`${TARGET} is stale. Run: npm run extension:sync`);
    process.exit(1);
  }
  console.log('extension parser in sync');
} else {
  writeFileSync(TARGET, next);
  console.log(`wrote ${TARGET}`);
}
