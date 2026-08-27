import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crawlFrontier } from '../src/sources/crawlFrontier.mjs';

/**
 * The frontier crawl, driven against a fake site graph with no network.
 *
 * This is the thing K4 describes and the one-hop harvest was not: a bounded
 * BFS that walks outward from proven sources, descends into a known-good
 * host's other listing pages, and turns the outbound links into candidates —
 * while respecting robots, deduping near-identical pages, and refusing to
 * exhaust any budget.
 */

/** A little web: url -> html. Anything not here 404s. */
function fakeWeb(pages) {
  return async (url) => {
    const html = pages[url] ?? pages[url.replace(/\/$/, '')] ?? null;
    return { html, status: html ? 200 : 404 };
  };
}

const link = (href, text = 'Programok') => `<a href="${href}">${text}</a>`;

describe('crawlFrontier', () => {
  it('turns outbound links from a proven source into candidates', async () => {
    const pages = {
      'https://a38.hu/programok': `<html><body>
        <h1>A38 programok</h1>
        ${link('https://muveszetimalom.hu/esemenyek', 'Művészetek Malma')}
        ${link('https://kisvarosikult.hu/naptar', 'Kisvárosi Kultúrház')}
      </body></html>`,
      'https://muveszetimalom.hu/esemenyek': '<html><body>' + '<script type="application/ld+json">{"@type":"Event"}</script>'.repeat(5) + '</body></html>',
      'https://kisvarosikult.hu/naptar': '<html><body>Programnaptár</body></html>',
    };
    const out = await crawlFrontier({
      seeds: ['https://a38.hu/programok'],
      fetchPage: fakeWeb(pages),
      knownHosts: ['a38.hu'],
      maxDepth: 1,
    });
    const hosts = out.candidates.map((c) => c.host).sort();
    assert.deepEqual(hosts, ['kisvarosikult.hu', 'muveszetimalom.hu']);
  });

  it('descends into a known host\'s other listing pages to reach more leads', async () => {
    const pages = {
      // The seed links to its own /szinhaz page, which links out to a new host.
      'https://kulturhaz.hu/programok': `<html><body>Programok ${link('https://kulturhaz.hu/szinhaz', 'Színház')}</body></html>`,
      'https://kulturhaz.hu/szinhaz': `<html><body>Színházi események ${link('https://ujtarsulat.hu/eloadasok', 'Új Társulat')}</body></html>`,
      'https://ujtarsulat.hu/eloadasok': '<html><body>Előadások</body></html>',
    };
    const out = await crawlFrontier({
      seeds: ['https://kulturhaz.hu/programok'],
      fetchPage: fakeWeb(pages),
      knownHosts: ['kulturhaz.hu'],
      maxDepth: 2,
    });
    // The new host is only reachable by descending one level first.
    assert.ok(out.candidates.some((c) => c.host === 'ujtarsulat.hu'));
    assert.ok(out.pagesFetched >= 2);
  });

  it('respects robots at every fetch', async () => {
    const pages = {
      'https://a.hu/programok': `<html><body>${link('https://blocked.hu/esemenyek')}</body></html>`,
      'https://a.hu/tiltott': '<html><body>secret</body></html>',
    };
    const fetched = [];
    const out = await crawlFrontier({
      seeds: ['https://a.hu/programok', 'https://a.hu/tiltott'],
      fetchPage: async (url) => { fetched.push(url); return fakeWeb(pages)(url); },
      robotsAllows: async (url) => !url.includes('/tiltott'),
      knownHosts: ['a.hu'],
    });
    assert.ok(!fetched.includes('https://a.hu/tiltott'));
    assert.ok(fetched.includes('https://a.hu/programok'));
    void out;
  });

  it('skips a near-duplicate page instead of crawling it twice', async () => {
    const listing = '<html><body>' + ('Őszi programsorozat koncertekkel és tárlatvezetésekkel, ingyenes belépéssel, minden hétvégén a nagyteremben. '.repeat(8)) + '</body></html>';
    const pages = {
      'https://x.hu/programok': listing + link('https://x.hu/en/events', 'English'),
      // Same content under a different slug — a re-slugged copy.
      'https://x.hu/en/events': listing,
    };
    const out = await crawlFrontier({
      seeds: ['https://x.hu/programok', 'https://x.hu/en/events'],
      fetchPage: fakeWeb(pages),
      knownHosts: ['x.hu'],
    });
    assert.equal(out.nearDuplicatesSkipped, 1);
  });

  it('never exceeds its page budget', async () => {
    // A site that links to a fresh internal listing for ever.
    const fetchPage = async (url) => ({
      html: `<html><body>Programok ${link(url + '/tovabb')}</body></html>`,
      status: 200,
    });
    const out = await crawlFrontier({
      seeds: ['https://vegtelen.hu/esemenyek'],
      fetchPage,
      knownHosts: ['vegtelen.hu'],
      maxDepth: 99,
      maxPages: 10,
    });
    assert.ok(out.pagesFetched <= 10, `fetched ${out.pagesFetched}`);
  });

  it('never fetches one host more than its per-host cap', async () => {
    const fetchPage = async (url) => ({
      html: `<html><body>${link(url + '/esemenyek-2')}${link(url + '/esemenyek-3')}</body></html>`,
      status: 200,
    });
    const out = await crawlFrontier({
      seeds: ['https://egyhost.hu/esemenyek'],
      fetchPage,
      knownHosts: ['egyhost.hu'],
      maxDepth: 99,
      maxPages: 100,
      perHostCap: 4,
    });
    assert.ok(out.pagesFetched <= 4, `fetched ${out.pagesFetched}`);
  });

  it('lets one fetch failure not stop the crawl', async () => {
    const pages = {
      'https://a.hu/programok': `<html><body>${link('https://b.hu/programok')}${link('https://c.hu/esemenyek')}</body></html>`,
    };
    const out = await crawlFrontier({
      seeds: ['https://a.hu/programok'],
      fetchPage: async (url) => {
        if (url.includes('a.hu')) return fakeWeb(pages)(url);
        throw new Error('boom');
      },
      knownHosts: ['a.hu'],
    });
    // The seed's outbound links still became candidates despite nothing beyond
    // it being fetchable.
    assert.ok(out.candidates.length >= 1);
  });

  it('demands a fetch function rather than failing obscurely later', async () => {
    await assert.rejects(() => crawlFrontier({ seeds: ['https://a.hu'] }), /fetchPage/);
  });
});

