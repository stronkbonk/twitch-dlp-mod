import {
  ARCHIVE_ENV,
  AUDIO_FORMATS,
  MERGE_METHODS,
  OUTPUT_DIR_ENV,
  UNMUTE,
} from '../../constants.ts';
import type { AppArgs, RawArgs } from '../../types.ts';
import { getDownloader } from './getDownloader.ts';
import { parseDownloadSectionsArg } from './parseDownloadSectionsArg.ts';
import { parseTime } from './parseTime.ts';

const parseDurationArg = (value: string | undefined, argName: string) => {
  if (value === undefined) return null;
  const seconds = (() => {
    try {
      return parseTime(value);
    } catch {
      throw new Error(`Wrong ${argName} value: ${value}`);
    }
  })();
  if (seconds <= 0) throw new Error(`Wrong ${argName} value: ${value}`);
  return seconds;
};

const parseIntArg = (
  value: string | undefined,
  argName: string,
  defaultValue: number,
  max: number,
) => {
  if (value === undefined) return defaultValue;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`Wrong ${argName} value: ${value}`);
  }
  const n = Number.parseInt(value, 10);
  if (n < 1 || n > max) {
    throw new Error(`${argName} must be between 1 and ${max}`);
  }
  return n;
};

const parseCountArg = (
  value: string | undefined,
  argName: string,
  defaultValue: number,
) => {
  if (value === undefined) return defaultValue;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`Wrong ${argName} value: ${value}`);
  }
  return Number.parseInt(value, 10);
};

export const normalizeArgs = async (args: RawArgs['values']) => {
  const newArgs = { ...args } as unknown as AppArgs;

  newArgs.downloader = await getDownloader(args.downloader);

  newArgs['download-sections'] = parseDownloadSectionsArg(
    args['download-sections'],
  );
  newArgs['download-last'] = parseDurationArg(
    args['download-last'],
    '--download-last',
  );
  newArgs.duration = parseDurationArg(args.duration, '--duration');
  newArgs['frag-concurrency'] = parseIntArg(
    args['frag-concurrency'],
    '--frag-concurrency',
    1,
    32,
  );
  newArgs['frag-retries'] = parseIntArg(
    args['frag-retries'],
    '--frag-retries',
    5,
    100,
  );
  newArgs['poll-interval'] = parseIntArg(
    args['poll-interval'],
    '--poll-interval',
    60,
    3600,
  );
  newArgs['max-downloads'] = parseCountArg(
    args['max-downloads'],
    '--max-downloads',
    0,
  );
  newArgs['sleep-interval'] = parseCountArg(
    args['sleep-interval'],
    '--sleep-interval',
    0,
  );

  if (args['extract-audio']) {
    const audioFormats = AUDIO_FORMATS as readonly string[];
    if (!audioFormats.includes(args['extract-audio'])) {
      throw new Error(
        `Unknown audio format: ${args['extract-audio']}. Available: ${AUDIO_FORMATS.join(', ')}`,
      );
    }
    newArgs['extract-audio'] = args[
      'extract-audio'
    ] as AppArgs['extract-audio'];
  } else {
    newArgs['extract-audio'] = undefined;
  }

  if (args['audio-only'] && args.format !== 'best') {
    throw new Error('--audio-only cannot be used with --format');
  }

  if (newArgs['download-last'] && newArgs['download-sections']) {
    throw new Error('--download-last cannot be used with --download-sections');
  }
  if (newArgs.duration && newArgs['download-last']) {
    throw new Error('--duration cannot be used with --download-last');
  }
  // Default output directory, so the downloads can be redirected once
  // (e.g. TWITCH_DLP_OUTPUT_DIR="E:/Twitch VODs")
  if (!newArgs['output-dir']) {
    newArgs['output-dir'] = process.env[OUTPUT_DIR_ENV] || undefined;
  }
  // Same idea for the archive, so batch runs can keep skipping old videos
  // without passing --download-archive every time
  if (!newArgs['download-archive']) {
    newArgs['download-archive'] = process.env[ARCHIVE_ENV] || undefined;
  }

  if (args['webhook']) {
    try {
      new URL(args['webhook']);
    } catch {
      throw new Error(`Wrong --webhook url: ${args['webhook']}`);
    }
  }

  if (args['retry-streams']) {
    const delay = Number.parseInt(args['retry-streams']);
    if (!delay) throw new Error('Wrong --retry-streams delay');
    if (delay < 10) throw new Error('Min --retry-streams delay is 10');
    newArgs['retry-streams'] = delay;
  }

  if (!(MERGE_METHODS as readonly string[]).includes(args['merge-method'])) {
    throw new Error(
      `Unknown merge method: ${args['merge-method']}. Available: ${MERGE_METHODS.join(', ')}`,
    );
  }

  const unmuteValues = Object.values(UNMUTE);
  if (args['unmute'] && !unmuteValues.includes(args['unmute'] as any)) {
    throw new Error(
      `Unknown unmute policy: ${args['unmute']}. Available: ${unmuteValues.join(', ')}`,
    );
  }

  return newArgs;
};
