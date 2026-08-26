#!/usr/bin/env node
// Keeps the Edge Function's copy of the extraction recipes byte-identical to the
// scraper worker's. One implementation, two runtimes: the admin preview and the
// production collector must never disagree about what a source yields.
//
//   node scripts/sync-edge-recipes.mjs           # copy worker -> edge
//   node scripts/sync-edge-recipes.mjs --check   # fail if they differ (CI)

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'scraper-worker/src/sources/recipes.mjs';
const TARGET = 'supabase/functions/source-manager/recipes.mjs';
const BANNER = '// GENERATED COPY — edit scraper-worker/src/sources/recipes.mjs instead.\n'
  + '// Kept in sync by scripts/sync-edge-recipes.mjs (npm run edge:sync-recipes).\n';

const source = BANNER + readFileSync(SOURCE, 'utf8');
const check = process.argv.includes('--check');

let current = null;
try { current = readFileSync(TARGET, 'utf8'); } catch { /* first run */ }

if (current === source) {
  console.log('recipes in sync');
  process.exit(0);
}
if (check) {
  console.error(`${TARGET} is out of date. Run: npm run edge:sync-recipes`);
  process.exit(1);
}
writeFileSync(TARGET, source);
console.log(`synced ${SOURCE} -> ${TARGET}`);
