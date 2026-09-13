import type { AUDIO_FORMATS, DOWNLOADERS, MERGE_METHODS } from './constants.ts';
import type { getArgs } from './main.ts';

export type Downloader = (typeof DOWNLOADERS)[number];
export type MergeMethod = (typeof MERGE_METHODS)[number];
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/**
 * Result of a single download. `skipped` means nothing had to be downloaded,
 * `failed` means the downloaded fragments couldn't be merged
 */
export type DownloadOutcome = 'downloaded' | 'skipped' | 'failed';

export type RawArgs = ReturnType<typeof getArgs>;
export type AppArgs = Omit<
  RawArgs['values'],
  | 'download-sections'
  | 'download-last'
  | 'duration'
  | 'retry-streams'
  | 'frag-concurrency'
  | 'frag-retries'
  | 'poll-interval'
  | 'max-downloads'
  | 'sleep-interval'
  | 'extract-audio'
> & {
  downloader: Downloader;
  'download-sections': readonly [startTime: number, endTime: number] | null;
  /** Duration of the tail of the stream/video to download (sec) */
  'download-last': number | null;
  /** Max duration of the download from the range start (sec) */
  duration: number | null;
  'retry-streams': number | undefined;
  /** How many fragments are downloaded in parallel */
  'frag-concurrency': number;
  /** How many times a failed fragment download is retried */
  'frag-retries': number;
  /** How often (sec) new fragments are checked for while the stream is live */
  'poll-interval': number;
  /** Stop after N successful downloads in batch mode (0 = unlimited) */
  'max-downloads': number;
  /** Wait N seconds between downloads in batch mode (0 = no wait) */
  'sleep-interval': number;
  /** Convert the downloaded video to an audio-only file */
  'extract-audio': AudioFormat | undefined;
  'merge-method': MergeMethod;
};

export type Frag = {
  /** Frag index in the original playlist */
  idx: number;
  /** Offset from the start of the video (sec) */
  offset: number;
  /** Frag duration (sec) */
  duration: number;
  /** Is it a frag from #EXT-X-MAP tag */
  isMap?: true;
  /** Full frag url */
  url: string;
};
export type Frags = Frag[] & { isFMp4: boolean };
export type FragMetadata = {
  /** Frag size (bytes) */
  size: number;
  /** Time spent downloading a fragment (ms) */
  time: number;
};

export type BroadcastType = 'ARCHIVE' | 'HIGHLIGHT' | 'UPLOAD';

export type DownloadFormat = {
  format_id: string;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  totalBitrate?: number | null;
  source: true | null;
  url: string;
};

export type VideoInfo = {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
  uploader: string | null;
  uploader_id: string | null;
  upload_date: string | null;
  release_date: string | null;
  view_count: number | null;
  ext: 'mp4' | 'm4a';
};
