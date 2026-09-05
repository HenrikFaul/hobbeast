import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldLatin, localeFor, knownLocaleCountries, localeEventPathRe, localeMonthPattern,
  parseLocaleTextDate, isLocaleNavigationTitle, parseLocaleFieldDate,
} from '../src/sources/locales.mjs';
import { parseEventDate, buildEvent, dateFromUrlPath } from '../src/sources/generic.mjs';

/**
 * The v1.56.0 foreign sources collected nothing because the generic extractor
 * speaks Hungarian: /akce/ is not an event path, "6. září 2026" is not a date,
 * and "Kouř" is too short to be a title. These tests pin the vocabulary that
 * fixes that, and — just as importantly — pin that Hungarian sources are left
 * completely alone.
 */

describe('locale selection', () => {
  it('leaves Hungarian and unknown countries on the original code path', () => {
    // null is the signal every call site checks before using a locale, so this
    // is the guarantee that 377 Hungarian sources behave exactly as before.
    assert.equal(localeFor('HU'), null);
    assert.equal(localeFor('hu'), null);
    assert.equal(localeFor(null), null);
    assert.equal(localeFor(undefined), null);
    assert.equal(localeFor(''), null);
    assert.equal(localeFor('XX'), null);
    // DE used to be the example of an unregistered country here. It is a
    // registered locale since v1.66.0, so the example moved to one that is not.
    assert.equal(localeFor('FR'), null, 'only countries we actually registered get a locale');
  });

  it('covers exactly the six countries the registry now holds', () => {
    assert.deepEqual(knownLocaleCountries(), ['AT', 'CZ', 'DE', 'PL', 'SI', 'SK']);
  });

  it('is case- and whitespace-insensitive about the country code', () => {
    assert.equal(localeFor(' cz ').country, 'CZ');
  });
});

describe('foldLatin', () => {
  it('strips the diacritics Hungarian folding does not know', () => {
    assert.equal(foldLatin('září'), 'zari');
    assert.equal(foldLatin('více'), 'vice');
    assert.equal(foldLatin('września'), 'wrzesnia');
    assert.equal(foldLatin('Kouř'), 'kour');
    assert.equal(foldLatin('Ľudová'), 'ludova');
  });

  it('handles the Polish stroked l, which is not a combining mark', () => {
    assert.equal(foldLatin('Łódź'), 'lodz');
  });

  it('does not throw on empty input', () => {
    assert.equal(foldLatin(null), '');
    assert.equal(foldLatin(undefined), '');
  });
});

describe('event-path vocabulary', () => {
  const cases = [
    ['CZ', '/cs/praha/akce/leznyvlkk/', true],
    ['CZ', '/udalost/koncert-podzim', true],
    ['CZ', '/cs/predstaveni/sweeney-todd-FKs5ZFQ', true],
    ['PL', '/repertuar/koncert-symfoniczny', true],
    ['PL', '/wydarzenia/festiwal', true],
    ['SI', '/film/gajin-svet-3/', true],
    ['SI', '/spored', true],
    ['SK', '/koncerty', true],
    ['SK', '/podujatia/vianocny-koncert', true],
    // predpredaj.zoznam.sk serves EVENT pages at /sk/listky/<slug>/. The word
    // means "tickets", so it is also a nav word — the two axes are independent:
    // a URL path can be an event scheme while the same word as a card TITLE is
    // a buy button.
    ['SK', '/sk/listky/unbros-music-festival/', true],
    ['CZ', '/listky/koncert-2026', true],
    ['AT', '/de/veranstaltungen/konzert', true],
    ['AT', '/termine/2026', true],
  ];
  for (const [cc, path, expected] of cases) {
    it(`${cc} recognises ${path}`, () => {
      assert.equal(localeEventPathRe(localeFor(cc)).test(path), expected);
    });
  }

  it('requires a whole path segment, so a word inside a slug does not match', () => {
    const cz = localeEventPathRe(localeFor('CZ'));
    // "akce" appears inside "nakceni" but does not start a segment.
    assert.equal(cz.test('/nakceni'), false);
    assert.equal(cz.test('/o-nas'), false);
  });

  it('has no matcher when there is no locale', () => {
    assert.equal(localeEventPathRe(null), null);
    assert.equal(localeMonthPattern(null), null);
  });
});

