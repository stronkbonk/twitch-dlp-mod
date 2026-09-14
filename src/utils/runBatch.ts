import { setTimeout as sleep } from 'node:timers/promises';
import { chalk } from '../lib/chalk.ts';
import type { AppArgs } from '../types.ts';
import { downloadByLink } from './downloadByLink.ts';

/**
 * Downloads every link one after another.
 *
 * A failing link doesn't stop the batch, only a single link run rethrows the
 * error. Passed with more than one link, the exit code is 1 if any failed
 */
export const runBatch = async (links: string[], args: AppArgs) => {
  const isBatch = links.length > 1;
  const maxDownloads = args['max-downloads'];
  const sleepIntervalSec = args['sleep-interval'];

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];

    if (maxDownloads && downloaded >= maxDownloads) {
      console.log(`[batch] Reached --max-downloads ${maxDownloads}`);
      break;
    }

    if (isBatch) console.log(`\n[batch] ${i + 1}/${links.length}: ${link}`);

    try {
      const outcome = await downloadByLink(link, args);
      if (outcome === 'skipped') skipped += 1;
      else if (outcome === 'failed') failed += 1;
      else downloaded += 1;

      if (sleepIntervalSec && i + 1 < links.length) {
        console.log(`[batch] Waiting ${sleepIntervalSec} second(s)`);
        await sleep(sleepIntervalSec * 1000);
      }
    } catch (e: any) {
      if (!isBatch) throw e;
      failed += 1;
      console.error(`${chalk.red('ERROR:')} ${link}: ${e.message}`);
    }
  }

  // Even a single link should fail loudly, so scripts can react to it
  if (!isBatch) {
    if (failed > 0) process.exitCode = 1;
    return;
  }

  const summary = [
    `${downloaded} downloaded`,
    skipped ? `${skipped} skipped` : null,
    failed ? `${failed} failed` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`\n[batch] Done: ${summary}`);

  if (failed > 0) process.exitCode = 1;
};
