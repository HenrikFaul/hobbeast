import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE, detectInitialLocale, htmlLangForLocale, isSupportedLocale, persistLocale,
  type Locale,
} from './locales';
import { getLoadedLocaleBundle, getSourceBundle, loadLocaleBundle, type LocaleBundle } from './localeBundles';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** Translate a dotted key, interpolating {{placeholders}}. Never throws. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** False only while a non-source bundle is still downloading. */
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(bundle: LocaleBundle | null, key: string): string | undefined {
  if (!bundle) return undefined;
  let cur: unknown = bundle;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(value: string, vars?: Record<string, string | number>): string {
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    (vars[name] != null ? String(vars[name]) : whole));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());
  const [, forceBundleTick] = useState(0);
  const [ready, setReady] = useState(locale === DEFAULT_LOCALE);

  useEffect(() => {
    let alive = true;
    if (locale === DEFAULT_LOCALE) { setReady(true); return; }
    setReady(false);
    loadLocaleBundle(locale)
      .then(() => { if (alive) { forceBundleTick((n) => n + 1); setReady(true); } })
      .catch(() => {
        // Keep the source language rather than showing raw keys. The visitor
        // sees a working, Hungarian page instead of a broken translated one.
        if (alive) setReady(true);
      });
    return () => { alive = false; };
  }, [locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = htmlLangForLocale(locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isSupportedLocale(next)) return;
    persistLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const active = locale === DEFAULT_LOCALE ? getSourceBundle() : getLoadedLocaleBundle(locale);
    // Chain: chosen locale -> source locale -> the key itself. Returning the key
    // is deliberate: an empty string would hide the gap, and a thrown error
    // would take a page down over a missing word.
    const hit = lookup(active, key) ?? lookup(getSourceBundle(), key);
    return interpolate(hit ?? key, vars);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t, ready }), [locale, setLocale, t, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Usable outside the provider on purpose: a component rendered in isolation (a
 * test, a storybook-style preview) still gets working Hungarian copy instead of
 * crashing on a missing context.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    ready: true,
    t: (key, vars) => interpolate(lookup(getSourceBundle(), key) ?? key, vars),
  };
}
