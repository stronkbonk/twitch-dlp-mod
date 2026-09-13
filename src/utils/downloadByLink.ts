import { downloadByChannelLogin } from '../commands/downloadByChannelLogin.ts';
import { downloadByStatsService } from '../commands/downloadByStatsService.ts';
import { downloadByVideoId } from '../commands/downloadByVideoId.ts';
import { downloadByVodPath } from '../commands/downloadByVodPath.ts';
import { downloadClip } from '../commands/downloadClip.ts';
import type { AppArgs, DownloadOutcome } from '../types.ts';
import { parseLink } from './args/parseLink.ts';

/** Runs the command that matches the link */
export const downloadByLink = async (
  link: string,
  args: AppArgs,
): Promise<DownloadOutcome | void> => {
  const parsedLink = parseLink(link);
  if (parsedLink.type === 'vodPath') return downloadByVodPath(parsedLink, args);
  if (parsedLink.type === 'video') {
    return downloadByVideoId(parsedLink.videoId, args);
  }
  if (parsedLink.type === 'clip') return downloadClip(parsedLink.slug, args);
  // prettier-ignore
  if (parsedLink.type === 'channel') return downloadByChannelLogin(parsedLink.channelLogin, args);
  if (parsedLink.type === 'statsService') {
    return downloadByStatsService(parsedLink, args);
  }
};
