import fsp from 'node:fs/promises';

/**
 * Parses a batch file. Every non-empty line is a link, `#` starts a comment
 */
export const parseBatchFile = (content: string) =>
  content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

/** All links of the current run: positionals plus the ones from --batch-file */
export const getLinks = async (
  positionals: string[],
  batchFilePath: string | undefined,
) => {
  const links = [...positionals];
  if (batchFilePath) {
    const content = await fsp.readFile(batchFilePath, 'utf8').catch(() => null);
    if (content === null) {
      throw new Error(`Cannot read batch file: ${batchFilePath}`);
    }
    links.push(...parseBatchFile(content));
  }
  return links;
};
