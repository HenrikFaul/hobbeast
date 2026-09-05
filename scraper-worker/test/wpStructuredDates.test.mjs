import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWpPosts } from '../src/sources/recipes.mjs';

/**
 * A WordPress site can model events as a real post type with the date in a
 * field, instead of as prose inside an article. visitbratislava.com does, and
 * its rendered cards write "5. 9." with no year at all — unrecoverable from the
 * HTML. Reading the field is both easier and more correct.
 */
describe('parseWpPosts structured event dates', () => {
  const post = (extra, title = 'Fest Čierny Deň 2026') => ({
    link: 'https://x.sk/events/fest/', title: { rendered: title },
    excerpt: { rendered: '<p>Gastro</p>' }, content: { rendered: '' }, ...extra,
  });

  it('reads a Unix timestamp in seconds', () => {
    const [e] = parseWpPosts([post({ event_date: { start_date: 1788566400 } })]);
    assert.equal(e.startDate, '2026-09-05');
    assert.equal(e.name, 'Fest Čierny Deň 2026');
  });

  it('reads milliseconds and an ISO string too', () => {
    assert.equal(parseWpPosts([post({ event_date: { start_date: 1788566400000 } })])[0].startDate, '2026-09-05');
    assert.equal(parseWpPosts([post({ event_date: { start_date: '2026-09-05' } })])[0].startDate, '2026-09-05');
    assert.equal(parseWpPosts([post({ acf: { start_date: 1788566400 } })])[0].startDate, '2026-09-05');
  });

  it('does not apply the article-headline gate to a structured event', () => {
    // "TRH – PIAC – MARKT" is a real market, not an article headline; the
    // heuristic gate exists for prose articles and must not judge this.
    const [e] = parseWpPosts([post({ event_date: { start_date: 1788566400 } }, 'TRH – PIAC – MARKT')]);
    assert.equal(e.name, 'TRH – PIAC – MARKT');
  });

  it('ignores an implausible timestamp rather than inventing a date', () => {
    assert.equal(parseWpPosts([post({ event_date: { start_date: 1 } })]).length, 0);
    assert.equal(parseWpPosts([post({ event_date: { start_date: 99999999999999 } })]).length, 0);
  });

  it('leaves a plain article on the original prose path', () => {
    // This is the Hungarian guarantee: funzine.hu and sportagvalaszto.hu request
    // _fields=id,link,title,excerpt,content, so event_date can never appear and
    // structuredPostDate always returns null for them.
    const article = {
      link: 'https://funzine.hu/x/', title: { rendered: 'Cikk' },
      excerpt: { rendered: '' },
      content: { rendered: '<h2>Tábor Fesztivál // Alsóörs</h2><p>2026. szeptember 4.</p>' },
    };
    const events = parseWpPosts([article]);
    assert.equal(events.length, 1);
    assert.equal(events[0].startDate, '2026-09-04');
    assert.equal(events[0].name, 'Tábor Fesztivál');
  });
});
