export type ProviderKey = 'geoapify' | 'tomtom';

export type ProviderCategory = {
  key: string;
  label: string;
  geoapify?: string;
  tomtom?: string;
};

export type DiscoveryCell = {
  provider: ProviderKey;
  country_code: string;
  category_key: string;
  category_label: string;
  selected: boolean;
  status: string;
  cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
};

export type AddressManagerLimits = {
  geoapify_limit: number;
  tomtom_limit: number;
  radius_meters: number;
  worker_chunk_size: number;
  max_parallel_workers: number;
};
