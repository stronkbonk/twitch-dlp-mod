import path from 'node:path';
import { statsOrNull } from './statsOrNull.ts';

/**
 * Finds a file that ships with the package (README.md, package.json, ...).
 * Looks in the current directory and then in the parent ones, so it works both
 * from the bundled script and from the sources
 */
export const getAssetPath = async (filename: string) => {
  let dir = import.meta.dirname;
  while (true) {
    const filePath = path.join(dir, filename);
    if (await statsOrNull(filePath)) return filePath;
    const parentDir = path.dirname(dir);
    if (parentDir === dir) throw new Error(`Cannot find ${filename}`);
    dir = parentDir;
  }
};
