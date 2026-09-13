import fsp from 'node:fs/promises';
import path from 'node:path';
import { PRECISE_CUT_THRESHOLD_SEC } from '../constants.ts';
import { formatTime } from '../lib/formatTime.ts';
import { spawn } from '../lib/spawn.ts';
import { statsOrNull } from '../lib/statsOrNull.ts';
import type { Frags } from '../types.ts';
import type { DownloadRange } from './getDownloadRange.ts';

export type PreciseCut = {
  /** Offset of the cut in the downloaded file (sec, not in the stream) */
  startTime: number;
  /** Duration of the cut (sec) */
  duration: number;
};

/**
 * Maps the requested range onto the downloaded fragments.
 *
 * Cutting is done by the closest fragments, so the file usually starts a bit
 * before the requested start and ends a bit after the requested end. Returns
 * `null` when there is nothing to trim
 */
export const getPreciseCutRange = (
  frags: Frags,
  range: DownloadRange,
): PreciseCut | null => {
  const segments = frags.filter((frag) => !frag.isMap);
  const first = segments.at(0);
  const last = segments.at(-1);
  if (!first || !last) return null;

  const contentStart = first.offset;
  const contentEnd = last.offset + last.duration;
  const clamp = (time: number) =>
    Math.min(Math.max(time, contentStart), contentEnd);

  const startTime = clamp(range.startTime);
  const endTime =
    range.endTime === Infinity ? contentEnd : clamp(range.endTime);
  const duration = endTime - startTime;
  if (duration <= 0) return null;

  const isStartAligned = startTime - contentStart < PRECISE_CUT_THRESHOLD_SEC;
  const isEndAligned = contentEnd - endTime < PRECISE_CUT_THRESHOLD_SEC;
  if (isStartAligned && isEndAligned) return null;

  // The file starts where the first downloaded fragment starts, so the cut is
  // relative to it and not to the beginning of the stream
  return { startTime: startTime - contentStart, duration };
};

/**
 * Trims the file by re-encoding it, so the cut is frame accurate instead of
 * fragment accurate. Slow on purpose: it's the price of a precise cut
 */
export const getPreciseCutArgs = (
  inputPath: string,
  outputPath: string,
  cut: PreciseCut,
  isAudioOnly: boolean,
) => [
  '-hide_banner',
  '-y',
  '-ss',
  cut.startTime.toFixed(3),
  '-i',
  inputPath,
  '-t',
  cut.duration.toFixed(3),
  // prettier-ignore
  ...(isAudioOnly
    ? ['-vn', '-c:a', 'aac', '-b:a', '192k']
    : ['-map', '0', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k']),
  '-movflags',
  '+faststart',
  outputPath,
];

export const preciseCut = async (
  outputPath: string,
  cut: PreciseCut,
  isAudioOnly: boolean,
) => {
  const parsed = path.parse(outputPath);
  const tmpPath = path.join(parsed.dir, `${parsed.name}.precise-tmp.mp4`);
  console.log(
    `[precise-cut] Re-encoding ${formatTime(cut.startTime)} → ${formatTime(
      cut.startTime + cut.duration,
    )} of the downloaded file (this can take a while)`,
  );
  const retCode = await spawn(
    'ffmpeg',
    getPreciseCutArgs(outputPath, tmpPath, cut, isAudioOnly),
    true,
  );
  // The cut is only applied when ffmpeg produced something usable, so a
  // failing re-encode can never replace a good file with an empty one
  const isEmpty = ((await statsOrNull(tmpPath))?.size || 0) < 1024;
  if (retCode !== 0 || isEmpty) {
    console.warn(
      '[precise-cut] ffmpeg failed, keeping the fragment accurate cut',
    );
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    return false;
  }
  await fsp.unlink(outputPath);
  await fsp.rename(tmpPath, outputPath);
  console.log('[precise-cut] Done');
  return true;
};
