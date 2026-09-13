import * as api from '../api/twitch.ts';
import { PRIVATE_VIDEO_INSTRUCTIONS } from '../constants.ts';
import type { AppArgs, DownloadOutcome } from '../types.ts';
import { downloadVideo } from '../utils/downloadVideo.ts';
import {
  getVideoFormats,
  getVideoFormatsByThumbUrl,
} from '../utils/getVideoFormats.ts';
import { getVideoInfoByVideoMeta } from '../utils/getVideoInfo.ts';

export const downloadByVideoId = async (
  videoId: string,
  args: AppArgs,
): Promise<DownloadOutcome | void> => {
  let [formats, videoMeta] = await Promise.all([
    getVideoFormats(videoId),
    api.getVideoMetadata(videoId),
  ]);
  // should work for VODs and highlights
  if (formats.length === 0 && videoMeta !== null) {
    console.log('Trying to get playlist from video metadata');
    formats = await getVideoFormatsByThumbUrl(
      videoMeta.broadcastType,
      videoMeta.id,
      videoMeta.previewThumbnailURL,
    );
  }
  if (formats.length === 0 || !videoMeta) {
    console.log(PRIVATE_VIDEO_INSTRUCTIONS);
    return 'failed';
  }
  const videoInfo = getVideoInfoByVideoMeta(videoMeta);
  return downloadVideo(formats, videoInfo, args);
};
