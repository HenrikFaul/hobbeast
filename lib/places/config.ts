export interface PlacesProviderConfig {
  geoapifyApiKey?: string;
  tomtomApiKey?: string;
  tomtomEnrichmentEnabled: boolean;
  tomtomFallbackEnabled: boolean;
  premiumPoiForDetailsEnabled: boolean;
  defaultCountryCodes: string[];
  cacheTtlMs: number;
}

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
};

const parseList = (value: string | undefined, fallback: string[]) => {
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

export const placesConfig: PlacesProviderConfig = {
  geoapifyApiKey: import.meta.env.VITE_GEOAPIFY_API_KEY,
  tomtomApiKey: import.meta.env.VITE_TOMTOM_API_KEY,
  tomtomEnrichmentEnabled: parseBoolean(import.meta.env.VITE_TOMTOM_ENRICHMENT_ENABLED, true),
  tomtomFallbackEnabled: parseBoolean(import.meta.env.VITE_TOMTOM_FALLBACK_ENABLED, true),
  premiumPoiForDetailsEnabled: parseBoolean(import.meta.env.VITE_TOMTOM_DETAILS_ENABLED, true),
  defaultCountryCodes: parseList(import.meta.env.VITE_PLACES_COUNTRY_CODES, ['hu']),
  cacheTtlMs: Number(import.meta.env.VITE_PLACES_CACHE_TTL_MS || 1000 * 60 * 60 * 6),
};

export const hasGeoapify = () => Boolean(placesConfig.geoapifyApiKey);
export const hasTomTom = () => Boolean(placesConfig.tomtomApiKey);