describe('parseLocaleTextDate', () => {
  const cz = localeFor('CZ');
  const pl = localeFor('PL');
  const at = localeFor('AT');
  const si = localeFor('SI');
  const sk = localeFor('SK');

  it('reads day-first numeric dates, the Central-European norm', () => {
    // This is the single most important case: it is what the Hungarian
    // year-first parser could never match.
    assert.equal(parseLocaleTextDate('Sa, 06.09.2026 19:30', at), '2026-09-06');
    assert.equal(parseLocaleTextDate('6. 9. 2026', cz), '2026-09-06');
    assert.equal(parseLocaleTextDate('6/9/2026', pl), '2026-09-06');
  });

  it('reads month names in each language, including the genitive forms', () => {
    assert.equal(parseLocaleTextDate('6. září 2026', cz), '2026-09-06');
    assert.equal(parseLocaleTextDate('6 września 2026', pl), '2026-09-06');
    assert.equal(parseLocaleTextDate('6. September 2026', at), '2026-09-06');
    assert.equal(parseLocaleTextDate('6. september 2026', si), '2026-09-06');
    assert.equal(parseLocaleTextDate('6. septembra 2026', sk), '2026-09-06');
  });

  it('does not confuse Czech June with July', () => {
    // "cerven" is a prefix of "cervence", so a shortest-first match would read
    // every July date as June. Longest-key-first is what prevents that.
    assert.equal(parseLocaleTextDate('6. června 2026', cz), '2026-06-06');
    assert.equal(parseLocaleTextDate('6. července 2026', cz), '2026-07-06');
  });

  it('reads abbreviated month names', () => {
    // Cankarjev dom writes "16. sept. 2026" and "13. okt.". A one-way prefix
    // test ("sept".startsWith("september")) rejects both, which is why that
    // source still collected nothing after the first pass of this work.
    assert.equal(parseLocaleTextDate('Razstave 16. sept. 2026', si), '2026-09-16');
    assert.equal(parseLocaleTextDate('6. dec. 2026', si), '2026-12-06');
    assert.equal(parseLocaleTextDate('6. srp 2026', cz), '2026-08-06');
    assert.equal(parseLocaleTextDate('6 wrze 2026', pl), '2026-09-06');
    assert.equal(parseLocaleTextDate('6. Sept 2026', at), '2026-09-06');
  });

  it('refuses an ambiguous abbreviation rather than guessing', () => {
    // "cerv" prefixes both cerven (June) and cervenec (July). Picking one
    // would silently file half a theatre season under the wrong month.
    assert.equal(parseLocaleTextDate('6. cerv 2026', cz), null);
  });

  it('does not treat a two-letter fragment as a month', () => {
    assert.equal(parseLocaleTextDate('6. ma 2026', si), null);
  });

  it('still accepts ISO and year-first dates, which are language-neutral', () => {
    assert.equal(parseLocaleTextDate('2026-09-06', cz), '2026-09-06');
    assert.equal(parseLocaleTextDate('2026.09.06', pl), '2026-09-06');
  });

  it('rejects impossible dates rather than inventing one', () => {
    assert.equal(parseLocaleTextDate('45.13.2026', cz), null);
    assert.equal(parseLocaleTextDate('no date here at all', cz), null);
    assert.equal(parseLocaleTextDate('', cz), null);
  });

  it('returns nothing without a locale, so Hungarian never reaches it', () => {
    assert.equal(parseLocaleTextDate('6. září 2026', null), null);
  });

  it('rolls a year-less date forward the way the Hungarian parser does', () => {
    const iso = parseLocaleTextDate('6. ledna', cz); // 6 January
    assert.match(iso, /^20\d{2}-01-06$/);
    // Never more than a year out, and never far in the past.
    const parsed = new Date(`${iso}T00:00:00Z`).getTime();
    assert.ok(parsed > Date.now() - 40 * 86400000, 'a year-less date must not land in the past');
  });
});

