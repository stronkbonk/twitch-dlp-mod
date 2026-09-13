import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getExtractAudioArgs } from './extractAudio.ts';

const getArgs = (format: Parameters<typeof getExtractAudioArgs>[2]) =>
  getExtractAudioArgs('in.mp4', `out.${format}`, format);

describe('getExtractAudioArgs', () => {
  it('should drop the video stream and put the output last', () => {
    const args = getArgs('mp3');
    assert.ok(args.includes('-vn'));
    assert.equal(args.at(-1), 'out.mp3');
    assert.equal(args[args.indexOf('-i') + 1], 'in.mp4');
  });

  it('should use an encoder per format', () => {
    assert.ok(getArgs('mp3').includes('libmp3lame'));
    assert.ok(getArgs('opus').includes('libopus'));
    assert.ok(getArgs('flac').includes('flac'));
    assert.ok(getArgs('wav').includes('pcm_s16le'));
  });

  it('should not re-encode for copy', () => {
    const args = getArgs('copy');
    assert.ok(args.includes('copy'));
    assert.ok(!args.includes('libmp3lame'));
  });

  it('should always pass -y so an existing file is replaced', () => {
    assert.ok(getArgs('m4a').includes('-y'));
  });
});
