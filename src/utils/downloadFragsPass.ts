import { asyncPool } from '../lib/asyncPool.ts';
import { statsOrNull } from '../lib/statsOrNull.ts';
import { DL_EVENT, logUnmuteResult, type createLogger } from '../stats.ts';
import type { AppArgs, DownloadFormat, FragMetadata, Frags } from '../types.ts';
import { downloadFrag } from './downloadFrag.ts';
import { getPath } from './getPath.ts';
import { getUnmutedFrag, type UnmutedFrag } from './getUnmutedFrag.ts';
import { showProgress } from './showProgress.ts';

type Params = {
  frags: Frags;
  fragsCount: number;
  outputPath: string;
  args: AppArgs;
  formats: DownloadFormat[];
  tryUnmute: boolean;
  downloadedFrags: Map<number, FragMetadata>;
  writeLog: ReturnType<typeof createLogger>;
};

/** Downloads all fragments that are not on disk yet */
export const downloadFragsPass = async ({
  frags,
  fragsCount,
  outputPath,
  args,
  formats,
  tryUnmute,
  downloadedFrags,
  writeLog,
}: Params) => {
  const fragType = frags.isFMp4 ? ('fmp4-media' as const) : ('ts' as const);

  await asyncPool(
    [...frags.entries()],
    args['frag-concurrency'],
    async ([i, frag]) => {
      showProgress(downloadedFrags, fragsCount);

      const fragPath = getPath.frag(outputPath, frag.idx + 1);
      const fragStats = await statsOrNull(fragPath);
      if (fragStats) {
        if (!downloadedFrags.has(i)) {
          downloadedFrags.set(i, { size: fragStats.size, time: 0 });
          showProgress(downloadedFrags, fragsCount);
        }
        return;
      }

      if (frag.url.includes('-unmuted')) {
        writeLog([DL_EVENT.FRAG_RENAME_UNMUTED, frag.idx]);
        frag.url = frag.url.replace('-unmuted', '-muted');
      }
      let unmutedFrag: UnmutedFrag | null = null;
      if (frag.url.includes('-muted')) {
        writeLog([DL_EVENT.FRAG_MUTED, frag.idx]);
        if (tryUnmute) {
          unmutedFrag = await getUnmutedFrag(
            args.downloader,
            args.unmute,
            frag.url,
            formats,
          );
          writeLog(logUnmuteResult(unmutedFrag, frag.idx));
        }
      }

      let fragGzip: boolean | undefined = undefined;
      if (unmutedFrag && unmutedFrag.sameFormat) {
        frag.url = unmutedFrag.url;
        fragGzip = unmutedFrag.gzip;
      }
      let fragMeta = await downloadFrag(
        args.downloader,
        frag.url,
        fragPath,
        args['limit-rate'],
        fragGzip,
        frag.isMap ? 'fmp4-map' : fragType,
        args['frag-retries'],
      );
      downloadedFrags.set(i, fragMeta || { size: 0, time: 0 });
      writeLog([
        fragMeta
          ? DL_EVENT.FRAG_DOWNLOAD_SUCCESS
          : DL_EVENT.FRAG_DOWNLOAD_FAILURE,
        frag.idx,
      ]);

      if (unmutedFrag && !unmutedFrag.sameFormat) {
        fragMeta = await downloadFrag(
          args.downloader,
          unmutedFrag.url,
          getPath.fragUnmuted(fragPath),
          args['limit-rate'],
          unmutedFrag.gzip,
          fragType,
          args['frag-retries'],
        );
        writeLog([
          fragMeta
            ? DL_EVENT.FRAG_DOWNLOAD_UNMUTED_SUCCESS
            : DL_EVENT.FRAG_DOWNLOAD_UNMUTED_FAILURE,
          frag.idx,
        ]);
      }

      showProgress(downloadedFrags, fragsCount);
    },
  );
};
