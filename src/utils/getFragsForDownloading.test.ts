import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as hlsParser from '../lib/hlsParser.ts';
import type { DownloadRange } from './getDownloadRange.ts';
import { getFragsForDownloading } from './getFragsForDownloading.ts';

const PLAYLIST_URL = 'https://example.com/chunked/index-dvr.m3u8';

const getPlaylist = (
  durations: number[],
  mapUri: string | null = null,
  isFinished = false,
): hlsParser.MediaPlaylist => ({
  type: 'playlist',
  isMasterPlaylist: false,
  endlist: isFinished,
  segments: durations.map((duration) => ({
    type: 'segment' as const,
    uri: `seg-${duration}.ts`,
    duration,
    map: mapUri ? { uri: mapUri } : null,
  })),
});

const getRange = (overrides: Partial<DownloadRange> = {}): DownloadRange => ({
  isLive: false,
  startTime: 0,
  endTime: Infinity,
  availableDuration: 40,
  isAvailable: false,
  isPendingStart: false,
  ...overrides,
});

const DURATIONS = [10, 10, 10, 10];

describe('getFragsForDownloading', () => {
  it('should return every fragment by default', () => {
    const frags = getFragsForDownloading(
      PLAYLIST_URL,
      getPlaylist(DURATIONS),
      getRange(),
    );
    assert.deepStrictEqual(
      frags.map((frag) => [frag.idx, frag.offset]),
      [
        [0, 0],
        [1, 10],
        [2, 20],
        [3, 30],
      ],
    );
    assert.equal(frags.isFMp4, false);
    assert.equal(frags[0].url, 'https://example.com/chunked/seg-10.ts');
  });

  it('should slice the range by the closest fragments', () => {
    const frags = getFragsForDownloading(
      PLAYLIST_URL,
      getPlaylist(DURATIONS),
      getRange({ startTime: 15, endTime: 25 }),
    );
    assert.deepStrictEqual(
      frags.map((frag) => frag.idx),
      [1, 2, 3],
    );
  });

  it('should take every available fragment when the end has not aired yet', () => {
    const frags = getFragsForDownloading(
      PLAYLIST_URL,
      getPlaylist(DURATIONS),
      getRange({ endTime: 90, availableDuration: 40, isLive: true }),
    );
    assert.deepStrictEqual(
      frags.map((frag) => frag.idx),
      [0, 1, 2, 3],
    );
  });

  it('should slice an infinite end', () => {
    const frags = getFragsForDownloading(
      PLAYLIST_URL,
      getPlaylist(DURATIONS),
      getRange({ startTime: 30, availableDuration: 40, isLive: true }),
    );
    assert.deepStrictEqual(
      frags.map((frag) => frag.idx),
      [3],
    );
  });

  it('should keep the init fragment for fMP4 streams', () => {
    const frags = getFragsForDownloading(
      PLAYLIST_URL,
      getPlaylist(DURATIONS, 'init.mp4'),
      getRange({ startTime: 15, endTime: 25 }),
    );
    assert.equal(frags.isFMp4, true);
    assert.deepStrictEqual(
      frags.map((frag) => [frag.idx, frag.isMap]),
      [
        [0, true],
        [2, undefined],
        [3, undefined],
        [4, undefined],
      ],
    );
  });
});
