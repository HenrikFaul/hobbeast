/**
 * Locale registry.
 *
 * To add a locale: (1) create src/i18n/resources/<tag>.ts, (2) add the tag to
 * SUPPORTED_LOCALES, (3) add a LOCALE_LABEL entry, (4) add a loader in
 * localeBundles.ts. The key-parity test will then require the new bundle to
 * cover every key the source bundle has.
 *
 * The source locale is HUNGARIAN, not English. The entire existing UI is written
 * in Hungarian and the current audience is Hungarian, so an English source would
 * make every unmigrated string appear in English to them — an instant
 * regression. With `hu` as the source, a visitor who never touches the language
 * switcher sees exactly what they saw before.
 */
export type Locale = 'hu' | 'en' | 'de' | 'cs' | 'pl' | 'sl' | 'sk' | (string & {});

/** Exactly the seven countries the catalogue collects from. */
export const SUPPORTED_LOCALES: Locale[] = ['hu', 'en', 'de', 'cs', 'pl', 'sl', 'sk'];

export const DEFAULT_LOCALE: Locale = 'hu';

/** English is the international fallback when a key is missing from a locale. */
export const FALLBACK_CHAIN: readonly Locale[] = ['hu', 'en'];

const HTML_LANG_BY_LOCALE: Readonly<Record<string, string>> = Object.freeze({
  hu: 'hu',
  en: 'en',
  de: 'de',
  cs: 'cs',
  pl: 'pl',
  sl: 'sl',
  sk: 'sk',
});

export function htmlLangForLocale(locale: Locale): string {
  return HTML_LANG_BY_LOCALE[locale] ?? DEFAULT_LOCALE;
}

export const LOCALE_LABEL: Record<string, { native: string; english: string; flag: string }> =
  Object.freeze({
    hu: { native: 'Magyar', english: 'Hungarian', flag: '🇭🇺' },
    en: { native: 'English', english: 'English', flag: '🇬🇧' },
    de: { native: 'Deutsch', english: 'German', flag: '🇩🇪' },
    cs: { native: 'Čeština', english: 'Czech', flag: '🇨🇿' },
    pl: { native: 'Polski', english: 'Polish', flag: '🇵🇱' },
    sl: { native: 'Slovenščina', english: 'Slovenian', flag: '🇸🇮' },
    sk: { native: 'Slovenčina', english: 'Slovak', flag: '🇸🇰' },
  });

export const LOCALE_STORAGE_KEY = 'hobbeast.locale.v1';

/**
 * Which country a locale implies, so choosing a language can also seed the
 * programme filter. Austria speaks German, so `de` maps to DE and the visitor
 * can still pick AT explicitly — a language is not a country, and guessing
 * between them would be worse than offering the larger one.
 */
export const COUNTRY_FOR_LOCALE: Readonly<Record<string, string>> = Object.freeze({
  hu: 'HU', en: 'HU', de: 'DE', cs: 'CZ', pl: 'PL', sl: 'SI', sk: 'SK',
});

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * Stored choice first, then the browser's language, then Hungarian.
 *
 * Reading storage is wrapped because hardened browsers and native WebViews throw
 * on access rather than returning null.
 */
export function detectInitialLocale(navigatorLanguages?: readonly string[]): Locale {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
  } catch {
    stored = null;
  }
  if (isSupportedLocale(stored)) return stored;

  const langs = navigatorLanguages
    ?? (typeof navigator !== 'undefined'
      ? (navigator.languages?.length ? navigator.languages : [navigator.language])
      : []);
  for (const raw of langs) {
    const base = String(raw ?? '').toLowerCase().split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage refused; the choice still applies for this visit */
  }
}
