import { describe, expect, it } from 'vitest';
import { normalizeUrl, parseClubRows, SPORT_SLUGS } from '../../../scripts/harvest-sport-clubs.mjs';

/**
 * The club finder's markup, reduced to the shape the parser actually depends
 * on: one `klub_tabla` row per club, four positional columns (name, postal
 * code, city, links). Taken from the live page for /klubkereso/evezes/.
 */
function row(name: string, postalCode: string, city: string, links = '') {
  return `<div class="vc_row wpb_row vc_row-fluid vc_column-gap-10 klub_tabla" >`
    + `<div class="wpb_column vc_column_container vc_col-sm-3"><div class="vc_column-inner"><div class="wpb_wrapper"><div class="wpb_text_column"><div class="wpb_wrapper">${name}</div></div></div></div></div>`
    + `<div class="wpb_column vc_column_container vc_col-sm-3"><div class="vc_column-inner"><div class="wpb_wrapper"><div class="wpb_text_column"><div class="wpb_wrapper">${postalCode}</div></div></div></div></div>`
    + `<div class="wpb_column vc_column_container vc_col-sm-3"><div class="vc_column-inner"><div class="wpb_wrapper"><div class="wpb_text_column"><div class="wpb_wrapper">${city}</div></div></div></div></div>`
    + `<div class="wpb_column vc_column_container vc_col-sm-3 center"><div class="vc_column-inner"><div class="wpb_wrapper">${links}</div></div></div>`
    + `</div>`;
}

describe('normalizeUrl', () => {
  /**
   * The directory writes some links without a scheme. The first such row
   * ("www.facebook.com/CowbellsFootball") failed the URL check constraint and
   * took a whole 200-club ingest batch down with it.
   */
  it('adds the missing scheme to a bare host', () => {
    expect(normalizeUrl('www.facebook.com/CowbellsFootball'))
      .toBe('https://www.facebook.com/CowbellsFootball');
    expect(normalizeUrl('evezz.hu')).toBe('https://evezz.hu/');
  });

  it('keeps an absolute URL as it is', () => {
    expect(normalizeUrl('https://cowbells.hu/')).toBe('https://cowbells.hu/');
  });

  it('drops what is not a link', () => {
    for (const value of ['', '   ', '#', '#content', 'mailto:a@b.hu', 'tel:+3612345678', 'javascript:void(0)', 'nonsense']) {
      expect(normalizeUrl(value)).toBeNull();
    }
  });
});

describe('parseClubRows', () => {
  const html = [
    row('Acélöntő Sportkör', '1139', 'Budapest'),
    row('Budapest Evezős Egyesület', '1138', 'Budapest',
      '<a href="https://www.facebook.com/evezz.hu/">fb</a><a href="https://evezz.hu">web</a>'),
    row('Vác Városi Evezős Club', '2600', 'Vác', '<a href="www.evezosclub.hu">web</a>'),
  ].join('\n');

  const clubs = parseClubRows(html, 'Evezés', 'https://sportagvalaszto.hu/klubkereso/evezes/');

  it('reads one club per row', () => {
    expect(clubs).toHaveLength(3);
    expect(clubs.map((club) => club.name)).toEqual([
      'Acélöntő Sportkör', 'Budapest Evezős Egyesület', 'Vác Városi Evezős Club',
    ]);
  });

  it('reads the postal code and city from their own columns', () => {
    expect(clubs[2]).toMatchObject({ postal_code: '2600', city: 'Vác', topic: 'Evezés' });
  });

  it('separates the website from the Facebook page', () => {
    expect(clubs[1].facebook_url).toBe('https://www.facebook.com/evezz.hu/');
    expect(clubs[1].website_url).toBe('https://evezz.hu/');
  });

  it('normalises a scheme-less website', () => {
    expect(clubs[2].website_url).toBe('https://www.evezosclub.hu/');
  });

  it('records nothing it was not given', () => {
    expect(clubs[0].website_url).toBeNull();
    expect(clubs[0].facebook_url).toBeNull();
  });

  it('carries the source page so a club can be traced back', () => {
    expect(clubs[0].source_url).toBe('https://sportagvalaszto.hu/klubkereso/evezes/');
  });
});

describe('SPORT_SLUGS', () => {
  it('covers the club finder without duplicate slugs', () => {
    const slugs = Object.keys(SPORT_SLUGS);
    expect(slugs.length).toBeGreaterThan(45);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(SPORT_SLUGS.evezes).toBe('Evezés');
    expect(SPORT_SLUGS['wt-taekwondo']).toBe('Taekwondo');
  });
});

describe('community club names', () => {
  /**
   * Community clubs have no registry, so the harvester keeps the links whose
   * text names a club. The pattern is the whole filter, which makes these the
   * cases that matter.
   */
  it('accepts the names a cultural centre actually uses', async () => {
    const { looksLikeClubName } = await import('../../../scripts/lib/communityClubs.mjs');
    for (const name of [
      '„Őszikék” Nyugdíjas Klub',
      'Nevkó Baba-Mama Klub',
      'Hunyor Foltvarró Kör',
      'Apáczai Sakk Klub',
      'Társasjáték Klub',
      'Szivárvány Fotóklub',
      'Baranya Bokréta Népdalkör',
      'Pécsi Origami Kör',
      'KCSE IFI KLUB',
    ]) {
      expect(looksLikeClubName(name), name).toBe(true);
    }
  });

  it('rejects page furniture and bare category words', async () => {
    const { looksLikeClubName } = await import('../../../scripts/lib/communityClubs.mjs');
    for (const name of [
      'Klub', 'Klubjaink', 'Közösségeink', 'Csoportjaink',
      'Tovább', 'Kapcsolat', 'Adatvédelmi tájékoztató',
      'A klubunk minden kedden este várja az érdeklődőket a nagyteremben.',
      '',
    ]) {
      expect(looksLikeClubName(name), name).toBe(false);
    }
  });

  it('needs a club word, not just a proper noun', async () => {
    const { looksLikeClubName } = await import('../../../scripts/lib/communityClubs.mjs');
    expect(looksLikeClubName('Nyári tábor')).toBe(false);
    expect(looksLikeClubName('Jazz koncert')).toBe(false);
  });

  it('extracts clubs from links and headings, without duplicates', async () => {
    const { extractCommunityClubs } = await import('../../../scripts/lib/communityClubs.mjs');
    const html = `
      <a href="/klub/sakk">Apáczai Sakk Klub</a>
      <h3>Nevkó Baba-Mama Klub</h3>
      <a href="/klub/sakk">Apáczai Sakk Klub</a>
      <a href="/tovabb">Tovább</a>
    `;
    const clubs = extractCommunityClubs(html, { sourceUrl: 'https://x.hu/klubjaink/', city: 'Pécs' });
    expect(clubs.map((club) => club.name)).toEqual(['Apáczai Sakk Klub', 'Nevkó Baba-Mama Klub']);
    expect(clubs[0].website_url).toBe('https://x.hu/klub/sakk');
    expect(clubs[0].city).toBe('Pécs');
    expect(clubs[0].club_type).toBe('community_club');
  });
});
