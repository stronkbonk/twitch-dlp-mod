import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Frags } from '../types.ts';
import type { DownloadRange } from './getDownloadRange.ts';
import { getPreciseCutArgs, getPreciseCutRange } from './preciseCut.ts';

type Segment = [offset: number, duration: number];

const getFrags = (segments: Segment[], isFMp4 = false) => {
  const frags = segments.map(([offset, duration], i) => ({
    idx: i,
    offset,
    duration,
    url: `seg${i}.ts`,
  })) as unknown as Frags;
  frags.isFMp4 = isFMp4;
  return frags;
};

const INIT_FRAG = getFrags([[0, 0]]).map((frag) => ({
  ...frag,
  isMap: true as const,
}));

const FRAGS = getFrags([
  [0, 10],
  [10, 10],
  [20, 10],
]);

const getRange = (overrides: Partial<DownloadRange> = {}): DownloadRange => ({
  isLive: false,
  startTime: 0,
  endTime: Infinity,
  availableDuration: 30,
  isAvailable: false,
  isPendingStart: false,
  ...overrides,
});

describe('getPreciseCutRange', () => {
  it('should not cut when the fragments already match the range', () => {
    assert.equal(
      getPreciseCutRange(FRAGS, getRange({ endTime: Infinity })),
      null,
    );
    assert.equal(getPreciseCutRange(FRAGS, getRange({ endTime: 30 })), null);
  });

  it('should trim a start that is inside a fragment', () => {
    const cut = getPreciseCutRange(FRAGS, getRange({ startTime: 15 }));
    assert.deepStrictEqual(cut, { startTime: 15, duration: 15 });
  });

  it('should trim an end that is inside a fragment', () => {
    const cut = getPreciseCutRange(FRAGS, getRange({ endTime: 12 }));
    assert.deepStrictEqual(cut, { startTime: 0, duration: 12 });
  });

  it('should trim both ends', () => {
    const cut = getPreciseCutRange(
      FRAGS,
      getRange({ startTime: 15, endTime: 22 }),
    );
    assert.deepStrictEqual(cut, { startTime: 15, duration: 7 });
  });

  it('should never cut before the downloaded content', () => {
    // the first fragment starts at 10, so a cut can only start there
    const frags = getFrags([
      [10, 10],
      [20, 10],
      [30, 10],
    ]);
    assert.equal(
      getPreciseCutRange(frags, getRange({ startTime: 5, endTime: 40 })),
      null,
    );
    assert.deepStrictEqual(
      getPreciseCutRange(frags, getRange({ startTime: 5, endTime: 35 })),
      { startTime: 0, duration: 25 },
    );
  });

  it('should return a cut relative to the downloaded file, not the stream', () => {
    // stream offsets 20-40, downloaded starting at 20
    const frags = getFrags([
      [20, 10],
      [30, 10],
      [40, 10],
    ]);
    assert.deepStrictEqual(
      getPreciseCutRange(frags, getRange({ startTime: 25, endTime: 35 })),
      { startTime: 5, duration: 10 },
    );
  });

  it('should never seek past the downloaded content', () => {
    assert.equal(getPreciseCutRange(FRAGS, getRange({ endTime: 100 })), null);
  });

  it('should ignore the fMP4 init fragment', () => {
    const frags = [...INIT_FRAG, ...getFrags([[10, 10]])] as Frags;
    frags.isFMp4 = true;
    assert.equal(
      getPreciseCutRange(frags, getRange({ startTime: 10, endTime: 20 })),
      null,
    );
    assert.deepStrictEqual(
      getPreciseCutRange(frags, getRange({ startTime: 15, endTime: 20 })),
      { startTime: 5, duration: 5 },
    );
  });

  it('should return nothing without fragments', () => {
    assert.equal(getPreciseCutRange(getFrags([]), getRange()), null);
  });

  it('should return nothing when the range is outside the fragments', () => {
    const frags = getFrags([[0, 10]]);
    assert.equal(
      getPreciseCutRange(frags, getRange({ startTime: 50, endTime: 60 })),
      null,
    );
  });
});

describe('getPreciseCutArgs', () => {
  const cut = { startTime: 12.5, duration: 7.25 };

  it('should seek before the input for a fast and accurate cut', () => {
    const args = getPreciseCutArgs('in.mp4', 'out.mp4', cut, false);
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
    assert.equal(args[args.indexOf('-ss') + 1], '12.500');
    assert.equal(args[args.indexOf('-t') + 1], '7.250');
  });

  it('should re-encode video and audio', () => {
    const args = getPreciseCutArgs('in.mp4', 'out.mp4', cut, false);
    assert.ok(args.includes('libx264'));
    assert.ok(args.includes('aac'));
    assert.ok(!args.includes('-vn'));
    assert.equal(args.at(-1), 'out.mp4');
  });

  it('should drop the video stream for audio-only files', () => {
    const args = getPreciseCutArgs('in.m4a', 'out.m4a', cut, true);
    assert.ok(args.includes('-vn'));
    assert.ok(!args.includes('libx264'));
    assert.equal(args.at(-1), 'out.m4a');
  });
});
