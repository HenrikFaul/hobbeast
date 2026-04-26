import { CATEGORY_GROUPS, HUNGARY_BOUNDS, TILE_STEP_DEGREES } from './constants.ts';
import { roundCoord } from './utils.ts';
import type { CenterPoint, SyncTask } from './types.ts';

export function buildHungaryCenters(): CenterPoint[] {
  const centers: CenterPoint[] = [];
  let row = 0;

  for (let lat = HUNGARY_BOUNDS.minLat; lat <= HUNGARY_BOUNDS.maxLat; lat += TILE_STEP_DEGREES) {
    const lonOffset = row % 2 === 0 ? 0 : TILE_STEP_DEGREES / 2;

    for (let lon = HUNGARY_BOUNDS.minLon + lonOffset; lon <= HUNGARY_BOUNDS.maxLon; lon += TILE_STEP_DEGREES) {
      centers.push({
        city: `HU-TILE-${row + 1}`,
        lat: roundCoord(lat),
        lon: roundCoord(lon),
      });
    }

    row += 1;
  }

  return centers;
}

export function buildTasks(): SyncTask[] {
  const centers = buildHungaryCenters();
  const tasks: SyncTask[] = [];

  for (const center of centers) {
    for (const group of CATEGORY_GROUPS) {
      tasks.push({ center, group });
    }
  }

  return tasks;
}
