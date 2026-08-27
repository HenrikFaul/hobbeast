import { describe, expect, it } from 'vitest';
import { parseSocialPost } from '@/features/events/socialPostParser';
import { readLine } from '@/features/events/socialPostFields';

/**
 * The advert that exposed how little the parser was actually reading.
 *
 * Imported through the extension it produced: title "Családoknak" (a bullet
 * from the list of who it suits), no venue, no town, no organiser. Everything
 * it needed was on the page — just labelled with emoji rather than words.
 */
const KIS_DUNA = [
  '🚤☀️ HÉTVÉGI VÍZI KALAND? IRÁNY RÁCKEVE! ☀️🚤',
  '',
  'Eleged van a zsúfolt strandokból és a hétköznapi programokból?',
  '🌍 Pattanj motorcsónakba, és fedezd fel a Kis-Duna varázslatos világát!',
  '',
  '👨‍👩‍👧 Családoknak',
  '❤️ Pároknak',
  '🎉 Baráti társaságoknak',
  '👴 Idősebbeknek',
  '😎 Kezdőknek',
  '',
  'Nálunk nincs szükség hajóvezetői engedélyre, csak egy kis kalandvágyra!',
  '',
  '📍 Ráckeve – Kis-Duna',
  '📞 +36 30 670 77 17',
  '🌐 www.kisdunahajokolcsonzo.hu',
].join('\n');

describe('emoji labels', () => {
  it('reads a pin as a venue label', () => {
    const read = readLine('📍 Ráckeve – Kis-Duna');
    expect(read.field).toBe('venue');
    expect(read.value).toBe('Ráckeve – Kis-Duna');
  });

  it('reads a phone and a globe', () => {
    expect(readLine('📞 +36 30 670 77 17').field).toBe('phone');
    expect(readLine('🌐 www.kisdunahajokolcsonzo.hu').field).toBe('url');
  });

  it('lets a word label beat the emoji decorating it', () => {
    // Decorated with a pin, but it is plainly about the time.
    const read = readLine('📍 Időpont: 2026.09.12. 18:00');
    expect(read.field).toBe('date');
    expect(read.value).toBe('2026.09.12. 18:00');
  });

  it('does not mistake prose for a label', () => {
    expect(readLine('A helyszínen tudsz fizetni kártyával is.').field).toBeNull();
  });
});

describe('the Kis-Duna advert', () => {
  const draft = parseSocialPost(KIS_DUNA);

  it('takes the headline as the title, not a bullet from the list', () => {
    expect(draft.title).toContain('HÉTVÉGI VÍZI KALAND');
    expect(draft.title).not.toBe('Családoknak');
  });

  it('now finds the venue the pin marked', () => {
    expect(draft.venue).toBe('Ráckeve – Kis-Duna');
  });

  it('finds the town inside that venue line', () => {
    expect(draft.city).toBe('Ráckeve');
  });

  it('finds the phone number and the website', () => {
    expect(draft.phone).toContain('+36 30 670 77 17');
    expect(draft.url).toBe('https://www.kisdunahajokolcsonzo.hu');
  });

  it('still refuses to invent a date it was never given', () => {
    expect(draft.eventDate).toBeFalsy();
    expect(draft.warnings.join(' ')).toContain('dátum');
  });
});

describe('a fully labelled post', () => {
  const draft = parseSocialPost([
    '🎨 Kreatív kerámia workshop kezdőknek',
    '📅 Időpont: 2026.09.12. 18:00–20:30',
    '📍 Helyszín: Apacuka Ceramics',
    '🏠 Cím: 1075 Budapest, Kazinczy utca 12.',
    '👤 Szervező: Apacuka Stúdió',
    '💰 Részvételi díj: 12000 Ft',
    '✉️ jelentkezes@apacuka.hu',
    '🌐 https://apacukaceramics.hu/workshopok',
  ].join('\n'));

  it('reads every labelled field', () => {
    expect(draft.title).toContain('kerámia workshop');
    expect(draft.eventDate).toBe('2026-09-12');
    expect(draft.eventTime).toBe('18:00');
    expect(draft.endTime).toBe('20:30');
    expect(draft.venue).toBe('Apacuka Ceramics');
    expect(draft.city).toBe('Budapest');
    expect(draft.address).toContain('Kazinczy utca');
    expect(draft.organizer).toBe('Apacuka Stúdió');
    expect(draft.priceText).toContain('12000');
    expect(draft.email).toBe('jelentkezes@apacuka.hu');
    expect(draft.url).toBe('https://apacukaceramics.hu/workshopok');
    expect(draft.isFree).toBe(false);
  });

  it('leaves no warning when the post said everything', () => {
    expect(draft.warnings).toEqual([]);
  });
});

describe('a phone number is not a date', () => {
  it('does not read +36 30 670 77 17 as a time', () => {
    const draft = parseSocialPost([
      'Nyitott műhely',
      '📅 Időpont: 2026.10.03. 17:00',
      '📞 +36 30 670 77 17',
    ].join('\n'));
    expect(draft.eventTime).toBe('17:00');
    expect(draft.eventDate).toBe('2026-10-03');
  });
});
