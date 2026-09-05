import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLdBlock, jsonLdNodes } from '../src/sources/recipes.mjs';
import { extractJsonLdEvents, eventCategoryHint, buildEvent, extractAnchorWindowEvents } from '../src/sources/generic.mjs';
import { localeFor, parseLocaleTextDate } from '../src/sources/locales.mjs';
import { looksLikeBotChallenge } from '../src/fetch.mjs';

/**
 * Techniques taken from the grepsearch crawler (C:\Work\Smartsearchtool\
 * grepsearch-main) after a per-claim adversarial review. Each was adapted
 * rather than copied: that crawler enqueues into a persistent BFS frontier
 * where a false positive is nearly free, while this worker spends a fixed
 * per-run detail budget where it is not.
 */

describe('parseJsonLdBlock — tolerant JSON-LD', () => {
  it('parses clean JSON-LD unchanged', () => {
    assert.deepEqual(parseJsonLdBlock('{"@type":"Event","name":"X"}'), { '@type': 'Event', name: 'X' });
  });

  it('recovers a block wrapped in HTML comments', () => {
    const raw = '<!--\n{"@type":"Event","name":"Koncert"}\n-->';
    assert.equal(parseJsonLdBlock(raw).name, 'Koncert');
  });

  it('recovers a block with a trailing comma', () => {
    assert.equal(parseJsonLdBlock('{"@type":"Event","name":"X",}').name, 'X');
    assert.equal(parseJsonLdBlock('[{"name":"a"},]').length, 1);
  });

  it('does not touch a valid block whose text merely contains comment markers', () => {
    // The repair runs only after a strict parse fails, so this survives intact.
    const raw = '{"@type":"Event","name":"X","description":"use <!-- and --> in HTML"}';
    assert.equal(parseJsonLdBlock(raw).description, 'use <!-- and --> in HTML');
  });

  it('returns null for empty or unrecoverable input', () => {
    assert.equal(parseJsonLdBlock(''), null);
    assert.equal(parseJsonLdBlock(null), null);
    assert.equal(parseJsonLdBlock('{not json at all'), null);
  });
});

describe('jsonLdNodes — graph flattening', () => {
  it('finds events nested under mainEntity and hasPart', () => {
    const doc = {
      '@type': 'CollectionPage',
      mainEntity: { '@type': 'Event', name: 'A' },
      hasPart: [{ '@type': 'Event', name: 'B' }],
    };
    const names = jsonLdNodes(doc).filter((n) => n.name).map((n) => n.name).sort();
    assert.deepEqual(names, ['A', 'B']);
  });

  it('still walks the keys it always walked', () => {
    const doc = { '@graph': [{ '@type': 'Event', name: 'G' }], subEvent: { '@type': 'Event', name: 'S' } };
    const names = jsonLdNodes(doc).filter((n) => n.name).map((n) => n.name).sort();
    assert.deepEqual(names, ['G', 'S']);
  });
});

describe('extractJsonLdEvents — end to end', () => {
  const wrap = (json) => `<script type="application/ld+json">${json}</script>`;

  it('reads an event hidden under mainEntity, which the old two-level walk missed', () => {
    const html = wrap(JSON.stringify({
      '@type': 'WebPage',
      mainEntity: { '@type': 'MusicEvent', name: 'Symfonicky koncert', startDate: '2026-10-02T19:00' },
    }));
    const events = extractJsonLdEvents(html);
    assert.equal(events.length, 1);
    assert.equal(events[0].name, 'Symfonicky koncert');
  });

  it('recovers events from a comment-wrapped block', () => {
    const html = wrap(`<!-- ${JSON.stringify({ '@type': 'Event', name: 'Predstavenie', startDate: '2026-10-02' })} -->`);
    assert.equal(extractJsonLdEvents(html).length, 1);
  });
});

