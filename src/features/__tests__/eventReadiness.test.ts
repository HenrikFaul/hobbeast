import { describe, expect, it } from 'vitest';
import {
  computeReadiness,
  suggestEmoji,
  suggestTags,
  type ReadinessDraft,
} from '@/features/events/eventReadiness';

/**
 * The composer's live readiness and suggestions. It exists to help, never to
 * block — so the tests pin that an empty draft scores low but is honest about
 * what to do next, that the essentials alone make it publishable, and that a
 * full draft feels like a win.
 */

const EMPTY: ReadinessDraft = {
  title: '', description: '', category: '', hasDate: false, eventTime: '',
  hasLocation: false, imageEmoji: '🎉', maxAttendees: '',
  beginnerFriendly: 'unspecified', activityIntensity: '', equipmentRequired: '', tags: '',
};

const ESSENTIALS: ReadinessDraft = {
  ...EMPTY,
  title: 'Vasárnapi futóklub a Városligetben',
  category: 'Sport',
  hasDate: true, eventTime: '08:00',
  hasLocation: true,
};

describe('readiness', () => {
  it('starts low and names the single most useful next step', () => {
    const r = computeReadiness(EMPTY);
    expect(r.score).toBe(0);
    expect(r.level).toBe('start');
    expect(r.publishable).toBe(false);
    // The most valuable move on an empty draft is the highest-weight essential.
    expect(r.nextTip).toBeTruthy();
  });

  it('becomes publishable once the four essentials are in', () => {
    const r = computeReadiness(ESSENTIALS);
    expect(r.publishable).toBe(true);
    // Title, when, where, category done — but polish still pending.
    expect(r.items.filter((i) => i.essential).every((i) => i.done)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.score).toBeLessThan(100);
  });

  it('reaches a great score when the event is fully fleshed out', () => {
    const full: ReadinessDraft = {
      ...ESSENTIALS,
      description: 'Közös reggeli futás a Városliget körül, minden szinten. Utána kávé és beszélgetés.',
      imageEmoji: '🏃', maxAttendees: '25', beginnerFriendly: 'yes', tags: 'Futás, Reggeli',
    };
    const r = computeReadiness(full);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.level).toBe('great');
    expect(r.nextTip).toBeNull();
    expect(r.headline).toContain('🚀');
  });

  it('does not credit the default emoji — a real choice counts', () => {
    const withDefault = computeReadiness({ ...ESSENTIALS, imageEmoji: '🎉' });
    const withChosen = computeReadiness({ ...ESSENTIALS, imageEmoji: '🏃' });
    expect(withChosen.score).toBeGreaterThan(withDefault.score);
  });

  it('treats a date without a time as not-yet-done', () => {
    const r = computeReadiness({ ...EMPTY, hasDate: true, eventTime: '' });
    expect(r.items.find((i) => i.key === 'when')?.done).toBe(false);
  });
});

describe('suggestions', () => {
  it('picks an emoji that fits the category or the title', () => {
    expect(suggestEmoji('Sport', 'Reggeli futás')).toBe('🏃');
    expect(suggestEmoji('Túra', 'Buda-hegység')).toBe('🥾');
    expect(suggestEmoji('Zene', 'Akusztikus est')).toBe('🎸');
    expect(suggestEmoji('Társasjáték', 'Catan est')).toBe('🎲');
  });

  it('falls back to a tasteful default, never a blank', () => {
    expect(suggestEmoji('Egyéb', 'Valami')).toBe('✨');
  });

  it('suggests tags from the category, skipping ones already added', () => {
    const tags = suggestTags('Sport', 'Reggeli');
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(6);
    // "Reggeli" is already typed, so it is not offered again.
    expect(tags.map((t) => t.toLowerCase())).not.toContain('reggeli');
  });
});
