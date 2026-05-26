import * as Storage from "$lib/storage";
import LibAV, { type LibAV as LibAVInstance } from "@imput/libav.js-remux-cli";
import EncodeLibAV from "@imput/libav.js-encode-cli";

import type { FfprobeData } from "fluent-ffmpeg";
import type { FFmpegProgressCallback, FFmpegProgressEvent, FFmpegProgressStatus, RenderParams } from "$lib/types/libav";

export default class LibAVWrapper {
    libav: Promise<LibAVInstance> | null;
    concurrency: number;
    onProgress?: FFmpegProgressCallback;
    debugEnabled: boolean;
    debugStartedAt: number;

    constructor(onProgress?: FFmpegProgressCallback) {
        this.libav = null;
        this.concurrency = (typeof navigator !== "undefined") ? Math.min(4, navigator.hardwareConcurrency || 0) : 1;
        this.onProgress = onProgress;
        this.debugEnabled = false;
        this.debugStartedAt = Date.now();
    }

    init(options: any = {}) {
        if (typeof navigator === 'undefined') return;

        const variant = options?.variant || 'remux';
        const yesthreads = options?.yesthreads ?? true;
        const nothreads = options?.nothreads ?? !yesthreads;
        this.debugEnabled = options?.debug === true;
        const libavOptions = { ...options };
        delete libavOptions.debug;
        let constructor: typeof LibAV.LibAV;

        if (variant === 'remux') {
            constructor = LibAV.LibAV;
        } else if (variant === 'encode') {
            constructor = EncodeLibAV.LibAV;
        } else {
            throw "invalid variant";
        }

        if (this.concurrency && !this.libav) {
            this.#debug("init", {
                variant,
                yesthreads,
                nothreads,
                concurrency: this.concurrency,
                crossOriginIsolated: typeof crossOriginIsolated !== "undefined"
                    ? crossOriginIsolated
                    : undefined,
            });
            this.libav = constructor({
                ...libavOptions,
                variant: undefined,
                base: '/_libav',
                nothreads,
                yesthreads
            });
        }
    }

    async terminate() {
        if (this.libav) {
            this.#debug("terminate:waiting-for-libav");
            const libav = await this.libav;
            this.#debug("terminate:ready");
            libav.terminate();
            this.#debug("terminate:done");
        }
    }

    async probe(blob: Blob) {
        if (!this.libav) throw new Error("LibAV wasn't initialized");
        this.#debug("probe:waiting-for-libav", { bytes: blob.size, type: blob.type || "unknown" });
        const libav = await this.libav;
        this.#debug("probe:libav-ready");

        await libav.mkreadaheadfile('input', blob);
        this.#debug("probe:input-ready");

        try {
            this.#debug("probe:ffprobe-start");
            await libav.ffprobe([
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                'input',
                '-o', 'output.json'
            ]);
            this.#debug("probe:ffprobe-done");

            const copy = await libav.readFile('output.json');
            const text = new TextDecoder().decode(copy);
            await libav.unlink('output.json');

            const result = JSON.parse(text) as FfprobeData;
            this.#debug("probe:result-ready", {
                duration: result.format?.duration,
                streams: result.streams?.map((stream) => stream.codec_type),
            });
            return result;
        } finally {
            await libav.unlinkreadaheadfile('input');
            this.#debug("probe:cleanup-done");
        }
    }

    async render({ files, output, args }: RenderParams) {
        if (!this.libav) throw new Error("LibAV wasn't initialized");
        this.#debug("render:waiting-for-libav", {
            output,
            inputBytes: files.reduce((total, file) => total + file.size, 0),
            args,
        });
        const libav = await this.libav;
        this.#debug("render:libav-ready");

        if (!(output.format && output.type)) {
            throw new Error("output's format or type is missing");
        }

        const outputName = `output.${output.format}`;
        const ffInputs = [];
        const pendingWrites = new Set<Promise<void>>();
        let writeError: unknown = null;
        let reportedOutputWrite = false;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                await libav.mkreadaheadfile(`input${i}`, file);
                ffInputs.push('-i', `input${i}`);
            }
            this.#debug("render:inputs-ready", { count: files.length });

            await libav.mkwriterdev(outputName);
            await libav.mkwriterdev('progress.txt');
            this.#debug("render:writers-ready", { outputName });

            const totalInputSize = files.reduce((a, b) => a + b.size, 0);
            const storage = await Storage.init(totalInputSize);
            this.#debug("render:storage-ready", {
                implementation: storage.constructor.name,
                expectedBytes: totalInputSize,
            });

            libav.onwrite = (name, pos, data) => {
                if (name === 'progress.txt') {
                    try {
                        this.#emitProgress(data);
                    } catch (e) {
                        console.error(e);
                    }
                    return;
                }

                if (name !== outputName) return;

                if (!reportedOutputWrite) {
                    reportedOutputWrite = true;
                    this.#debug("render:first-output-write", {
                        offset: pos,
                        bytes: data.length,
                    });
                }

                let writeTask: Promise<void> | null = null;
                writeTask = Promise.resolve(storage.write(data, pos))
                    .then((written) => {
                        if (!Number.isFinite(written) || written <= 0) {
                            throw new Error("storage_write_no_progress");
                        }
                    })
                    .catch((e) => {
                        if (!writeError) {
                            writeError = e;
                        }
                    })
                    .finally(() => {
                        if (writeTask) {
                            pendingWrites.delete(writeTask);
                        }
                    });

                pendingWrites.add(writeTask);
            };

            this.#debug("render:ffmpeg-start");
            await libav.ffmpeg([
                '-nostdin', '-y',
                '-loglevel', 'error',
                '-progress', 'progress.txt',
                '-threads', this.concurrency.toString(),
                ...ffInputs,
                ...args,
                outputName
            ]);
            this.#debug("render:ffmpeg-done", { pendingWrites: pendingWrites.size });

            if (pendingWrites.size > 0) {
                await Promise.allSettled(Array.from(pendingWrites));
            }
            if (writeError) {
                throw writeError;
            }

            let file = Storage.retype(await storage.res(), output.type);
            this.#debug("render:storage-result", { bytes: file.size });
            if (file.size === 0) {
                try {
                    const directOutput = await libav.readFile(outputName);
                    if (directOutput && directOutput.length > 0) {
                        file = Storage.retype(
                            new File([directOutput], outputName, { type: output.type }),
                            output.type,
                        );
                    }
                } catch {
                    // ignore, we'll fall back to no-render below
                }
            }
            if (file.size === 0) {
                await storage.destroy().catch(() => undefined);
                this.#debug("render:no-output");
                return;
            }

            this.#debug("render:done", { bytes: file.size, type: file.type });
            return file;
        } finally {
            try {
                await libav.unlink(outputName);
                await libav.unlink('progress.txt');

                await Promise.allSettled(
                    files.map((_, i) =>
                        libav.unlinkreadaheadfile(`input${i}`)
                    ));
            } catch { /* catch & ignore */ }
            this.#debug("render:cleanup-done");
        }
    }

    #emitProgress(data: Uint8Array | Int8Array) {
        if (!this.onProgress) return;

        const copy = new Uint8Array(data);
        const text = new TextDecoder().decode(copy);
        const entries = Object.fromEntries(
            text.split('\n')
                .filter(a => a)
                .map(a => a.split('='))
        );

        const status: FFmpegProgressStatus = (() => {
            const { progress } = entries;

            if (progress === 'continue' || progress === 'end') {
                return progress;
            }

            return "unknown";
        })();

        const tryNumber = (str: string, transform?: (n: number) => number) => {
            if (str) {
                const num = Number(str);
                if (!isNaN(num)) {
                    if (transform)
                        return transform(num);
                    else
                        return num;
                }
            }
        }

        const progress: FFmpegProgressEvent = {
            status,
            frame: tryNumber(entries.frame),
            fps: tryNumber(entries.fps),
            total_size: tryNumber(entries.total_size),
            dup_frames: tryNumber(entries.dup_frames),
            drop_frames: tryNumber(entries.drop_frames),
            speed: tryNumber(entries.speed?.trim()?.replace('x', '')),
            out_time_sec: tryNumber(entries.out_time_us, n => Math.floor(n / 1e6))
        };

        this.onProgress(progress);
    }

    #debug(stage: string, details?: Record<string, unknown>) {
        if (!this.debugEnabled) return;

        console.info(
            `[REMUX DEBUG] libav +${Date.now() - this.debugStartedAt}ms ${stage}`,
            details ?? "",
        );
    }
}
