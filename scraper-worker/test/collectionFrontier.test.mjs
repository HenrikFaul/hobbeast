import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCollectionFrontier, backoffSeconds } from '../src/sources/collectionFrontier.mjs';

/**
 * The collection frontier, driven against an in-memory queue and a fake site
 * with no network and no database.
 *
 * The queue below mirrors the RPC contract row for row — pending/running/done/
 * error, bounded retry with decaying priority, claim order by priority DESC
 * then depth ASC, host backoff exclusion, the pre-claim status handed back —
 * so what passes here is what the planner will do against Postgres. The
 * planner itself is pure: this file is the only place the two meet.
 */

const SOURCE = 'src-kulturhaz';
const HOST = 'kulturhaz.hu';
const LISTING = `https://${HOST}/programok`;
const at = (path) => `https://${HOST}${path}`;

/** The RPCs, in memory. Rows live in a Map keyed by url; ids are stable. */
function fakeQueue() {
  const rows = new Map();
  const calls = { enqueue: [], claim: [], finish: [], release: [], hostBackoff: [], clearBackoff: [] };
  const backedOff = new Set();
  let nextId = 1;
  let tick = 0;
  const byId = (id) => [...rows.values()].find((r) => r.id === id);

  const q = {
    rows, calls, backedOff,
    // Ticks a done row must have aged before it is offered again. Infinity
    // is "never"; a test sets 0 to model the RPC's p_revisit_after elapsing.
    revisitAfter: Infinity,
    row: (path) => rows.get(at(path)),

    async enqueue(sourceId, batch) {
      calls.enqueue.push(batch.map((r) => r.url));
      let inserted = 0;
      for (const r of batch.slice(0, 2000)) {
        if (rows.has(r.url)) continue;
        rows.set(r.url, {
          id: `id-${nextId}`, created: nextId, source_id: sourceId,
          url: r.url, host: r.host, depth: r.depth, priority: r.priority, discovered_from: r.discovered_from,
          status: 'pending', found_events: 0, attempts: 0, error: null, etag: null, last_modified: null, fetched_at: null,
        });
        nextId += 1;
        inserted += 1;
      }
      return inserted;
    },

    async claim(sourceId, limit) {
      calls.claim.push(limit);
      const stale = (r) => r.status === 'done' && r.fetched_at !== null && tick - r.fetched_at >= q.revisitAfter;
      const picked = [...rows.values()]
        .filter((r) => r.source_id === sourceId && !backedOff.has(r.host))
        .filter((r) => (r.status === 'pending' && r.attempts < 3) || stale(r))
        .sort((a, b) => (Number(b.status === 'pending') - Number(a.status === 'pending'))
          || (b.priority - a.priority)
          || (a.depth - b.depth)
          || ((a.fetched_at ?? -1) - (b.fetched_at ?? -1))
          || (a.created - b.created))
        .slice(0, Math.max(1, Math.min(limit, 200)));
      return picked.map((r) => {
        const before = r.status;
        r.status = 'running';
        return { id: r.id, url: r.url, host: r.host, depth: r.depth, priority: r.priority, etag: r.etag, last_modified: r.last_modified, found_events: r.found_events, status: before };
      });
    },

    async finish(id, patch) {
      calls.finish.push({ id, ...patch });
      const r = byId(id);
      if (!r) return;
      r.attempts += 1;
      r.status = patch.status;
      if (patch.foundEvents != null) r.found_events = patch.foundEvents;
      r.error = patch.error ?? null;
      if (patch.etag != null) r.etag = patch.etag;
      if (patch.lastModified != null) r.last_modified = patch.lastModified;
      tick += 1;
      r.fetched_at = tick;
      if (patch.status === 'error' && r.attempts < 3) {
        r.status = 'pending';
        r.priority *= 0.5;
      }
    },

    async release(ids) {
      calls.release.push([...ids]);
      let n = 0;
      for (const id of ids) {
        const r = byId(id);
        if (r && r.status === 'running') { r.status = 'pending'; n += 1; }
      }
      return n;
    },

    async hostBackoff(host, seconds) { calls.hostBackoff.push({ host, seconds }); backedOff.add(host); },
    async clearBackoff(host) { calls.clearBackoff.push(host); backedOff.delete(host); },
  };
  return q;
}

