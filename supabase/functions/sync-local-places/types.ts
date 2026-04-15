// deno-lint-ignore-file no-explicit-any

export type SyncLevel = 'info' | 'warn' | 'error' | 'success';

export type SyncConfig = {
  enabled: boolean;
  interval_minutes: number;
  radius_meters: number;
  geo_limit: number;
  tomtom_limit: number;
  provider_concurrency: number;
  task_batch_size: number;
};

export type SyncAction =
  | 'status'
  | 'sync'
  | 'get_config'
  | 'save_config'
  | 'enqueue'
  | 'schedule'
  | 'unschedule';

export type SyncBody = {
  action?: SyncAction;
  reset?: boolean;
  interval_minutes?: number;
  config?: Partial<SyncConfig>;
};

export type TaskCenter = {
  city: string;
  lat: number;
  lon: number;
};

export type CategoryGroup = {
  key: string;
  geo: string;
  tomtom: string;
};

export type SyncTask = {
  center: TaskCenter;
  group: CategoryGroup;
};

export type LocalCatalogRow = {
  provider: 'geoapify' | 'tomtom';
  external_id: string;
  name: string;
  category_group: string;
  categories: string[];
  address: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  open_now: boolean | null;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  phone: string | null;
  website: string | null;
  opening_hours_text: string[];
  metadata: Record<string, unknown>;
  synced_at: string;
};

export type BatchResult = {
  ok: boolean;
  processedTasks: number;
  totalTasks: number;
  nextCursor: number;
  hasMore: boolean;
  partialFailures?: number;
  rowsWrittenThisRun?: number;
  status: Record<string, unknown>;
  _stateWriteError?: string | null;
  _logWriteError?: string | null;
};
