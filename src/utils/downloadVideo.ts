import fsp from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  AUDIO_EXT,
  DEFAULT_OUTPUT_TEMPLATE,
  NO_TRY_UNMUTE_MESSAGE,
} from '../constants.ts';
import { chalk } from '../lib/chalk.ts';
import { formatTime } from '../lib/formatTime.ts';
import * as hlsParser from '../lib/hlsParser.ts';
import { isInstalled } from '../lib/isInstalled.ts';
import { statsOrNull } from '../lib/statsOrNull.ts';
import { mergeFrags } from '../merge/index.ts';
import {
  createLogger,
  DL_EVENT,
  logFragsForDownloading,
  showStats,
} from '../stats.ts';
import type {
  AppArgs,
  DownloadFormat,
  DownloadOutcome,
  FragMetadata,
  Frags,
  VideoInfo,
} from '../types.ts';
import { downloadFragsPass } from './downloadFragsPass.ts';
import { extractAudio } from './extractAudio.ts';
import { fetchText } from './fetchText.ts';
import { getAudioOnlyFormat, getDlFormat } from './getDlFormat.ts';
import { appendToArchive, readArchive } from './getDownloadArchive.ts';
import {
  resolveDownloadRange,
  type DownloadRange,
  type RangeState,
} from './getDownloadRange.ts';
import { getExistingFrags } from './getExistingFrags.ts';
import { getFragsForDownloading } from './getFragsForDownloading.ts';
import { ensureOutputDir, getPath } from './getPath.ts';
import { getTryUnmute } from './getTryUnmute.ts';
import { notifyWebhook } from './notifyWebhook.ts';
import { getPreciseCutRange, preciseCut } from './preciseCut.ts';
import { processUnmutedFrags } from './processUnmutedFrags.ts';
import { readOutputDir } from './readOutputDir.ts';
import { showFormats } from './showFormats.ts';
import { writeInfoJson } from './writeInfoJson.ts';

const DEFAULT_POLL_INTERVAL_SEC = 60;

const getRetryMessage = (delaySec: number) =>
  `Retry every ${delaySec} second(s)`;

const getRangeKey = (range: DownloadRange) =>
  [range.startTime, range.endTime, range.isLive].join('-');

const showRange = (range: DownloadRange) => {
  const start = formatTime(range.startTime);
  const end =
    range.endTime === Infinity ? 'live edge' : formatTime(range.endTime);
  const status = range.isLive ? 'live' : 'finished';
  console.log(`[range] ${start} → ${end} | ${status}`);
};

const showDryRun = (range: DownloadRange, frags: Frags, outputPath: string) => {
  const segments = frags.filter((frag) => !frag.isMap);
  const last = segments.at(-1);
  const duration = segments.reduce((acc, frag) => acc + frag.duration, 0);
  console.log('[dry-run] Nothing will be downloaded');
  console.log(`[dry-run] Destination: ${outputPath}`);
  console.log(
    `[dry-run] Requested: ${formatTime(range.startTime)} → ${
      range.endTime === Infinity ? 'live edge' : formatTime(range.endTime)
    }`,
  );
  console.log(
    `[dry-run] Fragments: ${segments.length} (${formatTime(duration)} of video, ${formatTime(
      segments[0]?.offset || 0,
    )} → ${formatTime((last?.offset || 0) + (last?.duration || 0))})`,
  );
  if (range.isLive && !range.isAvailable) {
    console.log(
      `[dry-run] The requested range is not fully aired yet (live edge: ${formatTime(
        range.availableDuration,
      )})`,
    );
  }
};

