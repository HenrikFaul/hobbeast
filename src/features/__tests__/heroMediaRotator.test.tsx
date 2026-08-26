import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { heroClipPool } from '@/features/events/heroClips';
import { HeroMediaRotator } from '@/features/events/HeroMediaRotator';

/**
 * The events hero used to be one photograph of one sport. It now draws from
 * the whole editorial library, so what a visitor sees says something about the
 * catalogue rather than about badminton.
 */
describe('heroClipPool', () => {
  it('offers the whole library, not one category', () => {
    const pool = heroClipPool();
    expect(pool.length).toBeGreaterThan(100);
    expect(new Set(pool).size).toBe(pool.length);
  });
});

describe('HeroMediaRotator', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders media without an IntersectionObserver and without throwing', () => {
    const { container } = render(<HeroMediaRotator className="h-10 w-10" startIndex={0} />);
    expect(container.querySelector('video, img')).not.toBeNull();
  });

  it('starts somewhere else on another visit', () => {
    const pool = heroClipPool();
    const sources = new Set<string>();
    for (const value of [0.05, 0.4, 0.85]) {
      vi.spyOn(Math, 'random').mockReturnValue(value);
      const { container, unmount } = render(<HeroMediaRotator className="h-10 w-10" />);
      const media = container.querySelector('video, img') as HTMLMediaElement | HTMLImageElement;
      sources.add(media.getAttribute('src') || '');
      unmount();
    }
    expect(sources.size).toBe(3);
    expect(pool.length).toBeGreaterThan(3);
  });

  it('moves on to the next clip while it is on screen', () => {
    vi.useFakeTimers();
    const { container } = render(<HeroMediaRotator className="h-10 w-10" startIndex={0} intervalMs={1000} />);
    const first = container.querySelector('video, img')?.getAttribute('src');

    act(() => { vi.advanceTimersByTime(1100); });

    const second = container.querySelector('video, img')?.getAttribute('src');
    expect(second).not.toBe(first);
  });

  it('holds still when rotation is switched off', () => {
    vi.useFakeTimers();
    const { container } = render(<HeroMediaRotator className="h-10 w-10" startIndex={0} intervalMs={0} />);
    const first = container.querySelector('video, img')?.getAttribute('src');

    act(() => { vi.advanceTimersByTime(30000); });

    expect(container.querySelector('video, img')?.getAttribute('src')).toBe(first);
  });
});