/**
 * A little site: url -> { html } | { status } | { notModified }. Anything not
 * here is a 404. Behaves like fetchConditional: non-2xx throws `HTTP <n>`.
 */
function fakeSite(pages, fetches = []) {
  return async (url, validators) => {
    fetches.push({ url, validators });
    const page = pages.get(url);
    if (!page) throw new Error('HTTP 404');
    if (page.status && page.status >= 400) throw new Error(`HTTP ${page.status}`);
    if (page.notModified) return { html: null, status: 304, notModified: true, etag: page.etag ?? validators?.etag ?? null, lastModified: null };
    return { html: page.html, status: 200, notModified: false, etag: page.etag ?? null, lastModified: page.lastModified ?? null };
  };
}

const event = (name) => `<event>${name}</event>`;
const link = (href, text = 'Esemény') => `<a href="${href}">${text}</a>`;
const html = (...parts) => `<html><body>${parts.join('')}</body></html>`;
const extract = (body) => [...String(body || '').matchAll(/<event>(.*?)<\/event>/g)].map((m) => ({ name: m[1] }));
const harvest = (body, pageUrl) => [...String(body || '').matchAll(/<a\b[^>]*href="([^"]+)"/g)]
  .map((m) => new URL(m[1], pageUrl).toString())
  .filter((u) => new URL(u).hostname === HOST);
const detailShaped = (pathname) => /\/esemeny\/\d+/.test(pathname);

function run(overrides) {
  return runCollectionFrontier({
    sourceId: SOURCE,
    listingUrl: LISTING,
    listingHost: HOST,
    candidateUrls: [],
    extractFromDetail: extract,
    harvestLinks: harvest,
    isDetailShaped: detailShaped,
    delayMs: 0,
    ...overrides,
  });
}

describe('collectionFrontier: seeding', () => {
  it('enqueues each candidate once, detail-shaped links at priority 2 and the rest at 0.5', async () => {
    const q = fakeQueue();
    const pages = new Map([
      [at('/esemeny/123'), { html: html(event('Koncert')) }],
      [at('/programok/oszi-sorozat'), { html: html() }],
    ]);
    const out = await run({
      queue: q,
      fetchDetail: fakeSite(pages),
      candidateUrls: [at('/esemeny/123'), at('/esemeny/123'), at('/programok/oszi-sorozat'), LISTING],
    });
    assert.equal(out.enqueued, 2, 'the duplicate and the listing itself are not rows');
    assert.equal(q.row('/esemeny/123').priority, 2);
    assert.equal(q.row('/programok/oszi-sorozat').priority, 0.5);
    for (const row of q.rows.values()) {
      assert.equal(row.depth, 1);
      assert.equal(row.host, HOST);
      assert.equal(row.discovered_from, LISTING);
    }

    // The same listing next run: nothing new to insert.
    const again = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/123')] });
    assert.equal(again.enqueued, 0);
  });

  it('sends the seeds in chunks of 500', async () => {
    const q = fakeQueue();
    const candidates = Array.from({ length: 1200 }, (_, i) => at(`/esemeny/${1000 + i}`));
    await run({ queue: q, fetchDetail: fakeSite(new Map()), candidateUrls: candidates, maxDetails: 1 });
    const seedBatches = q.calls.enqueue.slice(0, 3).map((b) => b.length);
    assert.deepEqual(seedBatches, [500, 500, 200]);
  });
});

