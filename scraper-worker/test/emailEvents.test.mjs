import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmailEvents } from '../src/sources/emailEvents.mjs';

/**
 * Reading events out of a newsletter, with the same engine used on a web page.
 *
 * The three shapes a real newsletter takes — embedded JSON-LD, a list of
 * heading+date blocks, and a single announcement — plus the guards that keep a
 * last-week edition or an undated blurb from becoming a fake event.
 */

const nextYear = new Date().getFullYear() + 1;
const source = { publisherName: 'Próbafeszt', categories: ['Fesztivál'], strategy: 'auto', sourceKey: 'src_test' };

describe('email → events', () => {
  it('reads embedded JSON-LD, the strongest signal', () => {
    const html = `<html><body>
      <script type="application/ld+json">{"@type":"Event","name":"Nyitókoncert","startDate":"${nextYear}-09-12T19:00:00+02:00","location":{"name":"Nagyszínpad","address":{"addressLocality":"Budapest"}}}</script>
    </body></html>`;
    const events = parseEmailEvents({ html }, source);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Nyitókoncert');
    assert.equal(events[0].event_date, `${nextYear}-09-12`);
    assert.equal(events[0].event_time, '19:00');
    assert.equal(events[0].location_city, 'Budapest');
    assert.equal(events[0].external_source, 'email');
    assert.equal(events[0].organizer_name, 'Próbafeszt');
  });

  it('reads a list of heading+date blocks — the common newsletter shape', () => {
    const html = `<html><body>
      <h2>Szimfonikus est a Zeneakadémián</h2>
      <p>${nextYear}. szeptember 20. 19:00 — klasszikus est.</p>
      <h2>Jazz koncert a Budapest Parkban</h2>
      <p>${nextYear}. szeptember 25-én, 20:00-tól.</p>
      <h2>Miért érdemes feliratkozni?</h2>
      <p>Mert nem maradsz le semmiről.</p>
    </body></html>`;
    const events = parseEmailEvents({ html }, source);
    // Two real events; the "Miért érdemes…" question section is not one.
    assert.equal(events.length, 2);
    assert.ok(events.some((e) => e.title.includes('Szimfonikus')));
    assert.ok(events.some((e) => e.title.includes('Jazz koncert')));
    assert.ok(!events.some((e) => e.title.includes('Miért')));
  });

  it('reads a single-programme announcement from prose', () => {
    const html = `<html><head><title>Őszi tárlatmegnyitó a Galériában</title></head>
      <body><p>Szeretettel várunk a ${nextYear}. október 3. megnyitóra.</p></body></html>`;
    const events = parseEmailEvents({ html }, source);
    assert.equal(events.length, 1);
    assert.ok(events[0].title.includes('tárlatmegnyitó'));
    assert.equal(events[0].event_date, `${nextYear}-10-03`);
  });

  it('does not invent an event from an undated blurb', () => {
    const html = '<html><body><h2>Kövess minket a közösségi médiában!</h2><p>Legyél naprakész.</p></body></html>';
    assert.deepEqual(parseEmailEvents({ html }, source), []);
  });

  it('drops an event whose date has already passed — last week\'s edition', () => {
    const html = `<script type="application/ld+json">{"@type":"Event","name":"Tavalyi buli","startDate":"2020-01-01T19:00:00"}</script>`;
    assert.deepEqual(parseEmailEvents({ html }, source), []);
  });

  it('honours a source pinned to prose, skipping JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@type":"Event","name":"JSONLD esemény","startDate":"${nextYear}-09-12"}</script>
      <h2>Prose esemény a Klubban</h2><p>${nextYear}. szeptember 30.</p>`;
    const events = parseEmailEvents({ html }, { ...source, strategy: 'prose' });
    assert.ok(events.every((e) => !e.title.includes('JSONLD')));
    assert.ok(events.some((e) => e.title.includes('Prose')));
  });

  it('gives each event a stable id, so re-reading the same mail does not duplicate', () => {
    const html = `<script type="application/ld+json">{"@type":"Event","name":"Ugyanaz","startDate":"${nextYear}-09-12"}</script>`;
    const first = parseEmailEvents({ html }, source);
    const second = parseEmailEvents({ html }, source);
    assert.equal(first[0].external_id, second[0].external_id);
  });

  it('survives an empty or broken email rather than throwing', () => {
    assert.deepEqual(parseEmailEvents({}, source), []);
    assert.deepEqual(parseEmailEvents({ html: '<not really html' }, source), []);
  });
});
