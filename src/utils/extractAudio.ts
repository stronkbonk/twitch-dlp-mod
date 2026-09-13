import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from '../lib/spawn.ts';
import type { AudioFormat } from '../types.ts';

/** Audio encoder args for every `--extract-audio` value */
const ENCODE_ARGS: Record<AudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  opus: ['-c:a', 'libopus', '-b:a', '160k'],
  flac: ['-c:a', 'flac'],
  wav: ['-c:a', 'pcm_s16le'],
  copy: ['-c:a', 'copy'],
};

export const getExtractAudioArgs = (
  inputPath: string,
  outputPath: string,
  format: AudioFormat,
) => [
  '-hide_banner',
  '-y',
  '-i',
  inputPath,
  '-vn',
  ...ENCODE_ARGS[format],
  outputPath,
];

/**
 * Converts a downloaded video into an audio-only file.
 * The video is removed afterwards unless `keepVideo` is set
 */
export const extractAudio = async (
  inputPath: string,
  outputPath: string,
  format: AudioFormat,
  keepVideo: boolean,
) => {
  console.log(`[extract-audio] Converting to ${format}`);
  const retCode = await spawn(
    'ffmpeg',
    getExtractAudioArgs(inputPath, outputPath, format),
    true,
  );
  if (retCode !== 0) {
    console.warn('[extract-audio] ffmpeg failed, keeping the video');
    await fsp.rm(outputPath, { force: true }).catch(() => {});
    return false;
  }
  if (!keepVideo && path.resolve(inputPath) !== path.resolve(outputPath)) {
    await fsp.unlink(inputPath).catch(() => {});
  }
  console.log(`[extract-audio] Saved to ${outputPath}`);
  return true;
};
