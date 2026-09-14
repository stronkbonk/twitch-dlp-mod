import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getIssueLines, isRetryableIssue } from './liveFromStartIssue.ts';

const options = { isRetry: false, delaySec: 0, hasRangeArgs: false };

describe('isRetryableIssue', () => {
  it('should retry only while the video may still be published', () => {
    assert.equal(isRetryableIssue('vod-not-ready'), true);
    assert.equal(isRetryableIssue('no-stored-vods'), false);
  });
});

describe('getIssueLines', () => {
  /** The lines are printed one after another, so they read as one text */
  const text = (issue: Parameters<typeof getIssueLines>[0], opts = options) =>
    getIssueLines(issue, opts).join(' ');

  it('should explain that a channel stores no past broadcasts', () => {
    const message = text('no-stored-vods');
    assert.match(message, /stores no past broadcasts/);
    assert.ok(
      message.includes('Store past broadcasts'),
      'should name the Twitch setting',
    );
    assert.ok(
      message.includes('--fallback-live-edge'),
      'should point at the fallback',
    );
    assert.ok(
      message.includes('Drop --live-from-start'),
      'should suggest recording from the live edge',
    );
  });

  it('should not mention a range when none was requested', () => {
    assert.ok(!text('no-stored-vods').includes('--download-last'));
  });

  it('should explain that a requested range needs the missing video', () => {
    assert.ok(
      text('no-stored-vods', { ...options, hasRangeArgs: true }).includes(
        '--download-last',
      ),
    );
  });

  it('should tell a retrying run when the next attempt happens', () => {
    assert.ok(
      text('vod-not-ready', {
        ...options,
        isRetry: true,
        delaySec: 60,
      }).includes('Retry every 60 second(s)'),
    );
  });

  it('should suggest --retry-streams when there is no retry', () => {
    assert.ok(text('vod-not-ready').includes('--retry-streams 60'));
  });

  it('should keep every line short enough for a terminal', () => {
    for (const issue of ['no-stored-vods', 'vod-not-ready'] as const) {
      for (const opts of [
        options,
        { ...options, hasRangeArgs: true, isRetry: true, delaySec: 120 },
      ]) {
        for (const line of getIssueLines(issue, opts)) {
          assert.ok(line.length <= 80, `too long (${line.length}): ${line}`);
        }
      }
    }
  });
});
