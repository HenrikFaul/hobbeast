// Deutsches Bundle. Fehlende Schlüssel fallen auf Ungarisch zurück.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const de = {
  common: {
    loading: 'Wird geladen…',
    error: 'Ein Fehler ist aufgetreten',
    retry: 'Erneut versuchen',
    close: 'Schließen',
    clear: 'Zurücksetzen',
    all: 'Alle',
    more: 'Mehr',
  },

  nav: {
    home: 'Startseite',
    events: 'Veranstaltungen',
    hobbies: 'Hobbys',
    clubs: 'Klubs',
    about: 'Über uns',
    join: 'Mitmachen',
  },

  language: {
    label: 'Sprache',
    choose: 'Sprache wählen',
  },

  country: {
    label: 'Land',
    mapLabel: 'Welches Land sehen wir uns an?',
    foreign: 'Veranstaltungen im Ausland',
    onlyHome: 'Nur {{country}}',
    multiHint: 'Du kannst mehrere Länder auswählen — sie kommen zu den Veranstaltungen im Inland hinzu.',
    names: {
      HU: 'Ungarn',
      AT: 'Österreich',
      CZ: 'Tschechien',
      DE: 'Deutschland',
      PL: 'Polen',
      SI: 'Slowenien',
      SK: 'Slowakei',
    },
  },

  events: {
    locationSection: 'Ort',
    cityPlaceholder: 'Stadt oder Bezirk — z. B. Debrecen, XIII.',
    cityAria: 'Nach Ort filtern',
    clearCity: 'Ortsfilter löschen',
    searchPlaceholder: '…oder nach Namen suchen',
    filterAll: 'Alle',
    filterPersonal: 'Für mich',
  },

  map: {
    kicker: 'Kartensuche',
    backToCountry: 'Zurück zum ganzen Land',
    placedCount: '{{count}} Veranstaltungen auf der Karte',
    exactCount: '{{count}} mit genauem Veranstaltungsort',
    unplacedCount: '{{count}} landesweit oder ohne Ort',
    coverageNotice: 'Von den Veranstaltungen in {{countries}} sind {{placed}} auf der Karte. Für die übrigen haben wir noch keine Stadtkoordinaten — in der Listenansicht sind sie alle vorhanden.',
    noPlacementNotice: 'Die Karte springt zum ausgewählten Land, aber die Veranstaltungen in {{countries}} haben noch keine Kartenposition. In der Listenansicht sind sie alle vorhanden.',
  },

  clubs: {
    countryLabel: 'Land',
    noneInCountry: 'In diesem Land haben wir noch keine Klubs.',
  },
} as const;

export default de;
