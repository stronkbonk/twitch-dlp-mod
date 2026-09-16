#!/usr/bin/env node
/**
 * Live smoke test: downloads a few seconds of a live Twitch stream.
 *
 * The unit tests are pure logic, so nothing in the test suite talks to Twitch.
 * This does, on purpose: it fails when their API, their playlists or their
 * fragment URLs stop working, so breakage surfaces without a user hitting it.
 *
 * It picks a live channel that stores past broadcasts, downloads a short range
 * from the start of the stream and checks the result plays. Channels are taken
 * from the built-in list and from the top live streams of a few games, so the
 * test doesn't depend on a particular streamer being online.
 *
 * Usage:
 *   pnpm run smoke:live
 *
 * Env:
 *   SMOKE_CHANNELS  comma separated channels to try instead of the built-in
 *                   list and the discovery step (useful to reproduce a failure)
 *   SMOKE_SECONDS   how many seconds to download (default 20)
 *   SMOKE_ATTEMPTS  how many live channels to try before giving up (default 5)
 *   SMOKE_TIMEOUT   hard limit in seconds for one download (default 150)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getQueryDirectoryPageGame, gqlRequest } from 'twitch-gql-queries';
import * as api from '../src/api/twitch.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'twitch-dlp.js');
const OUTPUT_DIR = path.join(os.tmpdir(), 'twitch-dlp-mod-smoke');

const SECONDS = Number(process.env.SMOKE_SECONDS || 20);
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 5);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT || 150) * 1000;

/** Channels that stream for many hours and store past broadcasts */
const BUILT_IN_CHANNELS = [
  'RocketBeansTV',
  'monstercat',
  'xqc',
  'loltyler1',
  'jynxzi',
  'kaicenat',
  'sodapoppin',
  'hasanabi',
  'tarik',
  'summit1g',
  'zackrawrr',
  'northernlion',
  'jinnytty',
  'forsen',
  'lirik',
  'eslcs',
  'lck',
  'pgl',
  'riotgames',
  'gaules',
  'elraenn',
  'casimito',
];

/** Games whose top streams are big channels that store past broadcasts */
const DISCOVERY_SLUGS = ['just-chatting', 'league-of-legends', 'music'];
const DISCOVERY_LIMIT = 10;

const MEDIA_EXT = new Set(['.mp4', '.ts', '.mkv', '.m4a', '.mp3']);

type ProcessResult = {
  code: number | null;
  output: string;
  timedOut: boolean;
};

type Report = {
  channel: string;
  result: string;
  detail?: string;
};

const runProcess = (
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<ProcessResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args);
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout?.on('data', (data) => (output += data));
    child.stderr?.on('data', (data) => (output += data));
    child.on('error', (e: any) => {
      clearTimeout(timer);
      resolve({ code: null, output: `${e.message}\n`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });

/** Every media file in the output directory */
const listMediaFiles = (dir: string) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => MEDIA_EXT.has(path.extname(file).toLowerCase()));
};

type MediaInfo = {
  duration: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  probed: boolean;
};

const probeMedia = async (file: string): Promise<MediaInfo> => {
  const res = await runProcess(
    'ffprobe',
    ['-v', 'error', '-of', 'json', '-show_format', '-show_streams', file],
    30_000,
  );
  if (res.code !== 0)
    return { duration: null, hasVideo: false, hasAudio: false, probed: false };
  try {
    const parsed = JSON.parse(res.output);
    const streams: any[] = parsed.streams ?? [];
    const duration = Number.parseFloat(parsed.format?.duration);
    return {
      duration: Number.isFinite(duration) ? duration : null,
      hasVideo: streams.some((s) => s.codec_type === 'video'),
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
      probed: true,
    };
  } catch {
    return { duration: null, hasVideo: false, hasAudio: false, probed: false };
  }
};

/** Top live channels of the given games: live by definition of the query */
const discoverChannels = async () => {
  const channels = new Set<string>();
  for (const slug of DISCOVERY_SLUGS) {
    try {
      const [res] = await gqlRequest([
        getQueryDirectoryPageGame({
          slug,
          options: { sort: 'VIEWER_COUNT' },
          sortTypeIsRecency: false,
          limit: DISCOVERY_LIMIT,
          includeIsDJ: false,
        }),
      ]);
      const edges: any[] = (res as any)?.data?.game?.streams?.edges ?? [];
      const logins = edges
        .map((edge) => edge?.node?.broadcaster?.login)
        .filter(Boolean);
      for (const login of logins) channels.add(login);
      console.log(`[discover] ${slug}: ${logins.length} live channel(s)`);
    } catch (e: any) {
      console.warn(`[discover] ${slug} failed: ${e.message}`);
    }
  }
  return [...channels];
};

const tail = (text: string, lines = 12) =>
  text.trimEnd().split('\n').slice(-lines).join('\n');

