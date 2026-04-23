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