export const downloadVideo = async (
  formats: DownloadFormat[],
  videoInfo: VideoInfo,
  args: AppArgs,
): Promise<DownloadOutcome> => {
  if (formats.length === 0) throw new Error('Cannot get video formats');

  if (args['list-formats']) {
    showFormats(formats);
    return 'skipped';
  }

  if (!(await isInstalled('ffmpeg'))) {
    throw new Error(
      'ffmpeg is not installed. Install it from https://ffmpeg.org/',
    );
  }

  const pollIntervalSec = args['poll-interval'] || DEFAULT_POLL_INTERVAL_SEC;
  const retryMessage = getRetryMessage(pollIntervalSec);
  const title = `${videoInfo.title} [${videoInfo.id}]`;

  const isAudioOnly = !!(args['audio-only'] || args['extract-audio']);
  const dlFormat = args['audio-only']
    ? getAudioOnlyFormat(formats)
    : getDlFormat(formats, args.format);
  const outputTemplate = args.output || DEFAULT_OUTPUT_TEMPLATE;
  // Merging always produces a video file (an audio-only playlist is still an
  // mp4 container), so --extract-audio converts it in a second step
  const isExtractingAudio = !!args['extract-audio'];
  const outputPath = getPath.output(
    outputTemplate,
    isExtractingAudio || !isAudioOnly
      ? videoInfo
      : { ...videoInfo, ext: 'm4a' },
    args['output-dir'],
  );
  const destPath = isExtractingAudio
    ? getPath.replaceExt(outputPath, AUDIO_EXT[args['extract-audio']!])
    : outputPath;

  const archivePath = args['download-archive'];
  if (archivePath) {
    const archive = await readArchive(archivePath);
    if (archive.has(videoInfo.id)) {
      console.log(`[archive] Already downloaded, skipping: ${title}`);
      return 'skipped';
    }
  }

  // --dry-run doesn't touch the filesystem
  if (!args['dry-run']) await ensureOutputDir(destPath);
  console.log(`[download] Destination: ${destPath}`);

  const isAlreadyDownloaded =
    !args['dry-run'] && !!(await statsOrNull(destPath));
  if (args['no-overwrites'] && isAlreadyDownloaded) {
    console.log(`[download] File already exists, skipping: ${destPath}`);
    if (archivePath) await appendToArchive(archivePath, videoInfo.id);
    return 'skipped';
  }

  let frags: Frags | undefined;
  let fragsCount = 0;
  let playlistUrl = dlFormat.url;
  const downloadedFrags = new Map<number, FragMetadata>();

  const logPath = getPath.log(outputPath);
  const writeLog: ReturnType<typeof createLogger> = args['dry-run']
    ? async () => {}
    : createLogger(logPath);

  const tryUnmute = getTryUnmute(videoInfo);
  if (tryUnmute === false) console.warn(NO_TRY_UNMUTE_MESSAGE);

  writeLog([
    DL_EVENT.INIT,
    { args, formats, outputPath, playlistUrl, videoInfo },
  ]);

  const rangeState: RangeState = { fixedEnd: null };
  let range: DownloadRange | null = null;
  let loggedRangeKey: string | null = null;
  let isRangeCompleted = false;
  let isFirstCycle = true;

  while (true) {
    let playlistContent = await fetchText(playlistUrl, 'playlist');
    // workaround for some old muted highlights
    if (!playlistContent) {
      writeLog([DL_EVENT.FETCH_PLAYLIST_FAILURE]);
      const newPlaylistUrl = dlFormat.url.replace(/-muted-\w+(?=\.m3u8$)/, '');
      if (newPlaylistUrl !== playlistUrl) {
        playlistContent = await fetchText(playlistUrl, 'playlist (attempt #2)');
        if (playlistContent) {
          playlistUrl = newPlaylistUrl;
          writeLog([DL_EVENT.FETCH_PLAYLIST_OLD_MUTED_SUCCESS, playlistUrl]);
        } else {
          writeLog([DL_EVENT.FETCH_PLAYLIST_OLD_MUTED_FAILURE]);
        }
      }
    }
    if (!playlistContent && !args['live-from-start']) {
      throw new Error('Cannot download the playlist');
    }
    if (!playlistContent) {
      console.warn(
        `[live-from-start] Waiting for the playlist. ${retryMessage}`,
      );
      await sleep(pollIntervalSec * 1000);
      continue;
    }

    const playlist = hlsParser.parse(
      playlistContent,
    ) as hlsParser.MediaPlaylist;
    writeLog([DL_EVENT.FETCH_PLAYLIST_SUCCESS]);

    range = resolveDownloadRange(playlist, args, rangeState);
    const rangeKey = getRangeKey(range);
    if (rangeKey !== loggedRangeKey) {
      showRange(range);
      loggedRangeKey = rangeKey;
    }

    // The requested part of the stream hasn't aired yet
    if (range.isPendingStart) {
      const message = `[download-sections] ${formatTime(
        range.startTime,
      )} hasn't aired yet (live edge: ${formatTime(range.availableDuration)})`;
      if (args['dry-run']) {
        console.log(message);
        return 'skipped';
      }
      console.log(`${message}. ${retryMessage}`);
      await sleep(pollIntervalSec * 1000);
      continue;
    }

    frags = getFragsForDownloading(playlistUrl, playlist, range);
    writeLog(logFragsForDownloading(frags));

    if (args['dry-run'] && isFirstCycle) {
      showDryRun(range, frags, destPath);
      return 'skipped';
    }

    await fsp.writeFile(getPath.playlist(outputPath), playlistContent);

    const hasNewFrags = frags.length > fragsCount;
    fragsCount = frags.length;

    if (hasNewFrags || isFirstCycle) {
      await downloadFragsPass({
        frags,
        fragsCount,
        outputPath,
        args,
        formats,
        tryUnmute: !!tryUnmute,
        downloadedFrags,
        writeLog,
      });
      process.stdout.write('\n');
    }
    isFirstCycle = false;

    if (playlist.endlist || (range.endTime !== Infinity && range.isAvailable)) {
      isRangeCompleted = true;
      break;
    }

    if (!hasNewFrags) {
      console.log(
        `[download] ${chalk.green('VOD ONLINE')}: waiting for new fragments. ${retryMessage}`,
      );
      await sleep(pollIntervalSec * 1000);
    }
  }

  if (!frags) throw new Error('Cannot download the playlist');

  if (!isRangeCompleted) {
    console.warn(
      `[download] The stream ended before ${formatTime(
        range!.startTime,
      )} → ${formatTime(range!.endTime)} was fully available`,
    );
  }

  const dir = await readOutputDir(outputPath);
  const existingFrags = getExistingFrags(frags, outputPath, dir);
  writeLog([DL_EVENT.FRAGS_EXISTING, existingFrags.length]);

  await processUnmutedFrags(existingFrags, outputPath, dir, writeLog);

  const retCode = await mergeFrags(
    args['merge-method'],
    existingFrags,
    outputPath,
    args['keep-fragments'],
  );
  writeLog([
    retCode ? DL_EVENT.MERGE_FRAGS_FAILURE : DL_EVENT.MERGE_FRAGS_SUCCESS,
  ]);

  if (!retCode) {
    if (args['precise-cut']) {
      const cut = getPreciseCutRange(frags, range!);
      if (cut) {
        await preciseCut(outputPath, cut, isAudioOnly);
      } else {
        console.log('[precise-cut] The range is already cut accurately');
      }
    }

    if (args['extract-audio']) {
      await extractAudio(
        outputPath,
        destPath,
        args['extract-audio'],
        !!args['keep-video'],
      );
    }

    if (archivePath) await appendToArchive(archivePath, videoInfo.id);
  }

  if (args['write-info-json']) {
    await writeInfoJson(destPath, {
      videoInfo,
      dlFormat,
      range: range!,
      playlistUrl,
      fragmentCount: existingFrags.length,
      downloadedBytes: [...downloadedFrags.values()].reduce(
        (acc, frag) => acc + frag.size,
        0,
      ),
    });
  }

  await notifyWebhook(
    args.webhook,
    retCode
      ? `twitch-dlp: download failed - ${title}`
      : `twitch-dlp: download finished - ${title}`,
  );

  await showStats(logPath);
  if (!args['keep-fragments']) await fsp.unlink(logPath);
  return retCode ? 'failed' : 'downloaded';
};
