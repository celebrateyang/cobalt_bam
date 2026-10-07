import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { create as contentDisposition } from 'content-disposition-header';

import { destroyInternalStream } from './manage.js';
import { downloadGenericFile } from './generic-download.js';

// A readable EOF is not proof of success: FFmpeg also closes its pipes on a
// crash. Keep the HTTP response open until both the pipe and process succeed.
export async function renderGenericDownload(res, info, command, {
    spawnProcess = spawn,
    downloadFile = downloadGenericFile,
    idleTimeoutMs = 45_000,
} = {}) {
    const controller = new AbortController();
    let child;
    let bytes = 0;
    let lastOutput = Date.now();
    let stderr = '';
    let idleExpired = false;
    const startedAt = Date.now();
    const disconnect = () => controller.abort();
    res.once('close', disconnect);
    res.once('error', disconnect);
    const timer = setInterval(() => {
        if (Date.now() - lastOutput >= idleTimeoutMs) {
            idleExpired = true;
            stopChild();
            if (bytes > 0) controller.abort();
        }
    }, Math.min(idleTimeoutMs, 1000));
    timer.unref?.();
    const stopChild = () => {
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    };
    controller.signal.addEventListener('abort', stopChild, { once: true });
    const fail = () => {
        if (res.destroyed || res.writableEnded) return;
        if (res.headersSent) {
            // A broken transfer must reject fetch(), rather than look like a
            // successfully downloaded but truncated video.
            res.destroy();
        } else {
            res.removeHeader('Content-Disposition');
            res.removeHeader('Content-Length');
            res.status(502).end();
        }
    };

    try {
        child = spawnProcess(command[0], command[1], {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
        });
        const closed = new Promise(resolve => {
            child.once('error', error => resolve({ error }));
            child.once('close', (code, signal) => resolve({ code, signal }));
        });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
        const output = child.stdio[3];
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        // Consume with backpressure, but never let the output pipe end res.
        // A failed process may have written a container header before crashing.
        let pipeError;
        try {
            for await (const chunk of output) {
                if (controller.signal.aborted) throw new Error('Download aborted');
                if (!bytes) {
                    res.setHeader('Content-Disposition', contentDisposition(info.filename));
                    res.setHeader('Content-Type', info.filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
                }
                bytes += chunk.length;
                lastOutput = Date.now();
                if (!res.write(chunk)) {
                    await new Promise((resolve, reject) => {
                        const cleanup = () => {
                            res.off('drain', drained);
                            controller.signal.removeEventListener('abort', aborted);
                        };
                        const drained = () => { cleanup(); resolve(); };
                        const aborted = () => { cleanup(); reject(new Error('Download aborted')); };
                        res.once('drain', drained);
                        controller.signal.addEventListener('abort', aborted, { once: true });
                        if (controller.signal.aborted) aborted();
                    });
                }
            }
        } catch (error) {
            pipeError = error;
            stopChild();
        }
        const result = await closed;
        if (!pipeError && result.code === 0 && bytes > 0 && !idleExpired && !controller.signal.aborted) {
            res.end();
            return;
        }
        // Do not log CDN query strings, cookies or the raw FFmpeg stderr.
        console.warn('[generic.download] ffmpeg_failed', {
            service: info.service, code: result.code, signal: result.signal,
            bytes, stderrPresent: Boolean(stderr),
            reason: /allowed_segment_extensions/i.test(stderr) ? 'hls_segment_extension'
                : /403|forbidden/i.test(stderr) ? 'source_forbidden'
                : /invalid data/i.test(stderr) ? 'invalid_media' : 'process_failure',
        });
        clearInterval(timer);
        if (bytes || res.headersSent || res.destroyed || controller.signal.aborted) return fail();

        // Re-extract on the same server and use yt-dlp's native fragment
        // downloader, including its retry and signed-URL handling.
        if (!['remux', 'merge'].includes(info.type)) return fail();
        console.log('[generic.download] fallback_start', { service: info.service, elapsedMs: Date.now() - startedAt });
        const file = await downloadFile(info, {
            signal: controller.signal,
            timeoutMs: Math.min(90_000, Math.max(1000, 110_000 - (Date.now() - startedAt))),
        });
        try {
            if (controller.signal.aborted || res.destroyed) return;
            res.setHeader('Content-Disposition', contentDisposition(info.filename));
            res.setHeader('Content-Type', info.filename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
            res.setHeader('Content-Length', file.size);
            await pipeline(file.stream(), res, { signal: controller.signal });
            console.log('[generic.download] fallback_success', { service: info.service, bytes: file.size });
        } finally {
            await file.cleanup();
        }
    } catch (error) {
        console.warn('[generic.download] failed', {
            service: info.service, bytes,
            reason: controller.signal.aborted ? 'cancelled'
                : /timed out/i.test(error?.message || '') ? 'timeout'
                : /busy/i.test(error?.message || '') ? 'capacity' : 'download_failure',
        });
        fail();
    } finally {
        clearInterval(timer);
        stopChild();
        res.off('close', disconnect);
        res.off('error', disconnect);
        controller.signal.removeEventListener('abort', stopChild);
        for (const url of [info.urls].flat()) destroyInternalStream(url);
    }
}
