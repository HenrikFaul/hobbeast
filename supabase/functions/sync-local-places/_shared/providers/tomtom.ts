import type { CategoryGroup, PlaceRow, SyncConfig, TileCenter } from '../types/index.ts';
import { normalizeTomTomRow } from '../normalizers/tomtom.ts';

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchTomTom(
  center: TileCenter,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
): Promise<PlaceRow[]> {
  const params = new URLSearchParams({
    key: apiKey,
    countrySet: 'HU',
    limit: String(config.tomtom_limit),
    lat: String(center.lat),
    lon: String(center.lon),
    radius: String(config.radius_meters),
    openingHours: 'nextSevenDays',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(group.tomtom)}.json?${params.toString()}`,
      { signal: controller.signal },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`TomTom ${center.city}/${group.key}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TomTom ${center.city}/${group.key}: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.results || [])
    .map((result: any) => normalizeTomTomRow(result, group.key, center.city))
    .filter((row: PlaceRow) => Boolean(row.external_id));
}
