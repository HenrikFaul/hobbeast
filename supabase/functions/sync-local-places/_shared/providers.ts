// deno-lint-ignore-file no-explicit-any
import { normalizeGeoapifyRow, normalizeTomTomRow } from './normalize.ts';
import type { CategoryGroup, CenterPoint, LocalCatalogRow, SyncConfig } from './types.ts';

export async function fetchGeoapify(
  center: CenterPoint,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
): Promise<LocalCatalogRow[]> {
  const params = new URLSearchParams({
    categories: group.geo,
    filter: `circle:${center.lon},${center.lat},${config.radius_meters}`,
    bias: `proximity:${center.lon},${center.lat}`,
    limit: String(config.geo_limit),
    apiKey,
  });

  const res = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Geoapify ${center.city}/${group.key}: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.features || [])
    .map((feature: any) => normalizeGeoapifyRow(feature, group.key, center.city))
    .filter((row: LocalCatalogRow) => row.external_id && row.country_code === 'HU');
}

export async function fetchTomTom(
  center: CenterPoint,
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
    .filter((row: LocalCatalogRow) => row.external_id && row.country_code === 'HU');
}
