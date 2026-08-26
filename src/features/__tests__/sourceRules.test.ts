import { describe, expect, it } from 'vitest';
// @ts-expect-error -- untyped worker module, exercised here as a contract test
import {
  extractWithRule, parseHtml, parseSelector, queryAll, queryFirst,
  sampleRepeatingBlock, textOf, validateRule,
} from '../../../scraper-worker/src/sources/recipes.mjs';

/**
 * The rule engine is what makes a stubborn site teachable without letting
 * anyone run code on our servers. Its two jobs are therefore: read a page
 * correctly, and refuse a rule it cannot honour instead of quietly returning
 * nothing.
 */

const LISTING = `
<div id="wrap">
  <ul class="events">
    <li class="event card" data-id="1">
      <h3 class="t">Kőleves Open Mic</h3>
      <span class="d">2026. szeptember 12.</span>
      <span class="hour">19:30</span>
      <a href="/esemeny/1">jegy</a>
      <img src="/i/1.jpg">
      <span class="v">Kőleves Kert, Budapest</span>
      <span class="p">4 500 Ft</span>
    </li>
    <li class="event card" data-id="2">
      <h3 class="t">Zárt próba</h3>
      <span class="d">nincs dátum</span>
    </li>
    <li class="promo"><h3 class="t">Hirdetés</h3><span class="d">2026. szeptember 13.</span></li>
  </ul>
</div>`;

const RULE = {
  version: 1,
  container: 'ul.events li.event',
  fields: {
    title: { selector: 'h3.t' },
    date: { selector: 'span.d' },
    time: { selector: 'span.hour' },
    url: { selector: 'a', attr: 'href' },
    image: { selector: 'img', attr: 'src' },
    location: { selector: 'span.v' },
    price: { selector: 'span.p' },
  },
  dateFormat: 'hu',
};

describe('mini-DOM and the selector subset', () => {
  const root = parseHtml(LISTING);

  it('finds the repeating cards and ignores what the selector excludes', () => {
    expect(queryAll(root, 'ul.events li.event')).toHaveLength(2);
    expect(queryAll(root, 'li.promo')).toHaveLength(1);
  });

  it('honours the child combinator, attribute matches and selector groups', () => {
    expect(queryAll(root, 'ul.events > li.event')).toHaveLength(2);
    expect(queryAll(root, '[data-id="2"]')).toHaveLength(1);
    expect(queryAll(root, 'a[href^="/esemeny"]')).toHaveLength(1);
    expect(queryAll(root, 'li.promo, li.event')).toHaveLength(3);
  });

  it('reads text through nested markup', () => {
    const card = queryAll(root, 'li.event')[0];
    expect(textOf(queryFirst(card, 'h3.t')).trim()).toBe('Kőleves Open Mic');
  });

  it('refuses a selector it does not implement rather than guessing', () => {
    expect(parseSelector('li:nth-child(2)')).toEqual([]);
    expect(queryAll(root, 'li:nth-child(2)')).toEqual([]);
  });

  it('survives unclosed and stray tags', () => {
    const messy = parseHtml('<ul><li class="event"><p>egy<li class="event"><p>kettő</div></ul>');
    expect(queryAll(messy, 'li.event')).toHaveLength(2);
  });
});

describe('rule validation', () => {
  it('accepts a complete rule', () => {
    expect(validateRule(RULE)).toEqual({ ok: true, errors: [] });
  });

  it('names every problem instead of failing silently', () => {
    const result = validateRule({ container: 'li:has(> a)', fields: { title: { selector: '##' }, colour: {} } });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/container/);
    expect(result.errors.join(' ')).toMatch(/colour/);
    expect(result.errors.join(' ')).toMatch(/date/);
  });

  it('rejects an unknown version, date format and out-of-range limit', () => {
    expect(validateRule({ ...RULE, version: 2 }).ok).toBe(false);
    expect(validateRule({ ...RULE, dateFormat: 'magic' }).ok).toBe(false);
    expect(validateRule({ ...RULE, limit: 5000 }).ok).toBe(false);
  });

  it('rejects an attribute name that is not one', () => {
    expect(validateRule({ ...RULE, fields: { ...RULE.fields, url: { selector: 'a', attr: 'on click' } } }).ok).toBe(false);
  });
});

describe('applying a rule', () => {
  it('extracts the fields the rule names', () => {
    const { events, errors } = extractWithRule(LISTING, RULE, 'https://koleves.hu/programok');
    expect(errors).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'Kőleves Open Mic',
      startDate: '2026-09-12T19:30',
      url: 'https://koleves.hu/esemeny/1',
      image: 'https://koleves.hu/i/1.jpg',
      location: 'Kőleves Kert, Budapest',
    });
    expect(events[0].offers).toMatchObject({ price_min: 4500, currency: 'HUF' });
  });

  it('drops a card with no readable date rather than inventing one', () => {
    const { events } = extractWithRule(LISTING, RULE, 'https://koleves.hu/programok');
    expect(events.map((e: { name: string }) => e.name)).not.toContain('Zárt próba');
  });

  it('reports a container that matches nothing, so a typo is visible', () => {
    const { events, errors } = extractWithRule(LISTING, { ...RULE, container: '.nincs-ilyen' }, 'https://x.hu');
    expect(events).toEqual([]);
    expect(errors.join(' ')).toMatch(/egyetlen elemre sem illeszkedik/);
  });

  it('reports matching containers whose fields do not resolve', () => {
    const rule = { ...RULE, fields: { ...RULE.fields, date: { selector: '.hianyzik' } } };
    const { events, errors } = extractWithRule(LISTING, rule, 'https://x.hu');
    expect(events).toEqual([]);
    expect(errors.join(' ')).toMatch(/cím és dátum/);
  });

  it('never applies an invalid rule', () => {
    const { events, errors } = extractWithRule(LISTING, { container: '' }, 'https://x.hu');
    expect(events).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reads an ISO date out of an attribute', () => {
    const html = '<div class="e"><h4>Koncert</h4><time datetime="2026-10-05T20:00:00+02:00">okt. 5.</time></div>';
    const { events } = extractWithRule(html, {
      container: '.e',
      fields: { title: { selector: 'h4' }, date: { selector: 'time', attr: 'datetime' } },
      dateFormat: 'iso',
    }, 'https://x.hu');
    expect(events[0]).toMatchObject({ name: 'Koncert', startDate: '2026-10-05T20:00' });
  });
});

describe('repeating-block sampling', () => {
  it('suggests the class that actually repeats', () => {
    const block = sampleRepeatingBlock(LISTING.repeat(2));
    expect(block.hintSelector).toBe('.event');
    expect(block.candidates[0].occurrences).toBeGreaterThanOrEqual(3);
  });

  it('ignores utility classes that describe styling, not structure', () => {
    const html = '<div class="flex gap-4 p-2"><span class="flex gap-4 p-2">a</span><b class="flex gap-4 p-2">b</b><i class="flex gap-4 p-2">c</i></div>';
    expect(sampleRepeatingBlock(html).hintSelector).toBeNull();
  });
});
