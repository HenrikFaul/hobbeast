import type { PlaceRow } from '../types/index.ts';

export function summarizeRows(rows: Array<Partial<PlaceRow>>, limit = 3) {
  return rows.slice(0, limit).map((row) => ({
    provider: row.provider ?? null,
    external_id: row.external_id ?? null,
    name: row.name ?? null,
    country_code: row.country_code ?? null,
    city: row.city ?? null,
    category_group: row.category_group ?? null,
  }));
}