describe('offers parsing', () => {
  const evOf = (offers) => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event', name: 'Test event', startDate: '2026-10-02', offers,
    })}</script>`;
    return extractJsonLdEvents(html)[0];
  };

  it('keeps scanning past an offer that carries no price', () => {
    // The old code returned on offers[0] and reported no price at all.
    const ev = evOf([{ '@type': 'Offer', availability: 'InStock' }, { '@type': 'Offer', price: 4500, priceCurrency: 'CZK' }]);
    assert.equal(ev.offers.price_min, 4500);
    assert.equal(ev.offers.currency, 'CZK');
  });

  it('accepts highPrice when that is all an AggregateOffer gives', () => {
    assert.equal(evOf({ '@type': 'AggregateOffer', highPrice: 90, priceCurrency: 'EUR' }).offers.price_min, 90);
  });

  it('treats an empty price string as unknown, not as free', () => {
    // Number('') is 0, which would have published a paid event as free.
    assert.equal(evOf({ '@type': 'Offer', price: '' }).offers.price_min, null);
    assert.equal(evOf({ '@type': 'Offer', price: '   ' }).offers.price_min, null);
  });

  it('binds the ticket link to the FIRST offer that has one', () => {
    const ev = evOf([
      { '@type': 'Offer', url: 'https://x.cz/first' },
      { '@type': 'Offer', url: 'https://x.cz/second', price: 10, priceCurrency: 'CZK' },
    ]);
    assert.equal(ev.offers.ticket_url, 'https://x.cz/first');
    assert.equal(ev.offers.price_min, 10);
  });
});

describe('eventCategoryHint — per-event category', () => {
  it('maps schema.org event subtypes onto Hobbeast categories', () => {
    assert.equal(eventCategoryHint({ '@type': 'MusicEvent' }), 'Zene');
    assert.equal(eventCategoryHint({ '@type': 'TheaterEvent' }), 'Színház & Előadás');
    assert.equal(eventCategoryHint({ '@type': 'SportsEvent' }), 'Sport & Mozgás');
    assert.equal(eventCategoryHint({ '@type': 'ExhibitionEvent' }), 'Kultúra');
  });

  it('strips a schema.org URL prefix and handles an array type', () => {
    assert.equal(eventCategoryHint({ '@type': 'https://schema.org/DanceEvent' }), 'Tánc');
    assert.equal(eventCategoryHint({ '@type': ['ChildrensEvent', 'Event'] }), 'Családi');
  });

  it('falls back to genre text through the existing matcher', () => {
    assert.equal(eventCategoryHint({ '@type': 'Event', genre: 'jazz koncert' }), 'Zene');
  });

  it('returns null when the node says nothing useful', () => {
    assert.equal(eventCategoryHint({ '@type': 'Event' }), null);
    assert.equal(eventCategoryHint(null), null);
  });

  it("never invents a category outside Hobbeast's own set", () => {
    // Free text that matches nothing must not leak through as a raw string.
    assert.equal(eventCategoryHint({ '@type': 'Event', genre: 'völlig unbekannt' }), null);
  });

  it('lets the event type win over the source-level guess in buildEvent', () => {
    const source = { source_id: 's', publisher_name: 'P', categories: ['koncert'] };
    const row = buildEvent(source, {
      name: 'Tattoo Flash Market', startDate: '2026-10-03', category: 'Kultúra', offers: {},
    }, { listingUrl: 'https://x.cz/l', detailUrl: 'https://x.cz/d' });
    assert.equal(row.category, 'Kultúra');
  });

  it('keeps the source-level category when the event has no hint', () => {
    const source = { source_id: 's', publisher_name: 'P', categories: ['koncert'] };
    const row = buildEvent(source, { name: 'Valami', startDate: '2026-10-03', offers: {} },
      { listingUrl: 'https://x.hu/l', detailUrl: 'https://x.hu/d' });
    assert.equal(row.category, 'Zene');
  });
});

describe('looksLikeBotChallenge', () => {
  it('treats a refusal status as a block', () => {
    // Ticketmaster CZ/PL answer 403 from the CI datacenter IP; that is not a
    // parser problem and must not be reported as "0 events found".
    assert.equal(looksLikeBotChallenge(403, null), true);
    assert.equal(looksLikeBotChallenge(429, null), true);
    assert.equal(looksLikeBotChallenge(503, null), true);
  });

  it('recognises a short interstitial body', () => {
    assert.equal(looksLikeBotChallenge(200, '<html><body>Just a moment...</body></html>'), true);
    assert.equal(looksLikeBotChallenge(200, '<html>cf-browser-verification</html>'), true);
  });

  it('does not misread a long article that merely mentions Cloudflare', () => {
    const article = `<html><body>${'Cloudflare outage analysis. '.repeat(1500)}</body></html>`;
    assert.ok(article.length > 20000);
    assert.equal(looksLikeBotChallenge(200, article), false);
  });

  it('is false for an ordinary page', () => {
    assert.equal(looksLikeBotChallenge(200, '<html><body>Programme</body></html>'), false);
    assert.equal(looksLikeBotChallenge(200, null), false);
    assert.equal(looksLikeBotChallenge(404, null), false);
  });
});

describe('extractAnchorWindowEvents — raw-markup last resort', () => {
  const opts = (locale) => ({
    locale,
    isEventPath: (p) => /\/(akce|udalost|koncert)/i.test(p),
    isNavTitle: (t) => /^(vice|dalsi|zobrazit)/i.test(t.trim()),
    parseDate: (text) => (parseLocaleTextDate(text, locale)),
  });

  it('finds a date that sits beside the anchor in the MARKUP but far away in the DOM', () => {
    // The date is in a preceding sibling wrapper, many levels from the anchor —
    // the shape the four-ancestor DOM walk cannot reach.
    const html = `
      <section><header><span class="d">6. září 2026</span></header>
        <div><div><div><article><figure><img src="x.jpg"></figure>
        <a href="/akce/podzimni-koncert">Podzimní koncert</a>
        </article></div></div></div></section>`;
    const out = extractAnchorWindowEvents(html, 'https://x.cz/program', opts(localeFor('CZ')));
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'Podzimní koncert');
    assert.equal(out[0].startDate, '2026-09-06');
    assert.equal(out[0].url, 'https://x.cz/akce/podzimni-koncert');
  });

  it('never runs for a Hungarian source', () => {
    // locale is null for HU, which is the whole isolation guarantee.
    const html = '<span>6. září 2026</span><a href="/akce/x">Nejaka akce</a>';
    assert.deepEqual(extractAnchorWindowEvents(html, 'https://x.hu/p', opts(null)), []);
  });

  it('still refuses off-site links, nav titles and non-event paths', () => {
    const cz = localeFor('CZ');
    assert.equal(extractAnchorWindowEvents(
      '<span>6. září 2026</span><a href="https://other.cz/akce/x">Cizi akce</a>',
      'https://x.cz/p', opts(cz),
    ).length, 0, 'other host');
    assert.equal(extractAnchorWindowEvents(
      '<span>6. září 2026</span><a href="/akce/x">Zobrazit vsechny</a>',
      'https://x.cz/p', opts(cz),
    ).length, 0, 'nav title');
    assert.equal(extractAnchorWindowEvents(
      '<span>6. září 2026</span><a href="/o-nas">Nejaka stranka</a>',
      'https://x.cz/p', opts(cz),
    ).length, 0, 'not an event path');
  });

  it('drops an anchor with no date anywhere near it', () => {
    const html = `<a href="/akce/x">Koncert bez data</a>${' filler '.repeat(300)}<span>6. září 2026</span>`;
    assert.equal(extractAnchorWindowEvents(html, 'https://x.cz/p', opts(localeFor('CZ'))).length, 0);
  });

  it('deduplicates the same link, title and date', () => {
    const one = '<span>6. září 2026</span><a href="/akce/x">Podzimni koncert</a>';
    const out = extractAnchorWindowEvents(one + one, 'https://x.cz/p', opts(localeFor('CZ')));
    assert.equal(out.length, 1);
  });
});
