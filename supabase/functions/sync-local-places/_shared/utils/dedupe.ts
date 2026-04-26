import type { PlaceRow } from '../types/index.ts';

export function dedupeRows(rows: PlaceRow[]) {
  const map = new Map<string, PlaceRow>();
  for (const row of rows) {
    map.set(`${row.provider}:${row.external_id}`, row);
  }
  return Array.from(map.values());
}
