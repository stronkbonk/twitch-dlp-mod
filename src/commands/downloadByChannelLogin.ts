import { setTimeout as sleep } from 'node:timers/promises';
import * as api from '../api/twitch.ts';
import type { AppArgs, DownloadOutcome } from '../types.ts';
import { downloadVideo } from '../utils/downloadVideo.ts';
import { downloadWithStreamlink } from '../utils/downloadWithStreamlink.ts';
import { getLiveVideoInfo } from '../utils/getLiveVideoInfo.ts';

export const downloadByChannelLogin = async (
  channelLogin: string,
  args: AppArgs,
): Promise<DownloadOutcome | void> => {
  const delay = args['retry-streams'] || 0;
  const isLiveFromStart = args['live-from-start'];
  const isRetry = delay > 0;

  const isRangeArg = !!(
    args['download-sections'] ||
    args['download-last'] ||
    args.duration ||
    args['until-now']
  );
  if (!isLiveFromStart && isRangeArg) {
    throw new Error(
      '--download-sections, --download-last, --duration and --until-now require --live-from-start',
    );
  }

  while (true) {
    const streamMeta = await api.getStreamMetadata(channelLogin);
    const isLive = !!streamMeta?.stream;
    if (!isLive) {
      if (isRetry) {
        console.log(
          `[retry-streams] Waiting for streams. Retry every ${delay} second(s)`,
        );
      } else {
        console.warn('[download] The channel is not currently live');
        return 'failed';
      }
    }

    // not from start
    if (isLive && !isLiveFromStart) {
      await downloadWithStreamlink(
        `https://www.twitch.tv/${channelLogin}`,
        streamMeta,
        channelLogin,
        args,
      );
    }

    // from start
    if (isLive && isLiveFromStart) {
      const liveVideoInfo = await getLiveVideoInfo(streamMeta, channelLogin);
      if (liveVideoInfo) {
        const { formats, videoInfo } = liveVideoInfo;
        const outcome = await downloadVideo(formats, videoInfo, args);
        if (!isRetry || args['download-sections']) return outcome;
      } else {
        let message = `[live-from-start] Cannot find the playlist`;
        if (isRetry) {
          message += `. Retry every ${delay} second(s)`;
          console.warn(message);
        } else {
          console.warn(message);
          return 'failed';
        }
      }
    }

    await sleep(delay * 1000);
  }
};
