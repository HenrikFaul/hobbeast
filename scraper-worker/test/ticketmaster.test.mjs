import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapDiscoveryEvent, scrapeTicketmaster } from '../src/sources/ticketmaster.mjs';

/**
 * Ticketmaster is read through the official Discovery API, never by scraping
 * the site: ticketmaster.cz/.pl answer 403 from a datacenter IP and their
 * terms restrict automated access. These pin the mapping and the two things
 * the vetting pass warned about — upsell rows masquerading as events, and a
 * UTC timestamp moving a late show onto the wrong day.
 */

const EVENT = {
  id: 'Z698xZq1Ad_Zk',
  name: 'Hollywood Vampires',
  url: 'https://www.ticketmaster.cz/event/hollywood-vampires/363028185',
  images: [
    { url: 'https://img.tm/small.jpg', width: 100 },
    { url: 'https://img.tm/large.jpg', width: 2048 },
  ],
  dates: { start: { localDate: '2026-09-06', localTime: '20:00:00', dateTime: '2026-09-06T18:00:00Z' } },
  priceRanges: [{ type: 'standard', currency: 'CZK', min: 1290, max: 3900 }],
  classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }],
  _embedded: { venues: [{ name: 'Sportovní hala Fortuna', city: { name: 'Praha' }, address: { line1: 'Za Elektrárnou 419' } }] },
};

describe('mapDiscoveryEvent', () => {
  it('maps a full event', () => {
    const m = mapDiscoveryEvent(EVENT);
    assert.equal(m.name, 'Hollywood Vampires');
    assert.equal(m.startDate, '2026-09-06T20:00');
    assert.equal(m.city, 'Praha');
    assert.equal(m.location, 'Sportovní hala Fortuna');
    assert.equal(m.address, 'Za Elektrárnou 419');
    assert.equal(m.category, 'Zene');
    assert.equal(m.offers.price_min, 1290);
    assert.equal(m.offers.currency, 'CZK');
    assert.equal(m._id, 'Z698xZq1Ad_Zk');
  });

  it('takes the LOCAL date, not the UTC one', () => {
    // dateTime is 2026-09-06T22:30Z, which is the 7th in Prague. localDate is
    // authoritative, and reading dateTime would file the show on the wrong day.
    const late = {
      ...EVENT,
      dates: { start: { localDate: '2026-09-07', localTime: '00:30:00', dateTime: '2026-09-06T22:30:00Z' } },
    };
    assert.equal(mapDiscoveryEvent(late).startDate, '2026-09-07T00:30');
  });

  it('picks the largest image', () => {
    assert.equal(mapDiscoveryEvent(EVENT).image, 'https://img.tm/large.jpg');
  });

  it('drops the upsell rows that share a real event date', () => {
    // These would otherwise be published as separate programmes beside the
    // concert they belong to — flagged on both hosts during vetting.
    for (const name of [
      'Hollywood Vampires - VIP Packages',
      'Mike Oldfield - Parkovací lístek',
      'Mike Oldfield in Concert - Fast Track',
      'Jakis koncert — Karnet Parking',
      'JJ - VIP Upgrade',
    ]) {
      assert.equal(mapDiscoveryEvent({ ...EVENT, name }), null, name);
    }
    // ...but a real event whose name merely contains a word is kept.
    assert.ok(mapDiscoveryEvent({ ...EVENT, name: 'Parking Lot Party' }));
  });

  it('refuses an event with no usable date', () => {
    assert.equal(mapDiscoveryEvent({ ...EVENT, dates: {} }), null);
    assert.equal(mapDiscoveryEvent({ ...EVENT, dates: { start: { localDate: 'soon' } } }), null);
    assert.equal(mapDiscoveryEvent({ ...EVENT, name: '   ' }), null);
  });

  it('handles a date with no time', () => {
    const m = mapDiscoveryEvent({ ...EVENT, dates: { start: { localDate: '2026-09-06' } } });
    assert.equal(m.startDate, '2026-09-06');
  });

  it('maps the classification vocabulary onto Hobbeast categories', () => {
    const withClass = (segment, genre) =>
      mapDiscoveryEvent({ ...EVENT, classifications: [{ segment: { name: segment }, genre: { name: genre } }] }).category;
    assert.equal(withClass('Sports', 'Hockey'), 'Sport & Mozgás');
    assert.equal(withClass('Arts & Theatre', 'Dance'), 'Tánc');
    assert.equal(withClass('Arts & Theatre', 'Comedy'), 'Színház & Előadás');
    assert.equal(withClass('Arts & Theatre', 'Theatre'), 'Színház & Előadás');
    assert.equal(withClass('Film', 'Drama'), 'Kultúra');
    // Unknown vocabulary defers to the source's own categories.
    assert.equal(withClass('Miscellaneous', 'Undefined'), null);
  });
});

describe('scrapeTicketmaster', () => {
  const source = {
    source_id: 'src_tm', publisher_name: 'Ticketmaster CZ',
    endpoint_url: 'https://www.ticketmaster.cz/category/hudba-vstupenky/10001',
    categories: ['koncertek'], city: null,
  };

  it('reads a country catalogue and builds events', async () => {
    const calls = [];
    const res = await scrapeTicketmaster(source, {
      apiKey: 'test-key',
      fetchJson: async (url) => {
        calls.push(url);
        return { _embedded: { events: [EVENT] }, page: { totalPages: 1 } };
      },
    });
    assert.equal(res.events.length, 1);
    assert.equal(res.events[0].title, 'Hollywood Vampires');
    assert.equal(res.events[0].event_date, '2026-09-06');
    assert.equal(res.events[0].location_city, 'Praha');
    assert.equal(res.httpStatus, 200);
    assert.match(calls[0], /countryCode=CZ/);
  });

  it('follows pagination and dedups an event repeated across pages', async () => {
    const res = await scrapeTicketmaster(source, {
      apiKey: 'test-key',
      fetchJson: async (url) => {
        const page = Number(/[&?]page=(\d+)/.exec(url)[1]);
        // The same id comes back on page 1 as well — Discovery does this when
        // the underlying set shifts between calls.
        return { _embedded: { events: [page === 0 ? EVENT : { ...EVENT }] }, page: { totalPages: 2 } };
      },
    });
    assert.equal(res.events.length, 1, 'the repeated id must not become two events');
  });

  it('says so and returns nothing when the key is missing', async () => {
    const lines = [];
    const res = await scrapeTicketmaster(source, { apiKey: null, log: (m) => lines.push(m) });
    assert.deepEqual(res.events, []);
    assert.match(lines.join(' '), /TICKETMASTER_API_KEY/);
  });

  it('stops cleanly on an API error instead of throwing', async () => {
    const res = await scrapeTicketmaster(source, {
      apiKey: 'test-key',
      fetchJson: async () => { throw new Error('HTTP 429'); },
    });
    assert.deepEqual(res.events, []);
    assert.equal(res.httpStatus, 429);
  });

  it('refuses a host it has no country for', async () => {
    const res = await scrapeTicketmaster(
      { ...source, endpoint_url: 'https://www.ticketmaster.de/x' },
      { apiKey: 'test-key', fetchJson: async () => { throw new Error('must not be called'); } },
    );
    assert.deepEqual(res.events, []);
  });
});
