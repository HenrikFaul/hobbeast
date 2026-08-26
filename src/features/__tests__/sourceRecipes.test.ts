import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- untyped worker module, exercised here as a contract test
import {
  findEventHub, guessPublisherName, isSocialUrl, normalizeSourceUrl,
  parseIcs, parseJsonLdEvents, parseWpIcsCalendar,
} from '../../../scraper-worker/src/sources/recipes.mjs';

describe('iCalendar recipe', () => {
  it('reads folded VEVENTs with and without a time', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Kocsmakvíz a Játsz/Ma-ban',
      'DTSTART;TZID=Europe/Budapest:20260904T190000',
      'LOCATION:Budapest\, Wesselényi utca 13.',
      'DESCRIPTION:Csapatok 2-6 fővel',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Egész napos ',
      ' társasnap',
      'DTSTART;VALUE=DATE:20260905',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcs(ics);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      name: 'Kocsmakvíz a Játsz/Ma-ban',
      startDate: '2026-09-04T19:00',
      location: 'Budapest, Wesselényi utca 13.',
    });
    // RFC 5545 folding: the continuation line belongs to the previous value.
    expect(events[1].name).toBe('Egész napos társasnap');
    expect(events[1].startDate).toBe('2026-09-05');
  });

  it('drops a VEVENT without a title or a start', () => {
    expect(parseIcs('BEGIN:VEVENT\nSUMMARY:Nincs dátum\nEND:VEVENT')).toEqual([]);
  });
});

describe('WordPress ICS Calendar grid recipe', () => {
  // Shape taken from the live jatszma.com markup: the ISO date only exists in
  // aria-labelledby, and the time only in the <li> class.
  const grid = `
    <ul class="events" aria-labelledby="r6a8e287960e946c-20260904">
      <li class="event t190000" data-feed-key="0">
        <span tabindex="0" class="title has_desc confirmed">Kvíz - A nagy trash/<wbr /> meme kocsmakvíz</span>
        <div class="eventdesc"><p>Csapatok 2-6 fővel</p></div>
      </li>
    </ul>
    <ul class="events" aria-labelledby="r6a8e287960e946c-20260905">
      <li class="event" data-feed-key="0">
        <span class="title confirmed">Haver Vagy!</span>
      </li>
    </ul>`;

  it('pairs each entry with its day and time', () => {
    const events = parseWpIcsCalendar(grid, 'https://jatszma.com/esemenyek');
    expect(events).toHaveLength(2);
    // Inline markup must not survive into the card title.
    expect(events[0].name).toBe('Kvíz - A nagy trash/ meme kocsmakvíz');
    expect(events[0].startDate).toBe('2026-09-04T19:00');
    expect(events[0].description).toBe('Csapatok 2-6 fővel');
    expect(events[1]).toMatchObject({ name: 'Haver Vagy!', startDate: '2026-09-05' });
  });

  it('keeps one row per title and day when several months are rendered', () => {
    const events = parseWpIcsCalendar(grid + grid, 'https://jatszma.com/esemenyek');
    expect(events).toHaveLength(2);
  });
});

describe('JSON-LD recipe', () => {
  it('reads events out of a @graph and keeps the offer', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: 'Nem esemény' },
        {
          '@type': 'MusicEvent',
          name: 'Koncert',
          startDate: '2026-09-10T20:00:00+02:00',
          location: { name: 'A38', address: { addressLocality: 'Budapest' } },
          offers: { price: '4500', priceCurrency: 'HUF' },
        },
      ],
    })}</script>`;
    const events = parseJsonLdEvents(html, 'https://a38.hu/programok');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'Koncert', location: 'A38', city: 'Budapest' });
    expect(events[0].offers).toMatchObject({ price_min: 4500, currency: 'HUF' });
  });

  it('survives a malformed JSON-LD block', () => {
    expect(parseJsonLdEvents('<script type="application/ld+json">{oops</script>', 'https://x.hu')).toEqual([]);
  });
});

describe('source URL handling', () => {
  it('recognises the social pages we cannot read', () => {
    expect(isSocialUrl('https://www.facebook.com/jatszmatarsas')).toBe(true);
    expect(isSocialUrl('https://www.instagram.com/valaki/')).toBe(true);
    expect(isSocialUrl('https://jatszma.com/')).toBe(false);
    // A host that merely mentions facebook is not Facebook.
    expect(isSocialUrl('https://facebook.com.evil.hu/')).toBe(false);
  });

  it('accepts a bare host and rejects a non-web scheme', () => {
    expect(normalizeSourceUrl('jatszma.com')).toBe('https://jatszma.com/');
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSourceUrl('')).toBeNull();
  });

  it('follows the site to its own events page but never into an archive', () => {
    const html = `
      <a href="/rolunk">Rólunk</a>
      <a href="/korabbi-esemenyek">Korábbi</a>
      <a href="/esemenyek">Események</a>`;
    expect(findEventHub(html, 'https://jatszma.com/')).toBe('https://jatszma.com/esemenyek');
  });

  it('takes the site name out of a page title', () => {
    expect(guessPublisherName('<title>Események &raquo; Játsz/Ma Társasjáték Kávézó</title>', 'https://jatszma.com/'))
      .toBe('Játsz/Ma Társasjáték Kávézó');
  });
});

describe('recipe engine copies', () => {
  it('keeps the Edge Function copy byte-identical to the worker source', () => {
    const worker = readFileSync('scraper-worker/src/sources/recipes.mjs', 'utf8');
    const edge = readFileSync('supabase/functions/source-manager/recipes.mjs', 'utf8');
    // The preview an operator sees and the production run must be the same code.
    expect(edge.endsWith(worker)).toBe(true);
  });
});
