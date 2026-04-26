import type { CategoryGroup, PlaceRow, SyncConfig, TileCenter } from '../types/index.ts';
import { normalizeGeoapifyRow } from '../normalizers/geoapify.ts';

const FETCH_TIMEOUT_MS = 15_000;

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
  return (data.features || [])
    .map((feature: any) => normalizeGeoapifyRow(feature, group.key, center.city))
    .filter((row: PlaceRow) => Boolean(row.external_id));
}
