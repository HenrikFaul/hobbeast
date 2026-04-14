import type { CategoryGroup, SyncConfig } from '../types/index.ts';

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

export const MILESTONES = {
  // Request lifecycle
  REQ_RECEIVED: 'REQ_RECEIVED',
  ACTION_RESOLVED: 'ACTION_RESOLVED',
  // Status
  STATUS_LOAD_STARTED: 'STATUS_LOAD_STARTED',
  STATUS_LOAD_DONE: 'STATUS_LOAD_DONE',
  // Config
  CONFIG_LOAD_STARTED: 'CONFIG_LOAD_STARTED',
  CONFIG_LOAD_DONE: 'CONFIG_LOAD_DONE',
  CONFIG_SAVE_STARTED: 'CONFIG_SAVE_STARTED',
  CONFIG_SAVE_DONE: 'CONFIG_SAVE_DONE',
  // Task building
  TASK_SEEDS_BUILT: 'TASK_SEEDS_BUILT',
  TASKS_BUILT: 'TASKS_BUILT',
  BATCH_WINDOW_RESOLVED: 'BATCH_WINDOW_RESOLVED',
  // Run lifecycle
  ENQUEUE_REQUEST_ACCEPTED: 'ENQUEUE_REQUEST_ACCEPTED',
  RUN_STARTED: 'RUN_STARTED',
  RUN_COMPLETED: 'RUN_COMPLETED',
  // State reset
  STATE_RESET_STARTED: 'STATE_RESET_STARTED',
  STATE_RESET_DONE: 'STATE_RESET_DONE',
  // Batch lifecycle
  BATCH_STARTED: 'BATCH_STARTED',
  BATCH_FINISHED: 'BATCH_FINISHED',
  // Task lifecycle
  TASK_STARTED: 'TASK_STARTED',
  TASK_FINISHED: 'TASK_FINISHED',
  // Provider
  PROVIDER_FETCH_STARTED: 'PROVIDER_FETCH_STARTED',
  PROVIDER_FETCH_DONE: 'PROVIDER_FETCH_DONE',
  PROVIDER_NORMALIZE_DONE: 'PROVIDER_NORMALIZE_DONE',
  // Filters
  HU_FILTER_DONE: 'HU_FILTER_DONE',
  TASK_DEDUPE_DONE: 'TASK_DEDUPE_DONE',
  // Catalog write
  CATALOG_ROWS_BUILT: 'CATALOG_ROWS_BUILT',
  CATALOG_WRITE_ATTEMPT: 'CATALOG_WRITE_ATTEMPT',
  CATALOG_WRITE_DONE: 'CATALOG_WRITE_DONE',
  CATALOG_WRITE_ERROR: 'CATALOG_WRITE_ERROR',
  // State write
  STATE_WRITE_ATTEMPT: 'STATE_WRITE_ATTEMPT',
  STATE_WRITE_DONE: 'STATE_WRITE_DONE',
  // Snapshot
  SNAPSHOT_LOAD_STARTED: 'SNAPSHOT_LOAD_STARTED',
  SNAPSHOT_LOAD_DONE: 'SNAPSHOT_LOAD_DONE',
  // Schedule
  SCHEDULE_ENABLED: 'SCHEDULE_ENABLED',
  SCHEDULE_DISABLED: 'SCHEDULE_DISABLED',
  // Errors
  ERROR_THROWN: 'ERROR_THROWN',
  ERROR_REPORTED: 'ERROR_REPORTED',
} as const;
