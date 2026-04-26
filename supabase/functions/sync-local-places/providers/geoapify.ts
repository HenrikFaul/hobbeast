// deno-lint-ignore-file no-explicit-any
import type { CategoryGroup, LocalCatalogRow, SyncConfig, TaskCenter } from '../types.ts';

const FETCH_TIMEOUT_MS = 15_000;

type FetchProviderOptions = { applyHuFilter?: boolean };

function normalizeGeoapifyRow(feature: any, groupKey: string, centerCity: string): LocalCatalogRow {
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
    open_now: typeof feature?.properties?.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : null,
    rating: typeof feature?.properties?.datasource?.raw?.rating === 'number' ? feature.properties.datasource.raw.rating : null,
    review_count: typeof feature?.properties?.datasource?.raw?.reviews === 'number' ? feature.properties.datasource.raw.reviews : null,
    image_url: feature?.properties?.datasource?.raw?.image || null,
    phone: feature?.properties?.contact?.phone || null,
    website: feature?.properties?.website || null,
    opening_hours_text: Array.isArray(feature?.properties?.opening_hours?.text) ? feature.properties.opening_hours.text : [],
    metadata: feature?.properties || {},
    synced_at: new Date().toISOString(),
  };
}

export async function fetchGeoapifyRows(
  center: TaskCenter,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
  options: FetchProviderOptions = {},
): Promise<LocalCatalogRow[]> {
  const params = new URLSearchParams({
    categories: group.geo,
    filter: `circle:${center.lon},${center.lat},${config.radius_meters}`,
    bias: `proximity:${center.lon},${center.lat}`,
    limit: String(config.geo_limit),
    apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`, { signal: controller.signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Geoapify ${center.city}/${group.key}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Geoapify ${center.city}/${group.key}: ${res.status} ${text}`);
  }

  const data = await res.json();
  const rows = (data.features || [])
    .map((feature: any) => normalizeGeoapifyRow(feature, group.key, center.city))
    .filter((row: LocalCatalogRow) => Boolean(row.external_id));

  return options.applyHuFilter === false
    ? rows
    : rows.filter((row: LocalCatalogRow) => row.country_code === 'HU');
}
