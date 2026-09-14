#!/usr/bin/env node
import { parseArgs } from "node:util";
import fsp, { default as fsp$1, default as fsp$10, default as fsp$11, default as fsp$12, default as fsp$13, default as fsp$14, default as fsp$15, default as fsp$16, default as fsp$17, default as fsp$18, default as fsp$19, default as fsp$2, default as fsp$20, default as fsp$21, default as fsp$22, default as fsp$3, default as fsp$4, default as fsp$5, default as fsp$6, default as fsp$7, default as fsp$8, default as fsp$9 } from "node:fs/promises";
import path, { default as path$1, default as path$10, default as path$2, default as path$3, default as path$4, default as path$5, default as path$6, default as path$7, default as path$8, default as path$9 } from "node:path";
import fs, { default as fs$1 } from "node:fs";
import childProcess, { default as childProcess$1, default as childProcess$2, default as childProcess$3, default as childProcess$4 } from "node:child_process";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import os, { default as os$1 } from "node:os";
import stream, { default as stream$1 } from "node:stream";
import crypto from "node:crypto";

//#region src/constants.ts
const DEFAULT_OUTPUT_TEMPLATE = "%(title)s [%(id)s].%(ext)s";
const PRIVATE_VIDEO_INSTRUCTIONS = "This video might be private. Follow this article to download it: https://github.com/DmitryScaletta/twitch-dlp/blob/master/DOWNLOAD_PRIVATE_VIDEOS.md";
const NO_TRY_UNMUTE_MESSAGE = "[unmute] The video is old, not trying to unmute";
const VOD_DOMAINS = [
	"https://d2e2de1etea730.cloudfront.net",
	"https://dqrpb9wgowsf5.cloudfront.net",
	"https://ds0h3roq6wcgc.cloudfront.net",
	"https://d2nvs31859zcd8.cloudfront.net",
	"https://d2aba1wr3818hz.cloudfront.net",
	"https://d3c27h4odz752x.cloudfront.net",
	"https://dgeft87wbj63p.cloudfront.net",
	"https://d1m7jfoe9zdc1j.cloudfront.net",
	"https://d3vd9lfkzbru3h.cloudfront.net",
	"https://d2vjef5jvl6bfs.cloudfront.net",
	"https://d1ymi26ma8va5x.cloudfront.net",
	"https://d1mhjrowxxagfy.cloudfront.net",
	"https://ddacn6pr5v0tl.cloudfront.net",
	"https://d3aqoihi2n8ty8.cloudfront.net",
	"https://d3fi1amfgojobc.cloudfront.net"
];
const OUTPUT_DIR_ENV = "TWITCH_DLP_OUTPUT_DIR";
const ARCHIVE_ENV = "TWITCH_DLP_ARCHIVE";
const AUDIO_FORMATS = [
	"mp3",
	"m4a",
	"opus",
	"flac",
	"wav",
	"copy"
];
const AUDIO_EXT = {
	mp3: "mp3",
	m4a: "m4a",
	opus: "opus",
	flac: "flac",
	wav: "wav",
	copy: "m4a"
};
const PRECISE_CUT_THRESHOLD_SEC = .05;
const DOWNLOADERS = [
	"aria2c",
	"curl",
	"fetch"
];
const MERGE_METHODS = ["ffconcat", "append"];
const UNMUTE = {
	QUALITY: "quality",
	ANY: "any",
	SAME_FORMAT: "same_format",
	OFF: "off"
};
const RET_CODE = {
	OK: 0,
	UNKNOWN_ERROR: 1,
	HTTP_RETURNED_ERROR: 22
};

//#endregion
//#region src/lib/hlsParser.ts
const PLAYLIST_LINE_KV_REGEX = /(?<key>[A-Z-]+)=(?:"(?<stringValue>[^"]+)"|(?<value>[^,]+))/g;
const MASTER_PLAYLIST_TAGS = ["EXT-X-STREAM-INF", "EXT-X-MEDIA"];
const parseAttrs = (line) => {
	const attrs = {};
	for (const kv of line.matchAll(PLAYLIST_LINE_KV_REGEX)) {
		const { key, stringValue, value } = kv.groups;
		attrs[key] = value || stringValue || "";
	}
	return attrs;
};
const parseMasterPlaylist = (lines) => {
	const variants = [];
	const mediaLines = lines.filter((line) => MASTER_PLAYLIST_TAGS.some((s) => line.startsWith(`#${s}:`)) || !line.startsWith("#"));
	for (let i = 0; i < mediaLines.length; i += 3) {
		const media = parseAttrs(mediaLines[i]);
		const streamInf = parseAttrs(mediaLines[i + 1]);
		let resolution = undefined;
		if (streamInf.RESOLUTION) {
			const [width, height] = streamInf.RESOLUTION.split("x").map((n) => Number.parseInt(n));
			resolution = {
				width,
				height
			};
		}
		variants.push({
			uri: mediaLines[i + 2],
			bandwidth: Number.parseInt(streamInf.BANDWIDTH),
			codecs: streamInf.CODECS,
			resolution,
			frameRate: streamInf["FRAME-RATE"] ? Number.parseFloat(streamInf["FRAME-RATE"]) : undefined,
			video: [{
				type: "VIDEO",
				groupId: media["GROUP-ID"],
				name: media.NAME,
				isDefault: media.DEFAULT === "YES",
				autoselect: media.AUTOSELECT === "YES"
			}]
		});
	}
	const sessionDataList = [];
	for (const line of lines) if (line.startsWith("#EXT-X-SESSION-DATA:")) {
		const sessionData = parseAttrs(line);
		sessionDataList.push({
			id: sessionData["DATA-ID"],
			value: sessionData.VALUE
		});
	}
	return {
		type: "playlist",
		isMasterPlaylist: true,
		variants,
		sessionDataList
	};
};
const parseMediaPlaylist = (lines) => {
	const EXTINF = "#EXTINF:";
	const EXT_X_MAP = "#EXT-X-MAP:";
	let map = null;
	let mapLine = lines.find((line) => line.startsWith(EXT_X_MAP));
	if (mapLine) {
		const mapData = parseAttrs(mapLine);
		if (mapData?.URI) map = { uri: mapData.URI };
	}
	const segLines = lines.filter((line) => line.startsWith(EXTINF) || !line.startsWith("#"));
	const segments = [];
	for (let i = 0; i < segLines.length; i += 2) segments.push({
		type: "segment",
		uri: segLines[i + 1],
		duration: Number.parseFloat(segLines[i].replace(EXTINF, "").replace(",", "")),
		map
	});
	const endlist = lines.includes("#EXT-X-ENDLIST");
	return {
		type: "playlist",
		isMasterPlaylist: false,
		endlist,
		segments
	};
};
const parse = (playlist) => {
	const lines = playlist.split("\n").map((line) => line.trim()).filter(Boolean);
	const isMasterPlaylist = MASTER_PLAYLIST_TAGS.some((s) => lines.some((line) => line.startsWith(`#${s}:`)));
	return isMasterPlaylist ? parseMasterPlaylist(lines) : parseMediaPlaylist(lines);
};

//#endregion
//#region src/lib/chalk.ts
const styles = { color: {
	black: [30, 39],
	red: [31, 39],
	green: [32, 39],
	yellow: [33, 39],
	blue: [34, 39],
	magenta: [35, 39],
	cyan: [36, 39],
	white: [37, 39]
} };
const chalk = Object.entries(styles.color).reduce((acc, [color, [open, close]]) => {
	acc[color] = (s) => `\x1b[${open}m${s}\x1b[${close}m`;
	return acc;
}, {});

//#endregion
//#region src/lib/spawn.ts
const spawn = (command, args = [], silent = false) => new Promise((resolve, reject) => {
	const child = childProcess$4.spawn(command, args);
	if (!silent) {
		child.stdout.on("data", (data) => process.stdout.write(data));
		child.stderr.on("data", (data) => process.stderr.write(data));
	}
	child.on("error", (err) => reject(err));
	child.on("close", (code) => resolve(code));
});

//#endregion
//#region src/utils/getPath.ts
const ILLEGAL_PATH_CHARS_MAP = {
	"\\": "⧹",
	"/": "⧸",
	":": "：",
	"*": "＊",
	"?": "？",
	"\"": "＂",
	"<": "＜",
	">": "＞",
	"|": "｜"
};
const sanitizeFilename = (str) => {
	const chars = Object.keys(ILLEGAL_PATH_CHARS_MAP);
	const regex = `[${chars.map((c) => c === "\\" ? "\\\\" : c).join("")}]`;
	return str.replace(new RegExp(regex, "g"), (c) => ILLEGAL_PATH_CHARS_MAP[c]);
};
const getOutputPath = (template, videoInfo, outputDir) => {
	let outputPath = template;
	for (const [key, value] of Object.entries(videoInfo)) {
		let newValue = value ? `${value}` : "";
		if (key.endsWith("_date")) newValue = newValue.slice(0, 10);
		newValue = sanitizeFilename(newValue);
		outputPath = outputPath.replaceAll(`%(${key})s`, newValue);
	}
	return path$10.resolve(outputDir || ".", outputPath);
};
const ensureOutputDir = async (filePath) => {
	await fsp$22.mkdir(path$10.dirname(filePath), { recursive: true });
};
const getPath = {
	output: getOutputPath,
	replaceExt: (filePath, ext) => {
		const parsed = path$10.parse(filePath);
		return path$10.join(parsed.dir, `${parsed.name}.${ext}`);
	},
	ffconcat: (filePath) => `${filePath}-ffconcat.txt`,
	playlist: (filePath) => `${filePath}-playlist.m3u8`,
	log: (filePath) => `${filePath}-log.tsv`,
	infoJson: (filePath) => `${filePath}.info.json`,
	frag: (filePath, i) => `${filePath}.part-Frag${i}`,
	fragUnmuted: (fragPath) => `${fragPath}-unmuted`
};

//#endregion
//#region src/merge/append.ts
const concatFrags = async (files, outputPath) => {
	const writeStream = fs$1.createWriteStream(outputPath, { flags: "w" });
	try {
		for (const file of files) await new Promise((resolve, reject) => {
			const readStream = fs$1.createReadStream(file);
			readStream.pipe(writeStream, { end: false });
			readStream.on("end", resolve);
			readStream.on("error", reject);
		});
	} catch (error) {
		throw error;
	} finally {
		writeStream.end();
	}
};
const mergeFrags$2 = async (frags, outputPath, keepFragments) => {
	const fragFiles = frags.map((frag) => getPath.frag(outputPath, frag.idx + 1));
	await concatFrags(fragFiles, outputPath);
	const parsed = path$9.parse(outputPath);
	const outputPathTmp = path$9.join(parsed.dir, `${parsed.name}.temp.mp4`);
	await spawn("ffmpeg", [
		"-y",
		"-loglevel",
		"repeat+info",
		"-i",
		`file:${outputPath}`,
		"-map",
		"0",
		"-dn",
		"-ignore_unknown",
		"-c",
		"copy",
		"-f",
		"mp4",
		"-bsf:a",
		"aac_adtstoasc",
		"-movflags",
		"+faststart",
		`file:${outputPathTmp}`
	]);
	await fsp$21.unlink(outputPath);
	await fsp$21.rename(outputPathTmp, outputPath);
	if (!keepFragments) await Promise.all([...fragFiles.map((filename) => fsp$21.unlink(filename)), fsp$21.unlink(getPath.playlist(outputPath))]);
};

//#endregion
//#region src/merge/ffconcat.ts
const MAX_INT_STR = "2147483647";
const spawnFfmpeg = (args) => new Promise((resolve, reject) => {
	let isInputSection = true;
	let prevLinePart = "";
	const handleFfmpegData = (stream$2) => (data) => {
		if (!isInputSection) return stream$2.write(data);
		const lines = data.toString().split("\n");
		lines[0] = prevLinePart + lines[0];
		prevLinePart = lines.pop() || "";
		for (const line of lines) {
			if (line.startsWith("  Stream #")) continue;
			if (line.startsWith("Stream mapping:")) isInputSection = false;
			stream$2.write(line + "\n");
		}
		if (!isInputSection) stream$2.write(prevLinePart);
	};
	const child = childProcess$3.spawn("ffmpeg", args);
	child.stdout.on("data", handleFfmpegData(process.stdout));
	child.stderr.on("data", handleFfmpegData(process.stderr));
	child.on("error", () => reject(1));
	child.on("close", (code) => resolve(code || 0));
});
const runFfconcat = (ffconcatFilename, outputFilename) => spawnFfmpeg([
	"-hide_banner",
	"-avoid_negative_ts",
	"make_zero",
	"-analyzeduration",
	MAX_INT_STR,
	"-probesize",
	MAX_INT_STR,
	"-max_streams",
	MAX_INT_STR,
	"-n",
	"-f",
	"concat",
	"-safe",
	"0",
	"-i",
	ffconcatFilename,
	"-c",
	"copy",
	outputFilename
]);
const generateFfconcat = (files) => {
	let ffconcat = "ffconcat version 1.0\n";
	ffconcat += files.map(([file, duration]) => [
		`file '${file.replaceAll("'", "'\\''")}'`,
		"stream",
		"exact_stream_id 0x100",
		"stream",
		"exact_stream_id 0x101",
		"stream",
		"exact_stream_id 0x102",
		`duration ${duration}`
	].join("\n")).join("\n");
	return ffconcat;
};
const mergeFrags$1 = async (frags, outputPath, keepFragments) => {
	const fragFiles = frags.map((frag) => [getPath.frag(outputPath, frag.idx + 1), frag.duration]);
	const ffconcat = generateFfconcat(fragFiles);
	const ffconcatPath = getPath.ffconcat(outputPath);
	await fsp$20.writeFile(ffconcatPath, ffconcat);
	const retCode = await runFfconcat(ffconcatPath, outputPath);
	fsp$20.unlink(ffconcatPath);
	if (!keepFragments) await Promise.all([...fragFiles.map(([filename]) => fsp$20.unlink(filename)), fsp$20.unlink(getPath.playlist(outputPath))]);
	return retCode;
};

