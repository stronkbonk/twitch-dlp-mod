import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBatchFile } from './getLinks.ts';

describe('parseBatchFile', () => {
  it('should read one link per line', () => {
    const links = parseBatchFile(
      'https://www.twitch.tv/videos/111\nhttps://www.twitch.tv/videos/222\n',
    );
    assert.deepStrictEqual(links, [
      'https://www.twitch.tv/videos/111',
      'https://www.twitch.tv/videos/222',
    ]);
  });

  it('should ignore comments, blank lines and CRLF line endings', () => {
    const links = parseBatchFile(
      '# my links\r\n\r\n  https://www.twitch.tv/videos/111  \r\nhttps://twitch.tv/xqc # not a comment\r\n',
    );
    assert.deepStrictEqual(links, [
      'https://www.twitch.tv/videos/111',
      'https://twitch.tv/xqc # not a comment',
    ]);
  });

  it('should return nothing for an empty file', () => {
    assert.deepStrictEqual(parseBatchFile(''), []);
    assert.deepStrictEqual(parseBatchFile('\n\n# only comments\n'), []);
  });
});
