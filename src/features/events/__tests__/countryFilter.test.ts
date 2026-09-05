import { describe, it, expect, beforeEach } from 'vitest';
import {
  COUNTRIES,
  HOME_COUNTRY,
  boundsForCountries,
  countryLabel,
  countryMeta,
  isSupportedCountry,
  readStoredSelection,
  resolveDefaultCountry,
  selectionToCountries,
  writeStoredSelection,
} from '../countryFilter';

describe('country metadata', () => {
  it('covers exactly the countries the catalogue collects from', () => {
    expect(COUNTRIES.map((c) => c.code).sort()).toEqual(['AT', 'CZ', 'DE', 'HU', 'PL', 'SI', 'SK']);
  });

  it('is case- and whitespace-insensitive about the code', () => {
    expect(countryMeta(' hu ')?.code).toBe('HU');
    expect(countryLabel('pl')).toBe('Lengyelország');
  });

  it('does not invent a label for a country we do not carry', () => {
    expect(countryMeta('FR')).toBeNull();
    expect(isSupportedCountry('FR')).toBe(false);
    // ...but it still shows something rather than "undefined".
    expect(countryLabel('FR')).toBe('FR');
  });

  it('gives every country usable bounds', () => {
    for (const c of COUNTRIES) {
      const [s, w, n, e] = c.bounds;
      expect(n).toBeGreaterThan(s);
      expect(e).toBeGreaterThan(w);
    }
  });
});

describe('resolveDefaultCountry', () => {
  it('trusts an explicit profile country first', () => {
    expect(resolveDefaultCountry({ profileCountry: 'AT', locales: ['hu-HU'] })).toBe('AT');
  });

  it('falls back to the browser region', () => {
    expect(resolveDefaultCountry({ locales: ['de-AT', 'en-US'] })).toBe('AT');
    expect(resolveDefaultCountry({ locales: ['cs-CZ'] })).toBe('CZ');
  });

  it('refuses to guess a region from a bare language', () => {
    // "de" alone is likelier Germany than Austria, but likelier is not a reason
    // to decide someone's country for them.
    expect(resolveDefaultCountry({ locales: ['de'] })).toBe(HOME_COUNTRY);
  });

  it('ignores a country we do not carry and lands on Hungary', () => {
    expect(resolveDefaultCountry({ profileCountry: 'FR', locales: ['fr-FR'] })).toBe('HU');
    expect(resolveDefaultCountry({ locales: [] })).toBe('HU');
  });
});

describe('selection', () => {
  it('always queries the home country, foreign countries only when chosen', () => {
    expect(selectionToCountries({ home: 'HU', foreign: [] })).toEqual(['HU']);
    expect(selectionToCountries({ home: 'HU', foreign: ['AT', 'CZ'] })).toEqual(['HU', 'AT', 'CZ']);
  });

  it('never lists the home country twice', () => {
    expect(selectionToCountries({ home: 'PL', foreign: ['PL', 'CZ'] })).toEqual(['PL', 'CZ']);
  });
});

describe('stored selection', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('starts with the visitor country and no foreign countries', () => {
    expect(readStoredSelection('HU')).toEqual({ home: 'HU', foreign: [] });
  });

  it('round-trips a selection', () => {
    writeStoredSelection({ home: 'HU', foreign: ['AT', 'SK'] });
    expect(readStoredSelection('DE')).toEqual({ home: 'HU', foreign: ['AT', 'SK'] });
  });

  it('drops codes it no longer recognises rather than trusting old storage', () => {
    localStorage.setItem('hobbeast.countryFilter.v1', JSON.stringify({ home: 'XX', foreign: ['AT', 'FR', 'AT'] }));
    expect(readStoredSelection('HU')).toEqual({ home: 'HU', foreign: ['AT'] });
  });

  it('survives unparseable storage', () => {
    localStorage.setItem('hobbeast.countryFilter.v1', '{not json');
    expect(readStoredSelection('CZ')).toEqual({ home: 'CZ', foreign: [] });
  });
});

describe('boundsForCountries', () => {
  it('frames a single country', () => {
    expect(boundsForCountries(['HU'])).toEqual([[45.74, 16.11], [48.58, 22.90]]);
  });

  it('grows to cover several', () => {
    const b = boundsForCountries(['HU', 'DE']);
    expect(b).not.toBeNull();
    expect(b![0][0]).toBeLessThanOrEqual(45.74);
    expect(b![1][0]).toBeGreaterThanOrEqual(48.58);
  });

  it('returns null when nothing is selected, so the caller keeps its own view', () => {
    expect(boundsForCountries([])).toBeNull();
    expect(boundsForCountries(['FR'])).toBeNull();
  });
});