describe('operator controls and telemetry', () => {
  const link = (href, t = 'Programok') => `<a href="${href}">${t}</a>`;

  it('in strict mode never leaves the seed and allowed hosts', async () => {
    const pages = {
      'https://sajat.hu/programok': `<html><body>${link('https://kulso.hu/esemenyek')}${link('https://engedett.hu/esemenyek')}</body></html>`,
    };
    const fetched = [];
    await crawlFrontier({
      seeds: ['https://sajat.hu/programok'],
      fetchPage: async (url) => { fetched.push(url); return { html: pages[url] ?? '<html><body>x</body></html>', status: 200 }; },
      knownHosts: ['sajat.hu'],
      strict: true,
      allowedHosts: ['engedett.hu'],
      maxDepth: 2,
    });
    // kulso.hu is neither seed nor allowed; it is a candidate but never fetched.
    assert.ok(!fetched.some((u) => u.includes('kulso.hu')));
  });

  it('applies the operator exclude predicate to fetch and to candidates', async () => {
    const pages = {
      'https://a.hu/programok': `<html><body>${link('https://spam.hu/esemenyek')}${link('https://jo.hu/esemenyek')}</body></html>`,
    };
    const out = await crawlFrontier({
      seeds: ['https://a.hu/programok'],
      fetchPage: async (url) => ({ html: pages[url] ?? '', status: 200 }),
      knownHosts: ['a.hu'],
      isExcluded: (url) => url.includes('spam.hu'),
    });
    assert.ok(!out.candidates.some((c) => c.host === 'spam.hu'));
    assert.ok(out.candidates.some((c) => c.host === 'jo.hu'));
  });

  it('reports a 304 as not-modified without counting it as a fetch', async () => {
    const events = [];
    const out = await crawlFrontier({
      seeds: ['https://a.hu/programok'],
      fetchPage: async () => ({ notModified: true, status: 304, etag: 'W/"abc"' }),
      knownHosts: ['a.hu'],
      onPage: (p) => events.push(p),
    });
    assert.equal(out.pagesFetched, 0);
    assert.equal(events.filter((e) => e.outcome === 'not_modified').length, 1);
  });

  it('emits a telemetry row for every page, with word count and title', async () => {
    const events = [];
    await crawlFrontier({
      seeds: ['https://a.hu/programok'],
      fetchPage: async () => ({ html: '<html><head><title>Események — A</title></head><body>' + 'szó '.repeat(50) + '</body></html>', status: 200 }),
      knownHosts: ['a.hu'],
      onPage: (p) => events.push(p),
    });
    const fetched = events.find((e) => e.outcome === 'fetched');
    assert.ok(fetched);
    assert.equal(fetched.title, 'Események — A');
    assert.ok(fetched.word_count >= 50);
    assert.ok(fetched.content_simhash.length === 64);
  });
});
