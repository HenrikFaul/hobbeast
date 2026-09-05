// Slovenski paket. Manjkajoči ključi se vrnejo na madžarščino.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const sl = {
  common: {
    loading: 'Nalaganje…',
    error: 'Prišlo je do napake',
    retry: 'Poskusi znova',
    close: 'Zapri',
    clear: 'Počisti',
    all: 'Vse',
    more: 'Več',
  },

  nav: {
    home: 'Domov',
    events: 'Dogodki',
    hobbies: 'Hobiji',
    clubs: 'Klubi',
    about: 'O nas',
    join: 'Pridruži se',
  },

  language: {
    label: 'Jezik',
    choose: 'Izberi jezik',
  },

  country: {
    label: 'Država',
    mapLabel: 'Katero državo gledamo?',
    foreign: 'Dogodki v tujini',
    onlyHome: 'Samo {{country}}',
    multiHint: 'Izbereš lahko več držav — dodale se bodo domačim dogodkom.',
    names: {
      HU: 'Madžarska',
      AT: 'Avstrija',
      CZ: 'Češka',
      DE: 'Nemčija',
      PL: 'Poljska',
      SI: 'Slovenija',
      SK: 'Slovaška',
    },
  },

  events: {
    locationSection: 'Kraj',
    cityPlaceholder: 'Mesto ali okrožje — npr. Debrecen, XIII.',
    cityAria: 'Filtriraj po kraju',
    clearCity: 'Počisti filter kraja',
    searchPlaceholder: '…ali išči po imenu',
    filterAll: 'Vse',
    filterPersonal: 'Zame',
  },

  map: {
    kicker: 'Iskanje na zemljevidu',
    backToCountry: 'Nazaj na celotno državo',
    placedCount: '{{count}} dogodkov na zemljevidu',
    exactCount: '{{count}} z natančnim prizoriščem',
    unplacedCount: '{{count}} vsedržavnih ali brez prizorišča',
    coverageNotice: 'Od dogodkov v {{countries}} je na zemljevidu {{placed}}. Za ostale še nimamo koordinat mest — v seznamu so vsi.',
    noPlacementNotice: 'Zemljevid skoči na izbrano državo, vendar dogodki v {{countries}} še nimajo umestitve na zemljevid. V seznamu so vsi.',
  },

  clubs: {
    countryLabel: 'Država',
    noneInCountry: 'V tej državi še nimamo klubov.',
  },
} as const;

export default sl;
