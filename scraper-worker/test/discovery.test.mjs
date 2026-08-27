import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { harvestLinks, scoreCandidate, isWorthReviewing } from '../src/sources/discovery.mjs';

/**
 * Source discovery: turning the pages we already read into leads.
 *
 * Every host in the registry was added by hand. The sites we collect link
 * outward constantly, and those links are the best-qualified leads available —
 * they come from a site that already publishes Hungarian programmes.
 */

const PAGE = `
<html><body>
  <a href="/programok">Saját programjaink</a>
  <a href="https://muveszetimalom.hu/esemenyek">Művészetek Malma — események</a>
  <a href="https://kisvarosikultura.hu/">Kisvárosi Kultúrház</a>
  <a href="https://www.facebook.com/valami">Kövess minket</a>
  <a href="https://webshop.example.hu/kosar">Kosár</a>
  <a href="https://example.hu/dokumentum.pdf">Letölthető program (PDF)</a>
  <a href="https://a38.hu/hu/programok">A38 — már ismerjük</a>
  <a href="https://muveszetimalom.hu/rolunk">Rólunk</a>
</body></html>`;

describe('harvesting links', () => {
  const found = harvestLinks(PAGE, 'https://sajatoldal.hu/hirek', {
    knownHosts: ['a38.hu', 'sajatoldal.hu'],
  });
  const hosts = found.map((candidate) => candidate.host);

  it('keeps outbound hosts that could be a source', () => {
    assert.ok(hosts.includes('muveszetimalom.hu'));
    assert.ok(hosts.includes('kisvarosikultura.hu'));
  });

  it('never suggests a host the registry already collects', () => {
    // Re-crawling our own registry teaches nothing.
    assert.ok(!hosts.includes('a38.hu'));
  });

  it('never suggests the page it is reading', () => {
    assert.ok(!hosts.includes('sajatoldal.hu'));
  });

  it('skips social pages, which the collector refuses by design', () => {
    assert.ok(!hosts.some((host) => host.includes('facebook')));
  });

  it('skips carts, documents and other dead ends', () => {
    assert.ok(!hosts.includes('webshop.example.hu'));
    assert.ok(!found.some((candidate) => candidate.url.endsWith('.pdf')));
  });

  it('keeps one link per host, preferring the one that looks like a listing', () => {
    const malom = found.filter((candidate) => candidate.host === 'muveszetimalom.hu');
    assert.equal(malom.length, 1);
    // /esemenyek beats /rolunk.
    assert.ok(malom[0].url.includes('esemenyek'));
    assert.equal(malom[0].looksLikeListing, true);
  });

  it('records where the lead came from, so a bad source can be traced back', () => {
    assert.equal(found[0].foundOn, 'https://sajatoldal.hu/hirek');
  });

  it('survives markup that is not a page at all', () => {
    assert.deepEqual(harvestLinks('', 'https://x.hu'), []);
    assert.deepEqual(harvestLinks(null, 'https://x.hu'), []);
  });
});

describe('scoring a candidate', () => {
  it('rates a page that states its own events highest', () => {
    const scored = scoreCandidate({
      url: 'https://muveszetimalom.hu/esemenyek',
      title: 'Események — Művészetek Malma',
      html: '<script type="application/ld+json">{"@type":"Event"}</script>'.repeat(6),
    });
    assert.ok(scored.score >= 70, `expected a strong score, got ${scored.score}`);
    assert.ok(scored.reasons.some((reason) => reason.includes('strukturált')));
    assert.equal(isWorthReviewing(scored), true);
  });

  it('rates a listing with many dates but no markup as worth a look', () => {
    const html = Array.from({ length: 9 }, (_, i) => `<li>2026.09.${i + 1}. 19:00 Koncert</li>`).join('');
    const scored = scoreCandidate({ url: 'https://valami.hu/programnaptar', html });
    assert.ok(isWorthReviewing(scored));
    assert.ok(scored.signals.dates >= 5);
  });

  it('does not recommend a page with nothing to suggest it', () => {
    const scored = scoreCandidate({
      url: 'https://valami.hu/rolunk',
      title: 'Rólunk',
      html: '<p>Cégünk 1998 óta működik.</p>',
    });
    assert.equal(isWorthReviewing(scored), false);
  });

  it('marks a webshop down even when it is full of dates', () => {
    const dates = Array.from({ length: 9 }, (_, i) => `2026.09.${i + 1}. 19:00`).join(' ');
    const shop = scoreCandidate({ url: 'https://bolt.hu/termekek', html: `${dates} Kosárba tesz termék webshop` });
    const plain = scoreCandidate({ url: 'https://bolt.hu/termekek', html: dates });
    assert.ok(shop.score < plain.score);
    assert.ok(shop.reasons.some((reason) => reason.includes('Webshop')));
  });

  it('always explains itself, so an operator can disagree', () => {
    const scored = scoreCandidate({ url: 'https://valami.hu/esemenyek', html: '' });
    assert.ok(scored.reasons.length > 0);
  });

  it('never returns a score outside 0–100', () => {
    const huge = scoreCandidate({
      url: 'https://x.hu/esemenyek',
      title: 'Programok',
      linkText: 'Események',
      html: '<script type="application/ld+json">{"@type":"Event"}</script>'.repeat(50)
        + Array.from({ length: 60 }, (_, i) => `2026.09.${(i % 28) + 1}. 19:00`).join(' '),
    });
    assert.ok(huge.score <= 100 && huge.score >= 0);
  });
});

