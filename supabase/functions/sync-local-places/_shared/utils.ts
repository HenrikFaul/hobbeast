export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundCoord(value: number) {
  return Number(value.toFixed(5));
}

export function dedupeByProviderExternalId<T extends { provider: string; external_id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(`${row.provider}:${row.external_id}`, row);
  }
  return Array.from(map.values());
}

export async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let index = 0;

  const worker = async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}
