import type { CategoryGroup, PlaceRow, SyncConfig, TileCenter } from '../types/index.ts';
import { normalizeGeoapifyRow } from '../normalizers/geoapify.ts';

export async function fetchGeoapify(
  center: TileCenter,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
): Promise<PlaceRow[]> {
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
    .filter((row: PlaceRow) => Boolean(row.external_id));
}