//#endregion
//#region src/merge/index.ts
const [FFCONCAT, APPEND] = MERGE_METHODS;
const mergeFrags = async (method, frags, outputPath, keepFragments) => {
	if (frags.length === 0) {
		console.error(`${chalk.red("ERROR:")} No fragments were downloaded`);
		return 1;
	}
	if (method === FFCONCAT && frags.isFMp4) {
		console.warn(`${chalk.yellow("WARN:")} ${FFCONCAT} merge method is not supported for fMP4 streams. Using ${APPEND} instead`);
		method = APPEND;
	}
	if (method === FFCONCAT) return mergeFrags$1(frags, outputPath, keepFragments);
	if (method === APPEND) return mergeFrags$2(frags, outputPath, keepFragments);
	throw new Error();
};

//#endregion
//#region src/lib/groupBy.ts
const groupBy = (array, getKey) => array.reduce((groups, item) => {
	const key = getKey(item);
	if (!groups[key]) groups[key] = [];
	groups[key].push(item);
	return groups;
}, {});

//#endregion
//#region src/stats.ts
const DL_EVENT = {
	INIT: "INIT",
	FETCH_PLAYLIST_SUCCESS: "FETCH_PLAYLIST_SUCCESS",
	FETCH_PLAYLIST_FAILURE: "FETCH_PLAYLIST_FAILURE",
	FETCH_PLAYLIST_OLD_MUTED_SUCCESS: "FETCH_PLAYLIST_OLD_MUTED_SUCCESS",
	FETCH_PLAYLIST_OLD_MUTED_FAILURE: "FETCH_PLAYLIST_OLD_MUTED_FAILURE",
	FRAGS_FOR_DOWNLOADING: "FRAGS_FOR_DOWNLOADING",
	FRAGS_EXISTING: "FRAGS_EXISTING",
	FRAG_ALREADY_EXISTS: "FRAG_ALREADY_EXISTS",
	FRAG_RENAME_UNMUTED: "FRAG_RENAME_UNMUTED",
	FRAG_MUTED: "FRAG_MUTED",
	FRAG_UNMUTE_SUCCESS: "FRAG_UNMUTE_SUCCESS",
	FRAG_UNMUTE_FAILURE: "FRAG_UNMUTE_FAILURE",
	FRAG_DOWNLOAD_SUCCESS: "FRAG_DOWNLOAD_SUCCESS",
	FRAG_DOWNLOAD_FAILURE: "FRAG_DOWNLOAD_FAILURE",
	FRAG_DOWNLOAD_UNMUTED_SUCCESS: "FRAG_DOWNLOAD_UNMUTED_SUCCESS",
	FRAG_DOWNLOAD_UNMUTED_FAILURE: "FRAG_DOWNLOAD_UNMUTED_FAILURE",
	FRAG_REPLACE_AUDIO_SUCCESS: "FRAG_REPLACE_AUDIO_SUCCESS",
	FRAG_REPLACE_AUDIO_FAILURE: "FRAG_REPLACE_AUDIO_FAILURE",
	MERGE_FRAGS_SUCCESS: "MERGE_FRAGS_SUCCESS",
	MERGE_FRAGS_FAILURE: "MERGE_FRAGS_FAILURE"
};
const createLogger = (logPath) => (event) => {
	const line = event.map((v) => JSON.stringify(v)).join("	");
	return fsp$19.appendFile(logPath, `${line}\n`);
};
const nameEq = (name) => (event) => event[0] === name;
const getLog = async (logPath) => {
	try {
		const logContent = await fsp$19.readFile(logPath, "utf8");
		return logContent.split("\n").filter(Boolean).map((line) => line.split("	").map((v) => JSON.parse(v)));
	} catch {
		return null;
	}
};
const logUnmuteResult = (unmuteResult, fragIdx) => {
	if (unmuteResult) {
		const { sameFormat, gzip, url } = unmuteResult;
		return [
			DL_EVENT.FRAG_UNMUTE_SUCCESS,
			fragIdx,
			sameFormat,
			gzip,
			url
		];
	} else return [DL_EVENT.FRAG_UNMUTE_FAILURE, fragIdx];
};
const logFragsForDownloading = (frags) => {
	const firstFragIdx = frags.isFMp4 ? 1 : 0;
	return [
		DL_EVENT.FRAGS_FOR_DOWNLOADING,
		frags[firstFragIdx]?.idx || 0,
		frags[frags.length - 1]?.idx || 0
	];
};
const getFragsInfo = (log) => {
	const fragsInfo = {};
	const fragsGroupedByIdx = groupBy(log.filter(([name]) => name.startsWith("FRAG_")), (e) => e[1]);
	for (const [fragIdx, events] of Object.entries(fragsGroupedByIdx)) {
		const fragInfo = {
			muted: null,
			unmuteSuccess: null,
			unmuteSameFormat: null,
			dlSuccess: null,
			dlUnmutedSuccess: null,
			replaceAudioSuccess: null
		};
		fragsInfo[fragIdx] = fragInfo;
		if (!events) continue;
		fragInfo.muted = !!events.findLast(nameEq(DL_EVENT.FRAG_MUTED));
		const unmuteSuccess = events.findLast(nameEq(DL_EVENT.FRAG_UNMUTE_SUCCESS));
		fragInfo.unmuteSuccess = !!unmuteSuccess;
		fragInfo.unmuteSameFormat = unmuteSuccess?.[2] || null;
		fragInfo.dlSuccess = !!events.findLast(nameEq(DL_EVENT.FRAG_DOWNLOAD_SUCCESS));
		fragInfo.dlUnmutedSuccess = !!events.findLast(nameEq(DL_EVENT.FRAG_DOWNLOAD_UNMUTED_SUCCESS));
		fragInfo.replaceAudioSuccess = !!events.findLast(nameEq(DL_EVENT.FRAG_REPLACE_AUDIO_SUCCESS));
	}
	return fragsInfo;
};
const getInitPayload = (log) => log.findLast(nameEq(DL_EVENT.INIT))?.[1] || null;
const showStats = async (logPath) => {
	const log = await getLog(logPath);
	if (!log) {
		console.error("[stats] Cannot read log file");
		return;
	}
	const ffd = log.findLast(nameEq(DL_EVENT.FRAGS_FOR_DOWNLOADING));
	if (!ffd) return;
	const [, fragStartIdx, fragEndIdx] = ffd;
	if (fragStartIdx === 0 && fragEndIdx === 0) return;
	const fragsInfo = getFragsInfo(log);
	let downloaded = 0;
	let muted = 0;
	let unmutedSameFormat = 0;
	let unmutedReplacedAudio = 0;
	for (let i = fragStartIdx; i <= fragEndIdx; i += 1) {
		const fragInfo = fragsInfo[i];
		if (!fragInfo) continue;
		if (fragInfo.dlSuccess) downloaded += 1;
		if (fragInfo.muted) muted += 1;
		if (!fragInfo.unmuteSuccess) continue;
		if (!fragInfo.dlSuccess) continue;
		if (fragInfo.unmuteSameFormat) unmutedSameFormat += 1;
else if (fragInfo.dlUnmutedSuccess && fragInfo.replaceAudioSuccess) unmutedReplacedAudio += 1;
	}
	const stats = {
		Total: fragEndIdx - fragStartIdx + 1,
		Downloaded: downloaded,
		Muted: muted
	};
	const statsUnmuted = {
		"Unmuted total": unmutedSameFormat + unmutedReplacedAudio,
		"Unmuted (same format)": unmutedSameFormat,
		"Unmuted (replaced audio)": unmutedReplacedAudio
	};
	console.log("[stats] Fragments");
	console.table(muted > 0 ? {
		...stats,
		...statsUnmuted
	} : stats);
};

//#endregion
//#region src/downloaders/aria2c.ts
const isUrlsAvailableAria2c = (urls, urlsPath, gzip) => new Promise((resolve) => {
	const args = [
		"--dry-run",
		"--console-log-level",
		"error",
		"-i",
		urlsPath
	];
	if (gzip) args.push("--http-accept-gzip");
	const child = childProcess$2.spawn("aria2c", args);
	let data = "";
	child.stdout.on("data", (chunk) => data += chunk);
	child.on("error", () => resolve([]));
	child.on("close", () => {
		const matches = data.matchAll(/Exception:.*URI=(?<uri>\S+)/g);
		const notAvailableUrls = [];
		for (const m of matches) notAvailableUrls.push(m.groups.uri);
		resolve(urls.map((url) => !notAvailableUrls.includes(url)));
	});
});
const isUrlsAvailable$3 = async (urls) => {
	const urlsPath = path$8.resolve(os$1.tmpdir(), `aria2c-urls-${Date.now()}.txt`);
	await fsp$18.writeFile(urlsPath, urls.join("\n"));
	const [urlsNoGzip, urlsGzip] = await Promise.all([isUrlsAvailableAria2c(urls, urlsPath, false), isUrlsAvailableAria2c(urls, urlsPath, true)]);
	await fsp$18.unlink(urlsPath);
	return urls.map((_, i) => [urlsNoGzip[i], urlsGzip[i]]);
};
const downloadFile$3 = async (url, destPath, rateLimit = "0", gzip = false) => new Promise((resolve) => {
	const dest = path$8.parse(destPath);
	const args = [
		"--console-log-level",
		"error",
		"--max-overall-download-limit",
		rateLimit,
		"--dir",
		dest.dir,
		"-o",
		dest.base,
		url
	];
	if (gzip) args.push("--http-accept-gzip");
	const child = childProcess$2.spawn("aria2c", args);
	child.on("error", () => resolve(RET_CODE.UNKNOWN_ERROR));
	child.on("close", (code) => resolve(code || RET_CODE.OK));
});

//#endregion
//#region src/downloaders/curl.ts
const getIsUrlsAvailableCurl = (urls, gzip) => new Promise((resolve) => {
	const args = [
		"--parallel",
		"--parallel-immediate",
		"--parallel-max",
		"10",
		"--head",
		"-s",
		"-w",
		"[\"%{url_effective}\",\"%{http_code}\"]\r\n"
	];
	if (gzip) args.push("-H", "Accept-Encoding: deflate, gzip");
	args.push(...urls);
	const child = childProcess$1.spawn("curl", args);
	let data = "";
	child.stdout.on("data", (chunk) => data += chunk);
	child.on("error", () => resolve([]));
	child.on("close", () => {
		const responses = data.split("\r\n").filter((line) => line.startsWith("[\"")).map((line) => JSON.parse(line));
		const result = [];
		for (const url of urls) {
			const response = responses.find((res) => res[0] === url);
			if (!response) result.push(false);
else result.push(response[1] === "200");
		}
		resolve(result);
	});
});
const isUrlsAvailable$2 = async (urls) => {
	const [urlsNoGzip, urlsGzip] = await Promise.all([getIsUrlsAvailableCurl(urls, false), getIsUrlsAvailableCurl(urls, true)]);
	return urls.map((_, i) => [urlsNoGzip[i], urlsGzip[i]]);
};
const downloadFile$2 = async (url, destPath, retries, rateLimit = "0", gzip = false) => new Promise((resolve) => {
	const args = [
		"-o",
		destPath,
		"--retry",
		`${retries}`,
		"--retry-delay",
		"1",
		"--limit-rate",
		rateLimit,
		"--fail",
		url
	];
	if (gzip) args.push("-H", "Accept-Encoding: deflate, gzip");
	const child = childProcess$1.spawn("curl", args);
	child.on("error", () => resolve(RET_CODE.UNKNOWN_ERROR));
	child.on("close", (code) => resolve(code || RET_CODE.OK));
});

//#endregion
//#region src/lib/throttleTransform.ts
var ThrottleTransform = class extends stream$1.Transform {
	rateBps;
	startTime;
	processedBytes;
	constructor(rateBps) {
		super();
		this.rateBps = rateBps;
		this.startTime = Date.now();
		this.processedBytes = 0;
	}
	_transform(chunk, _, callback) {
		this.processedBytes += chunk.length;
		const expectedTime = this.processedBytes / this.rateBps * 1e3;
		const actualTime = Date.now() - this.startTime;
		const delay = Math.max(0, expectedTime - actualTime);
		if (delay > 0) setTimeout(() => {
			this.push(chunk);
			callback();
		}, delay);
else {
			this.push(chunk);
			callback();
		}
	}
};

//#endregion
//#region src/downloaders/fetch.ts
const WRONG_LIMIT_RATE_SYNTAX = "Wrong --limit-rate syntax";
const RATE_LIMIT_MULTIPLIER = {
	B: 1,
	K: 1024,
	M: 1048576
};
const parseRateLimit = (rateLimit) => {
	const m = rateLimit.match(/^(?<value>\d+(?:\.\d+)?)(?<unit>[KM])?$/i);
	if (!m) throw new Error(WRONG_LIMIT_RATE_SYNTAX);
	const { value, unit } = m.groups;
	const v = Number.parseFloat(value);
	const u = unit ? unit.toUpperCase() : "B";
	if (Number.isNaN(v)) throw new Error(WRONG_LIMIT_RATE_SYNTAX);
	const multiplier = RATE_LIMIT_MULTIPLIER[u];
	return Math.round(v * multiplier);
};
const isUrlsAvailableFetch = async (urls, gzip) => {
	try {
		const responses = await Promise.all(urls.map((url) => fetch(url, { headers: { "Accept-Encoding": gzip ? "deflate, gzip" : "" } })));
		return responses.map((res) => res.ok);
	} catch (e) {
		return urls.map(() => false);
	}
};
const isUrlsAvailable$1 = async (urls) => {
	const [urlsNoGzip, urlsGzip] = await Promise.all([isUrlsAvailableFetch(urls, false), isUrlsAvailableFetch(urls, true)]);
	return urls.map((_, i) => [urlsNoGzip[i], urlsGzip[i]]);
};
const downloadFile$1 = async (url, destPath, rateLimit, gzip = true) => {
	const rateLimitN = rateLimit ? parseRateLimit(rateLimit) : null;
	try {
		const res = await fetch(url, { headers: { "Accept-Encoding": gzip ? "deflate, gzip" : "" } });
		if (!res.ok) return RET_CODE.HTTP_RETURNED_ERROR;
		await stream.promises.pipeline(stream.Readable.fromWeb(res.body), rateLimitN ? new ThrottleTransform(rateLimitN) : new stream.PassThrough(), fs.createWriteStream(destPath, { flags: "wx" }));
		return RET_CODE.OK;
	} catch (e) {
		return RET_CODE.UNKNOWN_ERROR;
	}
};

