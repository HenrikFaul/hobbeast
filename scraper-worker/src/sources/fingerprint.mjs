/**
 * Near-duplicate detection for discovered pages.
 *
 * Ported from the SimHash implementation in C:\Work\Smartsearchtool (hercules
 * crawler_actions.ts) and the dedup guidance in K4 — "persist fingerprints for
 * cross-run dedup ... without this results flood with duplicates".
 *
 * The problem it solves here: a venue's site renders the same template at
 * /esemenyek, /esemenyek/, /esemenyek?ref=nav and /en/events — four URLs, one
 * page. URL canonicalization catches the first three; only a content
 * fingerprint catches the fourth, and catches a site that publishes the same
 * listing under a dozen category slugs. Two pages whose fingerprints are within
 * a few bits are the same page for our purposes, and only one should become a
 * candidate.
 */

/**
 * A 64-bit SimHash of a page's text, as a 64-character bit string.
 *
 * Kept as a string rather than a BigInt so it stores and compares trivially in
 * Postgres text and survives a JSON round-trip through the RPC unchanged.
 */
export function simhash64(text) {
  const words = String(text || '').toLowerCase().match(/\b[\p{L}\p{N}]+\b/gu) ?? [];
  if (!words.length) return '0'.repeat(64);

  const vector = new Array(64).fill(0);
  for (const word of words) {
    // A cheap, stable per-word hash. The exact function does not matter for
    // SimHash as long as it is deterministic and spreads the bits.
    let hash = 0;
    for (let i = 0; i < word.length; i += 1) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    for (let bit = 0; bit < 64; bit += 1) {
      vector[bit] += ((hash >> (bit % 32)) & 1) ? 1 : -1;
    }
  }
  return vector.map((value) => (value > 0 ? '1' : '0')).join('');
}

/** How many bits differ between two fingerprints. */
export function hammingDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let i = 0; i < length; i += 1) {
    if (left[i] !== right[i]) distance += 1;
  }
  return distance;
}

/**
 * Whether two pages are the same page for discovery's purposes.
 *
 * Three bits out of sixty-four is the standard SimHash near-duplicate
 * threshold: it catches templated pages and re-slugged listings while leaving
 * two genuinely different event pages apart.
 */
export function isNearDuplicate(a, b, threshold = 3) {
  return hammingDistance(a, b) <= threshold;
}

/**
 * The first fingerprint in a set that a new one duplicates, or null.
 * Linear, which is fine for the small per-run candidate sets discovery
 * produces; a large frontier would want the banding from K4's MinHash/LSH.
 */
export function findNearDuplicate(fingerprint, existing, threshold = 3) {
  for (const other of existing) {
    if (other && isNearDuplicate(fingerprint, other, threshold)) return other;
  }
  return null;
}
