// deno-lint-ignore-file no-explicit-any
import type { CategoryGroup, LocalCatalogRow, SyncConfig, TaskCenter } from '../types.ts';

const FETCH_TIMEOUT_MS = 15_000;

type FetchProviderOptions = { applyHuFilter?: boolean };

interface GeoapifyFeature {
  properties?: Record<string, unknown> & {
    place_id?: unknown;
    name?: unknown;
    address_line1?: unknown;
    categories?: unknown;
    formatted?: unknown;
    city?: unknown;
    county?: unknown;
    district?: unknown;
    postcode?: unknown;
    country_code?: unknown;
    lat?: unknown;
    lon?: unknown;
    opening_hours?: { open_now?: unknown; text?: unknown };
    datasource?: { raw?: { rating?: unknown; reviews?: unknown; image?: unknown } };
    contact?: { phone?: unknown };
    website?: unknown;
  };
}

function normalizeGeoapifyRow(feature: GeoapifyFeature, groupKey: string, centerCity: string): LocalCatalogRow {
  return {
    provider: 'geoapify',
    external_id: String(feature?.properties?.place_id || ''),
    name: String(feature?.properties?.name || feature?.properties?.address_line1 || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(feature?.properties?.categories) ? feature.properties.categories : [],
    address: typeof feature.properties?.formatted === 'string' ? feature.properties.formatted : null,
    city: typeof feature.properties?.city === 'string' ? feature.properties.city : centerCity,
    district: typeof feature.properties?.county === 'string' ? feature.properties.county : typeof feature.properties?.district === 'string' ? feature.properties.district : null,
    postal_code: typeof feature.properties?.postcode === 'string' ? feature.properties.postcode : null,
    country_code: String(feature?.properties?.country_code || 'HU').toUpperCase(),
    latitude: typeof feature?.properties?.lat === 'number' ? feature.properties.lat : null,
    longitude: typeof feature?.properties?.lon === 'number' ? feature.properties.lon : null,
    open_now: typeof feature?.properties?.opening_hours?.open_now === 'boolean' ? feature.properties.opening_hours.open_now : null,
    rating: typeof feature?.properties?.datasource?.raw?.rating === 'number' ? feature.properties.datasource.raw.rating : null,
    review_count: typeof feature?.properties?.datasource?.raw?.reviews === 'number' ? feature.properties.datasource.raw.reviews : null,
    image_url: typeof feature.properties?.datasource?.raw?.image === 'string' ? feature.properties.datasource.raw.image : null,
    phone: typeof feature.properties?.contact?.phone === 'string' ? feature.properties.contact.phone : null,
    website: typeof feature.properties?.website === 'string' ? feature.properties.website : null,
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

  const data = await res.json() as { features?: GeoapifyFeature[] };
  const rows = (data.features || [])
    .map((feature) => normalizeGeoapifyRow(feature, group.key, center.city))
    .filter((row: LocalCatalogRow) => Boolean(row.external_id));

  return options.applyHuFilter === false
    ? rows
    : rows.filter((row: LocalCatalogRow) => row.country_code === 'HU');
}
