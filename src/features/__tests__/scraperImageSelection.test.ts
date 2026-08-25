import { describe, expect, it } from 'vitest';
// The scraper worker is plain ESM shared with the GitHub Actions job; these are
// the image-selection rules that decide what ends up on an event card.
// @ts-expect-error -- untyped worker module, exercised here as a contract test
import { isUsableImage, resolveEventImages } from '../../../scraper-worker/src/sources/generic.mjs';

const banner = 'https://eventland.eu/wp-content/uploads/2023/05/Whats-happening-in-May.jpg';
const photoFor = (slug: string) => `https://eventland.eu/wp-content/uploads/2026/08/${slug}.jpg`;

function event(title: string, candidates: string[]) {
  return { title, image_candidates: candidates, image_url: candidates[0] ?? null };
}

describe('scraper image selection', () => {
  it('rejects filler, logo and tracking-pixel images', () => {
    expect(isUsableImage('https://www.jegy.hu/resources/img/noimage474.jpg')).toBe(false);
    expect(isUsableImage('https://site.hu/img/page/logo-1-blue.png')).toBe(false);
    expect(isUsableImage('https://site.hu/assets/placeholder.jpg')).toBe(false);
    expect(isUsableImage('https://site.hu/img/1x1.png')).toBe(false);
    expect(isUsableImage('https://site.hu/brand/mark.svg')).toBe(false);
    expect(isUsableImage('/relative/photo.jpg')).toBe(false);
    expect(isUsableImage(null)).toBe(false);
  });

  it('accepts real content photographs', () => {
    expect(isUsableImage(photoFor('Tefeszt-1'))).toBe(true);
    expect(isUsableImage('https://site.hu/uploads/koncert.webp')).toBe(true);
  });

  it('keeps performer photos whose path merely contains an avatar-like word', () => {
    // Songkick serves genuine artist photos under ".../huge_avatar"; a naive
    // substring filter would throw away a good image for every concert.
    expect(isUsableImage('https://images.sk-static.com/images/media/profile_images/artists/1923773/huge_avatar')).toBe(true);
    // A real default avatar is still rejected.
    expect(isUsableImage('https://site.hu/img/default-avatar.png')).toBe(false);
  });

  it('drops a site-wide banner shared by many distinct events and uses the per-event photo', () => {
    // Reproduces the eventland.eu defect: every event's JSON-LD carried the same
    // banner, while og:image (second candidate) held the real photo.
    const events = [
      event('Botanical Garden Budapest', [banner, photoFor('botanical')]),
      event('Budapest Zoo', [banner, photoFor('zoo')]),
      event('Sólet Fesztivál', [banner, photoFor('solet')]),
    ];
    resolveEventImages(events);
    expect(events.map((e) => e.image_url)).toEqual([
      photoFor('botanical'), photoFor('zoo'), photoFor('solet'),
    ]);
  });

  it('keeps a shared image when the same recurring event repeats', () => {
    const series = photoFor('f1-watch-party');
    const events = [
      event('F1 watch party', [series]),
      event('F1 watch party', [series]),
      event('F1 watch party', [series]),
    ];
    resolveEventImages(events);
    expect(events.every((e) => e.image_url === series)).toBe(true);
  });

  it('leaves the image empty rather than showing a wrong photo', () => {
    const events = [
      event('A', [banner]), event('B', [banner]), event('C', [banner]),
    ];
    resolveEventImages(events);
    expect(events.map((e) => e.image_url)).toEqual([null, null, null]);
  });
});
