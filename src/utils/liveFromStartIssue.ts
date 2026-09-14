/**
 * Why a live stream couldn't be downloaded from the start.
 *
 * Twitch only keeps a stream when the streamer has "Store past broadcasts"
 * enabled, so for some channels there is no video of the stream at all
 */
export type LiveFromStartIssue =
  /** The channel stores no past broadcasts, so no video exists */
  | 'no-stored-vods'
  /** The stream's video exists, but it isn't available yet */
  | 'vod-not-ready';

type Options = {
  /** --retry-streams was passed */
  isRetry: boolean;
  /** Delay between --retry-streams attempts (sec) */
  delaySec: number;
  /** --download-last, --download-sections, --duration or --until-now was passed */
  hasRangeArgs: boolean;
};

/** Only a video that isn't published yet can appear on a later attempt */
export const isRetryableIssue = (issue: LiveFromStartIssue) =>
  issue === 'vod-not-ready';

/**
 * Builds an explanation for a failed `--live-from-start`. The lines are kept
 * under 80 characters, so they read well in a terminal
 */
export const getIssueLines = (issue: LiveFromStartIssue, options: Options) => {
  const lines: string[] = [];

  if (issue === 'no-stored-vods') {
    lines.push(
      '[live-from-start] Cannot download from the start: this channel stores no',
      'past broadcasts, so Twitch has no video of the stream to download.',
      'Twitch records a stream only when the streamer enables "Store past',
      'broadcasts" and it is off for this channel, so its past is not available',
      'to any tool. Use a VOD link if one exists, or record from now on instead.',
    );
    if (options.hasRangeArgs) {
      lines.push(
        'The requested range (--download-last, --download-sections, --duration or',
        '--until-now) needs that video, because the past was never recorded.',
      );
    }
    lines.push(
      'Drop --live-from-start to record the stream from the live edge (needs',
      'streamlink), or pass --fallback-live-edge to fall back to that on its own.',
    );
    return lines;
  }

  lines.push(
    "[live-from-start] The stream's video isn't available yet. Twitch publishes",
    'it a few seconds after the stream starts and keeps it hidden for a moment',
  );
  lines.push(
    options.isRetry
      ? `Retry every ${options.delaySec} second(s)`
      : 'Try again in a moment, or pass --retry-streams 60 to wait for it',
  );
  return lines;
};
