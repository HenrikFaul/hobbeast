import { describe, expect, it } from 'vitest';
import { pickEditorialClip, resolveEditorialCategory } from '@/features/events/EditorialVideoBackdrop';
import { EDITORIAL_VIDEOS } from '@/assets/editorial/videoLibrary';

describe('editorial backdrop selection', () => {
  it('routes a category label to a bucket that actually has clips', () => {
    expect(resolveEditorialCategory('Zene')).toBe('Zene');
    expect(resolveEditorialCategory('Természet & Túra')).toBe('Természet & Túra');
    expect(resolveEditorialCategory('Koncert a Dürer Kertben')).toBe('Zene');
    expect(resolveEditorialCategory('Kerékpáros túra')).toBe('Természet & Túra');
    expect(resolveEditorialCategory(null)).toBe('Program');
    expect(resolveEditorialCategory('Valami egészen más')).toBe('Program');
  });

  it('gives every bucket it can return at least one clip', () => {
    const buckets = new Set(['Program', ...Object.keys(EDITORIAL_VIDEOS)]);
    for (const bucket of buckets) {
      expect(EDITORIAL_VIDEOS[bucket]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('always picks the same clip for the same program', () => {
    const first = pickEditorialClip('Zene', 'event-123');
    expect(first).toBeTruthy();
    expect(pickEditorialClip('Zene', 'event-123')).toBe(first);
    // and a different program usually gets a different one
    const others = ['a', 'b', 'c', 'd', 'e'].map((seed) => pickEditorialClip('Zene', seed));
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('never returns a clip outside its category', () => {
    const clip = pickEditorialClip('Gasztro', 'event-42');
    expect(EDITORIAL_VIDEOS['Gasztro']).toContain(clip);
  });
});
