import { describe, expect, it } from 'vitest';
// @ts-expect-error -- untyped worker module, exercised here as a contract test
import { findEventHubUrl } from '../../../scraper-worker/src/sources/generic.mjs';

const home = 'https://bekescsaba.hu';

describe('event hub discovery (self-healing entry points)', () => {
  it('finds a nested event hub on a municipal home page', () => {
    const links = [
      'https://bekescsaba.hu/palyazatok/videkfejlesztesi-program-2014-2020',
      'https://bekescsaba.hu/aktualitasok/kiemelt-rendezvenyek',
      'https://bekescsaba.hu/aktualitasok/kiemelt-rendezvenyek/csabai-kolbaszfesztival',
    ];
    expect(findEventHubUrl(links, home)).toBe('https://bekescsaba.hu/aktualitasok/kiemelt-rendezvenyek');
  });

  it('ignores prose slugs that merely end in a hub word', () => {
    const links = ['https://bekescsaba.hu/letoltheto-tervek-koncepciok-kozep-es-hosszutavu-programok'];
    expect(findEventHubUrl(links, home)).toBeNull();
  });

  it('prefers the shallowest hub', () => {
    const links = [
      'https://site.hu/hirek/kultura/programok',
      'https://site.hu/programok',
    ];
    expect(findEventHubUrl(links, 'https://site.hu')).toBe('https://site.hu/programok');
  });

  it('stays on the same host and never returns the page it is already on', () => {
    expect(findEventHubUrl(['https://other.hu/programok'], home)).toBeNull();
    expect(findEventHubUrl(['https://site.hu/programok'], 'https://site.hu/programok')).toBeNull();
    expect(findEventHubUrl(['https://site.hu/programok/'], 'https://site.hu/programok')).toBeNull();
  });

  it('does not walk into deep detail pages', () => {
    const links = ['https://site.hu/a/b/c/programok'];
    expect(findEventHubUrl(links, 'https://site.hu')).toBeNull();
  });

  it('never picks an archive of past programs', () => {
    // Seen live: amcham.hu offered "/events/past-events", which can only yield
    // expired entries that the ingest then discards.
    expect(findEventHubUrl(['https://site.hu/events/past-events'], 'https://site.hu')).toBeNull();
    expect(findEventHubUrl(['https://site.hu/archiv-programok'], 'https://site.hu')).toBeNull();
    expect(findEventHubUrl(['https://site.hu/korabbi-rendezvenyek'], 'https://site.hu')).toBeNull();
    // A normal hub still passes.
    expect(findEventHubUrl(['https://site.hu/programok'], 'https://site.hu')).toBe('https://site.hu/programok');
  });

  it('survives malformed input', () => {
    expect(findEventHubUrl(['not-a-url', ''], home)).toBeNull();
    expect(findEventHubUrl(null, home)).toBeNull();
  });
});
