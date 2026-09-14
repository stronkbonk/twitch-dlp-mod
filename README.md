# twitch-dlp-mod

Download any twitch VODs from start during live broadcast

## Features

- Download live VODs from start (`--live-from-start`)
- Download ongoing hidden VODs (or if they were hidden during the broadcast)
- Download finished hidden VODs
  - Just use [twitchtracker.com](https://twitchtracker.com), [streamscharts.com](https://streamscharts.com) or [sullygnome.com](https://sullygnome.com) links ([details](https://github.com/stronkbonk/twitch-dlp-mod/blob/master/DOWNLOAD_PRIVATE_VIDEOS.md))
- Download specific part of the video (`--download-sections`)
- Download clips (including portrait versions)
- Automatically unmute muted sections if possible
- Continue downloading partially downloaded video (in case of network/power outage)
- Watch channel status. If it becomes live, start downloading (`--retry-streams DELAY`)
- Similar to `yt-dlp` (`youtube-dl`) syntax

## Extra features

- Download a specific part of a **live** stream: `--download-last 10m` or
  `--download-sections "*1:00:00-1:15:00"`. Sections that haven't aired yet are
  waited for
- Snapshot downloads: grab everything from the stream start up to the moment the
  download started and stop instead of following the live edge (`--until-now`)
- A plain explanation when a stream can't be downloaded from the start (the
  channel doesn't store past broadcasts), and `--fallback-live-edge` to record
  it from the live edge instead of failing
- Limit a download by duration (`--duration 30m`)
- Human readable times everywhere: `10m`, `1h30m`, `90s`, `1:30:00` and plain
  seconds
- Download fragments in parallel (`--frag-concurrency 4`)
- Tune fragment retries (`--frag-retries`) and the live poll interval
  (`--poll-interval 10`)
- Write the video to its own directory (`-P, --output-dir`) or set a default
  directory once with the `TWITCH_DLP_OUTPUT_DIR` environment variable
- Save video metadata next to the video (`--write-info-json`)
- Get a webhook notification when a download finishes (`--webhook`)
- See what would be downloaded without downloading it (`--dry-run`)
- Download many videos in one run: pass several links or use `--batch-file`.
  A failing link doesn't stop the rest of the batch
- Never download the same video twice: `--download-archive FILE` records what
  was downloaded, `--no-overwrites` skips videos that are already on disk
- Tune batch runs with `--max-downloads` and `--sleep-interval`
- Audio only downloads: `--audio-only`, or convert a video with
  `--extract-audio mp3` (also `m4a`, `opus`, `flac`, `wav`, `copy`)
- Cut sections frame accurately (`--precise-cut`) instead of by the closest
  fragments

## Usage

Install the latest [Node.js](https://nodejs.org/) version (v22 or newer).

Run the mod straight from GitHub, without installing anything:

```bash
npx github:stronkbonk/twitch-dlp-mod LINK
```

> [!IMPORTANT]
> `npx twitch-dlp` downloads the **original** project from npm, which doesn't
> have any of the extra flags. Keep the `github:stronkbonk/` part.

Install it once if you use it often. This adds a `twitch-dlp-mod` command:

```bash
npm install --global github:stronkbonk/twitch-dlp-mod
twitch-dlp-mod LINK
```

Every command below is written as `npx github:stronkbonk/twitch-dlp-mod` so it
works without installing anything. If you installed the package globally, you
can write `twitch-dlp-mod` instead.

### Changing the output directory

```bash
# Download to a specific directory (works with --output-dir / -P)
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -P "E:/Twitch VODs"

# Or set it once as the default directory for every download
# Windows (cmd)
setx TWITCH_DLP_OUTPUT_DIR "E:\Twitch VODs"

# Windows (PowerShell)
[Environment]::SetEnvironmentVariable('TWITCH_DLP_OUTPUT_DIR', 'E:\Twitch VODs', 'User')

# macOS / Linux
export TWITCH_DLP_OUTPUT_DIR="/mnt/e/Twitch VODs"
```

The directory is created if it doesn't exist. `TWITCH_DLP_OUTPUT_DIR` is used
only when `-P, --output-dir` is not passed.

### Running from the sources

```bash
git clone https://github.com/stronkbonk/twitch-dlp-mod.git
cd twitch-dlp-mod
npm install

# bundled version
node twitch-dlp.js LINK

# from the sources
npm start -- LINK

# rebuild the bundle after changing the sources
npm run build
```

### Examples

```bash
# Download every link of a batch file one after another, keep a list of what
# was downloaded and skip everything that is already in it
npx github:stronkbonk/twitch-dlp-mod --batch-file links.txt --download-archive archive.txt

# The same, one video per line, saved to a specific directory
npx github:stronkbonk/twitch-dlp-mod --batch-file links.txt --download-archive archive.txt -P "E:/Twitch VODs"

# Download several videos in one run (a failing link doesn't stop the rest)
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/111 https://www.twitch.tv/videos/222

# Download only the audio track, saved as m4a
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --audio-only

# Download a video and convert it to mp3 (the video file is removed)
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --extract-audio mp3

# Cut a section frame accurately instead of by the closest fragments
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --download-sections "*15:00-25:00" --precise-cut

# Download a VOD from start using channel link, continue until stream ends
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start

# Download a VOD
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761

# Download live stream from the current time using streamlink
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc

# Download a hidden VOD
# Just use twitchtracker.com, streamscharts.com or sullygnome.com links
npx github:stronkbonk/twitch-dlp-mod https://twitchtracker.com/xqc/streams/51582913581
npx github:stronkbonk/twitch-dlp-mod https://streamscharts.com/channels/lirik/streams/51579711693
npx github:stronkbonk/twitch-dlp-mod https://sullygnome.com/channel/summit1g/stream/315782796250
# If it doesn't work for you, follow this instructions:
# https://github.com/stronkbonk/twitch-dlp-mod/blob/master/DOWNLOAD_PRIVATE_VIDEOS.md

# Check every 60 seconds is channel live
# If it's live, start to download it using streamlink
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --retry-streams 60

# Check every 60 seconds is channel live
# If it's live, start to download it's VOD from start
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --retry-streams 60 --live-from-start

# Download 10 minutes in the middle of the VOD
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --download-sections "*15:00-25:00"

# Download the last 10 minutes of a live stream and stop
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start --download-last 10m

# Download everything from the start of the stream up to the moment you started
# the download (a snapshot of the stream so far), then stop
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start --until-now

# Download a specific part of a live stream. If the stream hasn't reached
# 1:30:00 yet, wait for it and stop when the section is complete
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start --download-sections "*1:30:00-1:45:00"

# Download the first 30 minutes of a live stream
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start --duration 30m

# Download the last 10 minutes of a VOD
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --download-last 10m

# See what would be downloaded without downloading it
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/xqc --live-from-start --until-now --dry-run

# Download fragments in parallel, save metadata and ping a webhook when done
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 --frag-concurrency 4 \
  --write-info-json --webhook "https://discord.com/api/webhooks/..."

# Save the video to a different directory
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -P ./downloads

# Display available formats
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -F

# Download specified format
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -f 480p30

# Change output template
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -o "%(title)s [%(id)s].%(ext)s"

# Limit download rate
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/videos/2022789761 -r 720k

# Merge already downloaded fragments (if something went wrong)
# Filename must match the fragment names but without ".part-FragN"
# Use `--download-sections` if you want to merge only specific part of the video
npx github:stronkbonk/twitch-dlp-mod "./Chillin [v2222470239].mp4" --merge-fragments

# Merge already downloaded fragments and try to unmute muted fragments
npx github:stronkbonk/twitch-dlp-mod "./Chillin [v2222470239].mp4" --merge-fragments --unmute quality
```

### Streams that can't be downloaded from the start

`--live-from-start` needs Twitch to record the stream. That only happens when
the streamer has "Store past broadcasts" enabled, and it is off by default for
some channels. For those channels the stream has no video at all, so nothing
can download it from the start and the command stops with:

```text
[live-from-start] Cannot download from the start: this channel stores no
past broadcasts, so Twitch has no video of the stream to download.
```

Add `--fallback-live-edge` to record the stream from the live edge in that
case, or drop `--live-from-start` to do it by hand:

```bash
# Record from the live edge if the channel doesn't store past broadcasts
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/CHANNEL --live-from-start --fallback-live-edge

# Or record the live stream with streamlink, from the current time on
npx github:stronkbonk/twitch-dlp-mod https://www.twitch.tv/CHANNEL
```

Recording from the live edge only saves what happens from now on, because Twitch
didn't keep the earlier part of the stream. Range options (`--download-last`,
`--download-sections`, `--duration`, `--until-now`) also can't be served that
way and are ignored, with a warning. Both need [streamlink](https://streamlink.github.io/).

## Options

```text
-h, --help                  Print this help text and exit
--version                   Print program version and exit
-f, --format FORMAT         Select format to download
                            Available formats:
                            * best: best quality (default)
                            * FORMAT: select format by format_id
-F, --list-formats          Print available formats and exit
-o, --output OUTPUT         Output filename template
                            Available template variables:
                            * %(title)s
                            * %(id)s
                            * %(ext)s
                            * %(description)s
                            * %(duration)s
                            * %(uploader)s
                            * %(uploader_id)s
                            * %(upload_date)s
                            * %(release_date)s
                            * %(view_count)s
--live-from-start           Download live streams from the start
--retry-streams DELAY       Retry fetching the list of available streams until
                            streams are found while waiting DELAY second(s)
                            between each attempt
-r, --limit-rate RATE       Limit download rate to RATE
--keep-fragments            Keep fragments after downloading
--download-sections TEXT    Download specific part of the video or of a live
                            stream (with --live-from-start).
                            Syntax: "*start_time-end_time".
                            Examples: "*0-12:34", "*3:14:15-inf", "*10m-25m".
                            A "*" prefix is for yt-dlp compatibility.
                            Times can be written as seconds ("600"), as
                            min:sec ("12:34"), as hour:min:sec ("3:14:15") or
                            with units ("45s", "10m", "1h30m").
                            If the end of the section is in the future, the
                            download waits for it to air (live streams only).
                            Negative timestamps and multiple sections are not
                            supported. Cutting is done by the closest fragments
                            (not by keyframes), so the accuracy is not very high
--download-last TIME        Download only the last TIME of the stream/video and
                            stop. Works with videos and with live streams
                            (with --live-from-start), where TIME is counted
                            from the live edge at the moment you started the
                            download. Example: "--download-last 10m"
--duration TIME             Download only TIME from the start of the range
                            (or from the start of the stream). Example:
                            "--live-from-start --duration 30m" records the
                            first 30 minutes
--until-now                 Stop at the live edge at the moment the download
                            started instead of following the stream. Use it to
                            get a snapshot of a live stream: everything from
                            the start of the stream up to now. Can be combined
                            with --download-sections, e.g.
                            "--download-sections \"*10:00-inf\" --until-now"
--fallback-live-edge        Record from the live edge when a stream can't be
                            downloaded from the start (the channel stores no
                            past broadcasts), instead of failing. The range
                            options can't be honoured then, only what happens
                            from now on is saved. Requires streamlink
--precise-cut               Cut the requested range frame accurately instead of
                            by the closest fragments. The result is re-encoded,
                            which is slow, but the start and the end match the
                            requested times exactly. Works with
                            --download-sections, --download-last and --until-now
--unmute POLICY             Try to unmute muted fragments. Keep in mind that
                            160p and 360p have slightly worse audio quality.
                            Available values:
                            * quality (default for 480p and higher) - check all
                              formats, unmute only if best audio quality is
                              available
                            * any - check all formats, unmute if any audio
                              quality is available
                            * same_format (default for 360p and lower) - only
                              check downloading format, unmute if available
                            * off - don't try to unmute fragments
--downloader NAME           Name of the external downloader to use.
                            Currently supports: aria2c, curl, fetch (default)
--proxy URL                 Use the specified HTTP/HTTPS/SOCKS proxy. To
                            enable SOCKS proxy, specify a proper scheme,
                            e.g. socks5://user:pass@127.0.0.1:1080/.
                            Pass in an empty string (--proxy "") for
                            direct connection. Currently only works with fetch
--merge-method METHOD       How fragments should be merged. Merging happens
                            only after all fragments are downloaded.
                            Available values:
                            * ffconcat (default) - using ffmpeg's concat
                              demuxer, no fixup needed
                            * append - merge all fragments into one file and
                              fixup using ffmpeg (like yt-dlp does)
--merge-fragments           Merge already downloaded fragments. A FILENAME
                            should be passed instead of a video link. The
                            FILENAME must match the fragment names but without
                            ".part-FragN". Example: "npx
                            github:stronkbonk/twitch-dlp-mod FILENAME
                            --merge-fragments".
                            Can be used with:
                            * --download-sections - merge only specific part
                              of the video
                            * --unmute - try to unmute downloaded fragments
                              according to passed unmute policy (off by
                              default)
                            * --merge-method - change merge method
--frag-concurrency N        Download N fragments in parallel (default: 1).
                            Speeds up downloads a lot on fast connections
--frag-retries N            How many times a failed fragment download is
                            retried (default: 5). Retries use exponential
                            backoff
--poll-interval SEC         How often (sec) new fragments are checked for
                            while the stream is live (default: 60). Lower
                            values make live section downloads finish sooner
--audio-only                Download only the audio track (saved as m4a).
                            Cannot be used with --format
--extract-audio FORMAT      Convert the downloaded video to an audio-only file
                            and remove the video afterwards (unless
                            --keep-video). Requires ffmpeg.
                            Available formats:
                            * mp3, m4a, opus, flac, wav
                            * copy - only extract the audio stream, no re-encode
--keep-video                Keep the video file when --extract-audio is used
-P, --output-dir DIR        Directory for the output file. The output
                            template is resolved inside DIR
--write-info-json           Save video metadata to FILE.info.json next to the
                            video
--webhook URL               POST a notification to URL when the download is
                            finished or failed (Discord/Slack compatible)
--dry-run                   Print what would be downloaded (range, fragments
                            and destination) and exit. Nothing is downloaded
--download-archive FILE     Skip videos that are already listed in FILE and add
                            every video downloaded during the run to it. One id
                            per line, so a batch run can be continued later
--no-overwrites             Skip videos whose output file already exists
--batch-file FILE           Download all links of FILE (one per line, "#"
                            starts a comment) in addition to the passed links
--max-downloads N           Stop a batch run after N downloaded videos
                            (default: 0 - no limit)
--sleep-interval SEC        Wait SEC second(s) between batch downloads
                            (default: 0)

Environment variables:
* TWITCH_DLP_OUTPUT_DIR - default directory for downloaded files
  (same as --output-dir, e.g. "E:/Twitch VODs")
* TWITCH_DLP_ARCHIVE - default file for --download-archive

It's also possible to pass streamlink twitch plugin args:
--twitch-disable-ads, --twitch-low-latency, --twitch-api-header,
--twitch-access-token-param, --twitch-force-client-integrity,
--twitch-purge-client-integrity
See https://streamlink.github.io/cli.html#twitch
```

## Formats example

For VODs

```bash
┌─────────┬──────────────┬──────────────┬──────┬───────────────┬────────┐
│ (index) │ format_id    │ resolution   │ fps  │ total_bitrate │ source │
├─────────┼──────────────┼──────────────┼──────┼───────────────┼────────┤
│ 0       │ 'Audio_Only' │ 'audio only' │ null │ '212k'        │ null   │
│ 1       │ '160p'       │ '284x160'    │ 30   │ '225k'        │ null   │
│ 2       │ '360p'       │ '640x360'    │ 30   │ '615k'        │ null   │
│ 3       │ '480p'       │ '852x480'    │ 30   │ '1172k'       │ null   │
│ 4       │ '720p60'     │ '1280x720'   │ 60   │ '3027k'       │ null   │
│ 5       │ '1080p60'    │ '1920x1080'  │ 60   │ '5967k'       │ true   │
└─────────┴──────────────┴──────────────┴──────┴───────────────┴────────┘
```

For live streams (streamlink)

```bash
Available streams: audio_only, 160p (worst), 360p, 480p, 720p, 720p60, 1080p60 (best)
```

```bash
Available streams: audio_only, 160p (worst), 360p, 480p, 720p, 720p60_alt, 720p60 (best)
```

## Dependencies

- **ffmpeg**
- **streamlink** (if downloading by channel link without `--live-from-start`)
