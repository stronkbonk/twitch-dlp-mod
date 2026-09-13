/** Runs `worker` for every item, keeping at most `concurrency` workers busy */
export const asyncPool = async <T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) => {
  const limit = Math.max(
    1,
    Math.min(Math.floor(concurrency) || 1, items.length || 1),
  );
  let nextIdx = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIdx < items.length) {
        const idx = nextIdx;
        nextIdx += 1;
        await worker(items[idx], idx);
      }
    }),
  );
};
