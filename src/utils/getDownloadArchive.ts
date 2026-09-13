import fsp from 'node:fs/promises';
import path from 'node:path';

/** Parses the ids of already downloaded videos from an archive file */
export const parseArchive = (content: string) =>
  new Set(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );

/** Reads the archive. A missing file is not an error, it's an empty archive */
export const readArchive = async (archivePath: string) => {
  const content = await fsp.readFile(archivePath, 'utf8').catch(() => null);
  if (content === null) return new Set<string>();
  return parseArchive(content);
};

export const appendToArchive = async (archivePath: string, videoId: string) => {
  const dir = path.dirname(archivePath);
  if (dir && dir !== '.') await fsp.mkdir(dir, { recursive: true });
  await fsp.appendFile(archivePath, `${videoId}\n`);
};
