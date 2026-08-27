import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSocialPost } from '@/features/events/socialPostParser';

/**
 * The extension reads Facebook POSTS as well as events, using this same
 * parser — the file under browser-extension/ is transpiled from it, so these
 * two must not drift apart.
 *
 * The post below is a real one an operator tried to import: an advert for a
 * boat rental with no date at all. It is the honest hard case, and what it
 * proves is that the parser does not INVENT a date — the extension shows the
 * operator "no date found" instead of filing a fictional programme.
 */
const KIS_DUNA_POST = [
  '🚤☀️ HÉTVÉGI VÍZI KALAND? IRÁNY RÁCKEVE! ☀️🚤',
  '',
  'Eleged van a zsúfolt strandokból és a hétköznapi programokból?',
  '🌍 Pattanj motorcsónakba, és fedezd fel a Kis-Duna varázslatos világát!',
  '',
  '👨‍👩‍👧 Családoknak',
  '❤️ Pároknak',
  '🎉 Baráti társaságoknak',
  '',
  'Nálunk nincs szükség hajóvezetői engedélyre, csak egy kis kalandvágyra!',
  '',
  '📍 Ráckeve – Kis-Duna',
  '📞 +36 30 670 77 17',
  '🌐 www.kisdunahajokolcsonzo.hu',
].join('\n');

const DATED_POST = [
  '🎨 Kreatív kerámia workshop kezdőknek!',
  '📅 Időpont: 2026.09.12. 18:00',
  '📍 Helyszín: Apacuka Ceramics, Budapest',
  '💰 Részvételi díj: 12000 Ft',
  'Jelentkezés: https://apacukaceramics.hu/workshopok',
].join('\n');

describe('extension post draft', () => {
  it('does not invent a date for an advert that has none', () => {
    const draft = parseSocialPost(KIS_DUNA_POST);
    // No date means the popup shows "Dátumot nem találtam — add meg kézzel."
    // and the required date field stays empty, so the form cannot be submitted
    // by accident.
    expect(draft.eventDate).toBeFalsy();
  });

  it('still recovers the place and the link from that advert', () => {
    const draft = parseSocialPost(KIS_DUNA_POST);
    expect(`${draft.city} ${draft.venue} ${draft.description}`).toContain('Ráckeve');
    expect(draft.description).toContain('kisdunahajokolcsonzo.hu');
  });

  it('reads a real dated post into a fileable draft', () => {
    const draft = parseSocialPost(DATED_POST);
    expect(draft.eventDate).toBe('2026-09-12');
    expect(draft.eventTime).toBe('18:00');
    expect(draft.venue).toContain('Apacuka');
  });

  it('ships the same parser to the extension, not a copy that can drift', () => {
    const generated = readFileSync(
      'browser-extension/hobbeast-importer/vendor/socialPostParser.js',
      'utf8',
    );
    expect(generated).toContain('GENERATED from src/features/events/socialPostParser.ts');
    expect(generated).toContain('export {');
  });
});
