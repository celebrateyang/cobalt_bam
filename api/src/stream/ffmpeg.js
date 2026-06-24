import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import { create as contentDisposition } from "content-disposition-header";

import { env } from "../config.js";
import { destroyInternalStream } from "./manage.js";
import { hlsExceptions } from "../processing/service-config.js";
import { closeResponse, pipe, estimateTunnelLength, estimateAudioMultiplier } from "./shared.js";

const metadataTags = new Set([
    "album",
    "composer",
    "genre",
    "copyright",
    "title",
    "artist",
    "album_artist",
    "track",
    "date",
    "sublanguage"
]);

const convertMetadataToFFmpeg = (metadata) => {
    const args = [];

    for (const [name, value] of Object.entries(metadata)) {
        if (metadataTags.has(name)) {
            if (name === "sublanguage") {
                args.push('-metadata:s:s:0', `language=${value}`);
                continue;
            }
            args.push('-metadata', `${name}=${value.replace(/[\u0000-\u0009]/g, '')}`); // skipcq: JS-0004
        } else {
            throw `${name} metadata tag is not supported.`;
        }
    }

    return args;
}

const killProcess = (p) => {
    p?.kill('SIGTERM'); // ask the process to terminate itself gracefully

    setTimeout(() => {
        if (p?.exitCode === null)
            p?.kill('SIGKILL'); // brutally murder the process if it didn't quit
    }, 5000);
}

const getCommand = (args) => {
    if (typeof env.processingPriority === 'number' && !isNaN(env.processingPriority)) {
        return ['nice', ['-n', env.processingPriority.toString(), ffmpeg, ...args]]
    }
    return [ffmpeg, args]
}

const toRawHeaders = (headers) =>
    Object.entries(headers || {})
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}: ${value}\r\n`)
        .join('');

const isDiagnosticService = (streamInfo) =>
    streamInfo?.service === 'niconico';

const redactUrl = (value) => {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
        return value;
    }

    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}${url.search ? '?<redacted>' : ''}`;
    } catch {
        return '<invalid-url>';
    }
};

const sanitizeRawHeaders = (headers) =>
    String(headers || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const [name] = line.split(':', 1);
            if (!name) return '<invalid-header>';

            if (/^(cookie|authorization|proxy-authorization)$/i.test(name)) {
                return `${name}: <redacted>`;
            }

            return `${name}: <present>`;
        })
        .join('\\r\\n');

const redactFfmpegArgs = (args) =>
    args.map((arg, index) => {
        if (args[index - 1] === '-headers') {
            return sanitizeRawHeaders(arg);
        }

        return redactUrl(arg);
    });

const summarizeHeaders = (headers) => {
    const keys = Object.keys(headers || {});
    return {
        keys,
        hasCookie: keys.some(key => key.toLowerCase() === 'cookie'),
        hasUserAgent: keys.some(key => key.toLowerCase() === 'user-agent'),
    };
};

const buildInputArgs = (url, streamInfo) => {
    if (streamInfo?.isHLS) {
        const args = [
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
            '-allowed_extensions', 'ALL',
        ];

        if (streamInfo?.service === 'cctv') {
            args.push(
                '-fflags', '+discardcorrupt',
                '-err_detect', 'ignore_err',
            );
        }

        const rawHeaders = toRawHeaders(streamInfo?.headers);
        if (rawHeaders) {
            args.push('-headers', rawHeaders);
        }

        args.push(
            '-f', 'hls',
            '-i', url,
        );

        return args;
    }

    return ['-i', url];
}

const render = async (res, streamInfo, ffargs, estimateMultiplier) => {
    let process;
    let finalized = false;
    let muxBytes = 0;
    let stderrBuffer = '';
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const diagnostics = isDiagnosticService(streamInfo);
    const shutdown = (reason = 'unknown', error) => {
        if (finalized) return;
        finalized = true;

        if (diagnostics) {
            console.log('[ffmpeg.render][niconico] shutdown:', {
                reason,
                error: error?.message || error?.toString?.(),
                exitCode: process?.exitCode,
                signalCode: process?.signalCode,
                muxBytes,
                headersSent: res.headersSent,
                writableEnded: res.writableEnded,
                stderr: stderrBuffer.slice(-2000),
            });
        }

        killProcess(process);
        closeResponse(res);
        urls.map(destroyInternalStream);
    };

    try {
        const args = [
            '-loglevel', diagnostics ? 'warning' : '-8',
            ...ffargs,
        ];

        if (diagnostics) {
            console.log('[ffmpeg.render][niconico] spawn:', {
                type: streamInfo.type,
                filename: streamInfo.filename,
                urlCount: urls.length,
                urls: urls.map(redactUrl),
                headers: summarizeHeaders(streamInfo.headers),
                args: redactFfmpegArgs(args),
            });
        }

        process = spawn(...getCommand(args), {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'pipe',
                'pipe'
            ],
        });

        const [, , ffmpegError, muxOutput] = process.stdio;

        ffmpegError?.on('data', chunk => {
            stderrBuffer += chunk.toString();
            if (stderrBuffer.length > 8000) {
                stderrBuffer = stderrBuffer.slice(-8000);
            }
        });

        muxOutput?.on('data', chunk => {
            muxBytes += chunk.length;
        });

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', contentDisposition(streamInfo.filename));
        // 添加 CORS 相关头以支持跨域请求
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        const estimatedLength = await estimateTunnelLength(streamInfo, estimateMultiplier);
        res.setHeader('Estimated-Content-Length', estimatedLength);

        pipe(muxOutput, res, error => shutdown('pipe', error));

        process.on('close', () => shutdown('process-close'));
        process.on('error', error => shutdown('process-error', error));
        res.on('finish', () => shutdown('response-finish'));
    } catch (e) {
        shutdown('exception', e);
    }
}

