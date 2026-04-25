import type { CountryBounds, ProviderCategory } from './types.ts';

export const PROVIDERS = ['geoapify', 'tomtom'] as const;

// European country bounding boxes (degrees).
// We sweep these with a tile grid in the worker.
export const EUROPEAN_COUNTRIES: CountryBounds[] = [
  { code: 'AT', label: 'Ausztria', minLat: 46.37, maxLat: 49.02, minLon: 9.53, maxLon: 17.16 },
  { code: 'BE', label: 'Belgium', minLat: 49.49, maxLat: 51.51, minLon: 2.54, maxLon: 6.40 },
  { code: 'BG', label: 'Bulgária', minLat: 41.24, maxLat: 44.22, minLon: 22.36, maxLon: 28.61 },
  { code: 'CH', label: 'Svájc', minLat: 45.82, maxLat: 47.81, minLon: 5.95, maxLon: 10.49 },
  { code: 'CY', label: 'Ciprus', minLat: 34.57, maxLat: 35.70, minLon: 32.27, maxLon: 34.60 },
  { code: 'CZ', label: 'Csehország', minLat: 48.55, maxLat: 51.06, minLon: 12.09, maxLon: 18.87 },
  { code: 'DE', label: 'Németország', minLat: 47.27, maxLat: 55.06, minLon: 5.87, maxLon: 15.04 },
  { code: 'DK', label: 'Dánia', minLat: 54.56, maxLat: 57.75, minLon: 8.08, maxLon: 12.69 },
  { code: 'EE', label: 'Észtország', minLat: 57.52, maxLat: 59.67, minLon: 21.38, maxLon: 28.21 },
  { code: 'ES', label: 'Spanyolország', minLat: 36.00, maxLat: 43.79, minLon: -9.39, maxLon: 3.32 },
  { code: 'FI', label: 'Finnország', minLat: 59.45, maxLat: 70.09, minLon: 20.56, maxLon: 31.59 },
  { code: 'FR', label: 'Franciaország', minLat: 41.33, maxLat: 51.12, minLon: -5.14, maxLon: 9.56 },
  { code: 'GB', label: 'Egyesült Királyság', minLat: 49.96, maxLat: 58.64, minLon: -8.62, maxLon: 1.77 },
  { code: 'GR', label: 'Görögország', minLat: 34.80, maxLat: 41.75, minLon: 19.37, maxLon: 28.25 },
  { code: 'HR', label: 'Horvátország', minLat: 42.39, maxLat: 46.56, minLon: 13.49, maxLon: 19.45 },
  { code: 'HU', label: 'Magyarország', minLat: 45.74, maxLat: 48.59, minLon: 16.11, maxLon: 22.90 },
  { code: 'IE', label: 'Írország', minLat: 51.42, maxLat: 55.43, minLon: -10.48, maxLon: -6.03 },
  { code: 'IS', label: 'Izland', minLat: 63.30, maxLat: 66.56, minLon: -24.53, maxLon: -13.50 },
  { code: 'IT', label: 'Olaszország', minLat: 36.62, maxLat: 47.09, minLon: 6.63, maxLon: 18.52 },
  { code: 'LI', label: 'Liechtenstein', minLat: 47.05, maxLat: 47.27, minLon: 9.47, maxLon: 9.64 },
  { code: 'LT', label: 'Litvánia', minLat: 53.89, maxLat: 56.45, minLon: 20.94, maxLon: 26.84 },
  { code: 'LU', label: 'Luxemburg', minLat: 49.45, maxLat: 50.18, minLon: 5.73, maxLon: 6.53 },
  { code: 'LV', label: 'Lettország', minLat: 55.67, maxLat: 58.08, minLon: 20.97, maxLon: 28.24 },
  { code: 'MT', label: 'Málta', minLat: 35.80, maxLat: 36.08, minLon: 14.18, maxLon: 14.58 },
  { code: 'NL', label: 'Hollandia', minLat: 50.75, maxLat: 53.56, minLon: 3.36, maxLon: 7.23 },
  { code: 'NO', label: 'Norvégia', minLat: 57.95, maxLat: 71.19, minLon: 4.65, maxLon: 31.08 },
  { code: 'PL', label: 'Lengyelország', minLat: 49.00, maxLat: 54.84, minLon: 14.12, maxLon: 24.15 },
  { code: 'PT', label: 'Portugália', minLat: 36.96, maxLat: 42.15, minLon: -9.53, maxLon: -6.19 },
  { code: 'RO', label: 'Románia', minLat: 43.61, maxLat: 48.27, minLon: 20.26, maxLon: 29.69 },
  { code: 'SE', label: 'Svédország', minLat: 55.34, maxLat: 69.06, minLon: 11.11, maxLon: 23.90 },
  { code: 'SI', label: 'Szlovénia', minLat: 45.42, maxLat: 46.88, minLon: 13.38, maxLon: 16.61 },
  { code: 'SK', label: 'Szlovákia', minLat: 47.73, maxLat: 49.61, minLon: 16.85, maxLon: 22.57 },
];

// Provider category mapping.
// - Geoapify: must use Places API category names from
//   https://apidocs.geoapify.com/docs/places/#categories
// - TomTom: categorySearch supports POI category keywords;
//   spaces are OR'd by TomTom search.
export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  { key: 'restaurant', label: 'Étterem', geoapify: 'catering.restaurant', tomtom: 'restaurant' },
  { key: 'cafe', label: 'Kávézó', geoapify: 'catering.cafe', tomtom: 'cafe' },
  { key: 'bar', label: 'Bár / Pub', geoapify: 'catering.bar,catering.pub', tomtom: 'bar pub' },
  { key: 'supermarket', label: 'Szupermarket', geoapify: 'commercial.supermarket', tomtom: 'supermarket' },
  { key: 'museum', label: 'Múzeum', geoapify: 'entertainment.museum', tomtom: 'museum' },
  { key: 'fitness', label: 'Fitnesz', geoapify: 'sport.fitness.fitness_centre,leisure.fitness_centre', tomtom: 'fitness' },
  { key: 'cinema', label: 'Mozi', geoapify: 'entertainment.cinema', tomtom: 'cinema' },
  { key: 'park', label: 'Park', geoapify: 'leisure.park', tomtom: 'park' },
];

// Provider per-request hard caps documented in their public APIs.
// The DB stores whatever the admin types ("dumb storage"); the worker
// only enforces the caps at HTTP-call time so a single page never 400s.
export const PROVIDER_PAGE_CAPS = {
  geoapify: 500, // Places API "limit" max
  tomtom: 100,   // categorySearch "limit" max
} as const;
