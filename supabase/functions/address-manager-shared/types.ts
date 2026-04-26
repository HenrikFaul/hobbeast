export type ProviderKey = 'geoapify' | 'tomtom';

export type ProviderCategory = {
  key: string;
  label: string;
  geoapify?: string;
  tomtom?: string;
};

export type DiscoveryCell = {
  id: string;
  provider: ProviderKey;
  country_code: string;
  category_key: string;
  category_label: string;
  selected: boolean;
  status: string;
  cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
  last_error: string | null;
  last_run_started_at: string | null;
  last_run_completed_at: string | null;
  updated_at: string;
};

export type AddressManagerLimits = {
  geoapify_limit: number;
  tomtom_limit: number;
  radius_meters: number;
  worker_chunk_size: number;
  max_parallel_workers: number;
  // Soft time budget (ms) for one worker invocation. Bounded so
  // we stay well under Supabase Edge Function 60s wall time.
  worker_time_budget_ms: number;
  // Max provider HTTP pages (per tile) one worker invocation will issue.
  worker_max_pages_per_tile: number;
};

export type CountryBounds = {
  code: string;
  label: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export type MatrixSelectionUpdate = {
  provider: ProviderKey;
  country_code: string;
  category_key: string;
  selected: boolean;
};

export type ProviderSelfTestResult = {
  provider: ProviderKey;
  ok: boolean;
  status: number | null;
  sampleCount: number;
  error?: string;
  endpoint: string;
};