//#endregion
//#region src/downloaders/index.ts
const [ARIA2C$1, CURL$1, FETCH$1] = DOWNLOADERS;
const RETRY_DELAY_MS = 1e3;
const MAX_RETRY_DELAY_MS = 15e3;
const downloadFile = async (downloader, url, destPath, rateLimit, gzip, retries = 5) => {
	if (downloader === CURL$1) return downloadFile$2(url, destPath, retries, rateLimit, gzip);
	for (let i = 0; i < retries; i += 1) {
		let retCode = RET_CODE.OK;
		if (downloader === ARIA2C$1) retCode = await downloadFile$3(url, destPath, rateLimit, gzip);
		if (downloader === FETCH$1) retCode = await downloadFile$1(url, destPath, rateLimit, gzip);
		if (retCode === RET_CODE.OK) return retCode;
		await setTimeout$1(Math.min(RETRY_DELAY_MS * 2 ** i, MAX_RETRY_DELAY_MS));
	}
	return RET_CODE.UNKNOWN_ERROR;
};
const IS_URLS_AVAILABLE_MAP = {
	[ARIA2C$1]: isUrlsAvailable$3,
	[CURL$1]: isUrlsAvailable$2,
	[FETCH$1]: isUrlsAvailable$1
};
const isUrlsAvailable = async (downloader, urls) => IS_URLS_AVAILABLE_MAP[downloader](urls);

//#endregion
//#region src/lib/isFMp4MediaFile.ts
const isFMp4MediaFile = async (filePath) => {
	const fd = await fsp$17.open(filePath, "r");
	try {
		const buf = Buffer.alloc(4096);
		await fd.read(buf, 0, buf.length, 0);
		const hasMoof = buf.includes(Buffer.from("moof"));
		const hasMdat = buf.includes(Buffer.from("mdat"));
		return hasMoof && hasMdat;
	} finally {
		await fd.close();
	}
};

//#endregion
//#region src/lib/isMp4File.ts
const isMp4File = async (filePath) => {
	const fd = await fsp$16.open(filePath, "r");
	try {
		const buf = Buffer.alloc(12);
		await fd.read(buf, 0, buf.length, 0);
		return buf[4] === 102 && buf[5] === 116 && buf[6] === 121 && buf[7] === 112;
	} finally {
		await fd.close();
	}
};

//#endregion
//#region src/lib/isTsFile.ts
const PACKET_SIZE = 188;
const TS_SYNC_BYTE = 71;
const isTsFile = async (filePath, packetsToCheck = 1) => {
	const fd = await fsp$15.open(filePath, "r");
	try {
		const buf = Buffer.alloc(PACKET_SIZE * packetsToCheck);
		const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
		if (bytesRead < PACKET_SIZE * packetsToCheck) return false;
		for (let i = 0; i < packetsToCheck; i += 1) if (buf[i * PACKET_SIZE] !== TS_SYNC_BYTE) return false;
		return true;
	} finally {
		await fd.close();
	}
};

//#endregion
//#region src/lib/statsOrNull.ts
const statsOrNull = async (path$11) => {
	try {
		return await fsp$14.stat(path$11);
	} catch (e) {
		return null;
	}
};

//#endregion
//#region src/lib/unlinkIfAny.ts
const unlinkIfAny = async (path$11) => {
	try {
		return await fsp$13.unlink(path$11);
	} catch {}
};

//#endregion
//#region src/utils/downloadFrag.ts
const CHECK_FILE_TYPE = {
	any: () => true,
	ts: isTsFile,
	mp4: isMp4File,
	"fmp4-map": isMp4File,
	"fmp4-media": isFMp4MediaFile
};
const downloadFrag = async (downloader, url, destPath, limitRateArg, gzip, type = "any", retries) => {
	const destPathTmp = `${destPath}.part`;
	if (await statsOrNull(destPathTmp)) await fsp$12.unlink(destPathTmp);
	const startTime = Date.now();
	const retCode = await downloadFile(downloader, url, destPathTmp, limitRateArg, gzip, retries);
	const endTime = Date.now();
	if (retCode !== RET_CODE.OK) {
		await unlinkIfAny(destPathTmp);
		return null;
	}
	await fsp$12.rename(destPathTmp, destPath);
	const [{ size }, isTs] = await Promise.all([fsp$12.stat(destPath), CHECK_FILE_TYPE[type](destPath)]);
	if (!isTs) {
		await fsp$12.unlink(destPath);
		return null;
	}
	return {
		size,
		time: endTime - startTime
	};
};

//#endregion
//#region src/utils/getDownloadRange.ts
const getPlaylistDuration = (playlist) => playlist.segments.reduce((acc, segment) => acc + segment.duration, 0);
const resolveDownloadRange = (playlist, args, state) => {
	const isLive = !playlist.endlist;
	const availableDuration = getPlaylistDuration(playlist);
	const section = args["download-sections"];
	const downloadLast = args["download-last"];
	const duration = args.duration;
	const isSnapshot = !!(args["until-now"] || downloadLast);
	if (isSnapshot && isLive && state.fixedEnd === null) state.fixedEnd = availableDuration;
	const fixedEnd = state.fixedEnd;
	let startTime = section ? section[0] : 0;
	let endTime = section ? section[1] : Infinity;
	if (downloadLast) {
		const end = isLive ? fixedEnd : availableDuration;
		startTime = Math.max(0, end - downloadLast);
		endTime = end;
	}
	if (duration) endTime = Math.min(endTime, startTime + duration);
	if (fixedEnd !== null) endTime = Math.min(endTime, fixedEnd);
	return {
		isLive,
		startTime,
		endTime,
		availableDuration,
		isAvailable: endTime !== Infinity && endTime > 0 && availableDuration >= endTime,
		isPendingStart: isLive && availableDuration < startTime
	};
};

//#endregion
//#region src/utils/getExistingFrags.ts
const getExistingFrags = (frags, outputPath, dir) => {
	const existingFrags = frags.filter((frag) => dir.includes(path$7.parse(getPath.frag(outputPath, frag.idx + 1)).base));
	existingFrags.isFMp4 = frags.isFMp4;
	return existingFrags;
};

//#endregion
//#region src/utils/getFragsForDownloading.ts
const sliceFrags = (frags, range) => {
	if (range.startTime <= 0 && range.endTime === Infinity) return frags;
	const firstIdx = Math.max(0, frags.findLastIndex((frag) => frag.offset <= range.startTime));
	if (range.endTime === Infinity) return frags.slice(firstIdx);
	const endIdx = frags.findIndex((frag) => frag.offset >= range.endTime);
	return frags.slice(firstIdx, endIdx === -1 ? undefined : endIdx + 1);
};
const getFragsForDownloading = (playlistUrl, playlist, range) => {
	const baseUrl = playlistUrl.split("/").slice(0, -1).join("/");
	const mapFragUri = playlist.segments[0]?.map?.uri;
	let mapFrag = null;
	if (mapFragUri) mapFrag = {
		idx: 0,
		offset: 0,
		duration: 0,
		isMap: true,
		url: `${baseUrl}/${mapFragUri}`
	};
	let frags = [];
	let offset = 0;
	let idx = mapFrag ? 1 : 0;
	for (const { duration, uri } of playlist.segments) {
		frags.push({
			idx,
			offset,
			duration,
			url: `${baseUrl}/${uri}`
		});
		offset += duration;
		idx += 1;
	}
	frags = sliceFrags(frags, range);
	if (mapFrag) frags = [mapFrag, ...frags];
	const dlFrags = frags;
	dlFrags.isFMp4 = !!mapFrag;
	return dlFrags;
};

//#endregion
//#region src/utils/getTryUnmute.ts
const ONE_WEEK_MS = 6048e5;
const getTryUnmute = (videoInfo) => {
	const videoDate = videoInfo.upload_date || videoInfo.release_date;
	if (!videoDate) return null;
	const videoDateMs = new Date(videoDate).getTime();
	return Date.now() - videoDateMs < ONE_WEEK_MS;
};

//#endregion
//#region src/utils/getUnmutedFrag.ts
const LOWER_AUDIO_QUALITY = ["160p30", "360p30"];
const SAME_FORMAT_SLUGS = ["audio_only", ...LOWER_AUDIO_QUALITY];
const getFormatSlug = (url) => url.split("/").at(-2);
const getFragResponse = ([available, availableGzip], sameFormat, url) => {
	if (available) return {
		sameFormat,
		gzip: false,
		url
	};
	if (availableGzip) return {
		sameFormat,
		gzip: true,
		url
	};
	return null;
};
const getUnmutedFrag = async (downloader, unmuteArg, fragUrl, formats) => {
	if (unmuteArg === UNMUTE.OFF) return null;
	const currentFormatSlug = getFormatSlug(fragUrl);
	if (unmuteArg === UNMUTE.ANY && currentFormatSlug === "audio_only") {
		console.warn("[unmute] Unmuting audio_only format is not supported");
		unmuteArg = UNMUTE.SAME_FORMAT;
	}
	if (!unmuteArg) unmuteArg = SAME_FORMAT_SLUGS.includes(currentFormatSlug) ? UNMUTE.SAME_FORMAT : UNMUTE.QUALITY;
	if (unmuteArg === UNMUTE.SAME_FORMAT) {
		const url = fragUrl.replace("-muted", "");
		const [availability] = await isUrlsAvailable(downloader, [url]);
		return getFragResponse(availability, true, url);
	}
	if (unmuteArg === UNMUTE.ANY || unmuteArg === UNMUTE.QUALITY) {
		const urls = [];
		let currentFormatIdx = -1;
		for (let i = 0; i < formats.length; i += 1) {
			const formatSlug = getFormatSlug(formats[i].url);
			if (unmuteArg === UNMUTE.QUALITY && LOWER_AUDIO_QUALITY.includes(formatSlug)) continue;
			if (formatSlug === currentFormatSlug) currentFormatIdx = i;
			urls.push(fragUrl.replace("-muted", "").replace(`/${currentFormatSlug}/`, `/${formatSlug}/`));
		}
		const responses = await isUrlsAvailable(downloader, urls);
		const unmutedSameFormat = getFragResponse(responses[currentFormatIdx], true, urls[currentFormatIdx]);
		if (unmutedSameFormat) return unmutedSameFormat;
		const idx = responses.findLastIndex(([av, avGzip]) => av || avGzip);
		if (idx === -1) return null;
		return getFragResponse(responses[idx], false, urls[idx]);
	}
	throw new Error();
};

//#endregion
//#region src/utils/processUnmutedFrags.ts
const processUnmutedFrags = async (frags, outputPath, dir, writeLog) => {
	for (const frag of frags) {
		const fragPath = getPath.frag(outputPath, frag.idx + 1);
		const fragUnmutedPath = getPath.fragUnmuted(fragPath);
		const fragUnmutedFileName = path$6.parse(fragUnmutedPath).base;
		if (!dir.includes(fragUnmutedFileName)) continue;
		const fragUnmutedPathTmp = `${fragPath}.ts`;
		const retCode = await spawn("ffmpeg", [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			fragPath,
			"-i",
			fragUnmutedPath,
			"-c:a",
			"copy",
			"-c:v",
			"copy",
			"-map",
			"1:a:0",
			"-map",
			"0:v:0",
			"-y",
			fragUnmutedPathTmp
		]);
		const message = `[unmute] Adding audio to Frag${frag.idx + 1}`;
		if (retCode) {
			await unlinkIfAny(fragUnmutedPathTmp);
			console.error(`${message}. Failure`);
			writeLog?.([DL_EVENT.FRAG_REPLACE_AUDIO_FAILURE, frag.idx]);
			continue;
		}
		await Promise.all([fsp$11.unlink(fragPath), fsp$11.unlink(fragUnmutedPath)]);
		await fsp$11.rename(fragUnmutedPathTmp, fragPath);
		console.log(`${message}. Success`);
		writeLog?.([DL_EVENT.FRAG_REPLACE_AUDIO_SUCCESS, frag.idx]);
	}
};

//#endregion
//#region src/utils/readOutputDir.ts
const readOutputDir = (outputPath) => fsp$10.readdir(path$5.parse(outputPath).dir || ".");

