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

const render = async (res, streamInfo, ffargs, estimateMultiplier) => {
    let process;
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const renderId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    let bytesSent = 0;

    console.log(`[ffmpeg.render ${renderId}] 开始渲染`, {
        service: streamInfo.service,
        type: streamInfo.type,
        filename: streamInfo.filename,
        urlCount: urls.length
    });

    const shutdown = () => {
        console.log(`[ffmpeg.render ${renderId}] shutdown 被调用`, {
            bytesSent,
            elapsedTime: Date.now() - startTime + 'ms'
        });
        killProcess(process);
        closeResponse(res);
        urls.map(destroyInternalStream);
    };

    try {
        const args = [
            '-loglevel', '-8',
            ...ffargs,
        ];

        console.log(`[ffmpeg.render ${renderId}] Spawning FFmpeg with args:`, args);

        process = spawn(...getCommand(args), {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe'
            ],
        });

        console.log(`[ffmpeg.render ${renderId}] FFmpeg process spawned, PID:`, process.pid);

        const [, , , muxOutput] = process.stdio;

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', contentDisposition(streamInfo.filename));
        // 添加 CORS 相关头以支持跨域请求
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        const estimatedLength = await estimateTunnelLength(streamInfo, estimateMultiplier);
        console.log(`[ffmpeg.render ${renderId}] Estimated length:`, estimatedLength);

        res.setHeader('Estimated-Content-Length', estimatedLength);

        // 监控 muxOutput 数据
        muxOutput.on('data', (chunk) => {
            bytesSent += chunk.length;
        });

        muxOutput.on('error', (err) => {
            console.error(`[ffmpeg.render ${renderId}] muxOutput 错误:`, err.message);
        });

        muxOutput.on('end', () => {
            console.log(`[ffmpeg.render ${renderId}] muxOutput 结束`, {
                bytesSent,
                elapsedTime: Date.now() - startTime + 'ms'
            });
        });

        // 监控响应状态
        res.on('close', () => {
            console.log(`[ffmpeg.render ${renderId}] 响应关闭`, {
                bytesSent,
                elapsedTime: Date.now() - startTime + 'ms',
                writableEnded: res.writableEnded,
                writableFinished: res.writableFinished
            });
        });

        res.on('error', (err) => {
            console.error(`[ffmpeg.render ${renderId}] 响应错误:`, err.message);
        });

        // 每10秒记录一次进度
        const logInterval = setInterval(() => {
            console.log(`[ffmpeg.render ${renderId}] 进度`, {
                bytesSent,
                elapsedTime: Date.now() - startTime + 'ms',
                processExitCode: process?.exitCode
            });
        }, 10000);

        console.log(`[ffmpeg.render ${renderId}] Setting up pipe to response...`);
        pipe(muxOutput, res, () => {
            clearInterval(logInterval);
            shutdown();
        });

        process.on('close', (code) => {
            clearInterval(logInterval);
            console.log(`[ffmpeg.render ${renderId}] Process closed with code:`, code, {
                bytesSent,
                elapsedTime: Date.now() - startTime + 'ms'
            });
            shutdown();
        });

        process.on('error', (err) => {
            clearInterval(logInterval);
            console.error(`[ffmpeg.render ${renderId}] Process error:`, err);
        });

        res.on('finish', () => {
            clearInterval(logInterval);
            console.log(`[ffmpeg.render ${renderId}] Response finished`, {
                bytesSent,
                elapsedTime: Date.now() - startTime + 'ms'
            });
            shutdown();
        });
    } catch (e) {
        console.error(`[ffmpeg.render ${renderId}] Exception:`, e);
        shutdown();
    }
}

const remux = async (streamInfo, res) => {
    const format = streamInfo.filename.split('.').pop();
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];

    console.log('[ffmpeg.remux] Type:', streamInfo.type);
    console.log('[ffmpeg.remux] Format:', format);
    console.log('[ffmpeg.remux] URLs:', urls);
    console.log('[ffmpeg.remux] URLs length:', urls.length);

    const args = urls.flatMap(url => ['-i', url]);

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

    args.push(
        '-c:v', 'copy',
        ...(streamInfo.type === 'mute' ? ['-an'] : ['-c:a', 'copy'])
    );

    if (format === 'mp4') {
        args.push('-movflags', 'faststart+frag_keyframe+empty_moov');
    }

    if (streamInfo.type !== 'mute' && streamInfo.isHLS && hlsExceptions.has(streamInfo.service)) {
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

    console.log('[ffmpeg.remux] Final FFmpeg args:', args);
    console.log('[ffmpeg.remux] About to call render...');

    await render(res, streamInfo, args);
}

const convertAudio = async (streamInfo, res) => {
    const args = [
        '-i', streamInfo.urls,
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
