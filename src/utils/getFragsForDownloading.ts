import * as hlsParser from '../lib/hlsParser.ts';
import type { Frag, Frags } from '../types.ts';
import type { DownloadRange } from './getDownloadRange.ts';

const sliceFrags = (frags: Frag[], range: DownloadRange) => {
  if (range.startTime <= 0 && range.endTime === Infinity) return frags;

  // Cutting is done by the closest fragments (not by keyframes)
  const firstIdx = Math.max(
    0,
    frags.findLastIndex((frag) => frag.offset <= range.startTime),
  );
  if (range.endTime === Infinity) return frags.slice(firstIdx);

  const endIdx = frags.findIndex((frag) => frag.offset >= range.endTime);
  // The range end hasn't aired yet: take everything available and let the
  // caller wait for the rest
  return frags.slice(firstIdx, endIdx === -1 ? undefined : endIdx + 1);
};

export const getFragsForDownloading = (
  playlistUrl: string,
  playlist: hlsParser.MediaPlaylist,
  range: DownloadRange,
) => {
  const baseUrl = playlistUrl.split('/').slice(0, -1).join('/');

  const mapFragUri = playlist.segments[0]?.map?.uri;
  let mapFrag: null | Frag = null;
  if (mapFragUri) {
    mapFrag = {
      idx: 0,
      offset: 0,
      duration: 0,
      isMap: true,
      url: `${baseUrl}/${mapFragUri}`,
    };
  }

  let frags: Frag[] = [];
  let offset = 0;
  let idx = mapFrag ? 1 : 0;
  for (const { duration, uri } of playlist.segments) {
    frags.push({ idx, offset, duration, url: `${baseUrl}/${uri}` });
    offset += duration;
    idx += 1;
  }

  frags = sliceFrags(frags, range);
  if (mapFrag) frags = [mapFrag, ...frags];

  const dlFrags = frags as Frags;
  dlFrags.isFMp4 = !!mapFrag;
  return dlFrags;
};
