import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locales';
import hu from './resources/hu';

export type LocaleBundle = Record<string, unknown>;

/**
 * Every locale except the source is loaded on demand.
 *
 * Hungarian is imported statically because it is the source and the fallback:
 * it must be available synchronously on the very first render, or a Hungarian
 * visitor would see a flash of missing copy on a product that is already
 * entirely Hungarian.
 */
const LOADERS: Readonly<Record<string, () => Promise<{ default: LocaleBundle }>>> = Object.freeze({
  en: () => import('./resources/en'),
  de: () => import('./resources/de'),
  cs: () => import('./resources/cs'),
  pl: () => import('./resources/pl'),
  sl: () => import('./resources/sl'),
  sk: () => import('./resources/sk'),
});

const loaded = new Map<string, LocaleBundle>([[DEFAULT_LOCALE, hu as LocaleBundle]]);
const pending = new Map<string, Promise<LocaleBundle>>();

export function getLoadedLocaleBundle(locale: Locale): LocaleBundle | null {
  return loaded.get(locale) ?? null;
}

export function getSourceBundle(): LocaleBundle {
  return hu as LocaleBundle;
}

export async function loadLocaleBundle(locale: Locale): Promise<LocaleBundle> {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new Error('Unsupported locale bundle');

  const already = loaded.get(locale);
  if (already) return already;

  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;

  const loader = LOADERS[locale];
  if (!loader) throw new Error('Locale bundle loader is missing');

  const promise = loader()
    .then((mod) => {
      const bundle = (mod?.default ?? {}) as LocaleBundle;
      loaded.set(locale, bundle);
      pending.delete(locale);
      return bundle;
    })
    .catch((err) => {
      // A failed chunk must not strand the UI in a half-translated state; the
      // caller keeps the source bundle and the visitor keeps a working page.
      pending.delete(locale);
      throw err;
    });

  pending.set(locale, promise);
  return promise;
}