describe('isLocaleNavigationTitle', () => {
  const cz = localeFor('CZ');

  it('keeps genuinely short foreign titles', () => {
    // All three are real GoOut listings that the Hungarian length guard threw
    // away for being under ten characters.
    assert.equal(isLocaleNavigationTitle('Kouř', cz), false);
    assert.equal(isLocaleNavigationTitle('Jony', cz), false);
    assert.equal(isLocaleNavigationTitle('Kanine', cz), false);
  });

  it('still discards pager controls', () => {
    assert.equal(isLocaleNavigationTitle('Více', cz), true);
    assert.equal(isLocaleNavigationTitle('Zobrazit všechny akce', cz), true);
    assert.equal(isLocaleNavigationTitle('Další', cz), true);
  });

  it('discards ticket call-to-action buttons', () => {
    // On cd-cc.si the card closest to each date is the BUY TICKETS button, so
    // without this the extractor publishes a row of events all named that.
    const si = localeFor('SI');
    assert.equal(isLocaleNavigationTitle('NAKUP VSTOPNIC', si), true);
    assert.equal(isLocaleNavigationTitle('Kup bilety', localeFor('PL')), true);
    assert.equal(isLocaleNavigationTitle('Vstupenky', cz), true);
    assert.equal(isLocaleNavigationTitle('Jetzt buchen', localeFor('AT')), true);
  });

  it('discards genre headings and hire placeholders', () => {
    const si = localeFor('SI');
    assert.equal(isLocaleNavigationTitle('Razstave', si), true);
    // "Event of another organiser" — the venue's label for a third-party hire.
    assert.equal(isLocaleNavigationTitle('Prireditev drugega organizatorja', si), true);
    // ...but a real programme with a genuine name survives all of it.
    assert.equal(isLocaleNavigationTitle('KOZMOS KOSOVEL', si), false);
  });

  it('discards a title that is only a date', () => {
    assert.equal(isLocaleNavigationTitle('6. září 2026', cz), true);
    assert.equal(isLocaleNavigationTitle('září', cz), true);
  });

  it('judges nothing when there is no locale', () => {
    assert.equal(isLocaleNavigationTitle('anything', null), false);
  });
});

describe('parseEventDate non-ISO fallback', () => {
  it('still reads plain ISO exactly as before', () => {
    assert.deepEqual(parseEventDate('2026-09-06'), { date: '2026-09-06', time: null });
    assert.deepEqual(parseEventDate('2026-09-06T19:30:00'), { date: '2026-09-06', time: '19:30:00' });
    assert.deepEqual(parseEventDate('2026-09-06 19:30'), { date: '2026-09-06', time: '19:30:00' });
  });

  it('reads the JS Date string GoOut puts in its JSON-LD', () => {
    // Every one of GoOut's 36 Prague events was discarded over this format.
    const got = parseEventDate('Sat Sep 05 2026 13:00:00 GMT+0200');
    assert.equal(got.date, '2026-09-05');
  });

  it('keeps the wall-clock day for a late-evening event', () => {
    // Reading UTC fields here would move a 23:00 event to the next day.
    const got = parseEventDate('Sat Nov 28 2026 23:00:00 GMT+0100');
    assert.equal(got.date, '2026-11-28');
  });

  it('refuses junk instead of inventing events', () => {
    assert.deepEqual(parseEventDate('next Tuesday'), { date: null, time: null });
    assert.deepEqual(parseEventDate(''), { date: null, time: null });
    assert.deepEqual(parseEventDate(null), { date: null, time: null });
    assert.deepEqual(parseEventDate('+36 1 555 0100'), { date: null, time: null });
  });

  it('bounds the fallback to plausible event years', () => {
    // The sanity window guards the NEW branch only. A literal ISO date is
    // still taken at face value, exactly as it was before this change —
    // narrowing that would be a behaviour change for 377 Hungarian sources.
    assert.deepEqual(parseEventDate('Mon Apr 01 1832 10:00:00 GMT+0100'), { date: null, time: null });
    assert.deepEqual(parseEventDate('Fri Jan 01 2099 10:00:00 GMT+0100'), { date: null, time: null });
    assert.equal(parseEventDate('1832-04-01T10:00:00Z').date, '1832-04-01', 'ISO input keeps its original meaning');
  });
});

