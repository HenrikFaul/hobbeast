/**
 * Country as the primary geography of the listing.
 *
 * Before this, the only geography the product had was a row of city chips, so a
 * Hungarian visitor's first screen offered "Budapest, Praha, Warszawa, Wien" as
 * if those were peers. The rule now is: you see YOUR country by default, and
 * everything else lives behind one deliberate "foreign programmes" step.
 *
 * There is no i18n framework in this app yet — every visible string is written
 * in Hungarian in the components. The labels therefore live here as data rather
 * than inline, so adding a second language later means translating this map and
 * nothing else.
 */

export type CountryCode = 'HU' | 'AT' | 'CZ' | 'DE' | 'PL' | 'SI' | 'SK';

export interface CountryMeta {
  code: CountryCode;
  /** Hungarian name, as the UI language stands today. */
  label: string;
  /** The country's own name, shown as a hint so a foreign visitor recognises it. */
  endonym: string;
  flag: string;
  /** [south, west, north, east] — enough for the map to frame the country. */
  bounds: [number, number, number, number];
}

export const HOME_COUNTRY: CountryCode = 'HU';

export const COUNTRIES: readonly CountryMeta[] = [
  { code: 'HU', label: 'Magyarország', endonym: 'Magyarország', flag: '🇭🇺', bounds: [45.74, 16.11, 48.58, 22.90] },
  { code: 'AT', label: 'Ausztria', endonym: 'Österreich', flag: '🇦🇹', bounds: [46.37, 9.53, 49.02, 17.16] },
  { code: 'CZ', label: 'Csehország', endonym: 'Česko', flag: '🇨🇿', bounds: [48.55, 12.09, 51.06, 18.86] },
  { code: 'DE', label: 'Németország', endonym: 'Deutschland', flag: '🇩🇪', bounds: [47.27, 5.87, 55.06, 15.04] },
  { code: 'PL', label: 'Lengyelország', endonym: 'Polska', flag: '🇵🇱', bounds: [49.00, 14.12, 54.84, 24.15] },
  { code: 'SI', label: 'Szlovénia', endonym: 'Slovenija', flag: '🇸🇮', bounds: [45.42, 13.38, 46.88, 16.61] },
  { code: 'SK', label: 'Szlovákia', endonym: 'Slovensko', flag: '🇸🇰', bounds: [47.73, 16.83, 49.61, 22.57] },
] as const;

const BY_CODE = new Map<string, CountryMeta>(COUNTRIES.map((c) => [c.code, c]));

export function countryMeta(code: string | null | undefined): CountryMeta | null {
  return BY_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

export function countryLabel(code: string | null | undefined): string {
  return countryMeta(code)?.label ?? String(code ?? '').toUpperCase();
}

export function isSupportedCountry(code: string | null | undefined): code is CountryCode {
  return BY_CODE.has(String(code ?? '').trim().toUpperCase());
}

/**
 * Which country's programmes should be shown before the visitor chooses anything.
 *
 * Order of trust: an explicit country on the profile, then the browser's own
 * region, then Hungary. The browser locale is consulted rather than a geo-IP
 * lookup on purpose — it needs no third party, no consent banner and no network
 * call, and it is right for the overwhelming majority.
 */
export function resolveDefaultCountry(input?: {
  profileCountry?: string | null;
  locales?: readonly string[];
}): CountryCode {
  const fromProfile = String(input?.profileCountry ?? '').trim().toUpperCase();
  if (isSupportedCountry(fromProfile)) return fromProfile;

  const locales = input?.locales
    ?? (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? navigator.languages
      : []);
  for (const locale of locales) {
    // "hu-HU" -> HU, "de-AT" -> AT. A bare "de" carries no region and is skipped
    // rather than guessed at: "de" is far more likely to be Germany than Austria,
    // but "far more likely" is not a reason to silently decide for someone.
    const region = String(locale ?? '').split('-')[1];
    if (isSupportedCountry(region)) return region.toUpperCase() as CountryCode;
  }
  return HOME_COUNTRY;
}

const STORAGE_KEY = 'hobbeast.countryFilter.v1';

export interface CountrySelection {
  /** The visitor's own country — always shown, never part of "foreign". */
  home: CountryCode;
  /** Foreign countries the visitor has opted into. Empty by default. */
  foreign: CountryCode[];
}

/** The countries a query should ask for, or null for "everything". */
export function selectionToCountries(selection: CountrySelection): CountryCode[] {
  return [selection.home, ...selection.foreign.filter((c) => c !== selection.home)];
}

export function readStoredSelection(fallbackHome: CountryCode): CountrySelection {
  const empty: CountrySelection = { home: fallbackHome, foreign: [] };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<CountrySelection>;
    const home = isSupportedCountry(parsed.home) ? parsed.home : fallbackHome;
    const foreign = Array.isArray(parsed.foreign)
      ? parsed.foreign.filter(isSupportedCountry).filter((c) => c !== home)
      : [];
    return { home, foreign: Array.from(new Set(foreign)) };
  } catch {
    // A private window, cleared site data, or a browser that refuses storage.
    // The filter must still work; it just will not be remembered.
    return empty;
  }
}

export function writeStoredSelection(selection: CountrySelection): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* storage refused; the selection still applies for this visit */
  }
}

/** Bounds covering every selected country, for framing the map. */
export function boundsForCountries(codes: readonly string[]): [[number, number], [number, number]] | null {
  const metas = codes.map(countryMeta).filter((m): m is CountryMeta => Boolean(m));
  if (!metas.length) return null;
  const south = Math.min(...metas.map((m) => m.bounds[0]));
  const west = Math.min(...metas.map((m) => m.bounds[1]));
  const north = Math.max(...metas.map((m) => m.bounds[2]));
  const east = Math.max(...metas.map((m) => m.bounds[3]));
  return [[south, west], [north, east]];
}
