import fsp from 'node:fs/promises';
import path from 'node:path';
import type { VideoInfo } from '../types.ts';

const ILLEGAL_PATH_CHARS_MAP: Record<string, string> = {
  '\\': '⧹',
  '/': '⧸',
  ':': '：',
  '*': '＊',
  '?': '？',
  '"': '＂',
  '<': '＜',
  '>': '＞',
  '|': '｜',
};

const sanitizeFilename = (str: string) => {
  const chars = Object.keys(ILLEGAL_PATH_CHARS_MAP);
  const regex = `[${chars.map((c) => (c === '\\' ? '\\\\' : c)).join('')}]`;
  return str.replace(new RegExp(regex, 'g'), (c) => ILLEGAL_PATH_CHARS_MAP[c]);
};

const getOutputPath = (
  template: string,
  videoInfo: VideoInfo,
  outputDir?: string,
) => {
  let outputPath = template;
  for (const [key, value] of Object.entries(videoInfo)) {
    let newValue = value ? `${value}` : '';
    if (key.endsWith('_date')) newValue = newValue.slice(0, 10);
    newValue = sanitizeFilename(newValue);
    outputPath = outputPath.replaceAll(`%(${key})s`, newValue);
  }
  return path.resolve(outputDir || '.', outputPath);
};

/** Creates the directory of the output file if it doesn't exist yet */
export const ensureOutputDir = async (filePath: string) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
};

export const getPath = {
  output: getOutputPath,
  /** Same file with another extension, e.g. `video.mp4` -> `video.mp3` */
  replaceExt: (filePath: string, ext: string) => {
    const parsed = path.parse(filePath);
    return path.join(parsed.dir, `${parsed.name}.${ext}`);
  },
  ffconcat: (filePath: string) => `${filePath}-ffconcat.txt`,
  playlist: (filePath: string) => `${filePath}-playlist.m3u8`,
  log: (filePath: string) => `${filePath}-log.tsv`,
  infoJson: (filePath: string) => `${filePath}.info.json`,
  frag: (filePath: string, i: number) => `${filePath}.part-Frag${i}`,
  fragUnmuted: (fragPath: string) => `${fragPath}-unmuted`,
};
