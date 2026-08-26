import { EDITORIAL_VIDEOS } from '@/assets/editorial/videoLibrary';

/**
 * Every clip in the editorial library, deduplicated — buckets may share one.
 * The events hero draws from the whole pool rather than a single fixed
 * photograph, so the page shows the breadth of the catalogue.
 */
export function heroClipPool(): string[] {
  const seen = new Set<string>();
  for (const clips of Object.values(EDITORIAL_VIDEOS)) {
    for (const clip of clips) seen.add(clip);
  }
  return [...seen];
}
