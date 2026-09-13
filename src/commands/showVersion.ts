import fsp from 'node:fs/promises';
import { getAssetPath } from '../lib/getAssetPath.ts';

export const showVersion = async () => {
  const pkgPath = await getAssetPath('package.json');
  const pkg = await fsp.readFile(pkgPath, 'utf8');
  console.log(JSON.parse(pkg).version);
};
