// deno-lint-ignore-file no-explicit-any
import type { LocalCatalogRow } from './types.ts';

export function normalizeGeoapifyRow(feature: any, groupKey: string, centerCity: string): LocalCatalogRow {
  return {
    provider: 'geoapify',
    external_id: String(feature?.properties?.place_id || ''),
    name: String(feature?.properties?.name || feature?.properties?.address_line1 || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(feature?.properties?.categories) ? feature.properties.categories : [],
    address: feature?.properties?.formatted || null,
    city: feature?.properties?.city || centerCity,
    district: feature?.properties?.county || feature?.properties?.district || null,
    postal_code: feature?.properties?.postcode || null,
    country_code: String(feature?.properties?.country_code || 'HU').toUpperCase(),
    latitude: typeof feature?.properties?.lat === 'number' ? feature.properties.lat : null,
    longitude: typeof feature?.properties?.lon === 'number' ? feature.properties.lon : null,
    open_now: typeof feature?.properties?.opening_hours?.open_now === 'boolean'
      ? feature.properties.opening_hours.open_now
      : null,
    rating: typeof feature?.properties?.datasource?.raw?.rating === 'number'
      ? feature.properties.datasource.raw.rating
      : null,
    review_count: typeof feature?.properties?.datasource?.raw?.reviews === 'number'
      ? feature.properties.datasource.raw.reviews
      : null,
    image_url: feature?.properties?.datasource?.raw?.image || null,
    phone: feature?.properties?.contact?.phone || null,
    website: feature?.properties?.website || null,
    opening_hours_text: Array.isArray(feature?.properties?.opening_hours?.text)
      ? feature.properties.opening_hours.text
      : [],
    metadata: feature?.properties || {},
    synced_at: new Date().toISOString(),
  };
}

export function normalizeTomTomRow(result: any, groupKey: string, centerCity: string): LocalCatalogRow {
  return {
    provider: 'tomtom',
    external_id: String(result?.id || ''),
    name: String(result?.poi?.name || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(result?.poi?.categories) ? result.poi.categories : [],
    address: result?.address?.freeformAddress || null,
    city: result?.address?.municipality || centerCity,
    district: result?.address?.municipalitySubdivision || result?.address?.countrySecondarySubdivision || null,
    postal_code: result?.address?.postalCode || null,
    country_code: String(result?.address?.countryCode || 'HU').toUpperCase(),
    latitude: typeof result?.position?.lat === 'number' ? result.position.lat : null,
    longitude: typeof result?.position?.lon === 'number' ? result.position.lon : null,
    open_now: null,
    rating: null,
    review_count: null,
    image_url: null,
    phone: result?.poi?.phone || null,
    website: result?.poi?.url || null,
    opening_hours_text: [],
    metadata: result || {},
    synced_at: new Date().toISOString(),
  };
}