const remux = async (streamInfo, res) => {
    const format = streamInfo.filename.split('.').pop();
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];

    console.log('[ffmpeg.remux] Type:', streamInfo.type);
    console.log('[ffmpeg.remux] Format:', format);
    console.log('[ffmpeg.remux] URLs:', urls.map(redactUrl));
    console.log('[ffmpeg.remux] URLs length:', urls.length);

    const args = urls.flatMap(url => buildInputArgs(url, streamInfo));

    // if the stream type is merge, we expect two URLs
    if (streamInfo.type === 'merge' && urls.length !== 2) {
        console.log('[ffmpeg.remux] ERROR: merge type requires exactly 2 URLs');
        return closeResponse(res);
    }

    if (streamInfo.subtitles) {
        args.push(
            '-i', streamInfo.subtitles,
            '-map', `${urls.length}:s`,
            '-c:s', format === 'mp4' ? 'mov_text' : 'webvtt',
        );
    }

    if (urls.length === 2) {
        args.push(
            '-map', '0:v',
            '-map', '1:a',
        );
    } else {
        args.push(
            '-map', '0:v:0',
            '-map', '0:a:0'
        );
    }

    const shouldTranscodeCorruptCctv =
        streamInfo.service === 'cctv' &&
        streamInfo.isHLS === true &&
        urls.length === 1;

    if (shouldTranscodeCorruptCctv) {
        args.push(
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            ...(streamInfo.type === 'mute' ? ['-an'] : ['-c:a', 'aac', '-b:a', '192k'])
        );
    } else {
        args.push(
            '-c:v', 'copy',
            ...(streamInfo.type === 'mute' ? ['-an'] : ['-c:a', 'copy'])
        );
    }

    if (format === 'mp4') {
        args.push('-movflags', 'faststart+frag_keyframe+empty_moov');
    }

    if (
        !shouldTranscodeCorruptCctv &&
        streamInfo.type !== 'mute' &&
        streamInfo.isHLS &&
        hlsExceptions.has(streamInfo.service)
    ) {
        if (streamInfo.service === 'youtube' && format === 'webm') {
            args.push('-c:a', 'libopus');
        } else {
            args.push('-c:a', 'aac', '-bsf:a', 'aac_adtstoasc');
        }
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push('-f', format === 'mkv' ? 'matroska' : format, 'pipe:3');

    console.log('[ffmpeg.remux] Final FFmpeg args:', redactFfmpegArgs(args));
    console.log('[ffmpeg.remux] About to call render...');

    await render(res, streamInfo, args);
}

const convertAudio = async (streamInfo, res) => {
    const args = [
        ...buildInputArgs(streamInfo.urls, streamInfo),
        '-vn',
        ...(streamInfo.audioCopy ? ['-c:a', 'copy'] : ['-b:a', `${streamInfo.audioBitrate}k`]),
    ];

    if (streamInfo.audioFormat === 'mp3' && streamInfo.audioBitrate === '8') {
        args.push('-ar', '12000');
    }

    if (streamInfo.audioFormat === 'opus') {
        args.push('-vbr', 'off');
    }

    if (streamInfo.audioFormat === 'mp4a') {
        args.push('-movflags', 'frag_keyframe+empty_moov');
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push(
        '-f',
        streamInfo.audioFormat === 'm4a' ? 'ipod' : streamInfo.audioFormat,
        'pipe:3',
    );

    await render(
        res,
        streamInfo,
        args,
        estimateAudioMultiplier(streamInfo) * 1.1,
    );
}

const convertGif = async (streamInfo, res) => {
    const args = [
        '-i', streamInfo.urls,

        '-vf',
        'scale=-1:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
        '-loop', '0',

        '-f', 'gif', 'pipe:3',
    ];

    await render(
        res,
        streamInfo,
        args,
        60,
    );
}

export default {
    remux,
    convertAudio,
    convertGif,
}
