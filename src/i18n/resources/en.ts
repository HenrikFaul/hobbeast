// English bundle. Falls back to Hungarian for any key missing here.
// Structure mirrors resources/hu.ts, which is the source of truth for the keys.

const en = {
  common: {
    loading: 'Loading…',
    error: 'Something went wrong',
    retry: 'Try again',
    close: 'Close',
    clear: 'Clear',
    all: 'All',
    more: 'More',
  },

  nav: {
    home: 'Home',
    events: 'Events',
    hobbies: 'Hobbies',
    clubs: 'Clubs',
    about: 'About',
    join: 'Join',
  },

  language: {
    label: 'Language',
    choose: 'Choose language',
  },

  country: {
    label: 'Country',
    mapLabel: 'Which country are we looking at?',
    foreign: 'Programmes abroad',
    onlyHome: 'Only {{country}}',
    multiHint: 'You can pick several countries — they are added to the programmes at home.',
    names: {
      HU: 'Hungary',
      AT: 'Austria',
      CZ: 'Czechia',
      DE: 'Germany',
      PL: 'Poland',
      SI: 'Slovenia',
      SK: 'Slovakia',
    },
  },

  events: {
    locationSection: 'Location',
    cityPlaceholder: 'City or district — e.g. Debrecen, XIII.',
    cityAria: 'Filter by location',
    clearCity: 'Clear location filter',
    searchPlaceholder: '…or search by name',
    filterAll: 'All',
    filterPersonal: 'For me',
  },

  map: {
    kicker: 'Map search',
    backToCountry: 'Back to the whole country',
    placedCount: '{{count}} programmes on the map',
    exactCount: '{{count}} with an exact venue',
    unplacedCount: '{{count}} nationwide or without a venue',
    coverageNotice: '{{placed}} of the programmes in {{countries}} are on the map. We do not have city coordinates for the rest yet — all of them are in the list view.',
    noPlacementNotice: 'The map jumps to the selected country, but the programmes in {{countries}} have no map placement yet. All of them are in the list view.',
  },

  clubs: {
    countryLabel: 'Country',
    noneInCountry: 'We have no clubs in this country yet.',
  },
} as const;

export default en;
