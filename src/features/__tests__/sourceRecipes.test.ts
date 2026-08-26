import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- untyped worker module, exercised here as a contract test
import {
  findEventHub, guessPublisherName, isSocialUrl, looksLikeWordPress, normalizeSourceUrl,
  parseIcs, parseJsonLdEvents, parseProsePage, parseWpIcsCalendar, parseWpPosts, wpCategoryId,
} from '../../../scraper-worker/src/sources/recipes.mjs';

describe('iCalendar recipe', () => {
  it('reads folded VEVENTs with and without a time', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Kocsmakvíz a Játsz/Ma-ban',
      'DTSTART;TZID=Europe/Budapest:20260904T190000',
      // A real ICS escapes the comma; the parser has to unescape it.
      'LOCATION:Budapest\\, Wesselényi utca 13.',
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

describe('WordPress posts recipe (magazine listings)', () => {
  // Shape taken from funzine.hu: a listicle whose h2 sections each name a dated
  // program, with the venue after a double slash.
  const listicle = [{
    link: 'https://funzine.hu/2026/08/25/programok/20-szureti-program/',
    title: { rendered: '20 csodás szüreti program' },
    content: {
      rendered: `
        <p>Bevezető.</p>
        <h2>36. Budafoki Pezsgő- és Borfesztivál (2026. szeptember 4-6.)</h2>
        <p>A Budafoki pincék megnyílnak.</p>
        <h2>Tábor Fesztivál // Alsóörs</h2>
        <p>2026. szeptember 12. — háromnapos fesztivál.</p>
        <h2>Miért érdemes elmenni?</h2>
        <p>Mert 2026. szeptember 20-án is nyitva vagyunk.</p>`,
    },
  }];

  it('turns one article into several dated programs', () => {
    const events = parseWpPosts(listicle);
    const titles = events.map((e: { name: string }) => e.name);
    expect(titles).toContain('36. Budafoki Pezsgő- és Borfesztivál');
    expect(titles).toContain('Tábor Fesztivál');
  });

  it('strips the date the heading repeats and keeps the parsed one', () => {
    const [first] = parseWpPosts(listicle);
    expect(first.name).not.toMatch(/2026/);
    expect(first.startDate).toBe('2026-09-04');
    expect(first.url).toBe('https://funzine.hu/2026/08/25/programok/20-szureti-program/');
  });

  it('reads the venue that follows a double slash', () => {
    const tabor = parseWpPosts(listicle).find((e: { name: string }) => e.name === 'Tábor Fesztivál');
    expect(tabor.location).toBe('Alsóörs');
  });

  it('splits a venue and its city on the comma', () => {
    const events = parseWpPosts([{
      link: 'https://x.hu/a',
      content: { rendered: '<h2>BotanicArt – Oázis // Művészetek Háza, Veszprém</h2><p>2026. szeptember 12.</p>' },
    }]);
    expect(events[0]).toMatchObject({ location: 'Művészetek Háza, Veszprém', city: 'Veszprém' });
  });

  // sportagvalaszto.hu produced exactly these false positives on the first run.
  it('refuses a dated section heading that is not the name of anything', () => {
    const names = parseWpPosts(listicle).map((e: { name: string }) => e.name);
    expect(names).not.toContain('Miért érdemes elmenni?');
  });

  it('refuses a quiz headline even when the article body is full of dates', () => {
    const events = parseWpPosts([{
      link: 'https://x.hu/kviz',
      title: { rendered: 'Melyik sportág illik a testalkatodhoz?' },
      excerpt: { rendered: '<p>2026. szeptember 13-án kiderül.</p>' },
      content: { rendered: '<p>2026. szeptember 13.</p>' },
    }]);
    expect(events).toEqual([]);
  });

  it('still reports a single-topic article as one program', () => {
    const events = parseWpPosts([{
      link: 'https://x.hu/nsv',
      title: { rendered: 'Szeptemberben 10. alkalommal Nagy Hangszerválasztó' },
      excerpt: { rendered: '<p>2026. szeptember 18-19.</p>' },
      content: { rendered: '<p>Részletek.</p>' },
    }]);
    expect(events).toHaveLength(1);
    expect(events[0].startDate).toBe('2026-09-18');
  });
});

describe('single-event page recipe', () => {
  // sportagvalaszto.hu/nagy-sportagvalaszto/ — one event, date in prose, and an
  // og:description broken by page-builder shortcodes.
  const page = `
    <meta property="og:title" content="Nagy Sportágválasztó" />
    <meta property="og:description" content="[/vc_column" />
    <meta property="og:image" content="https://sportagvalaszto.hu/nsv.jpg" />
    <body><h1>Nagy Sportágválasztó</h1>
    <p>2026. szeptember 18-19-én, 9:00 és 17:00 óra között, Kőbányán.</p></body>`;

  it('reports the one event the page is about', () => {
    const events = parseProsePage(page, 'https://sportagvalaszto.hu/nagy-sportagvalaszto/');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'Nagy Sportágválasztó',
      startDate: '2026-09-18',
      image: 'https://sportagvalaszto.hu/nsv.jpg',
    });
  });

  it('returns nothing when the page carries no date at all', () => {
    expect(parseProsePage('<title>Kapcsolat</title><body><p>Írj nekünk.</p></body>', 'https://x.hu/kapcsolat')).toEqual([]);
  });
});

describe('WordPress detection', () => {
  it('recognises a WordPress page and the category it announces', () => {
    const html = '<meta name="generator" content="WordPress 6.9.7" /><link href="https://funzine.hu/wp-json/wp/v2/categories/8889" />';
    expect(looksLikeWordPress(html)).toBe(true);
    expect(wpCategoryId(html)).toBe('8889');
  });

  it('does not claim WordPress for an unrelated page', () => {
    expect(looksLikeWordPress('<html><body>plain</body></html>')).toBe(false);
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
