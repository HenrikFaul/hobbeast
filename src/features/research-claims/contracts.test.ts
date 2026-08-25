import { describe, expect, it } from 'vitest';
import { createResearchRandomCursor, resolveResearchLocale } from './contracts';

describe('research claim client contracts', () => {
  it('normalizes supported browser locales and fails closed to Hungarian', () => {
    expect(resolveResearchLocale('en_GB', 'hu-HU')).toBe('en-GB');
    expect(resolveResearchLocale('', 'de-DE')).toBe('de-DE');
    expect(resolveResearchLocale('not a locale', 'en-US')).toBe('hu-HU');
  });

  it('turns browser cryptographic entropy into a database cursor in [0, 1)', () => {
    const minimum = createResearchRandomCursor({
      getRandomValues: (array) => {
        (array as Uint32Array)[0] = 0;
        return array;
      },
    });
    const maximum = createResearchRandomCursor({
      getRandomValues: (array) => {
        (array as Uint32Array)[0] = 0xffff_ffff;
        return array;
      },
    });

    expect(minimum).toBe(0);
    expect(maximum).toBeGreaterThan(0.999999999);
    expect(maximum).toBeLessThan(1);
  });
});
