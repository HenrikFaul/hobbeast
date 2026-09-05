// Polski pakiet. Brakujące klucze wracają do węgierskiego.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const pl = {
  common: {
    loading: 'Ładowanie…',
    error: 'Wystąpił błąd',
    retry: 'Spróbuj ponownie',
    close: 'Zamknij',
    clear: 'Wyczyść',
    all: 'Wszystkie',
    more: 'Więcej',
  },

  nav: {
    home: 'Strona główna',
    events: 'Wydarzenia',
    hobbies: 'Hobby',
    clubs: 'Kluby',
    about: 'O nas',
    join: 'Dołącz',
  },

  language: {
    label: 'Język',
    choose: 'Wybierz język',
  },

  country: {
    label: 'Kraj',
    mapLabel: 'Który kraj oglądamy?',
    foreign: 'Wydarzenia za granicą',
    onlyHome: 'Tylko {{country}}',
    multiHint: 'Możesz wybrać kilka krajów — dodadzą się do wydarzeń krajowych.',
    names: {
      HU: 'Węgry',
      AT: 'Austria',
      CZ: 'Czechy',
      DE: 'Niemcy',
      PL: 'Polska',
      SI: 'Słowenia',
      SK: 'Słowacja',
    },
  },

  events: {
    locationSection: 'Miejsce',
    cityPlaceholder: 'Miasto lub dzielnica — np. Debreczyn, XIII.',
    cityAria: 'Filtruj według miejsca',
    clearCity: 'Wyczyść filtr miejsca',
    searchPlaceholder: '…albo szukaj po nazwie',
    filterAll: 'Wszystkie',
    filterPersonal: 'Dla mnie',
  },

  map: {
    kicker: 'Wyszukiwanie na mapie',
    backToCountry: 'Powrót do całego kraju',
    placedCount: '{{count}} wydarzeń na mapie',
    exactCount: '{{count}} z dokładnym miejscem',
    unplacedCount: '{{count}} ogólnokrajowych lub bez miejsca',
    coverageNotice: 'Spośród wydarzeń w {{countries}} na mapie jest {{placed}}. Dla pozostałych nie mamy jeszcze współrzędnych miast — na liście są wszystkie.',
    noPlacementNotice: 'Mapa przeskakuje do wybranego kraju, ale wydarzenia w {{countries}} nie mają jeszcze umiejscowienia na mapie. Na liście są wszystkie.',
  },

  clubs: {
    countryLabel: 'Kraj',
    noneInCountry: 'W tym kraju nie mamy jeszcze klubów.',
  },
} as const;

export default pl;
