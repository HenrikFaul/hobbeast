// deno-lint-ignore-file no-explicit-any
import type { CategoryGroup, LocalCatalogRow, SyncConfig, TaskCenter } from '../types.ts';

function normalizeTomTomRow(result: any, groupKey: string, centerCity: string): LocalCatalogRow {
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

export async function fetchTomTomRows(
  center: TaskCenter,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
): Promise<LocalCatalogRow[]> {
  const params = new URLSearchParams({
    key: apiKey,
    countrySet: 'HU',
    limit: String(config.tomtom_limit),
    lat: String(center.lat),
    lon: String(center.lon),
    radius: String(config.radius_meters),
    openingHours: 'nextSevenDays',
  });

  const res = await fetch(
    `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(group.tomtom)}.json?${params.toString()}`,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TomTom ${center.city}/${group.key}: ${res.status} ${text}`);
  }

  const data = await res.json();

  return (data.results || [])
    .map((result: any) => normalizeTomTomRow(result, group.key, center.city))
    .filter((row: LocalCatalogRow) => Boolean(row.external_id) && row.country_code === 'HU');
}
