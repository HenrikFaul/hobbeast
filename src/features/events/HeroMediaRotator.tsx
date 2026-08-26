import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { EDITORIAL_VIDEO_BASE } from '@/assets/editorial/videoLibrary';
import { heroClipPool } from '@/features/events/heroClips';

/**
 * The hero visual of the events page, drawn from the editorial library instead
 * of being one fixed photograph.
 *
 * A single badminton picture said "this is a badminton site" to everyone who
 * ever opened the page. Rotating through the whole library — 132 five-second
 * loops covering every hobby bucket — says what the catalogue actually is.
 *
 * Cheap by construction: exactly one clip is in the DOM at a time, nothing is
 * fetched before the hero is on screen, playback stops when it scrolls away,
 * and a viewer who asked for reduced motion gets a still frame that never
 * changes under them.
 */

const ROTATE_MS = 9000;

interface HeroMediaRotatorProps {
  className?: string;
  /** Fixes the starting clip; used by tests. Random when omitted. */
  startIndex?: number;
  /** Milliseconds between clips; 0 disables rotation. */
  intervalMs?: number;
}

export function HeroMediaRotator({ className, startIndex, intervalMs = ROTATE_MS }: HeroMediaRotatorProps) {
  const reduceMotion = useReducedMotion();
  const pool = useMemo(heroClipPool, []);
  // A fresh starting point per visit, so two people never open the same page
  // to the same picture — and neither does the same person twice.
  const [index, setIndex] = useState(() => {
    if (!pool.length) return 0;
    if (typeof startIndex === 'number') return startIndex % pool.length;
    return Math.floor(Math.random() * pool.length);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '100px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion || !inView || pool.length < 2 || intervalMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % pool.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [reduceMotion, inView, pool.length, intervalMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // jsdom throws from play()/pause(), and a browser may reject on its
    // autoplay policy. A decorative hero must never take the page down.
    try {
      if (inView) {
        const started = video.play();
        if (started && typeof started.catch === 'function') started.catch(() => undefined);
      } else {
        video.pause();
      }
    } catch {
      /* No media playback here — the poster frame stays. */
    }
  }, [inView, index]);

  if (!pool.length) return null;
  const clip = pool[index] ?? pool[0];
  const poster = `${EDITORIAL_VIDEO_BASE}/${clip}.jpg`;

  return (
    <div ref={containerRef} className={className} aria-hidden="true">
      {reduceMotion || !inView ? (
        <img src={poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <video
          // Keying on the clip makes React swap the element instead of mutating
          // src on a playing video, which is what leaves a frozen last frame.
          key={clip}
          ref={videoRef}
          poster={poster}
          src={`${EDITORIAL_VIDEO_BASE}/${clip}.mp4`}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-cover animate-in fade-in duration-700"
        />
      )}
    </div>
  );
}
