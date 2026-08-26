import { describe, expect, it } from 'vitest';
import type { EventData } from '@/features/events/discoveryModel';
import {
  currentSeasonLabel,
  eventHasSignups,
  eventMatchesVibeFacets,
  eventSeason,
  groupActivityReason,
  isGroupEvent,
  isSeasonalEvent,
  seasonsForDate,
  vibeFacetMeta,
  type VibeFacet,
} from '@/features/events/eventFacets';

function ev(overrides: Partial<EventData> = {}): EventData {
  return {
    id: 'e1',
    title: 'Program',
    category: 'Egyéb',
    event_date: '2026-08-26',
    event_time: '19:00',
    location_city: 'Budapest',
    location_district: null,
    location_address: null,
    location_free_text: null,
    location_type: 'address',
    max_attendees: null,
    image_emoji: null,
    tags: [],
    description: null,
    created_by: '',
    ...overrides,
  };
}

describe('eventHasSignups', () => {
  it('counts a Hobbeast participant', () => {
    expect(eventHasSignups(ev({ participant_count: 2 }))).toBe(true);
  });

  it('counts a companion plan on an external programme', () => {
    expect(eventHasSignups(ev({ participant_count: 0, companion_count: 1 }))).toBe(true);
  });

  it('is false when nobody has committed', () => {
    expect(eventHasSignups(ev({ participant_count: 0, companion_count: 0 }))).toBe(false);
    expect(eventHasSignups(ev())).toBe(false);
  });
});

describe('seasons', () => {
  it('knows what is in season on a given day', () => {
    const december = seasonsForDate(new Date('2026-12-10T12:00:00')).map((s) => s.key);
    expect(december).toContain('advent');
    expect(december).not.toContain('nyar');
  });

  it('handles a window that wraps the new year', () => {
    const keys = seasonsForDate(new Date('2027-01-03T12:00:00')).map((s) => s.key);
    expect(keys).toContain('szilveszter');
  });

  /**
   * The rule the user asked for: December does not make a cinema night
   * seasonal, and a Christmas market is seasonal in December only.
   */
  it('needs both the season word and the season', () => {
    const market = ev({ title: 'Adventi vásár a főtéren', event_date: '2026-12-05' });
    const cinema = ev({ title: 'Filmklub: francia új hullám', event_date: '2026-12-05' });
    const standup = ev({ title: 'Stand-up est', event_date: '2026-12-05' });

    expect(isSeasonalEvent(market)).toBe(true);
    expect(isSeasonalEvent(cinema)).toBe(false);
    expect(isSeasonalEvent(standup)).toBe(false);
  });

  it('rejects a season word outside its season', () => {
    expect(isSeasonalEvent(ev({ title: 'Karácsonyi vásár', event_date: '2026-07-04' }))).toBe(false);
  });

  it('is judged by the programme date, not by today', () => {
    const buso = ev({ title: 'Busójárás Mohácson', event_date: '2027-02-14' });
    expect(eventSeason(buso, new Date('2026-08-26T12:00:00'))?.key).toBe('farsang');
  });

  it('reads tags and the category, not just the title', () => {
    expect(isSeasonalEvent(ev({
      title: 'Kézműves piac',
      tags: ['mézeskalács'],
      event_date: '2026-12-12',
    }))).toBe(true);
  });

  it('names the season currently running for the chip label', () => {
    expect(currentSeasonLabel(new Date('2026-07-04T12:00:00'))).toContain('Nyári');
    // Windows may overlap; the label lists what is on.
    expect(currentSeasonLabel(new Date('2026-12-24T12:00:00'))).toContain('Advent');
  });
});

