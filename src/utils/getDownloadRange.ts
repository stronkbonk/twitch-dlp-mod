import * as hlsParser from '../lib/hlsParser.ts';
import type { AppArgs } from '../types.ts';

export type RangeState = {
  /**
   * End offset (sec) frozen on the first playlist fetch.
   * Used by `--until-now` and `--download-last` to stop at the point where
   * the download started instead of following the live edge
   */
  fixedEnd: number | null;
};

export type DownloadRange = {
  /** Is the playlist still growing (live stream) */
  isLive: boolean;
  /** Range start (sec from the beginning of the stream/video) */
  startTime: number;
  /** Range end (sec). `Infinity` means "until the stream ends" */
  endTime: number;
  /** Duration of the playlist right now (live edge for live streams) */
  availableDuration: number;
  /** The whole requested range is already in the playlist */
  isAvailable: boolean;
  /** The requested range start hasn't aired yet */
  isPendingStart: boolean;
};

export const getPlaylistDuration = (playlist: hlsParser.MediaPlaylist) =>
  playlist.segments.reduce((acc, segment) => acc + segment.duration, 0);

/**
 * Resolves what part of the stream should be downloaded.
 *
 * - `--download-sections "*start-end"` sets the range explicitly
 * - `--download-last 10m` downloads the last 10 minutes of a live stream
 *   (or of a finished video) and stops
 * - `--until-now` stops at the live edge at the moment the download started
 * - `--duration 30m` limits the download to 30 minutes from the range start
 *
 * Live edges are frozen on the first call (see `RangeState`), so downloads
 * stop instead of following the stream. Ranges that haven't aired yet are
 * reported through `isPendingStart`/`isAvailable` and can be waited for.
 */
export const resolveDownloadRange = (
  playlist: hlsParser.MediaPlaylist,
  args: AppArgs,
  state: RangeState,
): DownloadRange => {
  const isLive = !playlist.endlist;
  const availableDuration = getPlaylistDuration(playlist);
  const section = args['download-sections'];
  const downloadLast = args['download-last'];
  const duration = args.duration;

  const isSnapshot = !!(args['until-now'] || downloadLast);
  if (isSnapshot && isLive && state.fixedEnd === null) {
    state.fixedEnd = availableDuration;
  }
  const fixedEnd = state.fixedEnd;

  let startTime = section ? section[0] : 0;
  let endTime: number = section ? section[1] : Infinity;

  if (downloadLast) {
    const end = isLive ? (fixedEnd as number) : availableDuration;
    startTime = Math.max(0, end - downloadLast);
    endTime = end;
  }

  if (duration) endTime = Math.min(endTime, startTime + duration);
  if (fixedEnd !== null) endTime = Math.min(endTime, fixedEnd);

  return {
    isLive,
    startTime,
    endTime,
    availableDuration,
    isAvailable:
      endTime !== Infinity && endTime > 0 && availableDuration >= endTime,
    isPendingStart: isLive && availableDuration < startTime,
  };
};
