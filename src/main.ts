#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mergeFragments } from './commands/mergeFragments.ts';
import { showHelp } from './commands/showHelp.ts';
import { showVersion } from './commands/showVersion.ts';
import { chalk } from './lib/chalk.ts';
import { normalizeArgs } from './utils/args/normalizeArgs.ts';
import { getLinks } from './utils/getLinks.ts';
import { runBatch } from './utils/runBatch.ts';

export const getArgs = () =>
  parseArgs({
    args: process.argv.slice(2),
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      version: {
        type: 'boolean',
      },
      format: {
        type: 'string',
        short: 'f',
        default: 'best',
      },
      'list-formats': {
        type: 'boolean',
        short: 'F',
      },
      output: {
        type: 'string',
        short: 'o',
      },
      downloader: {
        type: 'string',
        default: 'fetch',
      },
      proxy: {
        type: 'string',
      },
      'keep-fragments': {
        type: 'boolean',
        default: false,
      },
      'limit-rate': {
        type: 'string',
        short: 'r',
      },
      'live-from-start': {
        type: 'boolean',
      },
      'retry-streams': {
        type: 'string',
      },
      'download-sections': {
        type: 'string',
      },
      'download-last': {
        type: 'string',
      },
      duration: {
        type: 'string',
      },
      'until-now': {
        type: 'boolean',
      },
      'fallback-live-edge': {
        type: 'boolean',
      },
      'frag-concurrency': {
        type: 'string',
      },
      'frag-retries': {
        type: 'string',
      },
      'poll-interval': {
        type: 'string',
      },
      'output-dir': {
        type: 'string',
        short: 'P',
      },
      'write-info-json': {
        type: 'boolean',
      },
      webhook: {
        type: 'string',
      },
      'dry-run': {
        type: 'boolean',
      },
      'audio-only': {
        type: 'boolean',
      },
      'extract-audio': {
        type: 'string',
      },
      'keep-video': {
        type: 'boolean',
      },
      'precise-cut': {
        type: 'boolean',
      },
      'download-archive': {
        type: 'string',
      },
      'no-overwrites': {
        type: 'boolean',
      },
      'batch-file': {
        type: 'string',
      },
      'max-downloads': {
        type: 'string',
      },
      'sleep-interval': {
        type: 'string',
      },
      unmute: {
        type: 'string',
      },
      'merge-fragments': {
        type: 'boolean',
      },
      'merge-method': {
        type: 'string',
        default: 'ffconcat',
      },
      // streamlink twitch plugin args
      // https://streamlink.github.io/cli.html#twitch
      'twitch-disable-ads': { type: 'boolean' },
      'twitch-low-latency': { type: 'boolean' },
      'twitch-api-header': { type: 'string', multiple: true },
      'twitch-access-token-param': { type: 'string', multiple: true },
      'twitch-force-client-integrity': { type: 'boolean' },
      'twitch-purge-client-integrity': { type: 'boolean' },
    },
    allowPositionals: true,
  });

const main = async () => {
  const parsedArgs = getArgs();
  const args = await normalizeArgs(parsedArgs.values);
  const positionals = parsedArgs.positionals;

  if (args.version) return showVersion();
  if (args.help || (!positionals.length && !args['batch-file'])) {
    return showHelp();
  }

  // https://github.com/nodejs/node/pull/57165
  if (args.proxy) {
    process.env.NODE_USE_ENV_PROXY = '1';
    process.env.HTTP_PROXY = args.proxy;
    process.env.HTTPS_PROXY = args.proxy;
  }

  if (args['merge-fragments']) {
    if (positionals.length !== 1) {
      throw new Error('--merge-fragments expects exactly one filename');
    }
    return mergeFragments(positionals[0], args);
  }

  const links = await getLinks(positionals, args['batch-file']);
  if (links.length === 0) return showHelp();

  return runBatch(links, args);
};

main().catch((e) => {
  console.error(chalk.red('ERROR:'), e.message);
  process.exitCode = 1;
});