/**
 * Canonicalisation and frontier guards, from the crawl notes in
 * C:\Work\Smartsearchtool (K4 — crawl · extract · dedup).
 */
import { canonicalizeCandidateUrl } from '../src/sources/discovery.mjs';

describe('canonicalising a candidate address', () => {
  it('strips the tracking parameters that never change a page', () => {
    assert.equal(
      canonicalizeCandidateUrl('https://valami.hu/esemenyek?utm_source=fb&fbclid=xyz&kategoria=zene'),
      'https://valami.hu/esemenyek?kategoria=zene',
    );
  });

  it('sorts what remains, so two orderings become one candidate', () => {
    assert.equal(
      canonicalizeCandidateUrl('https://valami.hu/e?b=2&a=1'),
      canonicalizeCandidateUrl('https://valami.hu/e?a=1&b=2'),
    );
  });

  it('folds the differences that never mean anything', () => {
    const target = 'https://valami.hu/esemenyek';
    assert.equal(canonicalizeCandidateUrl('http://www.valami.hu/esemenyek/'), target);
    assert.equal(canonicalizeCandidateUrl('https://VALAMI.hu/esemenyek#lista'), target);
  });

  it('keeps the root slash, which is the norm rather than noise', () => {
    assert.equal(canonicalizeCandidateUrl('https://valami.hu/'), 'https://valami.hu/');
  });

  it('refuses what is not an address at all', () => {
    assert.equal(canonicalizeCandidateUrl(''), null);
    assert.equal(canonicalizeCandidateUrl('mailto:a@b.hu'), null);
  });
});

describe('frontier guards', () => {
  const harvest = (href) => harvestLinks(`<a href="${href}">Programok</a>`, 'https://sajat.hu/', {
    knownHosts: ['sajat.hu'],
  });

  it('never follows a calendar, which generates URLs for ever', () => {
    // The worst trap for an events crawler: ?date=2031-07-04 is infinite.
    assert.equal(harvest('https://mas.hu/esemenyek?date=2031-07-04').length, 0);
    assert.equal(harvest('https://mas.hu/programok?month=9&year=2031').length, 0);
    assert.equal(harvest('https://mas.hu/esemenyek/2031/07/04/').length, 0);
  });

  it('never follows an internal search, which is a query and not a source', () => {
    assert.equal(harvest('https://mas.hu/esemenyek?q=koncert').length, 0);
    assert.equal(harvest('https://mas.hu/kereses/koncert').length, 0);
  });

  it('refuses a session URL, which is different for every visitor', () => {
    assert.equal(harvest('https://mas.hu/programok?PHPSESSID=abc123').length, 0);
  });

  it('refuses a faceted filter that has started combining itself', () => {
    assert.equal(harvest('https://mas.hu/programok?a=1&b=2&c=3&d=4&e=5&f=6&g=7').length, 0);
  });

  it('takes the first pages of a listing but not the deep tail', () => {
    assert.equal(harvest('https://mas.hu/programok?page=2').length, 1);
    assert.equal(harvest('https://mas.hu/programok?page=48').length, 0);
  });

  it('spots a site generating URLs out of its own path', () => {
    assert.equal(harvest('https://mas.hu/program/program/program/program').length, 0);
    assert.equal(harvest('https://mas.hu/a/b/c/d/e/f/g/h/i/j').length, 0);
  });

  it('still lets an ordinary listing through', () => {
    const found = harvest('https://mas.hu/esemenyek?kategoria=zene');
    assert.equal(found.length, 1);
    assert.equal(found[0].url, 'https://mas.hu/esemenyek?kategoria=zene');
  });
});