describe('collectionFrontier: claim order', () => {
  it('fetches in priority DESC, depth ASC order and leaves the rest pending', async () => {
    const q = fakeQueue();
    // Pre-existing frontier rows, as an earlier run would have left them.
    await q.enqueue(SOURCE, [
      { url: at('/programok/kategoria'), host: HOST, depth: 1, priority: 0.5, discovered_from: LISTING },
      { url: at('/esemeny/2'), host: HOST, depth: 2, priority: 2, discovered_from: at('/esemeny/1') },
      { url: at('/esemeny/1'), host: HOST, depth: 1, priority: 2, discovered_from: LISTING },
    ]);
    const fetches = [];
    const pages = new Map([
      [at('/esemeny/1'), { html: html(event('A')) }],
      [at('/esemeny/2'), { html: html(event('B')) }],
      [at('/programok/kategoria'), { html: html() }],
    ]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages, fetches), maxDetails: 2 });
    assert.deepEqual(fetches.map((f) => f.url), [at('/esemeny/1'), at('/esemeny/2')]);
    assert.equal(out.claimed, 2);
    assert.equal(q.row('/programok/kategoria').status, 'pending', 'beyond this run\'s share, untouched');
  });

  it('never fetches the same row twice in one run', async () => {
    const q = fakeQueue();
    const fetches = [];
    const pages = new Map([[at('/esemeny/1'), { html: html(event('A')) }]]);
    await run({ queue: q, fetchDetail: fakeSite(pages, fetches), candidateUrls: [at('/esemeny/1')], maxDetails: 10 });
    assert.equal(fetches.length, 1);
  });
});

