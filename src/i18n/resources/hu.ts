/**
 * Hungarian is the SOURCE catalogue.
 *
 * Every string here is copied character-for-character from the component it was
 * extracted from, not rewritten. That is what makes the migration invisible to a
 * Hungarian visitor: the same words render, they just arrive through t().
 */
const hu = {
  common: {
    loading: 'Betöltés…',
    error: 'Hiba történt',
    retry: 'Újra',
    close: 'Bezárás',
    clear: 'Törlés',
    all: 'Mind',
    more: 'Továbbiak',
  },

  nav: {
    home: 'Főoldal',
    events: 'Események',
    hobbies: 'Hobbik',
    clubs: 'Klubok',
    about: 'Rólunk',
    join: 'Csatlakozz',
  },

  language: {
    label: 'Nyelv',
    choose: 'Nyelv választása',
  },

  country: {
    label: 'Ország',
    mapLabel: 'Melyik országot nézzük?',
    foreign: 'Külföldi programok',
    onlyHome: 'Csak {{country}}',
    multiHint: 'Több országot is kiválaszthatsz — a listához hozzáadódnak a hazai programok mellé.',
    names: {
      HU: 'Magyarország',
      AT: 'Ausztria',
      CZ: 'Csehország',
      DE: 'Németország',
      PL: 'Lengyelország',
      SI: 'Szlovénia',
      SK: 'Szlovákia',
    },
  },

  events: {
    locationSection: 'Helyszín',
    cityPlaceholder: 'Város vagy kerület — pl. Debrecen, XIII.',
    cityAria: 'Helyszín szerinti szűrés',
    clearCity: 'Helyszínszűrő törlése',
    searchPlaceholder: '…vagy keress konkrét név szerint',
    filterAll: 'Mind',
    filterPersonal: 'Nekem',
  },

  map: {
    kicker: 'Térképes kereső',
    backToCountry: 'Vissza az egész országra',
    placedCount: '{{count}} program a térképen',
    exactCount: '{{count}} pontos helyszínnel',
    unplacedCount: '{{count}} országos vagy helyszín nélküli',
    coverageNotice:
      '{{countries}} programjaiból {{placed}} került a térképre. A többihez még nincs '
      + 'városkoordinátánk — a listás nézetben mind ott vannak.',
    noPlacementNotice:
      'A térkép a kiválasztott országra ugrik, de {{countries}} programjaihoz még nincs '
      + 'térképi elhelyezés. A listás nézetben mind ott vannak.',
  },

  clubs: {
    countryLabel: 'Ország',
    noneInCountry: 'Ebben az országban még nincs klubunk.',
  },
} as const;

export type SourceBundle = typeof hu;
export default hu;
