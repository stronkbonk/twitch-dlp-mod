import * as api from '../api/twitch.ts';
import type { DownloadFormat, VideoInfo } from '../types.ts';
import {
  getFullVodPath,
  getVideoFormats,
  getVideoFormatsByFullVodPath,
} from './getVideoFormats.ts';
import {
  getVideoInfoByStreamMeta,
  getVideoInfoByVideoMeta,
} from './getVideoInfo.ts';
import type { LiveFromStartIssue } from './liveFromStartIssue.ts';

export type LiveVideoInfoResult =
  | { ok: true; formats: DownloadFormat[]; videoInfo: VideoInfo }
  | { ok: false; issue: LiveFromStartIssue };

export const getLiveVideoInfo = async (
  streamMeta: api.StreamMetadata,
  channelLogin: string,
): Promise<LiveVideoInfoResult> => {
  let formats: DownloadFormat[] = [];
  let videoInfo: VideoInfo | null = null;

  if (!streamMeta.stream) throw new Error(); // make ts happy

  const broadcasts = await api.getRecentArchiveBroadcasts(streamMeta.id);
  const edges = broadcasts?.videos.edges;
  const broadcast = edges?.[0]?.node;

  const startTimestampMs = new Date(streamMeta.stream.createdAt).getTime();

  // public VOD
  if (
    broadcast &&
    startTimestampMs <= new Date(broadcast.createdAt).getTime()
  ) {
    let videoMeta: Awaited<ReturnType<typeof api.getVideoMetadata>>;
    [formats, videoMeta] = await Promise.all([
      getVideoFormats(broadcast.id),
      api.getVideoMetadata(broadcast.id),
    ]);
    if (videoMeta) videoInfo = getVideoInfoByVideoMeta(videoMeta);
  }

  // A VOD is published about 5-20 seconds after a stream starts
  // Wait at least 30 seconds before trying to recover the playlist
  const checkPrivateVod = startTimestampMs + 30_000 < Date.now();

  // private VOD
  if (checkPrivateVod && formats.length === 0) {
    console.warn('[live-from-start] Recovering the playlist');
    const startTimestamp = startTimestampMs / 1000;
    const vodPath = `${channelLogin}_${streamMeta.stream.id}_${startTimestamp}`;
    formats = await getVideoFormatsByFullVodPath(getFullVodPath(vodPath));
    videoInfo = getVideoInfoByStreamMeta(streamMeta, channelLogin);
  }

  if (formats.length > 0 && videoInfo) return { ok: true, formats, videoInfo };

  // Twitch lists the videos it stores: no archived broadcast at all means the
  // channel doesn't store past broadcasts. If there is an older one (or the
  // request failed), the stream's own video just isn't published yet
  const issue: LiveFromStartIssue =
    edges?.length === 0 ? 'no-stored-vods' : 'vod-not-ready';
  return { ok: false, issue };
};
