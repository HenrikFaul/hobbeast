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
  | 'unschedule'
  | 'self_test';

export type SyncBody = {
  action?: SyncAction;
  reset?: boolean;
  interval_minutes?: number;
  config?: Partial<SyncConfig>;
};

export type ProviderName = 'geoapify' | 'tomtom';

export type PlaceRow = {
  provider: ProviderName;
  external_id: string;
  name: string;
  category_group: string;
  categories: string[];
  address: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  country_code: string | null;
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

export type TileCenter = { city: string; lat: number; lon: number };

export type CategoryGroup = {
  key: string;
  geo: string;
  tomtom: string;
};

export type SyncTask = {
  center: TileCenter;
  group: CategoryGroup;
};

export type StatusPayload = {
  totalRows: number;
  state: Record<string, unknown> | null;
  providerCounts: Record<string, number>;
  preview: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
};

export type BatchExecutionResult = {
  ok: boolean;
  processedTasks: number;
  totalTasks: number;
  nextCursor: number;
  hasMore: boolean;
  batchesExecuted: number;
  partialFailures: number;
  rowsWrittenThisRun: number;
  status: StatusPayload;
};