describe('buildEvent text decoding', () => {
  const source = { source_id: 'src_test', publisher_name: 'P', categories: ['zene'], city: 'Wien' };
  const build = (ev) => buildEvent(source, { offers: {}, ...ev }, {
    listingUrl: 'https://example.at/listing', detailUrl: 'https://example.at/detail',
  });

  it('decodes HTML entities that JSON-LD carries into the title', () => {
    // Published verbatim before this: FALTER.at listed
    // `Claudia Märzendorfer &quot;A Chicken Can&#039;t Lay a Duck&quot;`.
    const row = build({ name: 'Claudia M &quot;A Chicken Can&#039;t Lay a Duck&quot;', startDate: '2026-09-05' });
    assert.equal(row.title, 'Claudia M "A Chicken Can\'t Lay a Duck"');
  });

  it('decodes the description too', () => {
    const row = build({ name: 'Konzert im Hof', startDate: '2026-09-05', description: 'Jazz &amp; Wein' });
    assert.equal(row.description, 'Jazz & Wein');
  });

  it('leaves a clean title untouched', () => {
    assert.equal(build({ name: 'Naši furianti', startDate: '2026-09-05' }).title, 'Naši furianti');
  });

  it('keeps external_id tied to the URL, so decoding cannot duplicate a row', () => {
    // The id is what the upsert dedups on. If it depended on the title, this
    // change would have forked every previously-ingested escaped event.
    const a = build({ name: 'Jazz &amp; Wein', startDate: '2026-09-05', url: 'https://example.at/e/1' });
    const b = build({ name: 'Jazz & Wein', startDate: '2026-09-05', url: 'https://example.at/e/1' });
    assert.equal(a.external_id, b.external_id);
  });
});

describe('path words and nav words are independent axes', () => {
  it('treats "listky" as an event path but also as a button label', () => {
    // predpredaj.zoznam.sk's event detail pages live at /sk/listky/<slug>/, so
    // the path must match; a CARD titled "Lístky" is still a buy button.
    const sk = localeFor('SK');
    assert.equal(localeEventPathRe(sk).test('/sk/listky/unbros-music-festival/'), true);
    assert.equal(isLocaleNavigationTitle('Lístky', sk), true);
    assert.equal(isLocaleNavigationTitle('UNBROS MUSIC FESTIVAL', sk), false);
  });
});

describe('dateFromUrlPath', () => {
  it('reads a full ISO date out of a URL path', () => {
    // snd.sk encodes the performance date in the link and nowhere else: its
    // detail pages have no JSON-LD, no microdata and not even an og:title.
    assert.equal(
      dateFromUrlPath('https://snd.sk/predstavenie/17366/2026-09-03/19-00/blazni-z-valencie/2026-09-03/19-00'),
      '2026-09-03',
    );
    assert.equal(dateFromUrlPath('/kalendarium/2026-09-17/koncert'), '2026-09-17');
  });

  it('requires the date to be a whole path segment', () => {
    assert.equal(dateFromUrlPath('https://x.sk/event/v2026-09-03-promo'), null);
    assert.equal(dateFromUrlPath('https://x.sk/event/slug'), null);
  });

  it('rejects a date that does not exist in the calendar', () => {
    // The regex alone would accept 31 February; the round-trip check catches it.
    assert.equal(dateFromUrlPath('https://x.sk/e/2026-02-31/slug'), null);
    assert.equal(dateFromUrlPath('https://x.sk/e/2026-13-01/slug'), null);
  });

  it('handles a relative path and empty input', () => {
    assert.equal(dateFromUrlPath('/e/2026-09-03/'), '2026-09-03');
    assert.equal(dateFromUrlPath(null), null);
    assert.equal(dateFromUrlPath(''), null);
  });
});

describe('parseLocaleFieldDate — the date FIELD of a selector rule', () => {
  const si = localeFor('SI');
  const at = localeFor('AT');
  const pl = localeFor('PL');

  it('reads a bare day.month, which free text never may', () => {
    // filharmonia.pl's .event-date holds "5.09" and nothing else. In running
    // prose that pattern would also match prices and scores, which is why
    // parseLocaleTextDate refuses it; here the rule has pointed at the date.
    assert.equal(parseLocaleFieldDate('5.09', pl), `${new Date().getFullYear()}-09-05`);
    assert.equal(parseLocaleFieldDate('12.10', pl), `${new Date().getFullYear()}-10-12`);
  });

  it('takes the START of a range, not the end', () => {
    // cd-cc.si: "7. - 10. sep." — the month sits on the second half.
    assert.equal(parseLocaleFieldDate('7. - 10. sep.', si), `${new Date().getFullYear()}-09-07`);
    // innsbruck.info: both halves name a month, and the general parser would
    // otherwise return December for a September event.
    assert.equal(parseLocaleFieldDate("05 Sep '26 - 26 Dez '26", at), '2026-09-05');
  });

  it('prefers a year STATED anywhere in the range over inference', () => {
    // "30. jun." alone is in the past, so inference would roll it to next year
    // — but the range says 2026 at its end, and that year covers both halves.
    assert.equal(parseLocaleFieldDate('30. jun. - 13. sep. 2026', si), '2026-06-30');
    assert.equal(parseLocaleFieldDate('7. jul. - 18. okt. 2026', si), '2026-07-07');
    // Two stated years: the first half's own year wins.
    assert.equal(parseLocaleFieldDate('16. sept. 2026 – 9. maj 2027', si), '2026-09-16');
  });

  it('still reads everything the free-text parser reads', () => {
    assert.equal(parseLocaleFieldDate('2026-09-05', pl), '2026-09-05');
    assert.equal(parseLocaleFieldDate('6. cervna 2026', localeFor('CZ')), '2026-06-06');
  });

  it('invents nothing from junk', () => {
    assert.equal(parseLocaleFieldDate('brak terminu', pl), null);
    assert.equal(parseLocaleFieldDate('', pl), null);
    assert.equal(parseLocaleFieldDate('45.99', pl), null, 'an impossible day/month is not a date');
  });

  it('never runs for a Hungarian source', () => {
    assert.equal(parseLocaleFieldDate('5.09', localeFor('HU')), null);
  });
});

