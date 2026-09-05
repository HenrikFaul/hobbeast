import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sameHostEventLinks } from '../src/sources/generic.mjs';

/**
 * The link harvest the collection frontier runs on a DETAIL page to reach one
 * level deeper. It must apply exactly the listing filter — same host, never
 * the page itself, a real path, worthFetching — because the frontier may only
 * ever hold a URL the sampling path would have fetched too.
 */

const a = (href, text = 'Program') => `<a href="${href}">${text}</a>`;
const page = 'https://kultur.hu/programok/koncert-2026';
const isEventish = (p) => /\/(program|esemeny|koncert)/i.test(p);
const harvest = (html, predicate = isEventish, opts) => sameHostEventLinks(html, page, 'kultur.hu', predicate, opts);

describe('sameHostEventLinks', () => {
  it('resolves relative hrefs and keeps only same-host, event-looking links', () => {
    const html = [
      a('/programok/masik-koncert'),
      a('esemenyek/jazz-est'), // relative to /programok/
      a('https://www.kultur.hu/koncert/blues'), // www. is the same host
      a('https://masik.hu/programok/x'), // another host
      a('/rolunk/impresszum'), // same host, not an event path
    ].join('');
    assert.deepEqual(harvest(html), [
      'https://kultur.hu/programok/masik-koncert',
      'https://kultur.hu/programok/esemenyek/jazz-est',
      'https://www.kultur.hu/koncert/blues',
    ]);
  });

  it('never returns the page itself, strips fragments and dedupes', () => {
    const html = [
      a('https://kultur.hu/programok/koncert-2026'),
      a('https://kultur.hu/programok/koncert-2026?utm=x'),
      a('https://kultur.hu/programok/koncert-2026#jegyek'),
      a('/programok/masik#reszletek'),
      a('/programok/masik'),
    ].join('');
    assert.deepEqual(harvest(html), ['https://kultur.hu/programok/masik']);
  });

  it('ignores short paths even when the predicate would take them', () => {
    const html = [a('/'), a('/abc'), a('/abcde'), a('/abcdef')].join('');
    assert.deepEqual(harvest(html, () => true), ['https://kultur.hu/abcdef']);
  });

  it('ignores mailto/javascript/tel hrefs and unparsable ones', () => {
    const html = [
      a('mailto:info@kultur.hu'), a('javascript:void(0)'), a('tel:+3611234567'),
      a('http://['),
      a('/programok/valid-esemeny'),
    ].join('');
    assert.deepEqual(harvest(html), ['https://kultur.hu/programok/valid-esemeny']);
  });

  it('decodes entity-encoded hrefs', () => {
    assert.deepEqual(harvest(a('/programok/lista?ev=2026&amp;honap=9')),
      ['https://kultur.hu/programok/lista?ev=2026&honap=9']);
  });

  it('reads single-quoted, spaced and upper-case href attributes', () => {
    const html = `<a class="c" href = '/programok/egy'>Egy</a><A HREF="/programok/ketto">Kettő</A>`;
    assert.deepEqual(harvest(html), ['https://kultur.hu/programok/egy', 'https://kultur.hu/programok/ketto']);
  });

  it('hands the predicate the pathname only, never the query', () => {
    const seen = [];
    harvest(a('/programok/x?y=1'), (p) => { seen.push(p); return true; });
    assert.deepEqual(seen, ['/programok/x']);
  });

  it('caps the harvest at 200 by default, or at the given limit', () => {
    const html = Array.from({ length: 250 }, (_, i) => a(`/programok/esemeny-${i}`)).join('');
    assert.equal(harvest(html).length, 200);
    assert.equal(harvest(html, isEventish, { limit: 5 }).length, 5);
  });

  it('returns [] for empty html or a missing page url', () => {
    assert.deepEqual(harvest(''), []);
    assert.deepEqual(harvest(null), []);
    assert.deepEqual(sameHostEventLinks(a('/programok/x'), null, 'kultur.hu', isEventish), []);
  });
});
