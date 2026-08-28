/**
 * Live readiness and smart suggestions for the event composer.
 *
 * The composer used to be a wall of thirty fields with no sense of progress or
 * of what mattered. This turns it into something that helps: a readiness score
 * that fills as the event takes shape, phrased as encouragement rather than
 * error, and a few deterministic suggestions (an emoji, some tags, a nudge on
 * the title) so the first minute feels guided, not blank.
 *
 * Everything here is pure — no network, no AI cost — so it updates on every
 * keystroke and is fully testable. It is advisory only: it never blocks a
 * publish, exactly as the plan asks (§7.3 "élő segítség, nem büntetés").
 */

export interface ReadinessDraft {
  title: string;
  description: string;
  category: string;
  hasDate: boolean;
  eventTime: string;
  hasLocation: boolean;
  imageEmoji: string;
  maxAttendees: string;
  beginnerFriendly: 'unspecified' | 'yes' | 'no';
  activityIntensity: string;
  equipmentRequired: string;
  tags: string;
}

export interface ReadinessItem {
  key: string;
  label: string;
  /** A friendly, specific nudge shown only while the item is incomplete. */
  tip: string;
  weight: number;
  done: boolean;
  /** The essentials a good event cannot do without; the rest are polish. */
  essential: boolean;
}

export interface Readiness {
  score: number;
  /** Drives the meter's colour and the headline. */
  level: 'start' | 'building' | 'good' | 'great';
  headline: string;
  items: ReadinessItem[];
  /** The single most valuable thing to do next. */
  nextTip: string | null;
  /** True once every essential is in place — safe and inviting to publish. */
  publishable: boolean;
}

function has(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function computeReadiness(draft: ReadinessDraft): Readiness {
  const items: ReadinessItem[] = [
    {
      key: 'title', label: 'Cím', essential: true, weight: 18,
      done: draft.title.trim().length >= 4,
      tip: 'Adj egy hívogató címet — ez az első, amit meglátnak.',
    },
    {
      key: 'when', label: 'Időpont', essential: true, weight: 20,
      done: draft.hasDate && has(draft.eventTime),
      tip: draft.hasDate ? 'Mikor kezdődik? Add meg az órát is.' : 'Mikor lesz? Válassz napot és időt.',
    },
    {
      key: 'where', label: 'Helyszín', essential: true, weight: 18,
      done: draft.hasLocation,
      tip: 'Hol találkoztok? Egy város is elég a kezdéshez.',
    },
    {
      key: 'category', label: 'Kategória', essential: true, weight: 10,
      done: has(draft.category),
      tip: 'Válaszd ki a témát, hogy a megfelelő emberek rátaláljanak.',
    },
    {
      key: 'description', label: 'Leírás', essential: false, weight: 14,
      done: draft.description.trim().length >= 30,
      tip: 'Írj pár mondatot arról, mi vár rájuk — ez dönti el, hogy eljönnek-e.',
    },
    {
      key: 'emoji', label: 'Hangulat', essential: false, weight: 6,
      done: has(draft.imageEmoji) && draft.imageEmoji !== '🎉',
      tip: 'Válassz egy emojit, ami passzol — a kártyád rögtön életre kel.',
    },
    {
      key: 'capacity', label: 'Létszám', essential: false, weight: 6,
      done: has(draft.maxAttendees),
      tip: 'Hány főt vársz? A létszám segít tervezni — és sürgetést is ad.',
    },
    {
      key: 'expectations', label: 'Mire számítsanak', essential: false, weight: 8,
      done: draft.beginnerFriendly !== 'unspecified' || has(draft.activityIntensity) || has(draft.equipmentRequired),
      tip: 'Kezdőbarát? Mit hozzanak? Egy kis eligazítás sok kételyt elolt.',
    },
  ];

  const score = Math.round(items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0));
  const publishable = items.filter((item) => item.essential).every((item) => item.done);

  const level: Readiness['level'] = score >= 90 ? 'great' : score >= 65 ? 'good' : score >= 35 ? 'building' : 'start';
  const headline = {
    start: 'Kezdjük! Pár lépés, és kész.',
    building: 'Szuper, formálódik! 🙌',
    good: 'Ez már nagyon jól néz ki! ✨',
    great: 'Zseniális esemény — csak nyomj a Közzétételre! 🚀',
  }[level];

  // The next tip is the highest-weight incomplete essential, or else the
  // highest-weight incomplete polish — the single most worthwhile next move.
  const incomplete = items.filter((item) => !item.done);
  const nextTip = [...incomplete]
    .sort((a, b) => Number(b.essential) - Number(a.essential) || b.weight - a.weight)[0]?.tip ?? null;

  return { score, level, headline, items, nextTip, publishable };
}

/** Category name → a fitting emoji, so the card is never a bland 🎉. */
const CATEGORY_EMOJI: Array<[RegExp, string]> = [
  [/sport|mozg|fut|edz|kondi|jóga|joga/i, '🏃'],
  [/túra|tura|kirándul|hegy|termész/i, '🥾'],
  [/zene|koncert|dj|jam|hangs/i, '🎸'],
  [/tánc|tanc|salsa|bachata/i, '💃'],
  [/társas|tarsas|játék|jatek|board/i, '🎲'],
  [/film|mozi|vetít/i, '🎬'],
  [/gaszt|főz|foz|vacsor|bor|sör|ser|kávé|kave/i, '🍽️'],
  [/kreatív|kreativ|fest|rajz|kézm|kezm|workshop/i, '🎨'],
  [/foto|fotó|kép/i, '📷'],
  [/könyv|konyv|iro|nyelv|tanul|előad|eload/i, '📚'],
  [/color|szín|fest/i, '🎨'],
  [/party|buli|fesztivál|fesztival/i, '🎉'],
];

export function suggestEmoji(categoryName: string, title: string): string {
  const haystack = `${categoryName} ${title}`;
  for (const [pattern, emoji] of CATEGORY_EMOJI) {
    if (pattern.test(haystack)) return emoji;
  }
  return '✨';
}

/** A handful of tag ideas from the category and what is already typed. */
export function suggestTags(categoryName: string, existing: string): string[] {
  const already = new Set(existing.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean));
  const pool: string[] = [];
  const add = (...tags: string[]) => { for (const t of tags) if (!already.has(t.toLowerCase())) pool.push(t); };

  const c = categoryName.toLowerCase();
  add('Kezdőbarát', 'Ingyenes');
  if (/sport|mozg|fut/.test(c)) add('Reggeli', 'Szabadtéri', 'Csapat');
  if (/túra|tura|termész/.test(c)) add('Kirándulás', 'Természet', 'Könnyű');
  if (/zene|koncert/.test(c)) add('Élő zene', 'Este');
  if (/társas|jatek|játék/.test(c)) add('Társasozás', 'Esti program');
  if (/kreatív|kreativ|workshop|fest/.test(c)) add('Workshop', 'Alkotás');
  if (/gaszt|főz|bor/.test(c)) add('Kóstoló', 'Közös főzés');
  add('Új barátok', 'Hétvégi');
  return pool.slice(0, 6);
}
