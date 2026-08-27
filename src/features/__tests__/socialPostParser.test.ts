import { describe, expect, it } from 'vitest';
import { parseSocialPost } from '@/features/events/socialPostParser';

/**
 * Every post below is a real one, pasted as the reader sees it — emoji,
 * bullets and marketing copy included. If the parser handles these it handles
 * the shape of Hungarian venue posts; if it stops handling one of them, that
 * is a regression somebody will notice.
 */
const TODAY = new Date('2026-08-27T09:00:00Z');

describe('parseSocialPost', () => {
  it('reads a sauna evening with a labelled date, time range and venue', () => {
    const draft = parseSocialPost([
      '🇮🇹🍋 Irány Olaszország!',
      'Készülj egy felejthetetlen estére, ahol a mediterrán aromák találkoznak!',
      '📅 Időpont: 2026.08.30. 18:00–20:30',
      '📍 Helyszín: Chill Island Club',
      '🧖 Szaunamester: Varga Zsolt',
      '🎟 A belépő ára tartalmazza a frissítőket.',
      'Info & bejelentkezés: chillislandclub.hu',
    ].join('\n'), TODAY);

    expect(draft.eventDate).toBe('2026-08-30');
    expect(draft.eventTime).toBe('18:00');
    expect(draft.endTime).toBe('20:30');
    expect(draft.venue).toBe('Chill Island Club');
    expect(draft.registrationRequired).toBe(true);
  });

  it('reads a quiz night written as "2026. szeptember 4., 19:00"', () => {
    const draft = parseSocialPost([
      '🌿🧠 ÁLTALÁNOS KVÍZ A KOPASZI KERTBEN',
      '📅 Időpont: 2026. szeptember 4., 19:00',
      '📍 Helyszín: Kopaszi Kert',
      '🎫 Részvétel: Ingyenes, de regisztrációhoz kötött',
      '🔗 Regisztráció: foglalas.kvizestek.hu/kopaszi-kert',
    ].join('\n'), TODAY);

    expect(draft.eventDate).toBe('2026-09-04');
    expect(draft.eventTime).toBe('19:00');
    expect(draft.venue).toBe('Kopaszi Kert');
    expect(draft.isFree).toBe(true);
    expect(draft.registrationRequired).toBe(true);
  });

  it('reads a date written without a year and puts it in the future', () => {
    const draft = parseSocialPost([
      'Először érkezik kvízest a Hard Rock Cafe Budapestbe!',
      'Szeptember 16-án gyűjtsd össze a csapatodat!',
      '👥 2-6 fős csapatok',
      '🗓 Szeptember 16. 19:00',
      '📍 Hard Rock Cafe Budapest',
    ].join('\n'), TODAY);

    expect(draft.eventDate).toBe('2026-09-16');
    expect(draft.eventTime).toBe('19:00');
    expect(draft.city).toBe('Budapest');
  });

  it('reads a multi-day festival as a range', () => {
    const draft = parseSocialPost([
      '10. Belvárosi Sörfesztivál',
      '2026. szeptember 1-6.',
      'Budapest, Szabadság tér',
      'Ingyenes',
    ].join('\n'), TODAY);

    expect(draft.eventDate).toBe('2026-09-01');
    expect(draft.endDate).toBe('2026-09-06');
    expect(draft.isFree).toBe(true);
    expect(draft.city).toBe('Budapest');
  });

  /**
   * "Péntekenként 15:00–17:30" is a club meeting every week, not one evening.
   * Saying so is more useful than inventing a single date for it.
   */
  it('flags a weekly series rather than pretending it is one evening', () => {
    const draft = parseSocialPost([
      'JÁTÉKBÓL SZÍNHÁZ, VELED!',
      'A Divine Comedy Színházi Műhely ifjúsági színjátszó csoportjába várunk 12–16 éves fiatalokat.',
      '📅 Indulás: október 2.',
      '⏰ Péntekenként 15:00–17:30',
      '📍 Hely-Szín-Hub – Bp. VII. kerület, Murányi u. 61., szuterén',
      '💰 Részvételi díj: 25000Ft/hó',
    ].join('\n'), TODAY);

    expect(draft.recurring).toBe(true);
    expect(draft.warnings.some((warning) => /klubk[eé]nt/.test(warning))).toBe(true);
    expect(draft.priceText).toBe('25000Ft/hó');
    expect(draft.isFree).toBe(false);
  });

  it('picks the link and the phone number out of the body', () => {
    const draft = parseSocialPost([
      '🚤 HÉTVÉGI VÍZI KALAND? IRÁNY RÁCKEVE!',
      'Nálunk nincs szükség hajóvezetői engedélyre, csak egy kis kalandvágyra!',
      '📍 Ráckeve – Kis-Duna',
      '📞 +36 30 670 77 17',
      '🌐 www.kisdunahajokolcsonzo.hu',
    ].join('\n'), TODAY);

    expect(draft.url).toBe('https://www.kisdunahajokolcsonzo.hu');
    expect(draft.phone).toContain('+36 30 670 77 17');
    expect(draft.city).toBe('Ráckeve');
  });

  it('reads a full postal address', () => {
    const draft = parseSocialPost([
      'Mozdulj velünk szeptemberben!',
      '📅 A program a szeptember 7-i héten vár.',
      '📍 Gazdagrét – Csíkihegyek Általános Iskola',
      '1118 Budapest, Csíki-hegyek u. 13–15.',
      'A részvétel ingyenes, de előzetes regisztráció szükséges!',
    ].join('\n'), TODAY);

    expect(draft.address).toContain('1118 Budapest');
    expect(draft.city).toBe('Budapest');
    expect(draft.isFree).toBe(true);
  });

  it('takes the name from a heading, not from a question', () => {
    const draft = parseSocialPost([
      'Te is várod már, hogy újra megteljen sörrel a fesztiválpoharad?',
      '10. Belvárosi Sörfesztivál',
      'Kövesd az eseményt a friss infókért!',
    ].join('\n'), TODAY);

    expect(draft.title).toBe('10. Belvárosi Sörfesztivál');
  });

  it('says what is missing instead of guessing', () => {
    const draft = parseSocialPost('Jó buli lesz, gyertek sokan!', TODAY);
    expect(draft.eventDate).toBeNull();
    expect(draft.warnings).toContain('Nem találtam dátumot — add meg kézzel.');
    expect(draft.warnings).toContain('Nem találtam helyszínt.');
  });

  it('does not read a year as a clock', () => {
    const draft = parseSocialPost('Süllő Fesztivál 2026. szeptember 11–13.', TODAY);
    expect(draft.eventTime).toBeNull();
    expect(draft.eventDate).toBe('2026-09-11');
    expect(draft.endDate).toBe('2026-09-13');
  });
});
