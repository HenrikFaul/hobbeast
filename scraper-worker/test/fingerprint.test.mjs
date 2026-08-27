import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simhash64, hammingDistance, isNearDuplicate, findNearDuplicate } from '../src/sources/fingerprint.mjs';

/**
 * Near-duplicate detection, ported from the SimHash in C:\Work\Smartsearchtool
 * (hercules). The job: catch a page republished under a different slug, which
 * URL canonicalization cannot see.
 */

describe('simhash', () => {
  it('is a stable 64-bit fingerprint', () => {
    const fp = simhash64('a museum lists its concerts and workshops for the season');
    assert.equal(fp.length, 64);
    assert.match(fp, /^[01]+$/);
    // Deterministic: the same text always fingerprints the same.
    assert.equal(fp, simhash64('a museum lists its concerts and workshops for the season'));
  });

  it('gives empty text a defined fingerprint rather than throwing', () => {
    assert.equal(simhash64('').length, 64);
    assert.equal(simhash64(null).length, 64);
  });

  it('reads accented Hungarian words, not just ASCII', () => {
    // The \w-only original dropped every accented word; \p{L} keeps them.
    assert.notEqual(simhash64('Művészetek Malma őszi programajánló'), '0'.repeat(64));
  });
});

describe('near-duplicate judgement', () => {
  // A page's worth of text, which is what the crawler actually fingerprints
  // (a 20 000-char slice). The default threshold of 3 bits is tuned for that
  // length; on a one-line string SimHash has too little to work with.
  const base = ('A Művészetek Malma őszi programsorozata koncertekkel, tárlatvezetésekkel '
    + 'és családi foglalkozásokkal várja a látogatókat minden hétvégén. A belépés '
    + 'ingyenes, regisztráció nem szükséges. A programok a nagyteremben zajlanak.').repeat(6);

  it('sees a page and its re-slugged copy as the same', () => {
    // Same page, one line of news appended — a templated republish.
    const copy = base + ' Frissítés: az októberi koncert elmarad.';
    assert.ok(isNearDuplicate(simhash64(base), simhash64(copy)));
  });

  it('keeps two genuinely different listings apart', () => {
    const other = ('A Kis-Duna motorcsónak-kölcsönző hétvégi vízitúrákat kínál Ráckevén, '
      + 'hajóvezetői engedély nélkül, családoknak és baráti társaságoknak. Mentőmellény '
      + 'minden korosztálynak, rövid betanítás indulás előtt.').repeat(6);
    assert.ok(!isNearDuplicate(simhash64(base), simhash64(other)));
  });

  it('finds the first duplicate in a set, or nothing', () => {
    const unrelated = ('Teljesen más tartalom hajókról, vitorlázásról és a Balatonról, '
      + 'szezonális bérlési lehetőségekkel.').repeat(6);
    const fingerprints = [simhash64(unrelated), simhash64(base)];
    assert.ok(findNearDuplicate(simhash64(base + ' apró változás'), fingerprints));
    assert.equal(findNearDuplicate(simhash64(unrelated + ' still the same'), fingerprints), fingerprints[0]);
  });

  it('counts differing bits, including a length mismatch', () => {
    assert.equal(hammingDistance('1100', '1010'), 2);
    assert.equal(hammingDistance('1100', '110'), 1);
  });
});
