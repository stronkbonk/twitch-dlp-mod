import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asyncPool } from './asyncPool.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('asyncPool', () => {
  it('should process every item', async () => {
    const processed: number[] = [];
    await asyncPool([1, 2, 3, 4, 5], 2, async (item) => {
      processed.push(item);
    });
    assert.deepStrictEqual(
      processed.toSorted((a, b) => a - b),
      [1, 2, 3, 4, 5],
    );
  });

  it('should pass the item index', async () => {
    const indexes: number[] = [];
    await asyncPool(['a', 'b', 'c'], 1, async (_item, index) => {
      indexes.push(index);
    });
    assert.deepStrictEqual(indexes, [0, 1, 2]);
  });

  it('should not exceed the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    await asyncPool(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(5);
        active -= 1;
      },
    );
    assert.ok(maxActive <= 3, `maxActive is ${maxActive}`);
    assert.equal(maxActive, 3);
  });

  it('should do nothing for an empty list', async () => {
    let called = 0;
    await asyncPool([], 4, async () => {
      called += 1;
    });
    assert.equal(called, 0);
  });

  it('should treat a wrong concurrency as 1', async () => {
    let active = 0;
    let maxActive = 0;
    await asyncPool([1, 2, 3], 0, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active -= 1;
    });
    assert.equal(maxActive, 1);
  });
});
