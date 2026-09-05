// Slovenský balík. Chýbajúce kľúče sa vracajú k maďarčine.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const sk = {
  common: {
    loading: 'Načítava sa…',
    error: 'Vyskytla sa chyba',
    retry: 'Skúsiť znova',
    close: 'Zavrieť',
    clear: 'Vymazať',
    all: 'Všetky',
    more: 'Ďalšie',
  },

  nav: {
    home: 'Domov',
    events: 'Podujatia',
    hobbies: 'Záľuby',
    clubs: 'Kluby',
    about: 'O nás',
    join: 'Pridaj sa',
  },

  language: {
    label: 'Jazyk',
    choose: 'Vybrať jazyk',
  },

  country: {
    label: 'Krajina',
    mapLabel: 'Ktorú krajinu si pozeráme?',
    foreign: 'Podujatia v zahraničí',
    onlyHome: 'Iba {{country}}',
    multiHint: 'Môžeš vybrať viac krajín — pridajú sa k domácim podujatiam.',
    names: {
      HU: 'Maďarsko',
      AT: 'Rakúsko',
      CZ: 'Česko',
      DE: 'Nemecko',
      PL: 'Poľsko',
      SI: 'Slovinsko',
      SK: 'Slovensko',
    },
  },

  events: {
    locationSection: 'Miesto',
    cityPlaceholder: 'Mesto alebo mestská časť — napr. Debrecín, XIII.',
    cityAria: 'Filtrovať podľa miesta',
    clearCity: 'Zrušiť filter miesta',
    searchPlaceholder: '…alebo hľadaj podľa názvu',
    filterAll: 'Všetky',
    filterPersonal: 'Pre mňa',
  },

  map: {
    kicker: 'Vyhľadávanie na mape',
    backToCountry: 'Späť na celú krajinu',
    placedCount: '{{count}} podujatí na mape',
    exactCount: '{{count}} s presným miestom',
    unplacedCount: '{{count}} celoštátnych alebo bez miesta',
    coverageNotice: 'Z podujatí v {{countries}} je na mape {{placed}}. Pre ostatné zatiaľ nemáme súradnice miest — v zozname sú všetky.',
    noPlacementNotice: 'Mapa skočí na vybranú krajinu, ale podujatia v {{countries}} zatiaľ nemajú umiestnenie na mape. V zozname sú všetky.',
  },

  clubs: {
    countryLabel: 'Krajina',
    noneInCountry: 'V tejto krajine zatiaľ nemáme kluby.',
  },
} as const;

export default sk;