const main = async () => {
  if (!fs.existsSync(TOOL))
    throw new Error(`${TOOL} not found, run pnpm run build`);

  const version = await runProcess(
    process.execPath,
    [TOOL, '--version'],
    30_000,
  );
  if (version.code !== 0) {
    throw new Error(`Cannot run the bundle: ${tail(version.output, 3)}`);
  }
  console.log(
    `[smoke] twitch-dlp-mod ${version.output.trim()}, downloading ${SECONDS}s of a live stream`,
  );

  const envChannels = (process.env.SMOKE_CHANNELS || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const candidates = envChannels.length
    ? envChannels
    : [...BUILT_IN_CHANNELS, ...(await discoverChannels())];
  console.log(`[smoke] ${candidates.length} candidate channel(s)`);

  const report: Report[] = [];
  let live = 0;
  let attempts = 0;
  let unreachable = 0;
  let noStoredVods = 0;
  let succeeded = false;

  for (const channel of candidates) {
    if (succeeded || attempts >= ATTEMPTS) break;

    const metadata = await api.getStreamMetadata(channel);
    if (!metadata) {
      // The request failed: either a bad channel name or Twitch is unreachable
      unreachable += 1;
      report.push({ channel, result: 'no metadata' });
      continue;
    }
    const stream = metadata.stream;
    if (!stream) {
      report.push({ channel, result: 'offline' });
      continue;
    }

    const ageSec = (Date.now() - new Date(stream.createdAt).getTime()) / 1000;
    if (ageSec < SECONDS + 60) {
      report.push({
        channel,
        result: 'too new',
        detail: `live for ${Math.round(ageSec)}s`,
      });
      continue;
    }

    live += 1;
    attempts += 1;
    console.log(
      `\n[smoke] ${channel}: live for ${Math.round(ageSec / 60)}m, trying a download`,
    );

    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    const download = await runProcess(
      process.execPath,
      [
        TOOL,
        `https://www.twitch.tv/${channel}`,
        '--live-from-start',
        '--download-last',
        `${SECONDS}s`,
        '-P',
        OUTPUT_DIR,
      ],
      TIMEOUT_MS,
    );
    console.log(tail(download.output, 25));

    if (download.timedOut) {
      report.push({
        channel,
        result: 'timeout',
        detail: `${TIMEOUT_MS / 1000}s`,
      });
      continue;
    }
    if (download.code !== 0) {
      const storesNothing = /stores no\s+past broadcasts/.test(download.output);
      if (storesNothing) noStoredVods += 1;
      report.push({
        channel,
        result: storesNothing ? 'no stored VODs' : 'download failed',
        detail: `exit ${download.code}`,
      });
      continue;
    }

    const files = listMediaFiles(OUTPUT_DIR);
    if (files.length === 0) {
      report.push({ channel, result: 'no output file' });
      continue;
    }

    const file = path.join(OUTPUT_DIR, files[0]);
    const size = fs.statSync(file).size;
    const media = await probeMedia(file);
    const path_ = download.output.includes('Recovering the playlist')
      ? 'recovered playlist'
      : 'public VOD';
    const detail = `${(size / 1024 / 1024).toFixed(1)}MB, ${media.duration ?? '?'}s, ${
      media.hasVideo ? 'video' : 'no video'
    }+${media.hasAudio ? 'audio' : 'no audio'}, ${path_}`;

    // A few seconds of video is megabytes: a tiny file or a stub means the
    // download "succeeded" without downloading anything
    const tooSmall = size < 10 * 1024;
    const wrongDuration =
      media.probed && media.duration !== null && media.duration < SECONDS / 2;
    if (
      tooSmall ||
      wrongDuration ||
      (media.probed && !media.hasAudio && !media.hasVideo)
    ) {
      report.push({ channel, result: 'bad output', detail });
      continue;
    }
    if (!media.probed)
      console.warn('[smoke] ffprobe is unavailable, only the size was checked');

    succeeded = true;
    report.push({ channel, result: 'downloaded', detail });
  }

  console.log('\n[smoke] Report');
  for (const { channel, result, detail } of report) {
    console.log(
      `  ${channel.padEnd(20)} ${result}${detail ? ` (${detail})` : ''}`,
    );
  }

  const summary = [
    `### Nightly live smoke test`,
    '',
    succeeded
      ? `Downloaded ${SECONDS}s of a live stream from **${report.at(-1)?.channel}**.`
      : `**Failed**: ${live} live channel(s) tried, nothing downloaded.`,
    '',
    '| channel | result | detail |',
    '| --- | --- | --- |',
    ...report.map(
      ({ channel, result, detail }) =>
        `| ${channel} | ${result} | ${detail ?? ''} |`,
    ),
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  if (succeeded) return;

  process.exitCode = 1;
  if (live === 0) {
    throw new Error(
      unreachable > 0
        ? `Twitch returned no metadata for ${unreachable} channel(s) and no other candidate is live: the API is likely unreachable or changed`
        : 'No candidate channel is live right now: the test could not run',
    );
  }
  if (noStoredVods === attempts) {
    throw new Error(
      'Every live channel tried stores no past broadcasts, so there was nothing to download. Use SMOKE_CHANNELS to pick one that does',
    );
  }
  throw new Error(
    `Downloading a live stream failed on ${attempts} live channel(s)`,
  );
};

main().catch((e) => {
  console.error(`\n[smoke] FAILED: ${e.message}`);
  process.exitCode = 1;
});
