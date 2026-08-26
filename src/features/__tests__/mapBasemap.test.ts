import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/components/events/EventsMapView.tsx', 'utf8');

/**
 * The map went black for anyone whose laptop was in dark mode, on a page that
 * has no dark theme at all. The cause was asking the operating system what it
 * preferred; these tests exist so that never comes back.
 */
describe('map basemap', () => {
  it('never consults the operating system colour scheme', () => {
    expect(SOURCE).not.toContain('prefers-color-scheme');
  });

  it('uses the light Voyager basemap by default', () => {
    expect(SOURCE).toContain('rastertiles/voyager');
    // The dark tiles stay available for a future in-app theme…
    expect(SOURCE).toContain('dark_all');
    // …but only the `dark` class on <html> may select them.
    expect(SOURCE).toContain("classList.contains('dark')");
  });

  it('credits OpenStreetMap and CARTO, as their terms require', () => {
    expect(SOURCE).toContain('openstreetmap.org/copyright');
    expect(SOURCE).toContain('carto.com/attributions');
  });
});

describe('map layout', () => {
  it('fills the window instead of sitting in the narrow page container', () => {
    const page = readFileSync('src/pages/EventsMap.tsx', 'utf8');
    expect(page).not.toContain('container mx-auto');
    expect(page).toContain('max-w-[1900px]');
  });

  it('orders the columns on the grid children, not on their contents', () => {
    // `order` on a nested div does nothing; putting it there once silently
    // swapped the map into the sidebar's 340px column.
    expect(SOURCE).toContain('relative order-1 lg:order-2');
  });
});
