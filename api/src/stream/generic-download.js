import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

import { resolveRunner, createGenericCookieBundle } from '../processing/generic/yt-dlp.js';
import { validateGenericURL } from '../processing/generic/url-safety.js';

const MAX_BYTES = 1024 * 1024 * 1024;
const TIMEOUT_MS = 90_000;
let activeDownloads = 0;

export async function validateDownloadedVideo(filename, signal) {
    if (signal?.aborted) return false;
    return new Promise(resolve => {
        const child = spawn(process.platform === 'win32' ? ffprobe.path : '/usr/bin/ffprobe', [
            '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', filename,
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        const stop = () => child.kill('SIGKILL');
        const timer = setTimeout(stop, 10_000);
        signal?.addEventListener('abort', stop, { once: true });
        if (signal?.aborted) stop();
        child.stdout.on('data', chunk => { output = (output + chunk).slice(-65536); });
        const done = valid => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', stop);
            resolve(valid);
        };
        child.once('error', () => done(false));
        child.once('close', code => {
            try {
                done(code === 0 && !signal?.aborted && JSON.parse(output).streams.some(stream => stream.codec_type === 'video'));
            } catch { done(false); }
        });
    });
}

export async function downloadGenericFile(info, {
    signal,
    getRunner = resolveRunner,
    validateURL = validateGenericURL,
    validateMedia = validateDownloadedVideo,
    timeoutMs = TIMEOUT_MS,
    maxBytes = MAX_BYTES,
    tempRoot = os.tmpdir(),
} = {}) {
    const url = info.genericDownload?.url;
    if (signal?.aborted || !await validateURL(url)) throw new Error('Invalid download source');
    const runner = await getRunner();
    if (signal?.aborted) throw new Error('Download aborted');
    if (!runner) throw new Error('yt-dlp is unavailable');
    const extension = path.extname(info.filename).slice(1);
    if (!['mp4', 'mkv', 'webm'].includes(extension)) throw new Error('Unsupported fallback container');
    const directory = await mkdtemp(path.join(tempRoot, 'cobalt-generic-'));
    // Include files awaiting delivery in the concurrency budget. Exceptional
    // downloads must not fill the pod's disk when several clients retry.
    if (activeDownloads >= 2) {
        await rm(directory, { recursive: true, force: true });
        throw new Error('Generic download fallback is busy');
    }
    activeDownloads++;
    let released = false;
    const cleanup = async () => {
        if (released) return;
        released = true;
        try { await rm(directory, { recursive: true, force: true }); }
        finally { activeDownloads--; }
    };
    const output = path.join(directory, `video.${extension}`);
    const quality = Number(info.genericDownload.videoQuality);
    const qualityFilter = quality > 0 && quality < 9000 ? `[height<=${quality}]` : '';
    let cookieBundle;
    try {
        cookieBundle = await createGenericCookieBundle(url);
        const args = [
            ...runner.prefixArgs, '--ignore-config', '--no-playlist', '--no-progress',
            '--no-warnings', '--socket-timeout', '15', '--retries', '2',
            '--fragment-retries', '3', '--abort-on-unavailable-fragments',
            '--downloader', 'm3u8:native', '--max-filesize', String(maxBytes),
            '--ffmpeg-location', process.platform === 'win32' ? ffmpeg : '/usr/bin/ffmpeg',
            '--format', `bv*${qualityFilter}+ba/b${qualityFilter}/b`,
            '--merge-output-format', extension, '--remux-video', extension,
            '--output', path.join(directory, 'video.%(ext)s'), '--', url,
        ];
        if (cookieBundle?.filePath) {
            args.splice(args.length - 2, 0, '--cookies', cookieBundle.filePath, '--add-header', 'Referer:https://vimeo.com/');
        }
        await new Promise((resolve, reject) => {
            const child = spawn(runner.command, args, {
                windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
                env: runner.pathDir ? {
                    ...process.env, PATH: `${runner.pathDir}${path.delimiter}${process.env.PATH || ''}`,
                } : process.env,
            });
            let failure;
            let finished = false;
            const abort = () => { failure = new Error('Download aborted'); child.kill('SIGKILL'); };
            const timer = setTimeout(() => {
                failure = new Error('Download timed out');
                child.kill('SIGKILL');
            }, timeoutMs);
            // HLS often has no advertised filesize. Bound actual temporary
            // disk use as well, allowing room for remux input and output.
            const diskTimer = setInterval(async () => {
                try {
                    const names = await readdir(directory);
                    const sizes = await Promise.all(names.map(name => stat(path.join(directory, name)).catch(() => ({ size: 0 }))));
                    if (!finished && sizes.reduce((sum, file) => sum + file.size, 0) > maxBytes * 2) {
                        failure = new Error('Download exceeded disk budget');
                        child.kill('SIGKILL');
                    }
                } catch { /* Cleanup may already have removed the directory. */ }
            }, 1000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
            const done = error => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                clearInterval(diskTimer);
                signal?.removeEventListener('abort', abort);
                if (error || failure) reject(failure || error); else resolve();
            };
            child.once('error', done);
            child.once('close', code => done(code === 0 ? undefined : new Error(`yt-dlp download failed (exit ${code})`)));
        });
        const size = (await stat(output)).size;
        if (size <= 0 || size > maxBytes) throw new Error('Invalid download output');
        if (!await validateMedia(output, signal)) throw new Error('Invalid video output');
        return { size, stream: () => createReadStream(output), cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    } finally {
        if (cookieBundle?.tempDir) await rm(cookieBundle.tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
