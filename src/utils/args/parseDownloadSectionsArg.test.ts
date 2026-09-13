import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDownloadSectionsArg } from './parseDownloadSectionsArg.ts';

describe('parseDownloadSectionsArg', () => {
  it('return null for empty arg', () => {
    assert.equal(parseDownloadSectionsArg(), null);
    assert.equal(parseDownloadSectionsArg(''), null);
  });

  it('should parse --download-sections arg', () => {
    const cases = [
      ['*0-inf', [0, Infinity]],
      ['*5-10', [5, 10]],
      ['*3:14:15-inf', [11655, Infinity]],
      ['*13:14:15-16:17:18', [47655, 58638]],
      ['*99:00:00-inf', [356400, Infinity]],
      ['*60-inf', [60, Infinity]],
      ['*10m-45:00', [600, 2700]],
    ] as const;
    for (const [arg, expected] of cases) {
      assert.deepStrictEqual(parseDownloadSectionsArg(arg), expected);
    }
  });

  it('should parse unit time', () => {
    const cases = [
      ['*10m-25m', [600, 1500]],
      ['*1h30m-inf', [5400, Infinity]],
      ['*45s-2m', [45, 120]],
      ['*1h-1:30:00', [3600, 5400]],
    ] as const;
    for (const [arg, expected] of cases) {
      assert.deepStrictEqual(parseDownloadSectionsArg(arg), expected);
    }
  });

  it('should parse "inf" case-insensitively', () => {
    assert.deepStrictEqual(parseDownloadSectionsArg('*10m-INF'), [
      600,
      Infinity,
    ]);
  });

  it('should throw error for wrong syntax', () => {
    const cases = [
      '*13:14:15-13:14:15inf',
      '*13:14:15-inf13:14:15',
      '*10-5',
      '*10-10',
      '*61:00-inf',
      '*-10',
      '*10-',
      '*10m-5m',
      '*1h30',
      '*10m-1h30',
    ] as const;
    for (const arg of cases) {
      assert.throws(() => parseDownloadSectionsArg(arg));
    }
  });
});
