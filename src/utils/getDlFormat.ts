import type { DownloadFormat } from '../types.ts';

/**
 * Picks the audio-only track of a playlist.
 * Twitch names it "Audio_Only" (VODs) or "audio_only" (streamlink)
 */
export const getAudioOnlyFormat = (formats: DownloadFormat[]) => {
  const audioFormat =
    formats.find((f) => /^audio[_-]?only$/i.test(f.format_id)) ??
    formats.find((f) => f.height === null);
  if (!audioFormat) throw new Error('Cannot find an audio-only format');
  return audioFormat;
};

export const getDlFormat = (formats: DownloadFormat[], formatArg: string) => {
  const dlFormat =
    formatArg === 'best'
      ? formats[0]
      : formats.find(
          (f) => f.format_id.toLowerCase() === formatArg.toLowerCase(),
        );
  if (!dlFormat) throw new Error(`Wrong format: ${formatArg}`);
  return dlFormat;
};
