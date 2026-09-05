// Český balíček. Chybějící klíče se vrací k maďarštině.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const cs = {
  common: {
    loading: 'Načítání…',
    error: 'Došlo k chybě',
    retry: 'Zkusit znovu',
    close: 'Zavřít',
    clear: 'Vymazat',
    all: 'Vše',
    more: 'Další',
  },

  nav: {
    home: 'Domů',
    events: 'Akce',
    hobbies: 'Koníčky',
    clubs: 'Kluby',
    about: 'O nás',
    join: 'Přidat se',
  },

  language: {
    label: 'Jazyk',
    choose: 'Vybrat jazyk',
  },

  country: {
    label: 'Země',
    mapLabel: 'Kterou zemi si prohlížíme?',
    foreign: 'Akce v zahraničí',
    onlyHome: 'Pouze {{country}}',
    multiHint: 'Můžeš vybrat několik zemí — přidají se k domácím akcím.',
    names: {
      HU: 'Maďarsko',
      AT: 'Rakousko',
      CZ: 'Česko',
      DE: 'Německo',
      PL: 'Polsko',
      SI: 'Slovinsko',
      SK: 'Slovensko',
    },
  },

  events: {
    locationSection: 'Místo',
    cityPlaceholder: 'Město nebo čtvrť — např. Debrecín, XIII.',
    cityAria: 'Filtrovat podle místa',
    clearCity: 'Zrušit filtr místa',
    searchPlaceholder: '…nebo hledej podle názvu',
    filterAll: 'Vše',
    filterPersonal: 'Pro mě',
  },

  map: {
    kicker: 'Vyhledávání na mapě',
    backToCountry: 'Zpět na celou zemi',
    placedCount: '{{count}} akcí na mapě',
    exactCount: '{{count}} s přesným místem',
    unplacedCount: '{{count}} celostátních nebo bez místa',
    coverageNotice: 'Z akcí v {{countries}} je na mapě {{placed}}. Pro zbytek zatím nemáme souřadnice měst — v seznamu jsou všechny.',
    noPlacementNotice: 'Mapa přeskočí na vybranou zemi, ale akce v {{countries}} zatím nemají umístění na mapě. V seznamu jsou všechny.',
  },

  clubs: {
    countryLabel: 'Země',
    noneInCountry: 'V této zemi zatím nemáme žádné kluby.',
  },
} as const;

export default cs;
