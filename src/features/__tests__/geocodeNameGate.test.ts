import { describe, expect, it } from 'vitest';
// @ts-expect-error -- untyped Node script, exercised here as a contract test
import { nameMatches, districtFromPostcode, districtFromText, splitCityPrefix, fold } from '../../../scripts/geocode-places.mjs';

// Every rejection below is a real answer a geocoder gave during the first live
// run. They all share only the building-type word with what we asked for, and
// each of them would have put a program at the wrong address on the map.
describe('geocoder name gate', () => {
  it.each([
    ['Dürer Kert', 'ELTE Fűvészkert', 'ELTE Fűvészkert, Illés utca, Budapest'],
    ['Ferenczy Múzeum', 'Országos Színháztörténeti Múzeum és Intézet', 'Szentháromság tér, Budapest'],
    ['Flesch Károly Kulturális Központ', 'Chábád Keren Or Kulturális Központ és Zsinagóga', 'Károly körút, Budapest'],
    ['Bridge Garden', 'Vénusz Garden', 'Vénusz Garden, Győr'],
    ['Aquincumi katonavárosi amfiteátrum', 'Aquincumi polgárvárosi amfiteátrum', 'Szentendrei út, Budapest'],
  ])('rejects %s -> %s', (query, candidate, context) => {
    expect(nameMatches(query, candidate, context)).toBe(false);
  });

  it.each([
    ['Budapest Park', 'Budapest Park', 'Budapest Park, Kvassay Jenő út, Budapest'],
    ['A38 Ship / A38 Hajó', 'A38 Hajó', 'A38 Hajó, Budapest'],
    ['Garden Kobuci', 'Kobuci Kert', 'Kobuci Kert, Fő tér, Budapest'],
    ['Gyöngyös-Mátra Művelődési Központ', 'Mátra Művelődési Központ', 'Mátra Művelődési Központ, Gyöngyös'],
    ['Kós Károly Művelődési Ház és Könyvtár udvara', 'Kós Károly Művelődési Ház és Könyvtár', 'Budakalász'],
  ])('accepts %s -> %s', (query, candidate, context) => {
    expect(nameMatches(query, candidate, context)).toBe(true);
  });

  it('never matches on a building-type word alone', () => {
    expect(nameMatches('Valami Kulturális Központ', 'Másik Kulturális Központ', 'Debrecen')).toBe(false);
  });
});

describe('Budapest district derivation', () => {
  it('reads the district out of the postal code', () => {
    expect(districtFromPostcode('1095')).toBe('IX');
    expect(districtFromPostcode('1011')).toBe('I');
    expect(districtFromPostcode('1239')).toBe('XXIII');
    // 1450 is a PO-box code, not a district — better nothing than district 45.
    expect(districtFromPostcode('1450')).toBeNull();
    expect(districtFromPostcode('9700')).toBeNull();
  });

  it('reads both spellings out of free text', () => {
    expect(districtFromText('Budapest VII. kerület, Kazinczy u.')).toBe('VII');
    expect(districtFromText('Budapest 18. kerület')).toBe('XVIII');
    expect(districtFromText('XVIII. ker. Üllői út')).toBe('XVIII');
    expect(districtFromText('Dürer Kert')).toBeNull();
  });
});

describe('venue string normalisation', () => {
  const cities = new Set(['budapest', 'gyor', 'szentendre'].map(fold));

  it('splits the "City - Venue" shape the ticketing feeds use', () => {
    expect(splitCityPrefix('Győr - Trafo Club', cities)).toEqual({ city: 'Győr', name: 'Trafo Club' });
  });

  it('leaves a venue whose name merely contains a dash alone', () => {
    expect(splitCityPrefix('Instant - Fogas Ház', cities)).toEqual({ city: null, name: 'Instant - Fogas Ház' });
  });
});