//#endregion
//#region src/commands/mergeFragments.ts
const tryUnmuteFrags = async (outputPath, log, frags, formats, args, writeLog) => {
	const fragsInfo = getFragsInfo(log);
	for (const frag of frags) {
		const fragN = frag.idx + 1;
		const info = fragsInfo[frag.idx];
		if (!info || !info.muted || info.replaceAudioSuccess) continue;
		if (info.unmuteSameFormat && info.dlSuccess) continue;
		const unmutedFrag = await getUnmutedFrag(args.downloader, args.unmute, frag.url, formats);
		writeLog(logUnmuteResult(unmutedFrag, frag.idx));
		if (!unmutedFrag) {
			console.log(`[unmute] Frag${fragN}: cannot unmute`);
			continue;
		}
		const fragPath = getPath.frag(outputPath, fragN);
		if (unmutedFrag.sameFormat) {
			const fragPathTmp = `${fragPath}.tmp`;
			await fsp$9.rename(fragPath, fragPathTmp);
			const fragMeta = await downloadFrag(args.downloader, unmutedFrag.url, fragPath, args["limit-rate"], unmutedFrag.gzip, frags.isFMp4 ? "fmp4-media" : "ts");
			if (fragMeta) {
				await fsp$9.unlink(fragPathTmp);
				console.log(`[unmute] Frag${fragN}: successfully unmuted`);
			} else {
				await fsp$9.rename(fragPathTmp, fragPath);
				console.log(`[unmute] Frag${fragN}: cannot download unmuted fragment`);
			}
			writeLog([fragMeta ? DL_EVENT.FRAG_DOWNLOAD_SUCCESS : DL_EVENT.FRAG_DOWNLOAD_FAILURE, frag.idx]);
		} else {
			const unmutedFragPath = getPath.fragUnmuted(fragPath);
			const fragMeta = await downloadFrag(args.downloader, unmutedFrag.url, unmutedFragPath, args["limit-rate"], unmutedFrag.gzip, frags.isFMp4 ? "fmp4-media" : "ts");
			if (fragMeta) console.log(`[unmute] Frag${fragN}: successfully unmuted`);
else console.log(`[unmute] Frag${fragN}: cannot download unmuted fragment`);
			writeLog([fragMeta ? DL_EVENT.FRAG_DOWNLOAD_UNMUTED_SUCCESS : DL_EVENT.FRAG_DOWNLOAD_UNMUTED_FAILURE, frag.idx]);
		}
	}
};
const mergeFragments = async (outputPath, args) => {
	outputPath = path$4.resolve(outputPath);
	const [playlistContent, dir] = await Promise.all([fsp$9.readFile(getPath.playlist(outputPath), "utf8"), readOutputDir(outputPath)]);
	const logPath = getPath.log(outputPath);
	const log = await getLog(logPath);
	const writeLog = createLogger(logPath);
	const dlInfo = getInitPayload(log || []);
	const playlistUrl = dlInfo?.playlistUrl || "";
	const playlist = parse(playlistContent);
	const range = resolveDownloadRange(playlist, args, { fixedEnd: null });
	const allFrags = getFragsForDownloading(playlistUrl, playlist, range);
	const frags = getExistingFrags(allFrags, outputPath, dir);
	if (log && dlInfo && args.unmute && args.unmute !== UNMUTE.OFF) {
		const { videoInfo, formats } = dlInfo;
		if (getTryUnmute(videoInfo)) await tryUnmuteFrags(outputPath, log, frags, formats, args, writeLog);
else console.warn(NO_TRY_UNMUTE_MESSAGE);
	}
	writeLog(logFragsForDownloading(frags));
	await processUnmutedFrags(frags, outputPath, dir, writeLog);
	await mergeFrags(args["merge-method"], frags, outputPath, true);
	await showStats(logPath);
};

//#endregion
//#region src/lib/getAssetPath.ts
const getAssetPath = async (filename) => {
	let dir = import.meta.dirname;
	while (true) {
		const filePath = path$3.join(dir, filename);
		if (await statsOrNull(filePath)) return filePath;
		const parentDir = path$3.dirname(dir);
		if (parentDir === dir) throw new Error(`Cannot find ${filename}`);
		dir = parentDir;
	}
};

