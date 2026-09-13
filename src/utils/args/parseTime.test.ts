import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTime } from './parseTime.ts';

describe('parseTime', () => {
  it('should parse seconds', () => {
    assert.equal(parseTime('0'), 0);
    assert.equal(parseTime('15'), 15);
    assert.equal(parseTime('600'), 600);
    assert.equal(parseTime('01'), 1);
  });

  it('should parse clock time', () => {
    const cases = [
      ['5:10', 310],
      ['15:00', 900],
      ['00:30', 30],
      ['59:59', 3599],
      ['1:02:03', 3723],
      ['3:14:15', 11655],
      ['13:14:15', 47655],
      ['99:00:00', 356400],
    ] as const;
    for (const [arg, expected] of cases) {
      assert.equal(parseTime(arg), expected, arg);
    }
  });

  it('should parse unit time', () => {
    const cases = [
      ['45s', 45],
      ['30m', 1800],
      ['90m', 5400],
      ['2h', 7200],
      ['1h30m', 5400],
      ['1h30m15s', 5415],
      ['1.5m', 90],
    ] as const;
    for (const [arg, expected] of cases) {
      assert.equal(parseTime(arg), expected, arg);
    }
  });

  it('should trim the value', () => {
    assert.equal(parseTime(' 10m '), 600);
  });

  it('should throw error for wrong syntax', () => {
    const cases = [
      '',
      ' ',
      '1h30',
      'h',
      '5:60',
      '60:00',
      '1:60:00',
      '1:02:03:04',
      '15inf',
      '-10',
      'abc',
      '1m30x',
    ] as const;
    for (const arg of cases) {
      assert.throws(() => parseTime(arg), Error, `"${arg}" should throw`);
    }
  });
});
