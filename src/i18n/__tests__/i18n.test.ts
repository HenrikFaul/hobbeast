import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  detectInitialLocale,
  htmlLangForLocale,
  isSupportedLocale,
  persistLocale,
  LOCALE_STORAGE_KEY,
} from '../locales';
import { interpolate } from '../I18nProvider';
import { getSourceBundle, loadLocaleBundle } from '../localeBundles';

/** Every leaf string key in a nested bundle, as dotted paths. */
function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') return [path];
    return keysOf(v, path);
  });
}

/** The {{placeholders}} a string expects. */
function placeholders(s: string): string[] {
  return Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
}

function leafAt(bundle: unknown, key: string): string | undefined {
  let cur: unknown = bundle;
  for (const p of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

describe('locale registry', () => {
  it('the source locale is Hungarian, so an unmigrated string stays Hungarian', () => {
    expect(DEFAULT_LOCALE).toBe('hu');
  });

  it('covers exactly the seven countries the catalogue collects from', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(['cs', 'de', 'en', 'hu', 'pl', 'sk', 'sl']);
  });

  it('has a native label and a flag for every supported locale', () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(LOCALE_LABEL[l]?.native, `missing label for ${l}`).toBeTruthy();
      expect(LOCALE_LABEL[l]?.flag, `missing flag for ${l}`).toBeTruthy();
    }
  });

  it('maps every locale to a valid html lang', () => {
    for (const l of SUPPORTED_LOCALES) expect(htmlLangForLocale(l)).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
    expect(htmlLangForLocale('zz')).toBe(DEFAULT_LOCALE);
  });

  it('rejects a locale we do not ship', () => {
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });
});

describe('detectInitialLocale', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it('prefers a stored choice over the browser', () => {
    persistLocale('pl');
    expect(detectInitialLocale(['de-DE'])).toBe('pl');
  });

  it('falls back to the browser language', () => {
    expect(detectInitialLocale(['de-AT', 'en-US'])).toBe('de');
    expect(detectInitialLocale(['sk'])).toBe('sk');
  });

  it('lands on Hungarian for a language we do not ship', () => {
    expect(detectInitialLocale(['fr-FR'])).toBe('hu');
    expect(detectInitialLocale([])).toBe('hu');
  });

  it('ignores a stored value that is no longer supported', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    expect(detectInitialLocale(['cs-CZ'])).toBe('cs');
  });
});

describe('interpolation', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Csak {{country}}', { country: 'Magyarország' })).toBe('Csak Magyarország');
  });

  it('leaves an unknown placeholder visible rather than printing "undefined"', () => {
    expect(interpolate('{{a}} és {{b}}', { a: '1' })).toBe('1 és {{b}}');
  });

  it('is a no-op without variables', () => {
    expect(interpolate('{{a}}')).toBe('{{a}}');
  });
});

describe('bundle parity', () => {
  const sourceKeys = keysOf(getSourceBundle()).sort();

  it('the source bundle is not empty', () => {
    expect(sourceKeys.length).toBeGreaterThan(30);
  });

  for (const locale of SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} covers every key the source has`, async () => {
      const bundle = await loadLocaleBundle(locale);
      const missing = sourceKeys.filter((k) => leafAt(bundle, k) === undefined);
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale} adds no key the source lacks`, async () => {
      const bundle = await loadLocaleBundle(locale);
      const extra = keysOf(bundle).filter((k) => !sourceKeys.includes(k));
      expect(extra, `${locale} has orphan keys: ${extra.join(', ')}`).toEqual([]);
    });

    it(`${locale} keeps the same placeholders as the source`, async () => {
      const bundle = await loadLocaleBundle(locale);
      // A translation that drops {{count}} silently renders a sentence with a
      // hole in it, which is worse than an untranslated string.
      const broken = sourceKeys.filter((k) => {
        const src = leafAt(getSourceBundle(), k);
        const dst = leafAt(bundle, k);
        if (!src || !dst) return false;
        return placeholders(src).join(',') !== placeholders(dst).join(',');
      });
      expect(broken, `${locale} changed placeholders in: ${broken.join(', ')}`).toEqual([]);
    });

    it(`${locale} actually translates — it is not a copy of the source`, async () => {
      const bundle = await loadLocaleBundle(locale);
      const identical = sourceKeys.filter((k) => leafAt(getSourceBundle(), k) === leafAt(bundle, k));
      // A handful of proper nouns legitimately match (Slovenia is "Slovenija"
      // in Slovenian too), so this asserts the bundle is not wholesale copied.
      expect(identical.length).toBeLessThan(sourceKeys.length * 0.25);
    });
  }

  it('refuses to load a locale we do not ship', async () => {
    await expect(loadLocaleBundle('fr')).rejects.toThrow();
  });
});

describe('country names are translated for every country we collect from', () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} names all seven countries`, async () => {
      const bundle = locale === DEFAULT_LOCALE ? getSourceBundle() : await loadLocaleBundle(locale);
      for (const cc of ['HU', 'AT', 'CZ', 'DE', 'PL', 'SI', 'SK']) {
        expect(leafAt(bundle, `country.names.${cc}`), `${locale} missing ${cc}`).toBeTruthy();
      }
    });
  }
});
