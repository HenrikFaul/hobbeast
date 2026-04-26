import { HUNGARY_BOUNDS, TILE_STEP_DEGREES } from '../constants/sync.ts';
import type { TileCenter } from '../types/index.ts';
import { roundCoord } from '../utils/math.ts';

export function buildHungaryCenters(): TileCenter[] {
  const centers: TileCenter[] = [];
  let row = 0;

  for (let lat = HUNGARY_BOUNDS.minLat; lat <= HUNGARY_BOUNDS.maxLat; lat += TILE_STEP_DEGREES) {
    const lonOffset = row % 2 === 0 ? 0 : TILE_STEP_DEGREES / 2;

    for (let lon = HUNGARY_BOUNDS.minLon + lonOffset; lon <= HUNGARY_BOUNDS.maxLon; lon += TILE_STEP_DEGREES) {
      centers.push({ city: `HU-TILE-${row + 1}`, lat: roundCoord(lat), lon: roundCoord(lon) });
    }

    row += 1;
  }

  return centers;
}
