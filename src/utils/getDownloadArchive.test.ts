import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArchive } from './getDownloadArchive.ts';

describe('parseArchive', () => {
  it('should read one id per line', () => {
    const archive = parseArchive('v111\nv222\n');
    assert.deepStrictEqual([...archive], ['v111', 'v222']);
    assert.equal(archive.has('v222'), true);
    assert.equal(archive.has('v333'), false);
  });

  it('should ignore comments, blank lines and extra spaces', () => {
    const archive = parseArchive('  v111  \n\n# a comment\n#v222\nv333');
    assert.deepStrictEqual([...archive], ['v111', 'v333']);
  });

  it('should treat an empty file as an empty archive', () => {
    assert.equal(parseArchive('').size, 0);
    assert.equal(parseArchive('\n\n').size, 0);
  });
});
