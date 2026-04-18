import type { CategoryGroup, SyncConfig } from './types.ts';

export const HUNGARY_BOUNDS = {
  minLat: 45.74,
  maxLat: 48.62,
  minLon: 16.08,
  maxLon: 22.91,
} as const;

export const TILE_STEP_DEGREES = 0.55;

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { key: 'restaurant', geo: 'catering.restaurant,catering.cafe,catering.bar,catering.pub', tomtom: 'restaurant' },
  { key: 'cafe', geo: 'catering.cafe,catering.restaurant', tomtom: 'cafe' },
  { key: 'bar', geo: 'catering.bar,catering.pub', tomtom: 'bar' },
  { key: 'leisure', geo: 'leisure,sport', tomtom: 'leisure' },
  { key: 'entertainment', geo: 'entertainment,tourism', tomtom: 'entertainment' },
];

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  interval_minutes: 15,
  radius_meters: 16000,
  geo_limit: 60,
  tomtom_limit: 50,
  provider_concurrency: 2,
  task_batch_size: 2,
};

export const LOCAL_PLACES_STATE_KEY = 'local_places';
export const CATALOG_UPSERT_CHUNK_SIZE = 250;
