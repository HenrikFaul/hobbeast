import type { ProviderCategory } from './types.ts';

export const PROVIDERS = ['geoapify', 'tomtom'] as const;

export const EUROPEAN_COUNTRIES = [
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT',
  'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
];

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  { key: 'restaurant', label: 'Étterem', geoapify: 'catering.restaurant', tomtom: 'restaurant' },
  { key: 'cafe', label: 'Kávézó', geoapify: 'catering.cafe', tomtom: 'cafe' },
  { key: 'bar', label: 'Bár/Pub', geoapify: 'catering.bar', tomtom: 'pub' },
  { key: 'supermarket', label: 'Szupermarket', geoapify: 'commercial.supermarket', tomtom: 'supermarket' },
  { key: 'museum', label: 'Múzeum', geoapify: 'entertainment.museum', tomtom: 'museum' },
  { key: 'fitness', label: 'Fitnesz', geoapify: 'sport.fitness.fitness_centre', tomtom: 'fitness club center gym' },
];