/**
 * Germany (v1.66.0) is the first country added AFTER the module settled, so
 * these tests are really about the promise the module makes: adding a locale
 * must not touch an existing one. Austria yields 306 events today and speaks
 * the same language, which is exactly why DE gets its own arrays instead of
 * sharing Austria's.
 */
describe('German locale, added without touching Austria', () => {
  const de = localeFor('DE');
  const at = localeFor('AT');

  it('exists, and Hungarian still does not', () => {
    assert.ok(de, 'DE must resolve to a locale');
    assert.equal(localeFor('HU'), null);
    assert.deepEqual(knownLocaleCountries(), ['AT', 'CZ', 'DE', 'PL', 'SI', 'SK']);
  });

  it('shares no array object with Austria, so neither can drift into the other', () => {
    assert.notEqual(de.pathWords, at.pathWords);
    assert.notEqual(de.months, at.months);
    assert.notEqual(de.navWords, at.navWords);
  });

  it('leaves the Austrian vocabulary byte-identical', () => {
    assert.deepEqual(at.pathWords, [
      'veranstaltung', 'veranstaltungen', 'termin', 'termine', 'konzert', 'konzerte',
      'kalender', 'spielplan', 'programm', 'vorstellung', 'vorstellungen',
      'ausstellung', 'ausstellungen', 'festival', 'karten', 'tickets', 'buehne',
    ]);
    assert.ok('janner' in at.months, 'Austrian Jaenner must survive');
    assert.ok(!('janner' in de.months), 'a German page never writes Jaenner');
  });

  it('reads a German date the same way Austria does', () => {
    assert.equal(parseLocaleTextDate('Konzert am 6. September 2026 um 20 Uhr', de), '2026-09-06');
    assert.equal(parseLocaleTextDate('Konzert am 6. September 2026 um 20 Uhr', at), '2026-09-06');
    assert.equal(parseLocaleTextDate('15. Dezember 2026', de), '2026-12-15');
  });

  it('takes the START of a German range, not the end', () => {
    assert.equal(parseLocaleFieldDate('05 Sep 26 - 26 Dez 26', de), '2026-09-05');
    assert.equal(parseLocaleFieldDate('1. Marz 2027 - 30. April 2027', de), '2027-03-01');
  });

  it('matches the English event paths German sites actually use', () => {
    const re = localeEventPathRe(de);
    assert.ok(re.test('https://www.berlin.de/en/events/12345-konzert'));
    assert.ok(re.test('https://www.visitberlin.de/de/veranstaltung/sommerfest'));
    assert.ok(re.test('https://x.de/veranstaltungskalender/oktoberfest'));
    assert.ok(!re.test('https://x.de/eventual-nonsense'), 'the word must be a whole segment');
  });

  it('knows a German consent banner is not an event title', () => {
    assert.ok(isLocaleNavigationTitle('Alle akzeptieren', de));
    assert.ok(isLocaleNavigationTitle('Mehr anzeigen', de));
    assert.ok(isLocaleNavigationTitle('Zur Veranstaltung', de));
    assert.ok(!isLocaleNavigationTitle('Silvesterkonzert im Konzerthaus', de));
  });
});
