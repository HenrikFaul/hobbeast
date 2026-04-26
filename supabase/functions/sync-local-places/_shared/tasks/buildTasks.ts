import { CATEGORY_GROUPS } from '../constants/sync.ts';
import type { SyncTask } from '../types/index.ts';
import { buildHungaryCenters } from './buildCenters.ts';

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
