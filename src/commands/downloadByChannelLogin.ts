import { setTimeout as sleep } from 'node:timers/promises';
import * as api from '../api/twitch.ts';
import type { AppArgs, DownloadOutcome } from '../types.ts';
import { downloadVideo } from '../utils/downloadVideo.ts';
import { downloadWithStreamlink } from '../utils/downloadWithStreamlink.ts';
import { getLiveVideoInfo } from '../utils/getLiveVideoInfo.ts';
import {
  getIssueLines,
  isRetryableIssue,
} from '../utils/liveFromStartIssue.ts';

export const downloadByChannelLogin = async (
  channelLogin: string,
  args: AppArgs,
): Promise<DownloadOutcome | void> => {
  const link = `https://www.twitch.tv/${channelLogin}`;
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
      await downloadWithStreamlink(link, streamMeta, channelLogin, args);
    }

    // from start
    if (isLive && isLiveFromStart) {
      const liveVideoInfo = await getLiveVideoInfo(streamMeta, channelLogin);
      if (liveVideoInfo.ok) {
        const { formats, videoInfo } = liveVideoInfo;
        const outcome = await downloadVideo(formats, videoInfo, args);
        if (!isRetry || args['download-sections']) return outcome;
      } else {
        const { issue } = liveVideoInfo;
        for (const line of getIssueLines(issue, {
          isRetry,
          delaySec: delay,
          hasRangeArgs: isRangeArg,
        })) {
          console.warn(line);
        }
        // Retrying only helps while the stream's video may still appear
        if (!isRetry || !isRetryableIssue(issue)) {
          if (args['fallback-live-edge']) {
            console.warn(
              '[fallback-live-edge] Recording from the live edge instead',
            );
            await downloadWithStreamlink(link, streamMeta, channelLogin, args);
            return;
          }
          return 'failed';
        }
      }
    }

    await sleep(delay * 1000);
  }
};