describe('group activities', () => {
  it('accepts things that fall apart alone', () => {
    expect(isGroupEvent(ev({ title: 'Kispályás foci bajnokság' }))).toBe(true);
    expect(isGroupEvent(ev({ title: 'Kutyasétáltatás a Népszigeten' }))).toBe(true);
    expect(isGroupEvent(ev({ title: 'Teljesítménytúra a Pilisben' }))).toBe(true);
    expect(isGroupEvent(ev({ title: 'Salsa tánchouse', category: 'Tánc / Páros tánc' }))).toBe(true);
    expect(isGroupEvent(ev({ title: 'Társasjáték est' }))).toBe(true);
  });

  it('rejects programmes one person can complete alone', () => {
    expect(isGroupEvent(ev({ title: 'Filmvetítés: Metropolis' }))).toBe(false);
    expect(isGroupEvent(ev({ title: 'Kiállításmegnyitó' }))).toBe(false);
    expect(isGroupEvent(ev({ title: 'Szimfonikus koncert' }))).toBe(false);
    expect(isGroupEvent(ev({ title: 'Stand-up est' }))).toBe(false);
  });

  /**
   * "kultúra" folds to "kultura", which contains "tura". Without a word
   * boundary every culture programme would be filed as a group hike.
   */
  it('does not mistake "kultúra" for "túra"', () => {
    expect(isGroupEvent(ev({ title: 'Kultúra napja', category: 'Kultúra' }))).toBe(false);
  });

  it('treats an organised joint visit as social by definition', () => {
    expect(groupActivityReason(ev({ title: 'Kiállítás', companion_count: 2 })))
      .toBe('Közös látogatás szerveződött rá.');
  });

  it('explains why a programme qualified', () => {
    expect(groupActivityReason(ev({ title: 'Röplabda meccs' }))).toMatch(/Csapatjáték/);
    expect(groupActivityReason(ev({ title: 'Önkéntes szemétszedés' }))).toMatch(/sok kézre/);
  });
});

describe('eventMatchesVibeFacets', () => {
  const none = new Set<VibeFacet>();

  it('passes everything when no facet is on', () => {
    expect(eventMatchesVibeFacets(ev(), none)).toBe(true);
  });

  it('combines facets with AND', () => {
    const facets = new Set<VibeFacet>(['has_signups', 'group']);
    expect(eventMatchesVibeFacets(ev({ title: 'Foci', participant_count: 3 }), facets)).toBe(true);
    expect(eventMatchesVibeFacets(ev({ title: 'Foci', participant_count: 0 }), facets)).toBe(false);
    expect(eventMatchesVibeFacets(ev({ title: 'Filmklub', participant_count: 3 }), facets)).toBe(false);
  });
});

describe('vibeFacetMeta', () => {
  it('names the season in the chip when one is running', () => {
    expect(vibeFacetMeta('seasonal', new Date('2026-12-10T12:00:00')).label).toContain('Advent');
  });

  it('still describes the facet outside every season window', () => {
    const meta = vibeFacetMeta('seasonal', new Date('2026-05-10T12:00:00'));
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.blurb.length).toBeGreaterThan(0);
  });

  it('describes what each facet selects', () => {
    expect(vibeFacetMeta('has_signups').blurb).toMatch(/nem te leszel az első/);
    expect(vibeFacetMeta('group').blurb).toMatch(/nem lehet egyedül/);
  });
});

/**
 * Cases found by running the filter against the live catalogue. Each one was a
 * programme the filter wrongly claimed, or wrongly refused.
 */
describe('group filter regressions from real data', () => {
  it('does not treat a performing band as a team activity', () => {
    expect(isGroupEvent(ev({ title: 'Színpadra fel! – Dúros Zenekar', category: 'Zene' }))).toBe(false);
    expect(isGroupEvent(ev({ title: 'Kórus koncert a Bazilikában', category: 'Zene' }))).toBe(false);
  });

  it('still accepts formats where the visitor plays', () => {
    expect(isGroupEvent(ev({ title: 'Akusztikus jam session' }))).toBe(true);
    expect(isGroupEvent(ev({ title: 'Közös éneklés a téren' }))).toBe(true);
  });

  it('accepts a meetup: the format is the group', () => {
    expect(isGroupEvent(ev({ title: 'English Language Meetup' }))).toBe(true);
  });
});

describe('the title overrides a wrong category', () => {
  /**
   * Live data: the collector filed "English Stand-Up Comedy Night" under
   * Társasjáték. The category matched the group rules; the title says plainly
   * what the evening is.
   */
  it('keeps a stand-up night out even when the category says board games', () => {
    expect(isGroupEvent(ev({ title: 'English Stand-Up Comedy Night', category: 'Társasjáték' }))).toBe(false);
  });

  it('keeps a concert out even when the category says hiking', () => {
    expect(isGroupEvent(ev({ title: 'Nyári koncert a várban', category: 'Természet & Túra' }))).toBe(false);
  });

  it('does not veto a genuine group programme with a neutral title', () => {
    expect(isGroupEvent(ev({ title: 'Pilis 20', category: 'Természet & Túra / Túra' }))).toBe(true);
  });
});
