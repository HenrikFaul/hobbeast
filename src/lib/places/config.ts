export interface PlacesFeatureConfig {
  geoapifyPrimaryEnabled: boolean;
  tomtomEnrichmentEnabled: boolean;
  tomtomFallbackEnabled: boolean;
  premiumPoiForDetailsEnabled: boolean;
}

export function getPlacesFeatureConfig(): PlacesFeatureConfig {
  const read = (name: string, fallback: boolean) => {
    const raw = (import.meta.env[name] as string | undefined)?.toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  };

  return {
    geoapifyPrimaryEnabled: read('VITE_GEOAPIFY_PRIMARY_ENABLED', true),
    tomtomEnrichmentEnabled: read('VITE_TOMTOM_ENRICHMENT_ENABLED', true),
    tomtomFallbackEnabled: read('VITE_TOMTOM_FALLBACK_ENABLED', true),
    premiumPoiForDetailsEnabled: read('VITE_PREMIUM_POI_FOR_DETAILS_ENABLED', true),
  };
}