//#endregion
//#region src/commands/showHelp.ts
const showHelp = async () => {
	const readmePath = await getAssetPath("README.md");
	const readme = (await fsp$8.readFile(readmePath, "utf8")).replaceAll("\r\n", "\n");
	const entries = readme.split(/\s## (.*)/g).slice(1);
	const sections = {};
	for (let i = 0; i < entries.length; i += 2) {
		const header = entries[i];
		const content = entries[i + 1].trim();
		sections[header] = content;
	}
	const help = [
		"Options:",
		sections.Options.replace(/^```\w+\n(.*)\n```$/s, "$1"),
		"",
		"Dependencies:",
		sections.Dependencies.replaceAll("**", "")
	];
	console.log(help.join("\n"));
};

//#endregion
//#region src/commands/showVersion.ts
const showVersion = async () => {
	const pkgPath = await getAssetPath("package.json");
	const pkg = await fsp$7.readFile(pkgPath, "utf8");
	console.log(JSON.parse(pkg).version);
};

//#endregion
//#region src/lib/isInstalled.ts
const isInstalled = (cmd) => new Promise((resolve) => {
	const child = childProcess.spawn(cmd);
	child.on("error", (e) => resolve(e.code !== "ENOENT"));
	child.on("close", () => resolve(true));
});

//#endregion
//#region src/utils/args/getDownloader.ts
const [ARIA2C, CURL, FETCH] = DOWNLOADERS;
const getDownloader = async (downloaderArg) => {
	if (downloaderArg === FETCH) return FETCH;
	if (downloaderArg === ARIA2C) {
		if (await isInstalled(ARIA2C)) return ARIA2C;
		throw new Error(`${ARIA2C} is not installed. Install it from https://aria2.github.io/`);
	}
	if (downloaderArg === CURL) {
		if (await isInstalled(CURL)) return CURL;
		const curlLink = os.platform() === "win32" ? "https://curl.se/windows/" : "https://curl.se/download.html";
		throw new Error(`${CURL} is not installed. Install it from ${curlLink}`);
	}
	throw new Error(`Unknown downloader: ${downloaderArg}. Available: ${DOWNLOADERS.join(", ")}`);
};

//#endregion
//#region src/utils/args/parseTime.ts
const WRONG_TIME_SYNTAX = "Wrong time syntax";
const CLOCK_TIME_REGEX = /^(?:(?:(?<h>\d{1,2}):)?(?<m>\d{1,2}):)?(?<s>\d{1,2})$/;
const UNIT_TIME_REGEX = /^(?:(?<h>\d+(?:\.\d+)?)h)?(?:(?<m>\d+(?:\.\d+)?)m)?(?:(?<s>\d+(?:\.\d+)?)s)?$/;
const getParts = (groups) => {
	const { h, m, s } = groups || {};
	if (h === undefined && m === undefined && s === undefined) return null;
	const parts = {
		h: h ? Number.parseFloat(h) : 0,
		m: m ? Number.parseFloat(m) : 0,
		s: s ? Number.parseFloat(s) : 0
	};
	if (Number.isNaN(parts.h) || Number.isNaN(parts.m) || Number.isNaN(parts.s)) return null;
	return parts;
};
const toSeconds = ({ h, m, s }) => h * 60 * 60 + m * 60 + s;
const parseTime = (value) => {
	const str = `${value}`.trim();
	if (/^\d+$/.test(str)) return Number.parseInt(str, 10);
	const clock = str.match(CLOCK_TIME_REGEX);
	if (clock) {
		const parts = getParts(clock.groups);
		if (!parts || parts.m >= 60 || parts.s >= 60) throw new Error(WRONG_TIME_SYNTAX);
		return toSeconds(parts);
	}
	const unit = str.match(UNIT_TIME_REGEX);
	if (unit) {
		const parts = getParts(unit.groups);
		if (!parts) throw new Error(WRONG_TIME_SYNTAX);
		return toSeconds(parts);
	}
	throw new Error(WRONG_TIME_SYNTAX);
};

//#endregion
//#region src/utils/args/parseDownloadSectionsArg.ts
const DOWNLOAD_SECTIONS_ERROR = "Wrong --download-sections syntax";
const DOWNLOAD_SECTIONS_REGEX = /^\*(?<startTime>[^-]*)-(?<endTime>.+)$/;
const parseDownloadSectionsArg = (downloadSectionsArg) => {
	if (!downloadSectionsArg) return null;
	const m = downloadSectionsArg.match(DOWNLOAD_SECTIONS_REGEX);
	if (!m?.groups) throw new Error(DOWNLOAD_SECTIONS_ERROR);
	const { startTime, endTime } = m.groups;
	try {
		const start = parseTime(startTime);
		const end = endTime.trim().toLowerCase() === "inf" ? Infinity : parseTime(endTime);
		if (start >= end) throw new Error(DOWNLOAD_SECTIONS_ERROR);
		return [start, end];
	} catch {
		throw new Error(DOWNLOAD_SECTIONS_ERROR);
	}
};

//#endregion
//#region src/utils/args/normalizeArgs.ts
const parseDurationArg = (value, argName) => {
	if (value === undefined) return null;
	const seconds = (() => {
		try {
			return parseTime(value);
		} catch {
			throw new Error(`Wrong ${argName} value: ${value}`);
		}
	})();
	if (seconds <= 0) throw new Error(`Wrong ${argName} value: ${value}`);
	return seconds;
};
const parseIntArg = (value, argName, defaultValue, max) => {
	if (value === undefined) return defaultValue;
	if (!/^\d+$/.test(value.trim())) throw new Error(`Wrong ${argName} value: ${value}`);
	const n = Number.parseInt(value, 10);
	if (n < 1 || n > max) throw new Error(`${argName} must be between 1 and ${max}`);
	return n;
};
const parseCountArg = (value, argName, defaultValue) => {
	if (value === undefined) return defaultValue;
	if (!/^\d+$/.test(value.trim())) throw new Error(`Wrong ${argName} value: ${value}`);
	return Number.parseInt(value, 10);
};
const normalizeArgs = async (args) => {
	const newArgs = { ...args };
	newArgs.downloader = await getDownloader(args.downloader);
	newArgs["download-sections"] = parseDownloadSectionsArg(args["download-sections"]);
	newArgs["download-last"] = parseDurationArg(args["download-last"], "--download-last");
	newArgs.duration = parseDurationArg(args.duration, "--duration");
	newArgs["frag-concurrency"] = parseIntArg(args["frag-concurrency"], "--frag-concurrency", 1, 32);
	newArgs["frag-retries"] = parseIntArg(args["frag-retries"], "--frag-retries", 5, 100);
	newArgs["poll-interval"] = parseIntArg(args["poll-interval"], "--poll-interval", 60, 3600);
	newArgs["max-downloads"] = parseCountArg(args["max-downloads"], "--max-downloads", 0);
	newArgs["sleep-interval"] = parseCountArg(args["sleep-interval"], "--sleep-interval", 0);
	if (args["extract-audio"]) {
		const audioFormats = AUDIO_FORMATS;
		if (!audioFormats.includes(args["extract-audio"])) throw new Error(`Unknown audio format: ${args["extract-audio"]}. Available: ${AUDIO_FORMATS.join(", ")}`);
		newArgs["extract-audio"] = args["extract-audio"];
	} else newArgs["extract-audio"] = undefined;
	if (args["audio-only"] && args.format !== "best") throw new Error("--audio-only cannot be used with --format");
	if (newArgs["download-last"] && newArgs["download-sections"]) throw new Error("--download-last cannot be used with --download-sections");
	if (args["fallback-live-edge"] && !args["live-from-start"]) throw new Error("--fallback-live-edge can only be used with --live-from-start");
	if (newArgs.duration && newArgs["download-last"]) throw new Error("--duration cannot be used with --download-last");
	if (!newArgs["output-dir"]) newArgs["output-dir"] = process.env[OUTPUT_DIR_ENV] || undefined;
	if (!newArgs["download-archive"]) newArgs["download-archive"] = process.env[ARCHIVE_ENV] || undefined;
	if (args["webhook"]) try {
		new URL(args["webhook"]);
	} catch {
		throw new Error(`Wrong --webhook url: ${args["webhook"]}`);
	}
	if (args["retry-streams"]) {
		const delay = Number.parseInt(args["retry-streams"]);
		if (!delay) throw new Error("Wrong --retry-streams delay");
		if (delay < 10) throw new Error("Min --retry-streams delay is 10");
		newArgs["retry-streams"] = delay;
	}
	if (!MERGE_METHODS.includes(args["merge-method"])) throw new Error(`Unknown merge method: ${args["merge-method"]}. Available: ${MERGE_METHODS.join(", ")}`);
	const unmuteValues = Object.values(UNMUTE);
	if (args["unmute"] && !unmuteValues.includes(args["unmute"])) throw new Error(`Unknown unmute policy: ${args["unmute"]}. Available: ${unmuteValues.join(", ")}`);
	return newArgs;
};

//#endregion
//#region src/utils/getLinks.ts
const parseBatchFile = (content) => content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
const getLinks = async (positionals, batchFilePath) => {
	const links = [...positionals];
	if (batchFilePath) {
		const content = await fsp$6.readFile(batchFilePath, "utf8").catch(() => null);
		if (content === null) throw new Error(`Cannot read batch file: ${batchFilePath}`);
		links.push(...parseBatchFile(content));
	}
	return links;
};

//#endregion
//#region node_modules/.pnpm/twitch-gql-queries@0.1.18/node_modules/twitch-gql-queries/dist/index.js
var CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
var MAX_QUERIES_PER_REQUEST = 35;
var gqlRequest = async (queries, requestInit) => {
	if (queries.length === 0) return [];
	if (queries.length > MAX_QUERIES_PER_REQUEST) throw new Error(`Too many queries. Max: ${MAX_QUERIES_PER_REQUEST}`);
	const res = await fetch("https://gql.twitch.tv/gql", {
		method: "POST",
		body: JSON.stringify(queries),
		headers: {
			"Client-Id": CLIENT_ID,
			...requestInit?.headers
		},
		...requestInit
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
};
var getQueryFfzRecentBroadcasts = (variables) => ({
	operationName: "FFZ_RecentBroadcasts",
	variables,
	extensions: { persistedQuery: {
		version: 1,
		sha256Hash: "a92c0ad34fdba9b3f5e6125dce4b0acc9373f2b2c06c74c92187749d12f73d4c"
	} }
});
var getQueryPlaybackAccessToken = (variables) => ({
	operationName: "PlaybackAccessToken",
	variables,
	extensions: { persistedQuery: {
		version: 1,
		sha256Hash: "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9"
	} }
});
var getQueryShareClipRenderStatus = (variables) => ({
	operationName: "ShareClipRenderStatus",
	variables,
	extensions: { persistedQuery: {
		version: 1,
		sha256Hash: "e0a46b287d760c6890a39d1ccd736af5ec9479a267d02c710e9ac33326b651d2"
	} }
});
var getQueryStreamMetadata = (variables) => ({
	operationName: "StreamMetadata",
	variables,
	extensions: { persistedQuery: {
		version: 1,
		sha256Hash: "b57f9b910f8cd1a4659d894fe7550ccc81ec9052c01e438b290fd66a040b9b93"
	} }
});
var getQueryVideoMetadata = (variables) => ({
	operationName: "VideoMetadata",
	variables,
	extensions: { persistedQuery: {
		version: 1,
		sha256Hash: "45111672eea2e507f8ba44d101a61862f9c56b11dee09a15634cb75cb9b9084d"
	} }
});

//#endregion
//#region src/utils/fetchText.ts
const fetchText = async (url, description = "metadata") => {
	console.log(`Downloading ${description}`);
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error();
		return res.text();
	} catch (e) {
		console.error(`Unable to download ${description}`);
		return null;
	}
};

//#endregion
//#region src/api/twitch.ts
const apiRequest = async (query, resultKey, description = "metadata") => {
	console.log(`Downloading ${description}`);
	try {
		const [res] = await gqlRequest([query]);
		return res?.data[resultKey] || null;
	} catch (e) {
		console.error(`Unable to download ${description}`);
		return null;
	}
};
const getVideoAccessToken = (id) => apiRequest(getQueryPlaybackAccessToken({
	isLive: false,
	login: "",
	isVod: true,
	vodID: id,
	playerType: "site",
	platform: "web"
}), "videoPlaybackAccessToken", "video access token");
const getStreamMetadata = (channelLogin) => apiRequest(getQueryStreamMetadata({
	channelLogin,
	includeIsDJ: false
}), "user", "stream metadata");
const getVideoMetadata = (videoId) => apiRequest(getQueryVideoMetadata({
	channelLogin: "",
	videoID: videoId
}), "video", "video metadata");
const getClipMetadata = (slug) => apiRequest(getQueryShareClipRenderStatus({ slug }), "clip", "clip metadata");
const getRecentArchiveBroadcasts = (channelId) => apiRequest(getQueryFfzRecentBroadcasts({
	id: channelId,
	type: "ARCHIVE",
	sort: "TIME",
	limit: 1
}), "user", "recent broadcast");
const getManifest = (videoId, accessToken) => {
	const params = new URLSearchParams({
		allow_source: "true",
		allow_audio_only: "true",
		allow_spectre: "true",
		include_unavailable: "true",
		player: "twitchweb",
		playlist_include_framerate: "true",
		sig: accessToken.signature,
		supported_codecs: "av1,h265,h264",
		token: accessToken.value
	});
	const url = `https://usher.ttvnw.net/vod/${videoId}.m3u8?${params}`;
	return fetchText(url, "video manifest");
};

//#endregion
//#region src/lib/formatTime.ts
const formatTime = (seconds) => {
	const total = Math.max(0, Math.round(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor(total % 3600 / 60);
	const s = total % 60;
	const mm = `${m}`.padStart(h ? 2 : 1, "0");
	const ss = `${s}`.padStart(2, "0");
	return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

//#endregion
//#region src/lib/asyncPool.ts
const asyncPool = async (items, concurrency, worker) => {
	const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
	let nextIdx = 0;
	await Promise.all(Array.from({ length: limit }, async () => {
		while (nextIdx < items.length) {
			const idx = nextIdx;
			nextIdx += 1;
			await worker(items[idx], idx);
		}
	}));
};

//#endregion
//#region src/utils/showProgress.ts
const UNITS = [
	"B",
	"KB",
	"MB",
	"GB",
	"TB",
	"PB",
	"EB",
	"ZB",
	"YB"
];
const LOCALE = "en-GB";
const percentFmt = new Intl.NumberFormat(LOCALE, {
	style: "percent",
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});
const timeFmt = new Intl.DateTimeFormat(LOCALE, {
	hour: "numeric",
	minute: "numeric",
	second: "numeric",
	timeZone: "GMT"
});
const formatSpeed = (n) => {
	const i = n === 0 ? 0 : Math.floor(Math.log(n) / Math.log(1024));
	const value = n / Math.pow(1024, i);
	return `${value.toFixed(2)}${UNITS[i]}/s`;
};
const formatSize = (n) => {
	const i = n === 0 ? 0 : Math.floor(Math.log(n) / Math.log(1024));
	const value = n / Math.pow(1024, i);
	return `${value.toFixed(2)}${UNITS[i]}`;
};
const showProgress = (downloadedFrags, fragsCount) => {
	const dlFrags = Array.from(downloadedFrags.values());
	const dlSize = dlFrags.reduce((acc, f) => acc + f.size, 0);
	const avgFragSize = dlFrags.length ? dlSize / dlFrags.length : 0;
	const last5 = dlFrags.filter((f) => f.time !== 0).slice(-5);
	const currentSpeedBps = last5.length ? last5.map((f) => f.size / f.time * 1e3).reduce((a, b) => a + b, 0) / last5.length : 0;
	const estFullSize = avgFragSize * fragsCount;
	const estSizeLeft = estFullSize - dlSize;
	let estTimeLeftSec = currentSpeedBps ? estSizeLeft / currentSpeedBps : 0;
	let downloadedPercent = estFullSize ? dlSize / estFullSize : 0;
	downloadedPercent = Math.min(100, downloadedPercent) || 0;
	if (estTimeLeftSec < 0) estTimeLeftSec = 0;
	const progress = [
		"[download] ",
		chalk.cyan(percentFmt.format(downloadedPercent).padStart(6, " ")),
		" of ~ ",
		formatSize(estFullSize || 0).padStart(9, " "),
		" at ",
		chalk.green(formatSpeed(currentSpeedBps || 0).padStart(11, " ")),
		" ETA ",
		chalk.yellow(timeFmt.format(estTimeLeftSec * 1e3)),
		` (frag ${dlFrags.length}/${fragsCount})\r`
	].join("");
	process.stdout.write(progress);
};

//#endregion
//#region src/utils/downloadFragsPass.ts
const downloadFragsPass = async ({ frags, fragsCount, outputPath, args, formats, tryUnmute, downloadedFrags, writeLog }) => {
	const fragType = frags.isFMp4 ? "fmp4-media" : "ts";
	await asyncPool([...frags.entries()], args["frag-concurrency"], async ([i, frag]) => {
		showProgress(downloadedFrags, fragsCount);
		const fragPath = getPath.frag(outputPath, frag.idx + 1);
		const fragStats = await statsOrNull(fragPath);
		if (fragStats) {
			if (!downloadedFrags.has(i)) {
				downloadedFrags.set(i, {
					size: fragStats.size,
					time: 0
				});
				showProgress(downloadedFrags, fragsCount);
			}
			return;
		}
		if (frag.url.includes("-unmuted")) {
			writeLog([DL_EVENT.FRAG_RENAME_UNMUTED, frag.idx]);
			frag.url = frag.url.replace("-unmuted", "-muted");
		}
		let unmutedFrag = null;
		if (frag.url.includes("-muted")) {
			writeLog([DL_EVENT.FRAG_MUTED, frag.idx]);
			if (tryUnmute) {
				unmutedFrag = await getUnmutedFrag(args.downloader, args.unmute, frag.url, formats);
				writeLog(logUnmuteResult(unmutedFrag, frag.idx));
			}
		}
		let fragGzip = undefined;
		if (unmutedFrag && unmutedFrag.sameFormat) {
			frag.url = unmutedFrag.url;
			fragGzip = unmutedFrag.gzip;
		}
		let fragMeta = await downloadFrag(args.downloader, frag.url, fragPath, args["limit-rate"], fragGzip, frag.isMap ? "fmp4-map" : fragType, args["frag-retries"]);
		downloadedFrags.set(i, fragMeta || {
			size: 0,
			time: 0
		});
		writeLog([fragMeta ? DL_EVENT.FRAG_DOWNLOAD_SUCCESS : DL_EVENT.FRAG_DOWNLOAD_FAILURE, frag.idx]);
		if (unmutedFrag && !unmutedFrag.sameFormat) {
			fragMeta = await downloadFrag(args.downloader, unmutedFrag.url, getPath.fragUnmuted(fragPath), args["limit-rate"], unmutedFrag.gzip, fragType, args["frag-retries"]);
			writeLog([fragMeta ? DL_EVENT.FRAG_DOWNLOAD_UNMUTED_SUCCESS : DL_EVENT.FRAG_DOWNLOAD_UNMUTED_FAILURE, frag.idx]);
		}
		showProgress(downloadedFrags, fragsCount);
	});
};

//#endregion
//#region src/utils/extractAudio.ts
/** Audio encoder args for every `--extract-audio` value */
const ENCODE_ARGS = {
	mp3: [
		"-c:a",
		"libmp3lame",
		"-q:a",
		"2"
	],
	m4a: [
		"-c:a",
		"aac",
		"-b:a",
		"192k"
	],
	opus: [
		"-c:a",
		"libopus",
		"-b:a",
		"160k"
	],
	flac: ["-c:a", "flac"],
	wav: ["-c:a", "pcm_s16le"],
	copy: ["-c:a", "copy"]
};
const getExtractAudioArgs = (inputPath, outputPath, format) => [
	"-hide_banner",
	"-y",
	"-i",
	inputPath,
	"-vn",
	...ENCODE_ARGS[format],
	outputPath
];
const extractAudio = async (inputPath, outputPath, format, keepVideo) => {
	console.log(`[extract-audio] Converting to ${format}`);
	const retCode = await spawn("ffmpeg", getExtractAudioArgs(inputPath, outputPath, format), true);
	if (retCode !== 0) {
		console.warn("[extract-audio] ffmpeg failed, keeping the video");
		await fsp$5.rm(outputPath, { force: true }).catch(() => {});
		return false;
	}
	if (!keepVideo && path$2.resolve(inputPath) !== path$2.resolve(outputPath)) await fsp$5.unlink(inputPath).catch(() => {});
	console.log(`[extract-audio] Saved to ${outputPath}`);
	return true;
};

//#endregion
//#region src/utils/getDlFormat.ts
const getAudioOnlyFormat = (formats) => {
	const audioFormat = formats.find((f) => /^audio[_-]?only$/i.test(f.format_id)) ?? formats.find((f) => f.height === null);
	if (!audioFormat) throw new Error("Cannot find an audio-only format");
	return audioFormat;
};
const getDlFormat = (formats, formatArg) => {
	const dlFormat = formatArg === "best" ? formats[0] : formats.find((f) => f.format_id.toLowerCase() === formatArg.toLowerCase());
	if (!dlFormat) throw new Error(`Wrong format: ${formatArg}`);
	return dlFormat;
};

//#endregion
//#region src/utils/getDownloadArchive.ts
const parseArchive = (content) => new Set(content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
const readArchive = async (archivePath) => {
	const content = await fsp$4.readFile(archivePath, "utf8").catch(() => null);
	if (content === null) return new Set();
	return parseArchive(content);
};
const appendToArchive = async (archivePath, videoId) => {
	const dir = path$1.dirname(archivePath);
	if (dir && dir !== ".") await fsp$4.mkdir(dir, { recursive: true });
	await fsp$4.appendFile(archivePath, `${videoId}\n`);
};

//#endregion
//#region src/utils/notifyWebhook.ts
const notifyWebhook = async (webhookUrl, content) => {
	if (!webhookUrl) return;
	try {
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content,
				text: content
			})
		});
		if (!res.ok) console.warn(`[webhook] Request failed: ${res.status}`);
	} catch (e) {
		console.warn(`[webhook] Cannot send a notification: ${e.message}`);
	}
};

//#endregion
//#region src/utils/preciseCut.ts
const getPreciseCutRange = (frags, range) => {
	const segments = frags.filter((frag) => !frag.isMap);
	const first = segments.at(0);
	const last = segments.at(-1);
	if (!first || !last) return null;
	const contentStart = first.offset;
	const contentEnd = last.offset + last.duration;
	const clamp = (time) => Math.min(Math.max(time, contentStart), contentEnd);
	const startTime = clamp(range.startTime);
	const endTime = range.endTime === Infinity ? contentEnd : clamp(range.endTime);
	const duration = endTime - startTime;
	if (duration <= 0) return null;
	const isStartAligned = startTime - contentStart < PRECISE_CUT_THRESHOLD_SEC;
	const isEndAligned = contentEnd - endTime < PRECISE_CUT_THRESHOLD_SEC;
	if (isStartAligned && isEndAligned) return null;
	return {
		startTime: startTime - contentStart,
		duration
	};
};
const getPreciseCutArgs = (inputPath, outputPath, cut, isAudioOnly) => [
	"-hide_banner",
	"-y",
	"-ss",
	cut.startTime.toFixed(3),
	"-i",
	inputPath,
	"-t",
	cut.duration.toFixed(3),
	...isAudioOnly ? [
		"-vn",
		"-c:a",
		"aac",
		"-b:a",
		"192k"
	] : [
		"-map",
		"0",
		"-c:v",
		"libx264",
		"-crf",
		"18",
		"-preset",
		"veryfast",
		"-c:a",
		"aac",
		"-b:a",
		"160k"
	],
	"-movflags",
	"+faststart",
	outputPath
];
const preciseCut = async (outputPath, cut, isAudioOnly) => {
	const parsed = path.parse(outputPath);
	const tmpPath = path.join(parsed.dir, `${parsed.name}.precise-tmp.mp4`);
	console.log(`[precise-cut] Re-encoding ${formatTime(cut.startTime)} → ${formatTime(cut.startTime + cut.duration)} of the downloaded file (this can take a while)`);
	const retCode = await spawn("ffmpeg", getPreciseCutArgs(outputPath, tmpPath, cut, isAudioOnly), true);
	const isEmpty = ((await statsOrNull(tmpPath))?.size || 0) < 1024;
	if (retCode !== 0 || isEmpty) {
		console.warn("[precise-cut] ffmpeg failed, keeping the fragment accurate cut");
		await fsp$3.rm(tmpPath, { force: true }).catch(() => {});
		return false;
	}
	await fsp$3.unlink(outputPath);
	await fsp$3.rename(tmpPath, outputPath);
	console.log("[precise-cut] Done");
	return true;
};

//#endregion
//#region src/utils/showFormats.ts
const showFormats = (formats) => {
	console.table([...formats].reverse().map(({ format_id, width, height, frameRate, totalBitrate, source }) => {
		const fmt = {};
		fmt.format_id = format_id;
		fmt.resolution = "unknown";
		if (format_id === "Audio_Only") fmt.resolution = "audio only";
else if (width && height) fmt.resolution = `${width}x${height}`;
else if (height) fmt.resolution = `${height}p`;
		fmt.fps = frameRate;
		if (totalBitrate) fmt.total_bitrate = `${(totalBitrate / 1024).toFixed()}k`;
		fmt.source = source;
		return fmt;
	}));
};

//#endregion
//#region src/utils/writeInfoJson.ts
const writeInfoJson = async (outputPath, data) => {
	const { videoInfo, dlFormat, range, playlistUrl, fragmentCount } = data;
	const info = {
		...videoInfo,
		live: range.isLive,
		range_start: range.startTime,
		range_end: range.endTime === Infinity ? null : range.endTime,
		playlist_url: playlistUrl,
		format_id: dlFormat.format_id,
		fragment_count: fragmentCount,
		downloaded_bytes: data.downloadedBytes,
		downloaded_at: new Date().toISOString()
	};
	const infoPath = getPath.infoJson(outputPath);
	await fsp$2.writeFile(infoPath, `${JSON.stringify(info, null, 2)}\n`);
	console.log(`[info-json] Saved to ${infoPath}`);
};

//#endregion
//#region src/utils/downloadVideo.ts
const DEFAULT_POLL_INTERVAL_SEC = 60;
const getRetryMessage = (delaySec) => `Retry every ${delaySec} second(s)`;
const getRangeKey = (range) => [
	range.startTime,
	range.endTime,
	range.isLive
].join("-");
const showRange = (range) => {
	const start = formatTime(range.startTime);
	const end = range.endTime === Infinity ? "live edge" : formatTime(range.endTime);
	const status = range.isLive ? "live" : "finished";
	console.log(`[range] ${start} → ${end} | ${status}`);
};
const showDryRun = (range, frags, outputPath) => {
	const segments = frags.filter((frag) => !frag.isMap);
	const last = segments.at(-1);
	const duration = segments.reduce((acc, frag) => acc + frag.duration, 0);
	console.log("[dry-run] Nothing will be downloaded");
	console.log(`[dry-run] Destination: ${outputPath}`);
	console.log(`[dry-run] Requested: ${formatTime(range.startTime)} → ${range.endTime === Infinity ? "live edge" : formatTime(range.endTime)}`);
	console.log(`[dry-run] Fragments: ${segments.length} (${formatTime(duration)} of video, ${formatTime(segments[0]?.offset || 0)} → ${formatTime((last?.offset || 0) + (last?.duration || 0))})`);
	if (range.isLive && !range.isAvailable) console.log(`[dry-run] The requested range is not fully aired yet (live edge: ${formatTime(range.availableDuration)})`);
};
const downloadVideo = async (formats, videoInfo, args) => {
	if (formats.length === 0) throw new Error("Cannot get video formats");
	if (args["list-formats"]) {
		showFormats(formats);
		return "skipped";
	}
	if (!await isInstalled("ffmpeg")) throw new Error("ffmpeg is not installed. Install it from https://ffmpeg.org/");
	const pollIntervalSec = args["poll-interval"] || DEFAULT_POLL_INTERVAL_SEC;
	const retryMessage = getRetryMessage(pollIntervalSec);
	const title = `${videoInfo.title} [${videoInfo.id}]`;
	const isAudioOnly = !!(args["audio-only"] || args["extract-audio"]);
	const dlFormat = args["audio-only"] ? getAudioOnlyFormat(formats) : getDlFormat(formats, args.format);
	const outputTemplate = args.output || DEFAULT_OUTPUT_TEMPLATE;
	const isExtractingAudio = !!args["extract-audio"];
	const outputPath = getPath.output(outputTemplate, isExtractingAudio || !isAudioOnly ? videoInfo : {
		...videoInfo,
		ext: "m4a"
	}, args["output-dir"]);
	const destPath = isExtractingAudio ? getPath.replaceExt(outputPath, AUDIO_EXT[args["extract-audio"]]) : outputPath;
	const archivePath = args["download-archive"];
	if (archivePath) {
		const archive = await readArchive(archivePath);
		if (archive.has(videoInfo.id)) {
			console.log(`[archive] Already downloaded, skipping: ${title}`);
			return "skipped";
		}
	}
	if (!args["dry-run"]) await ensureOutputDir(destPath);
	console.log(`[download] Destination: ${destPath}`);
	const isAlreadyDownloaded = !args["dry-run"] && !!await statsOrNull(destPath);
	if (args["no-overwrites"] && isAlreadyDownloaded) {
		console.log(`[download] File already exists, skipping: ${destPath}`);
		if (archivePath) await appendToArchive(archivePath, videoInfo.id);
		return "skipped";
	}
	let frags;
	let fragsCount = 0;
	let playlistUrl = dlFormat.url;
	const downloadedFrags = new Map();
	const logPath = getPath.log(outputPath);
	const writeLog = args["dry-run"] ? async () => {} : createLogger(logPath);
	const tryUnmute = getTryUnmute(videoInfo);
	if (tryUnmute === false) console.warn(NO_TRY_UNMUTE_MESSAGE);
	writeLog([DL_EVENT.INIT, {
		args,
		formats,
		outputPath,
		playlistUrl,
		videoInfo
	}]);
	const rangeState = { fixedEnd: null };
	let range = null;
	let loggedRangeKey = null;
	let isRangeCompleted = false;
	let isFirstCycle = true;
	while (true) {
		let playlistContent = await fetchText(playlistUrl, "playlist");
		if (!playlistContent) {
			writeLog([DL_EVENT.FETCH_PLAYLIST_FAILURE]);
			const newPlaylistUrl = dlFormat.url.replace(/-muted-\w+(?=\.m3u8$)/, "");
			if (newPlaylistUrl !== playlistUrl) {
				playlistContent = await fetchText(playlistUrl, "playlist (attempt #2)");
				if (playlistContent) {
					playlistUrl = newPlaylistUrl;
					writeLog([DL_EVENT.FETCH_PLAYLIST_OLD_MUTED_SUCCESS, playlistUrl]);
				} else writeLog([DL_EVENT.FETCH_PLAYLIST_OLD_MUTED_FAILURE]);
			}
		}
		if (!playlistContent && !args["live-from-start"]) throw new Error("Cannot download the playlist");
		if (!playlistContent) {
			console.warn(`[live-from-start] Waiting for the playlist. ${retryMessage}`);
			await setTimeout$1(pollIntervalSec * 1e3);
			continue;
		}
		const playlist = parse(playlistContent);
		writeLog([DL_EVENT.FETCH_PLAYLIST_SUCCESS]);
		range = resolveDownloadRange(playlist, args, rangeState);
		const rangeKey = getRangeKey(range);
		if (rangeKey !== loggedRangeKey) {
			showRange(range);
			loggedRangeKey = rangeKey;
		}
		if (range.isPendingStart) {
			const message = `[download-sections] ${formatTime(range.startTime)} hasn't aired yet (live edge: ${formatTime(range.availableDuration)})`;
			if (args["dry-run"]) {
				console.log(message);
				return "skipped";
			}
			console.log(`${message}. ${retryMessage}`);
			await setTimeout$1(pollIntervalSec * 1e3);
			continue;
		}
		frags = getFragsForDownloading(playlistUrl, playlist, range);
		writeLog(logFragsForDownloading(frags));
		if (args["dry-run"] && isFirstCycle) {
			showDryRun(range, frags, destPath);
			return "skipped";
		}
		await fsp$1.writeFile(getPath.playlist(outputPath), playlistContent);
		const hasNewFrags = frags.length > fragsCount;
		fragsCount = frags.length;
		if (hasNewFrags || isFirstCycle) {
			await downloadFragsPass({
				frags,
				fragsCount,
				outputPath,
				args,
				formats,
				tryUnmute: !!tryUnmute,
				downloadedFrags,
				writeLog
			});
			process.stdout.write("\n");
		}
		isFirstCycle = false;
		if (playlist.endlist || range.endTime !== Infinity && range.isAvailable) {
			isRangeCompleted = true;
			break;
		}
		if (!hasNewFrags) {
			console.log(`[download] ${chalk.green("VOD ONLINE")}: waiting for new fragments. ${retryMessage}`);
			await setTimeout$1(pollIntervalSec * 1e3);
		}
	}
	if (!frags) throw new Error("Cannot download the playlist");
	if (!isRangeCompleted) console.warn(`[download] The stream ended before ${formatTime(range.startTime)} → ${formatTime(range.endTime)} was fully available`);
	const dir = await readOutputDir(outputPath);
	const existingFrags = getExistingFrags(frags, outputPath, dir);
	writeLog([DL_EVENT.FRAGS_EXISTING, existingFrags.length]);
	await processUnmutedFrags(existingFrags, outputPath, dir, writeLog);
	const retCode = await mergeFrags(args["merge-method"], existingFrags, outputPath, args["keep-fragments"]);
	writeLog([retCode ? DL_EVENT.MERGE_FRAGS_FAILURE : DL_EVENT.MERGE_FRAGS_SUCCESS]);
	if (!retCode) {
		if (args["precise-cut"]) {
			const cut = getPreciseCutRange(frags, range);
			if (cut) await preciseCut(outputPath, cut, isAudioOnly);
else console.log("[precise-cut] The range is already cut accurately");
		}
		if (args["extract-audio"]) await extractAudio(outputPath, destPath, args["extract-audio"], !!args["keep-video"]);
		if (archivePath) await appendToArchive(archivePath, videoInfo.id);
	}
	if (args["write-info-json"]) await writeInfoJson(destPath, {
		videoInfo,
		dlFormat,
		range,
		playlistUrl,
		fragmentCount: existingFrags.length,
		downloadedBytes: [...downloadedFrags.values()].reduce((acc, frag) => acc + frag.size, 0)
	});
	await notifyWebhook(args.webhook, retCode ? `twitch-dlp: download failed - ${title}` : `twitch-dlp: download finished - ${title}`);
	await showStats(logPath);
	if (!args["keep-fragments"]) await fsp$1.unlink(logPath);
	return retCode ? "failed" : "downloaded";
};

//#endregion
//#region src/utils/getVideoInfo.ts
const DEFAULT_TITLE = "Untitled Broadcast";
const getVideoInfoByVideoMeta = (videoMeta) => ({
	id: `v${videoMeta.id}`,
	title: videoMeta.title || DEFAULT_TITLE,
	description: videoMeta.description,
	duration: videoMeta.lengthSeconds,
	uploader: videoMeta.owner.displayName,
	uploader_id: videoMeta.owner.login,
	upload_date: videoMeta.createdAt,
	release_date: videoMeta.publishedAt,
	view_count: videoMeta.viewCount,
	ext: "mp4"
});
const getVideoInfoByStreamMeta = (streamMeta, channelLogin) => {
	const broadcast = streamMeta.lastBroadcast;
	const startedAt = streamMeta.stream?.createdAt ?? null;
	return {
		id: `v${broadcast?.id ?? streamMeta.stream?.id ?? ""}`,
		title: broadcast?.title || DEFAULT_TITLE,
		description: null,
		duration: null,
		uploader: channelLogin,
		uploader_id: streamMeta.id,
		upload_date: startedAt,
		release_date: startedAt,
		view_count: null,
		ext: "mp4"
	};
};
const getVideoInfoByVodPath = ({ channelLogin, videoId, startTimestamp }) => ({
	id: `v${videoId}`,
	title: `${channelLogin}_${startTimestamp}`,
	description: null,
	duration: null,
	uploader: channelLogin,
	uploader_id: null,
	upload_date: new Date(startTimestamp * 1e3).toISOString(),
	release_date: new Date(startTimestamp * 1e3).toISOString(),
	view_count: null,
	ext: "mp4"
});
const getVideoInfoByClipMeta = (clipMeta) => ({
	id: clipMeta.slug,
	title: clipMeta.title,
	description: null,
	duration: clipMeta.durationSeconds,
	uploader: clipMeta.broadcaster?.displayName || clipMeta.broadcaster?.login || null,
	uploader_id: clipMeta.broadcaster?.id || null,
	upload_date: clipMeta.createdAt,
	release_date: clipMeta.createdAt,
	view_count: clipMeta.viewCount,
	ext: "mp4"
});

//#endregion
//#region src/utils/downloadWithStreamlink.ts
const DEFAULT_STREAMLINK_ARGS = ["--twitch-force-client-integrity", "--twitch-access-token-param=playerType=frontpage"];
const getDefaultOutputTemplate = () => {
	const now = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "_");
	return `%(uploader)s (live) ${now} [%(id)s].%(ext)s`;
};
const downloadWithStreamlink = async (link, streamMeta, channelLogin, args) => {
	const outputPath = getPath.output(args.output || getDefaultOutputTemplate(), getVideoInfoByStreamMeta(streamMeta, channelLogin), args["output-dir"]);
	if (args["dry-run"]) {
		console.log("[dry-run] Nothing will be downloaded");
		console.log(`[dry-run] Destination: ${outputPath}`);
		return;
	}
	if (!await isInstalled("streamlink")) throw new Error("streamlink is not installed. Install it from https://streamlink.github.io/");
	if (args["list-formats"]) {
		await spawn("streamlink", ["-v", link]);
		process.exit();
	}
	await ensureOutputDir(outputPath);
	const streamlinkArgs = [];
	for (const argName of Object.keys(args)) {
		if (!argName.startsWith("twitch-")) continue;
		const argValue = args[argName];
		if (argValue === undefined) continue;
		if (Array.isArray(argValue)) for (const v of argValue) streamlinkArgs.push(`--${argName}=${v}`);
else streamlinkArgs.push(typeof argValue === "boolean" ? `--${argName}` : `--${argName}=${argValue}`);
	}
	return spawn("streamlink", [
		"-o",
		outputPath,
		link,
		args.format,
		...streamlinkArgs.length ? streamlinkArgs : DEFAULT_STREAMLINK_ARGS
	]);
};

//#endregion
//#region src/utils/parseDownloadFormats.ts
const parseDownloadFormats = (playlistContent) => {
	let formats = [];
	const playlist = parse(playlistContent);
	for (let i = 0; i < playlist.variants.length; i += 1) {
		const { uri, resolution, video, frameRate, bandwidth } = playlist.variants[i];
		const { name } = video[0];
		formats.push({
			format_id: name.replaceAll(" ", "_"),
			width: resolution?.width || null,
			height: resolution?.height || null,
			frameRate: frameRate ? Math.round(frameRate) : null,
			totalBitrate: bandwidth || null,
			source: i === 0 ? true : null,
			url: uri
		});
	}
	for (const sessionData of playlist.sessionDataList) {
		if (sessionData.id !== "com.amazon.ivs.unavailable-media") continue;
		if (!sessionData.value) continue;
		let unavailableMedia = [];
		try {
			unavailableMedia = JSON.parse(atob(sessionData.value));
		} catch (e) {
			console.warn(`${chalk.yellow("WARN:")} Failed to parse unavailable media: ${e.message}`);
		}
		if (unavailableMedia.length > 0) formats.forEach((f) => f.source = null);
		for (const media of unavailableMedia) {
			const [width, height] = media.RESOLUTION ? media.RESOLUTION.split("x").map((v) => Number.parseInt(v)) : [null, null];
			let urlArr = formats[0].url.split("/");
			urlArr = urlArr.with(-2, media["GROUP-ID"]);
			const url = urlArr.join("/");
			formats.push({
				format_id: media.NAME.replaceAll(" ", "_"),
				width,
				height,
				frameRate: media["FRAME-RATE"] ? Math.round(media["FRAME-RATE"]) : null,
				totalBitrate: media.BANDWIDTH || null,
				source: media["GROUP-ID"] === "chunked" || null,
				url
			});
		}
		if (formats.every((f) => !f.source)) {
			const last = formats.findLast((f) => f.format_id !== "Audio_Only");
			if (last) last.source = true;
		}
	}
	formats.sort((a, b) => (b.height || 0) - (a.height || 0));
	const counts = {};
	for (const { format_id } of formats) counts[format_id] = (counts[format_id] || 0) + 1;
	const remaining = { ...counts };
	formats = formats.map((format) => {
		const { format_id } = format;
		if (counts[format_id] > 1) {
			const suffix = remaining[format_id] - 1;
			remaining[format_id] -= 1;
			format.format_id = `${format_id}-${suffix}`;
		}
		return format;
	});
	return formats;
};

//#endregion
//#region src/utils/getVideoFormats.ts
const FORMATS = [
	"chunked",
	"1440p60",
	"1440p30",
	"1080p60",
	"1080p30",
	"720p60",
	"720p30",
	"480p30",
	"360p30",
	"160p30",
	"audio_only"
];
const FORMATS_MAP = {
	chunked: "Source",
	audio_only: "Audio_Only"
};
const getVideoFormats = async (videoId) => {
	const accessToken = await getVideoAccessToken(videoId);
	if (!accessToken) return [];
	const manifest = await getManifest(videoId, accessToken);
	if (!manifest) return [];
	const formats = parseDownloadFormats(manifest);
	return formats;
};
const getFullVodPath = (vodPath) => {
	const hashedVodPath = crypto.createHash("sha1").update(vodPath).digest("hex").slice(0, 20);
	return `${hashedVodPath}_${vodPath}`;
};
const getVodUrl = (vodDomain, fullVodPath, broadcastType = "ARCHIVE", videoId = "", format = "chunked") => {
	const playlistName = broadcastType === "HIGHLIGHT" ? `highlight-${videoId}` : "index-dvr";
	return `${vodDomain}/${fullVodPath}/${format}/${playlistName}.m3u8`;
};
const getAvailableFormats = async (vodDomain, fullVodPath, broadcastType, videoId) => {
	const formats = [];
	const formatUrls = FORMATS.map((format) => getVodUrl(vodDomain, fullVodPath, broadcastType, videoId, format));
	const responses = await Promise.all(formatUrls.map((url) => fetch(url, { method: "HEAD" }).catch(() => null)));
	for (const [i, res] of responses.entries()) {
		if (!res?.ok) continue;
		const format = FORMATS[i];
		let height = null;
		let frameRate = null;
		const m = format.match(/^(?<height>\d+)p(?<frameRate>\d+)$/);
		if (m) {
			const groups = m.groups;
			height = Number.parseInt(groups.height);
			frameRate = Number.parseInt(groups.frameRate);
		}
		formats.push({
			format_id: FORMATS_MAP[format] || format,
			height,
			frameRate,
			source: format === "chunked" ? true : null,
			url: formatUrls[i]
		});
	}
	return formats;
};
const getVideoFormatsByFullVodPath = async (fullVodPath, broadcastType, videoId) => {
	const responses = await Promise.all(VOD_DOMAINS.map((domain) => {
		const url = getVodUrl(domain, fullVodPath, broadcastType, videoId);
		return fetch(url, { method: "HEAD" }).catch(() => null);
	}));
	const vodDomainIdx = responses.findIndex((res) => res?.ok);
	if (vodDomainIdx === -1) return [];
	return getAvailableFormats(VOD_DOMAINS[vodDomainIdx], fullVodPath, broadcastType, videoId);
};
const THUMB_REGEX = /cf_vods\/(?<subdomain>[^\/]+)\/(?<fullVodPath>(?:[^\/]+|[^\/]+\/[^\/]+\/[^\/]+))\/?\/thumb\//;
const getVideoFormatsByThumbUrl = (broadcastType, videoId, thumbUrl) => {
	const m = thumbUrl.match(THUMB_REGEX);
	if (!m) return [];
	const { fullVodPath } = m.groups;
	return getVideoFormatsByFullVodPath(fullVodPath, broadcastType, videoId);
};

//#endregion
//#region src/utils/getLiveVideoInfo.ts
const getLiveVideoInfo = async (streamMeta, channelLogin) => {
	let formats = [];
	let videoInfo = null;
	if (!streamMeta.stream) throw new Error();
	const broadcasts = await getRecentArchiveBroadcasts(streamMeta.id);
	const edges = broadcasts?.videos?.edges;
	const broadcast = edges?.[0]?.node;
	const startTimestampMs = new Date(streamMeta.stream.createdAt).getTime();
	if (broadcast && startTimestampMs <= new Date(broadcast.createdAt).getTime()) {
		let videoMeta;
		[formats, videoMeta] = await Promise.all([getVideoFormats(broadcast.id), getVideoMetadata(broadcast.id)]);
		if (videoMeta) videoInfo = getVideoInfoByVideoMeta(videoMeta);
	}
	const checkPrivateVod = startTimestampMs + 3e4 < Date.now();
	if (checkPrivateVod && formats.length === 0) {
		console.warn("[live-from-start] Recovering the playlist");
		const startTimestamp = startTimestampMs / 1e3;
		const vodPath = `${channelLogin}_${streamMeta.stream.id}_${startTimestamp}`;
		formats = await getVideoFormatsByFullVodPath(getFullVodPath(vodPath));
		videoInfo = getVideoInfoByStreamMeta(streamMeta, channelLogin);
	}
	if (formats.length > 0 && videoInfo) return {
		ok: true,
		formats,
		videoInfo
	};
	const issue = edges?.length === 0 ? "no-stored-vods" : "vod-not-ready";
	return {
		ok: false,
		issue
	};
};

//#endregion
//#region src/utils/liveFromStartIssue.ts
const isRetryableIssue = (issue) => issue === "vod-not-ready";
const getIssueLines = (issue, options) => {
	const lines = [];
	if (issue === "no-stored-vods") {
		lines.push("[live-from-start] Cannot download from the start: this channel stores no", "past broadcasts, so Twitch has no video of the stream to download.", "Twitch records a stream only when the streamer enables \"Store past", "broadcasts\" and it is off for this channel, so its past is not available", "to any tool. Use a VOD link if one exists, or record from now on instead.");
		if (options.hasRangeArgs) lines.push("The requested range (--download-last, --download-sections, --duration or", "--until-now) needs that video, because the past was never recorded.");
		lines.push("Drop --live-from-start to record the stream from the live edge (needs", "streamlink), or pass --fallback-live-edge to fall back to that on its own.");
		return lines;
	}
	lines.push("[live-from-start] The stream's video isn't available yet. Twitch publishes", "it a few seconds after the stream starts and keeps it hidden for a moment");
	lines.push(options.isRetry ? `Retry every ${options.delaySec} second(s)` : "Try again in a moment, or pass --retry-streams 60 to wait for it");
	return lines;
};

//#endregion
//#region src/commands/downloadByChannelLogin.ts
const downloadByChannelLogin = async (channelLogin, args) => {
	const link = `https://www.twitch.tv/${channelLogin}`;
	const delay = args["retry-streams"] || 0;
	const isLiveFromStart = args["live-from-start"];
	const isRetry = delay > 0;
	const isRangeArg = !!(args["download-sections"] || args["download-last"] || args.duration || args["until-now"]);
	if (!isLiveFromStart && isRangeArg) throw new Error("--download-sections, --download-last, --duration and --until-now require --live-from-start");
	while (true) {
		const streamMeta = await getStreamMetadata(channelLogin);
		const isLive = !!streamMeta?.stream;
		if (!isLive) if (isRetry) console.log(`[retry-streams] Waiting for streams. Retry every ${delay} second(s)`);
else {
			console.warn("[download] The channel is not currently live");
			return "failed";
		}
		if (isLive && !isLiveFromStart) await downloadWithStreamlink(link, streamMeta, channelLogin, args);
		if (isLive && isLiveFromStart) {
			const liveVideoInfo = await getLiveVideoInfo(streamMeta, channelLogin);
			if (liveVideoInfo.ok) {
				const { formats, videoInfo } = liveVideoInfo;
				const outcome = await downloadVideo(formats, videoInfo, args);
				if (!isRetry || args["download-sections"]) return outcome;
			} else {
				const { issue } = liveVideoInfo;
				for (const line of getIssueLines(issue, {
					isRetry,
					delaySec: delay,
					hasRangeArgs: isRangeArg
				})) console.warn(line);
				if (!isRetry || !isRetryableIssue(issue)) {
					if (args["fallback-live-edge"]) {
						console.warn("[fallback-live-edge] Recording from the live edge instead");
						await downloadWithStreamlink(link, streamMeta, channelLogin, args);
						return;
					}
					return "failed";
				}
			}
		}
		await setTimeout$1(delay * 1e3);
	}
};

//#endregion
//#region src/api/sullygnome.ts
const BASE_URL = "https://sullygnome.com/api";
const STANDARD_SEARCH_ITEM_TYPE = {
	CHANNEL: 1,
	GAME: 2,
	TEAM: 4
};
const getStandardSearch = async (query) => {
	const url = `${BASE_URL}/standardsearch/${query}`;
	const res = await fetch(url);
	return res.json();
};
const CHANNEL_STREAMS_PAGE_SIZE = 100;
const getChannelStreams = async (channelId, page = 0, pageSize = CHANNEL_STREAMS_PAGE_SIZE) => {
	const pageN = page + 1;
	const start = page * pageSize;
	const url = `${BASE_URL}/tables/channeltables/streams/365/${channelId}/%20/${pageN}/1/desc/${start}/${pageSize}`;
	const res = await fetch(url);
	return res.json();
};

//#endregion
//#region src/utils/getWhyCannotDownload.ts
const getWhyCannotDownload = async () => {
	try {
		const mdPath = await getAssetPath("DOWNLOAD_PRIVATE_VIDEOS.md");
		const md = await fsp.readFile(mdPath, "utf8");
		const txt = [];
		for (const m of md.matchAll(/> (.*:|- .*)/gm)) txt.push(m[1]);
		return txt.join("\n");
	} catch {
		return "";
	}
};

//#endregion
//#region src/commands/downloadByVodPath.ts
const downloadByVodPath = async (parsedLink, args) => {
	const formats = await getVideoFormatsByFullVodPath(getFullVodPath(parsedLink.vodPath));
	if (formats.length === 0) {
		const reasons = await getWhyCannotDownload();
		throw new Error(`Cannot get video formats\n\n${reasons}`);
	}
	const videoInfo = getVideoInfoByVodPath(parsedLink);
	return downloadVideo(formats, videoInfo, args);
};

//#endregion
//#region src/commands/downloadByStatsService.ts
const getChannelStream = async (channelLogin, streamId) => {
	const search = await getStandardSearch(channelLogin);
	const channel = search.find((item) => item.itemtype === STANDARD_SEARCH_ITEM_TYPE.CHANNEL && item.siteurl === channelLogin);
	if (!channel) throw new Error(`Channel "${channelLogin}" not found`);
	const channelId = channel.value;
	let page = 0;
	let channelStreams;
	do {
		channelStreams = await getChannelStreams(channelId, page);
		const stream$2 = channelStreams.data.find((s) => s.streamId === streamId);
		if (stream$2) return stream$2;
		page += 1;
	} while (page * CHANNEL_STREAMS_PAGE_SIZE < channelStreams.recordsFiltered);
	const reasons = await getWhyCannotDownload();
	throw new Error(`Stream "${streamId}" not found\n\n${reasons}`);
};
const downloadByStatsService = async ({ channelLogin, streamId }, args) => {
	const stream$2 = await getChannelStream(channelLogin, streamId);
	const startTimestamp = new Date(stream$2.startDateTime).getTime() / 1e3;
	return downloadByVodPath({
		type: "vodPath",
		vodPath: `${channelLogin}_${streamId}_${startTimestamp}`,
		channelLogin,
		videoId: `${streamId}`,
		startTimestamp
	}, args);
};

//#endregion
//#region src/commands/downloadByVideoId.ts
const downloadByVideoId = async (videoId, args) => {
	let [formats, videoMeta] = await Promise.all([getVideoFormats(videoId), getVideoMetadata(videoId)]);
	if (formats.length === 0 && videoMeta !== null) {
		console.log("Trying to get playlist from video metadata");
		formats = await getVideoFormatsByThumbUrl(videoMeta.broadcastType, videoMeta.id, videoMeta.previewThumbnailURL);
	}
	if (formats.length === 0 || !videoMeta) {
		console.log(PRIVATE_VIDEO_INSTRUCTIONS);
		return "failed";
	}
	const videoInfo = getVideoInfoByVideoMeta(videoMeta);
	return downloadVideo(formats, videoInfo, args);
};

//#endregion
//#region src/commands/downloadClip.ts
const getClipFormats = (clipMeta) => {
	const formats = [];
	const { signature: sig, value: token } = clipMeta.playbackAccessToken;
	const addFormats = (videoQualities, formatIdPrefix = "") => {
		for (let i = 0; i < videoQualities.length; i += 1) {
			const { quality, frameRate, sourceURL } = videoQualities[i];
			if (!sourceURL) continue;
			formats.push({
				format_id: `${formatIdPrefix}${quality}`,
				height: Number.parseInt(quality) || null,
				frameRate: frameRate ? Math.round(frameRate) : null,
				source: null,
				url: `${sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`
			});
		}
	};
	const [assetDefault, assetPortrait] = clipMeta.assets;
	addFormats(assetDefault?.videoQualities || []);
	addFormats(assetPortrait?.videoQualities || [], "portrait-");
	formats[0].source = true;
	return formats;
};
const downloadClip = async (slug, args) => {
	const clipMeta = await getClipMetadata(slug);
	if (!clipMeta) throw new Error("Clip not found");
	const formats = getClipFormats(clipMeta);
	if (args["list-formats"]) return showFormats(formats);
	const dlFormat = getDlFormat(formats, args.format);
	const destPath = getPath.output(args.output || DEFAULT_OUTPUT_TEMPLATE, getVideoInfoByClipMeta(clipMeta), args["output-dir"]);
	console.log(`[download] Destination: ${destPath}`);
	if (args["dry-run"]) {
		console.log("[dry-run] Nothing will be downloaded");
		return "skipped";
	}
	const archivePath = args["download-archive"];
	if (archivePath && (await readArchive(archivePath)).has(slug)) {
		console.log(`[archive] Already downloaded, skipping: ${slug}`);
		return "skipped";
	}
	await ensureOutputDir(destPath);
	if (await statsOrNull(destPath)) {
		console.warn(`[download] File already exists, skipping`);
		if (archivePath) await appendToArchive(archivePath, slug);
		return "skipped";
	}
	const res = await fetch(dlFormat.url, { method: "HEAD" });
	const size = Number.parseInt(res.headers.get("content-length") || "0");
	console.log(`[download] Downloading clip (${(size / 1024 / 1024).toFixed(2)} MB)`);
	const result = await downloadFrag(args.downloader, dlFormat.url, destPath, args["limit-rate"], undefined, "mp4");
	if (!result) throw new Error("[download] Download failed");
	if (archivePath) await appendToArchive(archivePath, slug);
	console.log("[download] Done");
	return "downloaded";
};

//#endregion
//#region node_modules/.pnpm/twitch-regex@0.1.3/node_modules/twitch-regex/dist/index.js
var CLIP_REGEX_STRING = "https?:\\/\\/(?:clips\\.twitch\\.tv\\/(?:embed\\?.*?\\bclip=|\\/*)|(?:(?:www|go|m)\\.)?twitch\\.tv\\/(?:(?<channel>[^/]+)\\/)?clip\\/)(?<slug>[\\w-]+)\\S*";
var CLIP_REGEX_EXACT = new RegExp(`^${CLIP_REGEX_STRING}$`);
var VIDEO_REGEX_STRING = "https?:\\/\\/(?:(?:(?:www|go|m)\\.)?twitch\\.tv\\/(?:videos|(?<channel>[^/]+)\\/v(?:ideo)?)\\/|player\\.twitch\\.tv\\/\\?.*?\\bvideo=v?|www\\.twitch\\.tv\\/(?:[^/]+)\\/schedule\\?vodID=)(?<id>\\d+)\\S*";
var VIDEO_REGEX_EXACT = new RegExp(`^${VIDEO_REGEX_STRING}$`);
var CHANNEL_REGEX_STRING = "https?:\\/\\/(?:(?:(?:www|go|m)\\.)?twitch\\.tv\\/|player\\.twitch\\.tv\\/\\?.*?\\bchannel=)(?<channel>\\w+)[^\\s/]*";
var CHANNEL_REGEX_EXACT = new RegExp(`^${CHANNEL_REGEX_STRING}$`);
var COLLECTION_REGEX_STRING = "https?:\\/\\/(?:(?:(?:www|go|m)\\.)?twitch\\.tv\\/collections\\/|player\\.twitch\\.tv\\/\\?.*?\\bcollection=)(?<id>[\\w-]+)\\S*";
var COLLECTION_REGEX_EXACT = new RegExp(`^${COLLECTION_REGEX_STRING}$`);

//#endregion
//#region src/utils/args/parseLink.ts
const VOD_PATH_REGEX = /^video:(?<vodPath>(?<channelLogin>\w+)_(?<videoId>\d+)_(?<startTimestamp>\d+))$/;
const TWITCHTRACKER_REGEX = /^(?:https:\/\/)?(?<service>twitchtracker)\.com\/(?<channelName>[^/]+)\/streams\/(?<streamId>\d+)$/;
const STREAMSCHARTS_REGEX = /^(?:https:\/\/)?(?<service>streamscharts)\.com\/channels\/(?<channelName>[^/]+)\/streams\/(?<streamId>\d+)$/;
const SULLYGNOME_REGEX = /^(?:https:\/\/)?(?<service>sullygnome)\.com\/channel\/(?<channelName>[^/]+)\/(?:[^/]+\/)?stream\/(?<streamId>\d+)$/;
const parseLink = (link) => {
	let m = link.match(VOD_PATH_REGEX);
	if (m) return {
		type: "vodPath",
		...m.groups
	};
	m = link.match(VIDEO_REGEX_EXACT);
	if (m) {
		const { id } = m.groups;
		return {
			type: "video",
			videoId: id
		};
	}
	m = link.match(CLIP_REGEX_EXACT);
	if (m) {
		const { slug } = m.groups;
		return {
			type: "clip",
			slug
		};
	}
	m = link.match(CHANNEL_REGEX_EXACT);
	if (m) {
		const { channel } = m.groups;
		return {
			type: "channel",
			channelLogin: channel.toLowerCase()
		};
	}
	m = link.match(TWITCHTRACKER_REGEX) || link.match(STREAMSCHARTS_REGEX) || link.match(SULLYGNOME_REGEX);
	if (m) {
		const { service, channelName, streamId } = m.groups;
		return {
			type: "statsService",
			service,
			channelLogin: channelName,
			streamId: Number.parseInt(streamId)
		};
	}
	throw new Error("Wrong link");
};

//#endregion
//#region src/utils/downloadByLink.ts
const downloadByLink = async (link, args) => {
	const parsedLink = parseLink(link);
	if (parsedLink.type === "vodPath") return downloadByVodPath(parsedLink, args);
	if (parsedLink.type === "video") return downloadByVideoId(parsedLink.videoId, args);
	if (parsedLink.type === "clip") return downloadClip(parsedLink.slug, args);
	if (parsedLink.type === "channel") return downloadByChannelLogin(parsedLink.channelLogin, args);
	if (parsedLink.type === "statsService") return downloadByStatsService(parsedLink, args);
};

//#endregion
//#region src/utils/runBatch.ts
const runBatch = async (links, args) => {
	const isBatch = links.length > 1;
	const maxDownloads = args["max-downloads"];
	const sleepIntervalSec = args["sleep-interval"];
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;
	for (let i = 0; i < links.length; i += 1) {
		const link = links[i];
		if (maxDownloads && downloaded >= maxDownloads) {
			console.log(`[batch] Reached --max-downloads ${maxDownloads}`);
			break;
		}
		if (isBatch) console.log(`\n[batch] ${i + 1}/${links.length}: ${link}`);
		try {
			const outcome = await downloadByLink(link, args);
			if (outcome === "skipped") skipped += 1;
else if (outcome === "failed") failed += 1;
else downloaded += 1;
			if (sleepIntervalSec && i + 1 < links.length) {
				console.log(`[batch] Waiting ${sleepIntervalSec} second(s)`);
				await setTimeout$1(sleepIntervalSec * 1e3);
			}
		} catch (e) {
			if (!isBatch) throw e;
			failed += 1;
			console.error(`${chalk.red("ERROR:")} ${link}: ${e.message}`);
		}
	}
	if (!isBatch) {
		if (failed > 0) process.exitCode = 1;
		return;
	}
	const summary = [
		`${downloaded} downloaded`,
		skipped ? `${skipped} skipped` : null,
		failed ? `${failed} failed` : null
	].filter(Boolean).join(", ");
	console.log(`\n[batch] Done: ${summary}`);
	if (failed > 0) process.exitCode = 1;
};

//#endregion
//#region src/main.ts
const getArgs = () => parseArgs({
	args: process.argv.slice(2),
	options: {
		help: {
			type: "boolean",
			short: "h"
		},
		version: { type: "boolean" },
		format: {
			type: "string",
			short: "f",
			default: "best"
		},
		"list-formats": {
			type: "boolean",
			short: "F"
		},
		output: {
			type: "string",
			short: "o"
		},
		downloader: {
			type: "string",
			default: "fetch"
		},
		proxy: { type: "string" },
		"keep-fragments": {
			type: "boolean",
			default: false
		},
		"limit-rate": {
			type: "string",
			short: "r"
		},
		"live-from-start": { type: "boolean" },
		"retry-streams": { type: "string" },
		"download-sections": { type: "string" },
		"download-last": { type: "string" },
		duration: { type: "string" },
		"until-now": { type: "boolean" },
		"fallback-live-edge": { type: "boolean" },
		"frag-concurrency": { type: "string" },
		"frag-retries": { type: "string" },
		"poll-interval": { type: "string" },
		"output-dir": {
			type: "string",
			short: "P"
		},
		"write-info-json": { type: "boolean" },
		webhook: { type: "string" },
		"dry-run": { type: "boolean" },
		"audio-only": { type: "boolean" },
		"extract-audio": { type: "string" },
		"keep-video": { type: "boolean" },
		"precise-cut": { type: "boolean" },
		"download-archive": { type: "string" },
		"no-overwrites": { type: "boolean" },
		"batch-file": { type: "string" },
		"max-downloads": { type: "string" },
		"sleep-interval": { type: "string" },
		unmute: { type: "string" },
		"merge-fragments": { type: "boolean" },
		"merge-method": {
			type: "string",
			default: "ffconcat"
		},
		"twitch-disable-ads": { type: "boolean" },
		"twitch-low-latency": { type: "boolean" },
		"twitch-api-header": {
			type: "string",
			multiple: true
		},
		"twitch-access-token-param": {
			type: "string",
			multiple: true
		},
		"twitch-force-client-integrity": { type: "boolean" },
		"twitch-purge-client-integrity": { type: "boolean" }
	},
	allowPositionals: true
});
const main = async () => {
	const parsedArgs = getArgs();
	const args = await normalizeArgs(parsedArgs.values);
	const positionals = parsedArgs.positionals;
	if (args.version) return showVersion();
	if (args.help || !positionals.length && !args["batch-file"]) return showHelp();
	if (args.proxy) {
		process.env.NODE_USE_ENV_PROXY = "1";
		process.env.HTTP_PROXY = args.proxy;
		process.env.HTTPS_PROXY = args.proxy;
	}
	if (args["merge-fragments"]) {
		if (positionals.length !== 1) throw new Error("--merge-fragments expects exactly one filename");
		return mergeFragments(positionals[0], args);
	}
	const links = await getLinks(positionals, args["batch-file"]);
	if (links.length === 0) return showHelp();
	return runBatch(links, args);
};
main().catch((e) => {
	console.error(chalk.red("ERROR:"), e.message);
	process.exitCode = 1;
});

//#endregion
export { getArgs };
