import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { EDITORIAL_VIDEOS, EDITORIAL_VIDEO_BASE } from '@/assets/editorial/videoLibrary';

/**
 * The backdrop for a program that arrived without an image.
 *
 * Roughly half of the collected catalogue has no usable photo, and a gradient
 * with an emoji says nothing about what the evening will be like. A five-second
 * silent loop that matches the category does.
 *
 * It is deliberately cheap: nothing is fetched until the card scrolls into
 * view, the clip pauses again when it leaves, and a viewer who asked for
 * reduced motion only ever gets the poster frame.
 */

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/koncert|zene|jazz|opera|dj|karaoke|fesztiv/i, 'Zene'],
  [/túra|tura|hegy|boulder|kirándul|kirandul|természet|termeszet|outdoor|kajak|horgász/i, 'Természet & Túra'],
  [/társas|tarsas|kártya|kartya|kvíz|kviz|sakk|szabadul/i, 'Társasjáték'],
  [/színház|szinhaz|stand-?up|improv|előadás|eloadas|mozi|film/i, 'Színház & Előadás'],
  [/gasztro|bor|sör|sor\b|street food|piknik|főz|foz|sütés|sutes|kávé|kave|piac/i, 'Gasztro'],
  [/sport|fut|jóga|joga|úsz|usz|bicikli|kerékpár|kerekpar|mászás|maszas|tenisz|foci|kosár|kosar|mozgás|mozgas/i, 'Sport & Mozgás'],
  [/kiállítás|kiallitas|múzeum|muzeum|kultúra|kultura|irodalom|könyv|konyv|fot|kézműves|kezmuves|kerámia|keramia|festés|festes/i, 'Kultúra'],
  [/családi|csaladi|gyerek|kert|önkéntes|onkentes|kutya/i, 'Családi'],
  [/tánc|tanc|salsa|bachata|swing/i, 'Tánc'],
];

/** Maps any category label onto one of the editorial library's buckets. */
export function resolveEditorialCategory(category: string | null | undefined): string {
  const value = String(category ?? '');
  for (const [pattern, bucket] of CATEGORY_RULES) {
    if (pattern.test(value) && EDITORIAL_VIDEOS[bucket]?.length) return bucket;
  }
  return 'Program';
}

// A stable hash, so the same program keeps the same clip across renders and
// reloads — a backdrop that reshuffles on every scroll would be maddening.
function hash(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function pickEditorialClip(category: string | null | undefined, seed: string): string | null {
  const clips = EDITORIAL_VIDEOS[resolveEditorialCategory(category)] ?? EDITORIAL_VIDEOS.Program ?? [];
  if (!clips.length) return null;
  return clips[hash(seed || 'hobbeast') % clips.length];
}

interface EditorialVideoBackdropProps {
  category: string | null | undefined;
  seed: string;
  className?: string;
}

export function EditorialVideoBackdrop({ category, seed, className }: EditorialVideoBackdropProps) {
  const reduceMotion = useReducedMotion();
  const clip = useMemo(() => pickEditorialClip(category, seed), [category, seed]);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView) void video.play().catch(() => undefined);
    else video.pause();
  }, [inView]);

  if (!clip) return null;
  const poster = `${EDITORIAL_VIDEO_BASE}/${clip}.jpg`;

  return (
    <div ref={containerRef} className={className} aria-hidden="true">
      {reduceMotion || !inView ? (
        <img src={poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          poster={poster}
          src={`${EDITORIAL_VIDEO_BASE}/${clip}.mp4`}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
