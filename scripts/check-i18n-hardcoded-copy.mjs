#!/usr/bin/env node
/**
 * Guard: a file that has been migrated to i18n must not gain new hardcoded copy.
 *
 * The product has ~1769 Hungarian string literals across 355 files and they are
 * being migrated surface by surface. A blanket ban would fail on day one and be
 * switched off; a ratchet is the thing that actually holds. So this checks only
 * the files listed in MIGRATED, and that list may only grow.
 *
 * Run: npm run i18n:check
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose visible copy must come from the catalogue. Add, never remove. */
const MIGRATED = [
  'src/components/events/CountryFilterBar.tsx',
  'src/components/LanguageSwitcher.tsx',
];

// Hungarian-specific letters. Plain ASCII words are not flagged: "All" or a CSS
// class would produce constant false positives and train people to ignore this.
const HU_LETTERS = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;

/** Places a Hungarian literal is legitimate and not user-visible copy. */
const ALLOWED_CONTEXT = [
  /^\s*(\/\/|\*|\/\*)/,          // comments
  /data-testid=/,                 // test hooks
  /\bconsole\.(log|warn|error)\(/,
  /from\s+['"]/,                  // import paths
];

function scan(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return [{ line: 0, text: `MISSING FILE (was it renamed? update MIGRATED)` }];
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    if (!HU_LETTERS.test(line)) return;
    if (ALLOWED_CONTEXT.some((re) => re.test(line))) return;
    // Only flag actual string literals, not identifiers or JSX text that was
    // already routed through t().
    const literals = line.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
    const offending = literals.filter((lit) => HU_LETTERS.test(lit));
    if (offending.length) hits.push({ line: i + 1, text: offending.join(' | ').slice(0, 120) });
  });
  return hits;
}

let failed = 0;
for (const rel of MIGRATED) {
  const hits = scan(rel);
  if (hits.length) {
    failed += hits.length;
    console.error(`\n${rel}`);
    for (const h of hits) console.error(`  ${String(h.line).padStart(4)}: ${h.text}`);
  }
}

if (failed) {
  console.error(
    `\ni18n:check failed — ${failed} hardcoded Hungarian literal(s) in migrated files.`
    + `\nMove the text into src/i18n/resources/hu.ts and read it with t().\n`,
  );
  process.exit(1);
}
console.log(`i18n:check passed — ${MIGRATED.length} migrated file(s), no hardcoded copy.`);
