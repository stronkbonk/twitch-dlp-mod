import fsp from 'node:fs/promises';
import type { DownloadFormat, VideoInfo } from '../types.ts';
import type { DownloadRange } from './getDownloadRange.ts';
import { getPath } from './getPath.ts';

type InfoJson = {
  videoInfo: VideoInfo;
  dlFormat: DownloadFormat;
  range: DownloadRange;
  playlistUrl: string;
  fragmentCount: number;
  downloadedBytes: number;
};

export const writeInfoJson = async (outputPath: string, data: InfoJson) => {
  const { videoInfo, dlFormat, range, playlistUrl, fragmentCount } = data;
  const info = {
    ...videoInfo,
    live: range.isLive,
    range_start: range.startTime,
    range_end: range.endTime === Infinity ? null : range.endTime,
    playlist_url: playlistUrl,
    format_id: dlFormat.format_id,
    fragment_count: fragmentCount,
    downloaded_bytes: data.downloadedBytes,
    downloaded_at: new Date().toISOString(),
  };
  const infoPath = getPath.infoJson(outputPath);
  await fsp.writeFile(infoPath, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[info-json] Saved to ${infoPath}`);
};
