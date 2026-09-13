import fsp from 'node:fs/promises';
import { getAssetPath } from '../lib/getAssetPath.ts';

export const getWhyCannotDownload = async () => {
  try {
    const mdPath = await getAssetPath('DOWNLOAD_PRIVATE_VIDEOS.md');
    const md = await fsp.readFile(mdPath, 'utf8');
    const txt = [];
    for (const m of md.matchAll(/> (.*:|- .*)/gm)) txt.push(m[1]);
    return txt.join('\n');
  } catch {
    return '';
  }
};
