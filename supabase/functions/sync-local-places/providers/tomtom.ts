// deno-lint-ignore-file no-explicit-any
import type { CategoryGroup, LocalCatalogRow, SyncConfig, TaskCenter } from '../types.ts';

const FETCH_TIMEOUT_MS = 15_000;

type FetchProviderOptions = { applyHuFilter?: boolean };

interface TomTomResult {
  id?: unknown;
  poi?: { name?: unknown; categories?: unknown; phone?: unknown; url?: unknown };
  address?: {
    freeformAddress?: unknown;
    municipality?: unknown;
    municipalitySubdivision?: unknown;
    countrySecondarySubdivision?: unknown;
    postalCode?: unknown;
    countryCode?: unknown;
  };
  position?: { lat?: unknown; lon?: unknown };
}

function normalizeTomTomRow(result: TomTomResult, groupKey: string, centerCity: string): LocalCatalogRow {
  return {
    provider: 'tomtom',
    external_id: String(result?.id || ''),
    name: String(result?.poi?.name || 'Helyszín'),
    category_group: groupKey,
    categories: Array.isArray(result?.poi?.categories) ? result.poi.categories : [],
    address: typeof result.address?.freeformAddress === 'string' ? result.address.freeformAddress : null,
    city: typeof result.address?.municipality === 'string' ? result.address.municipality : centerCity,
    district: typeof result.address?.municipalitySubdivision === 'string' ? result.address.municipalitySubdivision : typeof result.address?.countrySecondarySubdivision === 'string' ? result.address.countrySecondarySubdivision : null,
    postal_code: typeof result.address?.postalCode === 'string' ? result.address.postalCode : null,
    country_code: String(result?.address?.countryCode || 'HU').toUpperCase(),
    latitude: typeof result?.position?.lat === 'number' ? result.position.lat : null,
    longitude: typeof result?.position?.lon === 'number' ? result.position.lon : null,
    open_now: null,
    rating: null,
    review_count: null,
    image_url: null,
    phone: typeof result.poi?.phone === 'string' ? result.poi.phone : null,
    website: typeof result.poi?.url === 'string' ? result.poi.url : null,
    opening_hours_text: [],
    metadata: { ...result },
    synced_at: new Date().toISOString(),
  };
}

export async function fetchTomTomRows(
  center: TaskCenter,
  group: CategoryGroup,
  apiKey: string,
  config: SyncConfig,
  options: FetchProviderOptions = {},
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

  const data = await res.json() as { results?: TomTomResult[] };
  const rows = (data.results || [])
    .map((result) => normalizeTomTomRow(result, group.key, center.city))
    .filter((row: LocalCatalogRow) => Boolean(row.external_id));

  return options.applyHuFilter === false
    ? rows
    : rows.filter((row: LocalCatalogRow) => row.country_code === 'HU');
}
