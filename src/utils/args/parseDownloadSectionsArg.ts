import { parseTime } from './parseTime.ts';

const DOWNLOAD_SECTIONS_ERROR = 'Wrong --download-sections syntax';
// https://regex101.com/r/d0kteE/2
const DOWNLOAD_SECTIONS_REGEX = /^\*(?<startTime>[^-]*)-(?<endTime>.+)$/;

type DownloadSectionsGroups = {
  startTime: string;
  endTime: string;
};

export const parseDownloadSectionsArg = (downloadSectionsArg?: string) => {
  if (!downloadSectionsArg) return null;
  const m = downloadSectionsArg.match(DOWNLOAD_SECTIONS_REGEX);
  if (!m?.groups) throw new Error(DOWNLOAD_SECTIONS_ERROR);
  const { startTime, endTime } = m.groups as DownloadSectionsGroups;
  try {
    const start = parseTime(startTime);
    const end =
      endTime.trim().toLowerCase() === 'inf' ? Infinity : parseTime(endTime);
    if (start >= end) throw new Error(DOWNLOAD_SECTIONS_ERROR);
    return [start, end] as const;
  } catch {
    throw new Error(DOWNLOAD_SECTIONS_ERROR);
  }
};
