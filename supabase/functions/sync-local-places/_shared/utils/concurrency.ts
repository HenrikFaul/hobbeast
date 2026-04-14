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
