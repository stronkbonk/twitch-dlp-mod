import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as hlsParser from '../lib/hlsParser.ts';
import type { AppArgs } from '../types.ts';
import { resolveDownloadRange, type RangeState } from './getDownloadRange.ts';

const getPlaylist = (
  durations: number[],
  isFinished = false,
): hlsParser.MediaPlaylist => ({
  type: 'playlist',
  isMasterPlaylist: false,
  endlist: isFinished,
  segments: durations.map((duration) => ({
    type: 'segment' as const,
    uri: 'seg.ts',
    duration,
    map: null,
  })),
});

const getArgs = (overrides: Partial<AppArgs> = {}) =>
  ({
    help: false,
    version: false,
    format: 'best',
    'list-formats': false,
    output: undefined,
    downloader: 'fetch',
    proxy: undefined,
    'keep-fragments': false,
    'limit-rate': undefined,
    'live-from-start': false,
    'retry-streams': undefined,
    'download-sections': null,
    'download-last': null,
    duration: null,
    unmute: undefined,
    'merge-fragments': false,
    'merge-method': 'ffconcat',
    'until-now': false,
    'frag-concurrency': 1,
    'frag-retries': 5,
    'poll-interval': 60,
    'output-dir': undefined,
    'write-info-json': false,
    webhook: undefined,
    'dry-run': false,
    ...overrides,
  }) as unknown as AppArgs;

const LIVE = [10, 10, 10];
const LIVE_6 = [10, 10, 10, 10, 10, 10];

describe('resolveDownloadRange', () => {
  it('should download the whole video by default', () => {
    const range = resolveDownloadRange(getPlaylist(LIVE, true), getArgs(), {
      fixedEnd: null,
    });
    assert.equal(range.isLive, false);
    assert.equal(range.startTime, 0);
    assert.equal(range.endTime, Infinity);
    assert.equal(range.isAvailable, false);
    assert.equal(range.availableDuration, 30);
  });

  it('should follow the live edge by default', () => {
    const range = resolveDownloadRange(getPlaylist(LIVE), getArgs(), {
      fixedEnd: null,
    });
    assert.equal(range.isLive, true);
    assert.equal(range.endTime, Infinity);
    assert.equal(range.isAvailable, false);
  });

  it('should resolve --download-last for a finished video', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE, true),
      getArgs({ 'download-last': 15 }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 15);
    assert.equal(range.endTime, 30);
    assert.equal(range.isAvailable, true);
  });

  it('should freeze the live edge for --until-now', () => {
    const args = getArgs({ 'until-now': true });
    const state: RangeState = { fixedEnd: null };
    const first = resolveDownloadRange(getPlaylist(LIVE), args, state);
    assert.equal(first.startTime, 0);
    assert.equal(first.endTime, 30);
    assert.equal(first.isAvailable, true);

    // the stream continues, but the download stops at the frozen live edge
    const next = resolveDownloadRange(getPlaylist(LIVE_6), args, state);
    assert.equal(next.startTime, 0);
    assert.equal(next.endTime, 30);
    assert.equal(next.availableDuration, 60);
  });

  it('should freeze the live edge for --download-last', () => {
    const args = getArgs({ 'download-last': 15 });
    const state: RangeState = { fixedEnd: null };
    const first = resolveDownloadRange(getPlaylist(LIVE_6), args, state);
    assert.equal(first.startTime, 45);
    assert.equal(first.endTime, 60);
    assert.equal(first.isAvailable, true);

    const next = resolveDownloadRange(
      getPlaylist([...LIVE_6, 10, 10]),
      args,
      state,
    );
    assert.equal(next.startTime, 45);
    assert.equal(next.endTime, 60);
  });

  it('should resolve --download-last to the beginning of a short stream', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'download-last': 600 }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 0);
    assert.equal(range.endTime, 30);
  });

  it('should resolve --download-sections', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'download-sections': [10, 20] }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 10);
    assert.equal(range.endTime, 20);
    assert.equal(range.isAvailable, true);
    assert.equal(range.isPendingStart, false);
  });

  it('should flag a section that has not aired yet', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'download-sections': [70, 80] }),
      { fixedEnd: null },
    );
    assert.equal(range.isPendingStart, true);
    assert.equal(range.isAvailable, false);
  });

  it('should not wait when the section starts inside the available part', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'download-sections': [25, 80] }),
      { fixedEnd: null },
    );
    assert.equal(range.isPendingStart, false);
    assert.equal(range.isAvailable, false);
  });

  it('should limit the range with --duration', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'download-sections': [10, Infinity], duration: 20 }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 10);
    assert.equal(range.endTime, 30);
    assert.equal(range.isAvailable, true);
  });

  it('should use --duration without a section', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ duration: 60 }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 0);
    assert.equal(range.endTime, 60);
    assert.equal(range.isAvailable, false);
  });

  it('should combine --until-now with an infinite section', () => {
    const range = resolveDownloadRange(
      getPlaylist(LIVE),
      getArgs({ 'until-now': true, 'download-sections': [10, Infinity] }),
      { fixedEnd: null },
    );
    assert.equal(range.startTime, 10);
    assert.equal(range.endTime, 30);
    assert.equal(range.isAvailable, true);
  });

  it('should not treat an empty playlist as available', () => {
    const range = resolveDownloadRange(
      getPlaylist([]),
      getArgs({ 'until-now': true }),
      { fixedEnd: null },
    );
    assert.equal(range.endTime, 0);
    assert.equal(range.isAvailable, false);
  });
});
