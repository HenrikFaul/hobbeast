import { beforeEach, describe, expect, it } from 'vitest';
import { parseSocialPost } from '@/features/events/socialPostParser';

/**
 * The browser extension hands a Facebook post to the admin panel as base64 in
 * the URL fragment, and the panel parses it with the SAME parser it uses for
 * text an operator pastes by hand. These tests pin both halves of that: the
 * encoding round-trips, and a real post produces a draft an operator can file.
 */

/** The encoder in browser-extension/hobbeast-importer/popup.js. */
function encodeHandoff(payload: { text: string; url: string }): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_');
}

/** The decoder in AdminPostImport.handoffFromHash. */
function decodeHandoff(encoded: string): { text: string; url: string } {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

const KIS_DUNA_POST = [
  'HETVEGI VIZI KALAND? IRANY RACKEVE!',
  '',
  'Eleged van a zsufolt strandokbol es a hetkoznapi programokbol?',
  'Nalunk nincs szukseg hajovezetoi engedelyre, csak egy kis kalandvagyra!',
  '',
  'Rackeve - Kis-Duna',
  '+36 30 670 77 17',
  'www.kisdunahajokolcsonzo.hu',
].join('\n');

const DATED_POST = [
  'Kreativ keramia workshop kezdoknek!',
  'Idopont: 2026.09.12. 18:00',
  'Helyszin: Apacuka Ceramics, Budapest',
  'Jelentkezes: https://apacukaceramics.hu/workshopok',
].join('\n');

describe('extension hand-off', () => {
  it('round-trips a post through the fragment encoding', () => {
    const payload = { text: KIS_DUNA_POST, url: 'https://www.facebook.com/x/posts/1' };
    expect(decodeHandoff(encodeHandoff(payload))).toEqual(payload);
  });

  it('survives accented Hungarian text and emoji', () => {
    const payload = { text: '🚤 Hétvégi vízi kaland — Ráckevén!', url: 'https://www.facebook.com/y' };
    expect(decodeHandoff(encodeHandoff(payload)).text).toBe(payload.text);
  });

  it('produces a base64url string with nothing needing escaping in a URL', () => {
    const encoded = encodeHandoff({ text: KIS_DUNA_POST, url: 'https://a/b?c=d&e=f' });
    expect(encoded).toMatch(/^[A-Za-z0-9\-_=]+$/);
  });

  it('reads a dated post into a fileable draft', () => {
    const draft = parseSocialPost(DATED_POST);
    expect(draft.eventDate).toBe('2026-09-12');
    expect(draft.eventTime).toBe('18:00');
    expect(draft.venue).toContain('Apacuka');
  });

  /**
   * The honest hard case: an advert with no date at all. What matters is that
   * no date is INVENTED — the operator is asked for one instead.
   */
  it('does not invent a date for an advert that has none', () => {
    expect(parseSocialPost(KIS_DUNA_POST).eventDate).toBeFalsy();
  });
});

describe('capture survives the login detour', () => {
  const KEY = 'hobbeast.postImportHandoff';

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/admin?tab=post-import');
  });

  it('moves the payload out of the address bar into session storage', async () => {
    const { capturePostImportHandoff, takePostImportHandoff } =
      await import('@/features/events/postImportHandoff');

    const encoded = encodeHandoff({ text: DATED_POST, url: 'https://www.facebook.com/x/posts/1' });
    window.history.replaceState(null, '', `/admin?tab=post-import#import=${encoded}`);

    capturePostImportHandoff();

    // Cleared from the URL, so a refresh cannot re-import what was filed…
    expect(window.location.hash).toBe('');
    // …but kept, so the bounce through /auth (Google included) does not lose it.
    expect(window.sessionStorage.getItem(KEY)).toBeTruthy();

    const taken = takePostImportHandoff();
    expect(taken?.text).toBe(DATED_POST);
    // Consumed exactly once.
    expect(takePostImportHandoff()).toBeNull();
  });

  it('ignores a fragment that is not a hand-off', async () => {
    const { capturePostImportHandoff } = await import('@/features/events/postImportHandoff');
    window.history.replaceState(null, '', '/admin?tab=post-import#section-2');
    capturePostImportHandoff();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    // A fragment it does not own is left exactly as it was.
    expect(window.location.hash).toBe('#section-2');
  });

  it('discards a corrupted payload rather than importing rubbish', async () => {
    const { capturePostImportHandoff, takePostImportHandoff } =
      await import('@/features/events/postImportHandoff');
    window.history.replaceState(null, '', '/admin?tab=post-import#import=not-valid-base64!!');
    capturePostImportHandoff();
    expect(takePostImportHandoff()).toBeNull();
  });
});