describe('collectionFrontier: outcomes', () => {
  it('marks a fetched page done with its found_events and returns the events with their URL', async () => {
    const q = fakeQueue();
    const pages = new Map([[at('/esemeny/7'), { html: html(event('Jazz est'), event('Táncház')), etag: 'W/"v1"', lastModified: 'Tue, 01 Sep 2026 10:00:00 GMT' }]]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/7')] });
    assert.equal(out.fetched, 1);
    assert.equal(out.errors, 0);
    assert.deepEqual(out.events, [
      { ev: { name: 'Jazz est' }, detailUrl: at('/esemeny/7') },
      { ev: { name: 'Táncház' }, detailUrl: at('/esemeny/7') },
    ]);
    const row = q.row('/esemeny/7');
    assert.equal(row.status, 'done');
    assert.equal(row.found_events, 2);
    assert.equal(row.etag, 'W/"v1"');
    assert.equal(row.last_modified, 'Tue, 01 Sep 2026 10:00:00 GMT');
    assert.equal(row.attempts, 1);
  });

  it('on a 304 keeps the previous found_events and does not re-extract', async () => {
    const q = fakeQueue();
    const pages = new Map([[at('/esemeny/7'), { html: html(event('Jazz est'), event('Táncház')), etag: 'W/"v1"' }]]);
    await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/7')] });
    assert.equal(q.row('/esemeny/7').found_events, 2);

    // The revisit interval elapses; the page now answers 304 to our validators.
    q.revisitAfter = 0;
    pages.set(at('/esemeny/7'), { notModified: true, etag: 'W/"v1"' });
    const fetches = [];
    let extracts = 0;
    const out = await run({
      queue: q,
      fetchDetail: fakeSite(pages, fetches),
      extractFromDetail: (body, url) => { extracts += 1; return extract(body, url); },
      candidateUrls: [at('/esemeny/7')],
    });
    assert.equal(out.notModified, 1);
    assert.equal(out.fetched, 0);
    assert.equal(out.events.length, 0);
    assert.equal(extracts, 0, 'a 304 has no body to extract from');
    assert.deepEqual(fetches[0].validators, { etag: 'W/"v1"', lastModified: null }, 'the stored validators travel with the request');
    const finish = q.calls.finish.at(-1);
    assert.equal(finish.status, 'done');
    assert.equal(finish.foundEvents, 2, 'the earlier count stands');
    assert.equal(q.row('/esemeny/7').found_events, 2);
    assert.equal(q.row('/esemeny/7').status, 'done');
  });

  it('on a 429 backs the host off, releases the rest of that host and stops fetching it', async () => {
    const q = fakeQueue();
    const fetches = [];
    const pages = new Map([
      [at('/esemeny/1'), { status: 429 }],
      [at('/esemeny/2'), { html: html(event('B')) }],
      [at('/esemeny/3'), { html: html(event('C')) }],
    ]);
    const out = await run({
      queue: q,
      fetchDetail: fakeSite(pages, fetches),
      candidateUrls: [at('/esemeny/1'), at('/esemeny/2'), at('/esemeny/3')],
      delayMs: 400,
      maxDetails: 3,
    });
    assert.deepEqual(fetches.map((f) => f.url), [at('/esemeny/1')], 'nothing more from a host that said 429');
    assert.deepEqual(q.calls.hostBackoff, [{ host: HOST, seconds: 2 }]);
    assert.equal(out.backoffs, 1);
    assert.equal(out.errors, 1);
    assert.equal(out.released, 2);
    assert.equal(out.events.length, 0);
    assert.equal(q.calls.release.length, 1, 'one release call for the whole remainder');
    assert.equal(q.row('/esemeny/2').status, 'pending');
    assert.equal(q.row('/esemeny/3').status, 'pending');
    const throttled = q.row('/esemeny/1');
    assert.equal(throttled.status, 'pending', 'bounded retry: back to pending after the first failure');
    assert.equal(throttled.attempts, 1);
    assert.equal(throttled.priority, 1, 'priority decays on error');
    assert.equal(throttled.error, 'HTTP 429');
  });

  it('treats a 503 the same way', async () => {
    const q = fakeQueue();
    const pages = new Map([[at('/esemeny/1'), { status: 503 }], [at('/esemeny/2'), { html: html() }]]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1'), at('/esemeny/2')], maxDetails: 2 });
    assert.equal(out.backoffs, 1);
    assert.equal(q.calls.hostBackoff.length, 1);
  });

  it('marks any other failure as an error and carries on with the next row', async () => {
    const q = fakeQueue();
    const fetches = [];
    const pages = new Map([[at('/esemeny/2'), { html: html(event('B')) }]]);
    const out = await run({
      queue: q,
      fetchDetail: async (url, v) => {
        if (url.endsWith('/esemeny/1')) throw new Error('socket hang up');
        return fakeSite(pages, fetches)(url, v);
      },
      candidateUrls: [at('/esemeny/1'), at('/esemeny/2')],
      maxDetails: 2,
    });
    assert.equal(out.errors, 1);
    assert.equal(out.backoffs, 0);
    assert.equal(out.fetched, 1);
    assert.equal(out.events.length, 1);
    assert.equal(q.calls.hostBackoff.length, 0);
    const failed = q.row('/esemeny/1');
    assert.equal(failed.status, 'pending');
    assert.equal(failed.attempts, 1);
    assert.equal(failed.error, 'socket hang up');
    assert.equal(q.row('/esemeny/2').status, 'done');
  });

  it('a robots disallow from the fetch is an error, never a backoff', async () => {
    const q = fakeQueue();
    const out = await run({
      queue: q,
      fetchDetail: async () => { throw new Error('robots disallow'); },
      candidateUrls: [at('/esemeny/1')],
    });
    assert.equal(out.errors, 1);
    assert.equal(out.backoffs, 0);
    assert.equal(q.row('/esemeny/1').error, 'robots disallow');
  });

  it('leaves a row in error after three failed attempts', async () => {
    const q = fakeQueue();
    const fetchDetail = async () => { throw new Error('boom'); };
    for (let i = 0; i < 3; i += 1) await run({ queue: q, fetchDetail, candidateUrls: [at('/esemeny/1')] });
    const row = q.row('/esemeny/1');
    assert.equal(row.status, 'error');
    assert.equal(row.attempts, 3);
    // A fourth run finds nothing claimable and fetches nothing.
    const fetches = [];
    await run({ queue: q, fetchDetail: fakeSite(new Map(), fetches), candidateUrls: [at('/esemeny/1')] });
    assert.equal(fetches.length, 0);
  });

  it('clears the host backoff once a page answers', async () => {
    const q = fakeQueue();
    const pages = new Map([[at('/esemeny/1'), { html: html() }], [at('/esemeny/2'), { html: html() }]]);
    await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1'), at('/esemeny/2')], maxDetails: 2 });
    assert.deepEqual(q.calls.clearBackoff, [HOST], 'once per host per run is enough — it is a no-op otherwise');
  });
});

describe('collectionFrontier: budgets', () => {
  it('releases the remainder when the time budget runs out', async () => {
    const q = fakeQueue();
    let clock = 0;
    const pages = new Map(Array.from({ length: 4 }, (_, i) => [at(`/esemeny/${i + 1}`), { html: html(event(`E${i + 1}`)) }]));
    const site = fakeSite(pages);
    const out = await run({
      queue: q,
      fetchDetail: async (url, v) => { clock += 100; return site(url, v); },
      candidateUrls: [...pages.keys()],
      maxDetails: 4,
      timeBudgetMs: 150,
      now: () => clock,
    });
    assert.equal(out.fetched, 2, 'the third row found the budget spent');
    assert.equal(out.released, 2);
    assert.equal(out.events.length, 2);
    assert.equal(q.calls.release.length, 1);
    assert.equal(q.row('/esemeny/3').status, 'pending');
    assert.equal(q.row('/esemeny/4').status, 'pending');
    assert.equal(q.row('/esemeny/1').status, 'done');
  });

  it('pauses between fetches but never after the last', async () => {
    const q = fakeQueue();
    const sleeps = [];
    const pages = new Map(Array.from({ length: 3 }, (_, i) => [at(`/esemeny/${i + 1}`), { html: html() }]));
    await run({
      queue: q,
      fetchDetail: fakeSite(pages),
      candidateUrls: [...pages.keys()],
      maxDetails: 3,
      delayMs: 250,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    assert.deepEqual(sleeps, [250, 250]);
  });

  it('does not pause at all for a single fetch or when delayMs is 0', async () => {
    const q = fakeQueue();
    const sleeps = [];
    const pages = new Map([[at('/esemeny/1'), { html: html() }]]);
    await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')], delayMs: 250, sleep: async (ms) => { sleeps.push(ms); } });
    assert.deepEqual(sleeps, []);
    const q2 = fakeQueue();
    const pages2 = new Map([[at('/esemeny/1'), { html: html() }], [at('/esemeny/2'), { html: html() }]]);
    await run({ queue: q2, fetchDetail: fakeSite(pages2), candidateUrls: [...pages2.keys()], maxDetails: 2, delayMs: 0, sleep: async (ms) => { sleeps.push(ms); } });
    assert.deepEqual(sleeps, []);
  });

  it('computes the backoff as four delays, floored at 2s and capped at 60s', () => {
    assert.equal(backoffSeconds(0), 2);
    assert.equal(backoffSeconds(400), 2);
    assert.equal(backoffSeconds(1000), 4);
    assert.equal(backoffSeconds(20000), 60);
  });
});

describe('collectionFrontier: descending', () => {
  it('enqueues what a detail page links to, one level deeper, and stops at maxDepth', async () => {
    const q = fakeQueue();
    const pages = new Map([
      [at('/esemeny/1'), { html: html(event('A'), link('/esemeny/9'), link('/esemeny/9'), link(LISTING), link('https://masik.hu/esemeny/5')) }],
      [at('/esemeny/9'), { html: html(event('B'), link('/esemeny/10')) }],
    ]);
    const shallow = fakeQueue();
    await run({ queue: shallow, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')], maxDepth: 1 });
    assert.equal(shallow.rows.size, 1, 'at maxDepth 1 a depth-1 page does not harvest');

    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')], maxDepth: 2 });
    assert.equal(out.enqueued, 2, 'the seed plus one harvested kid; duplicates, the listing and other hosts are dropped');
    const kid = q.row('/esemeny/9');
    assert.ok(kid);
    assert.equal(kid.depth, 2);
    assert.equal(kid.priority, 2);
    assert.equal(kid.discovered_from, at('/esemeny/1'));
    assert.equal(kid.status, 'pending');

    // Next run claims the kid; at depth 2 == maxDepth it does not harvest further.
    const next = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')], maxDepth: 2 });
    assert.equal(next.events.length, 1);
    assert.equal(next.events[0].detailUrl, at('/esemeny/9'));
    assert.equal(q.rows.has(at('/esemeny/10')), false);
  });

  it('caps the links harvested from one page at 200', async () => {
    const q = fakeQueue();
    const many = Array.from({ length: 250 }, (_, i) => link(`/esemeny/${100 + i}`)).join('');
    const pages = new Map([[at('/esemeny/1'), { html: html(many) }]]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')] });
    assert.equal(out.enqueued, 1 + 200);
  });
});

describe('collectionFrontier: failure discipline', () => {
  it('propagates a claim failure so the caller can fall back to sampling', async () => {
    const q = fakeQueue();
    q.claim = async () => { throw new Error('db down'); };
    await assert.rejects(() => run({ queue: q, fetchDetail: fakeSite(new Map()), candidateUrls: [at('/esemeny/1')] }), /db down/);
  });

  it('propagates a seed enqueue failure before anything is fetched', async () => {
    const q = fakeQueue();
    q.enqueue = async () => { throw new Error('db down'); };
    const fetches = [];
    await assert.rejects(() => run({ queue: q, fetchDetail: fakeSite(new Map(), fetches), candidateUrls: [at('/esemeny/1')] }), /db down/);
    assert.equal(fetches.length, 0);
  });

  it('keeps the events when a later queue call fails', async () => {
    const q = fakeQueue();
    q.finish = async () => { throw new Error('rpc timeout'); };
    q.clearBackoff = async () => { throw new Error('rpc timeout'); };
    const pages = new Map([[at('/esemeny/1'), { html: html(event('A')) }], [at('/esemeny/2'), { html: html(event('B')) }]]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [...pages.keys()], maxDetails: 2 });
    assert.equal(out.events.length, 2);
    assert.equal(out.fetched, 2);
    assert.ok(out.errors >= 2, 'the failures are counted, not hidden');
  });

  it('a harvested-link enqueue failure does not discard the page\'s events', async () => {
    const q = fakeQueue();
    const realEnqueue = q.enqueue.bind(q);
    let calls = 0;
    q.enqueue = async (sid, batch) => {
      calls += 1;
      if (calls > 1) throw new Error('db down');
      return realEnqueue(sid, batch);
    };
    const pages = new Map([[at('/esemeny/1'), { html: html(event('A'), link('/esemeny/9')) }]]);
    const out = await run({ queue: q, fetchDetail: fakeSite(pages), candidateUrls: [at('/esemeny/1')] });
    assert.equal(out.events.length, 1);
    assert.equal(out.errors, 1);
  });

  it('demands its collaborators rather than failing obscurely later', async () => {
    await assert.rejects(() => run({ queue: fakeQueue() }), /fetchDetail/);
    await assert.rejects(() => run({ fetchDetail: fakeSite(new Map()) }), /queue/);
    await assert.rejects(() => runCollectionFrontier({ sourceId: SOURCE, queue: fakeQueue(), fetchDetail: fakeSite(new Map()) }), /extractFromDetail/);
  });
});
