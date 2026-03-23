<script lang="ts">
    import mime from "mime";
    import { get } from "svelte/store";
    import { page } from "$app/stores";
    import { beforeNavigate, goto } from "$app/navigation";
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";
    import { createDialog } from "$lib/state/dialogs";
    import { downloadFile } from "$lib/download";

    import Skeleton from "$components/misc/Skeleton.svelte";
    import DropReceiver from "$components/misc/DropReceiver.svelte";
    import FileReceiver from "$components/misc/FileReceiver.svelte";

    import type { FfprobeData } from "fluent-ffmpeg";
    import type { FFmpegProgressCallback, RenderParams } from "$lib/types/libav";

    type ProcessingMode = "extract-audio" | "convert-video";
    type AudioOutputFormat = "m4a" | "mp3" | "wav";
    type VideoOutputFormat = "mp4" | "webm";
    type VideoProfile = "fast" | "compatible";
    type QueueItemStatus = "queued" | "processing" | "done" | "error";

    type RenderAttempt = {
        args: string[];
        output: {
            type: string;
            format: string;
        };
    };

    type QueueItem = {
        id: string;
        file: File;
        status: QueueItemStatus;
        result?: File;
        error?: string;
        summary?: string;
    };

    type LibAVProcessor = {
        init: (options?: any) => void;
        probe: (blob: Blob) => Promise<FfprobeData>;
        render: (params: RenderParams) => Promise<File | undefined>;
        terminate: () => Promise<void>;
    };

    const ACCEPT_EXTENSIONS = [
        "mp4",
        "mov",
        "mkv",
        "webm",
        "avi",
        "m4v",
        "mp3",
        "m4a",
        "wav",
        "ogg",
        "opus",
        "aac",
        "flac",
    ];
    const fallbackHost = env.HOST || "freesavevideo.online";
    const normalizePathname = (pathname: string) => {
        if (pathname !== "/" && pathname.endsWith("/")) {
            return pathname.replace(/\/+$/, "");
        }
        return pathname;
    };

    let draggedOver = false;
    let incomingFile: File | undefined;
    let incomingFiles: File[] | undefined;
    let queueItems: QueueItem[] = [];
    let processing = false;
    let wentAway = false;
    let cancelledByUser = false;

    let mode: ProcessingMode = "extract-audio";
    let audioFormat: AudioOutputFormat = "mp3";
    let audioBitrate = "128";
    let videoFormat: VideoOutputFormat = "mp4";
    let videoProfile: VideoProfile = "fast";

    let totalDuration: number | undefined;
    let processedDuration: number | undefined;
    let speed: number | undefined;
    let progress: string | undefined;

    let processor: LibAVProcessor | null = null;

    $: totalCount = queueItems.length;
    $: finishedCount = queueItems.filter((item) => item.status === "done" || item.status === "error").length;
    $: activeItem = queueItems.find((item) => item.status === "processing");
    $: seoTitle = `${$t("remux.seo.title")} ~ ${$t("general.cobalt")}`;
    $: seoDescription = String($t("remux.seo.description"));
    $: seoKeywords = String($t("remux.seo.keywords"));
    $: canonicalPathname = normalizePathname($page.url.pathname);
    $: canonicalUrl = `https://${fallbackHost}${canonicalPathname}`;
    $: seoJsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: seoTitle,
              description: seoDescription,
              url: canonicalUrl,
              inLanguage: $page.params.lang || "en",
          }
        : null;

    $: {
        if (totalDuration && processedDuration) {
            progress = Math.max(
                0,
                Math.min(100, (processedDuration / totalDuration) * 100),
            ).toFixed(2);
        } else {
            progress = undefined;
        }
    }

    $: if (incomingFiles && incomingFiles.length > 0) {
        addToQueue(incomingFiles);
        incomingFiles = undefined;
        incomingFile = undefined;
    }

    const tr = (key: string) => get(t)(key);

    const createProcessor = async (
        onProgress: FFmpegProgressCallback,
    ): Promise<LibAVProcessor> => {
        const module = await import("$lib/libav");
        const Instance = module.default;
        const instance = new Instance(onProgress) as LibAVProcessor;
        instance.init({ variant: "encode" });
        return instance;
    };

    const fileId = (file: File) => `${file.name}::${file.size}::${file.lastModified}`;

    const humanSize = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const baseName = (filename: string) => {
        const parts = filename.split(".");
        if (parts.length <= 1) return filename;
        parts.pop();
        return parts.join(".");
    };

    const normalizeFileType = (src: File) => {
        if (src.type) return src;
        return new File([src], src.name, {
            type: mime.getType(src.name) ?? undefined,
        });
    };

    const hasStream = (probe: FfprobeData, kind: "audio" | "video") =>
        Boolean(probe.streams?.some((stream) => stream.codec_type === kind));

    const probeDuration = (probe: FfprobeData) => {
        const value = Number(probe.format?.duration);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    };

    const resolveAudioOutput = () => {
        if (audioFormat === "m4a") {
            return {
                type: "audio/mp4",
                format: "m4a",
                args: [
                    "-map", "0:a:0",
                    "-vn",
                    "-c:a", "aac",
                    "-b:a", `${audioBitrate}k`,
                    "-f", "ipod",
                ],
            };
        }

        if (audioFormat === "mp3") {
            return {
                type: "audio/mpeg",
                format: "mp3",
                args: [
                    "-map", "0:a:0",
                    "-vn",
                    "-c:a", "libmp3lame",
                    "-b:a", `${audioBitrate}k`,
                    "-f", "mp3",
                ],
            };
        }

        return {
            type: "audio/wav",
            format: "wav",
            args: [
                "-map", "0:a:0",
                "-vn",
                "-c:a", "pcm_s16le",
                "-f", "wav",
            ],
        };
    };

    const buildVideoAttempts = () => {
        const attempts: RenderAttempt[] = [];

        if (videoProfile === "fast") {
            attempts.push({
                output: {
                    type: videoFormat === "mp4" ? "video/mp4" : "video/webm",
                    format: videoFormat,
                },
                args: [
                    "-map", "0:v:0",
                    "-map", "0:a?",
                    "-c", "copy",
                    "-f", videoFormat,
                ],
            });
        }

        if (videoFormat === "mp4") {
            attempts.push(
                {
                    output: { type: "video/mp4", format: "mp4" },
                    args: [
                        "-map", "0:v:0",
                        "-map", "0:a?",
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-crf", "23",
                        "-pix_fmt", "yuv420p",
                        "-c:a", "aac",
                        "-b:a", "128k",
                        "-movflags", "+faststart",
                        "-f", "mp4",
                    ],
                },
                {
                    output: { type: "video/mp4", format: "mp4" },
                    args: [
                        "-map", "0:v:0",
                        "-map", "0:a?",
                        "-c:v", "mpeg4",
                        "-q:v", "5",
                        "-c:a", "aac",
                        "-b:a", "128k",
                        "-movflags", "+faststart",
                        "-f", "mp4",
                    ],
                },
            );
        } else {
            attempts.push(
                {
                    output: { type: "video/webm", format: "webm" },
                    args: [
                        "-map", "0:v:0",
                        "-map", "0:a?",
                        "-c:v", "libvpx-vp9",
                        "-crf", "34",
                        "-b:v", "0",
                        "-c:a", "libopus",
                        "-b:a", "128k",
                        "-f", "webm",
                    ],
                },
                {
                    output: { type: "video/webm", format: "webm" },
                    args: [
                        "-map", "0:v:0",
                        "-map", "0:a?",
                        "-c:v", "libvpx",
                        "-crf", "10",
                        "-b:v", "1M",
                        "-c:a", "libvorbis",
                        "-q:a", "4",
                        "-f", "webm",
                    ],
                },
            );
        }

        return attempts;
    };

    const buildAttempts = () => {
        if (mode === "extract-audio") {
            const audio = resolveAudioOutput();
            return [
                {
                    output: {
                        type: audio.type,
                        format: audio.format,
                    },
                    args: audio.args,
                },
            ] satisfies RenderAttempt[];
        }

        return buildVideoAttempts();
    };

    const mapError = (err: unknown) => {
        const text =
            err instanceof Error
                ? `${err.name} ${err.message}`.toLowerCase()
                : String(err).toLowerCase();

        if (cancelledByUser) return tr("remux.errors.cancelled");
        if (text.includes("out of memory")) return tr("remux.errors.out_of_memory");
        if (text.includes("no audio")) return tr("remux.errors.no_audio_stream");
        if (text.includes("no video")) return tr("remux.errors.no_video_stream");
        if (text.includes("no storage method is available")) return tr("remux.errors.no_storage");
        return tr("remux.errors.generic");
    };

    const runAttempts = async (src: File, attempts: RenderAttempt[]) => {
        if (!processor) throw new Error("Processor not initialized");

        let lastError: unknown = null;

        for (const attempt of attempts) {
            try {
                const rendered = await processor.render({
                    files: [src],
                    output: attempt.output,
                    args: attempt.args,
                });

                if (rendered && rendered.size > 0) {
                    return {
                        file: rendered,
                        output: attempt.output,
                    };
                }
            } catch (err) {
                lastError = err;
            }
        }

        if (lastError) throw lastError;
        throw new Error("No successful render attempt");
    };

    const updateItem = (id: string, patch: Partial<QueueItem>) => {
        queueItems = queueItems.map((item) =>
            item.id === id
                ? { ...item, ...patch }
                : item,
        );
    };

    const addToQueue = (files: File[]) => {
        const seen = new Set(queueItems.map((item) => item.id));
        const next: QueueItem[] = [...queueItems];

        for (const file of files) {
            const id = fileId(file);
            if (seen.has(id)) continue;
            seen.add(id);
            next.push({
                id,
                file,
                status: "queued",
            });
        }

        queueItems = next;
    };

    const removeItem = (id: string) => {
        if (processing) return;
        queueItems = queueItems.filter((item) => item.id !== id);
    };

    const clearCompleted = () => {
        if (processing) return;
        queueItems = queueItems.filter((item) => item.status === "queued" || item.status === "processing");
    };

    const statusKey = (status: QueueItemStatus) => {
        if (status === "queued") return "remux.status.queued";
        if (status === "processing") return "remux.status.processing";
        if (status === "done") return "remux.status.done";
        return "remux.status.error";
    };

    const cancelProcessing = async () => {
        cancelledByUser = true;
        if (processor) {
            await processor.terminate();
        }
    };

    const processItem = async (itemId: string) => {
        const item = queueItems.find((entry) => entry.id === itemId);
        if (!item) return;

        const input = normalizeFileType(item.file);
        updateItem(itemId, {
            status: "processing",
            error: undefined,
            result: undefined,
            summary: undefined,
        });

        processedDuration = undefined;
        totalDuration = undefined;
        speed = undefined;

        processor = await createProcessor((info) => {
            if (info.out_time_sec !== undefined) {
                processedDuration = info.out_time_sec;
            }
            if (info.speed !== undefined) {
                speed = info.speed;
            }
        });

        try {
            const probe = await processor.probe(input);
            totalDuration = probeDuration(probe);

            if (mode === "extract-audio" && !hasStream(probe, "audio")) {
                throw new Error("no audio stream");
            }

            if (mode === "convert-video" && !hasStream(probe, "video")) {
                throw new Error("input has no video stream");
            }

            const attempts = buildAttempts();
            const rendered = await runAttempts(input, attempts);

            const suffix = mode === "extract-audio" ? "audio" : "converted";
            const name = `${baseName(input.name)} (${suffix}).${rendered.output.format}`;

            const output = new File([rendered.file], name, {
                type: rendered.output.type,
            });

            updateItem(itemId, {
                status: "done",
                result: output,
                summary: `${rendered.output.format.toUpperCase()} - ${humanSize(output.size)}`,
            });
        } catch (err) {
            if (!cancelledByUser) {
                console.error(err);
            }
            updateItem(itemId, {
                status: "error",
                error: mapError(err),
            });
        } finally {
            if (processor) {
                await processor.terminate();
                processor = null;
            }
        }
    };

    const startProcessing = async () => {
        if (processing) return;

        const targets = queueItems
            .filter((item) => item.status === "queued" || item.status === "error")
            .map((item) => item.id);

        if (targets.length === 0) return;

        cancelledByUser = false;
        processing = true;

        for (const id of targets) {
            if (cancelledByUser) break;
            await processItem(id);
        }

        processing = false;
        progress = undefined;
        speed = undefined;
        processedDuration = undefined;
        totalDuration = undefined;
    };

    const saveResult = async (id: string) => {
        const result = queueItems.find((item) => item.id === id)?.result;
        if (!result) return;
        await downloadFile({ file: result });
    };

    beforeNavigate((event) => {
        if (!processing || wentAway) return;

        event.cancel();
        const path = event.to?.url?.pathname;
        if (!path) return;

        createDialog({
            id: "remux-ongoing",
            type: "small",
            icon: "warn-red",
            title: $t("dialog.processing.title.ongoing"),
            bodyText: $t("dialog.processing.ongoing"),
            buttons: [
                {
                    text: $t("button.no"),
                    main: false,
                    action: () => {},
                },
                {
                    text: $t("button.yes"),
                    main: true,
                    color: "red",
                    action: async () => {
                        await cancelProcessing();
                        wentAway = true;
                        goto(path);
                    },
                },
            ],
        });
    });
</script>

<svelte:head>
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta name="keywords" content={seoKeywords} />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    {#if seoJsonLd}
        {@html `<script type="application/ld+json">${JSON.stringify(seoJsonLd).replace(/</g, "\\u003c")}</script>`}
    {/if}
</svelte:head>

<DropReceiver id="remux-container" bind:draggedOver bind:file={incomingFile} bind:files={incomingFiles} multiple>
    <div id="remux-open" tabindex="-1" data-first-focus data-focus-ring-hidden>
        <FileReceiver
            bind:draggedOver
            bind:file={incomingFile}
            bind:files={incomingFiles}
            acceptTypes={["video/*", "audio/*"]}
            acceptExtensions={ACCEPT_EXTENSIONS}
            multiple
        />

        <div class="remux-panel">
            <div class="mode-row">
                <button
                    class="button mode-button"
                    class:active={mode === "extract-audio"}
                    on:click={() => (mode = "extract-audio")}
                    disabled={processing}
                >
                    {$t("remux.modes.extract_audio")}
                </button>
                <button
                    class="button mode-button"
                    class:active={mode === "convert-video"}
                    on:click={() => (mode = "convert-video")}
                    disabled={processing}
                >
                    {$t("remux.modes.convert_video")}
                </button>
            </div>

            {#if mode === "extract-audio"}
                <div class="controls-grid">
                    <label>
                        {$t("remux.labels.output_format")}
                        <select bind:value={audioFormat} disabled={processing}>
                            <option value="m4a">m4a</option>
                            <option value="mp3">mp3</option>
                            <option value="wav">wav</option>
                        </select>
                    </label>

                    <label>
                        {$t("remux.labels.bitrate")}
                        <select bind:value={audioBitrate} disabled={processing || audioFormat === "wav"}>
                            <option value="96">96 kbps</option>
                            <option value="128">128 kbps</option>
                            <option value="192">192 kbps</option>
                            <option value="320">320 kbps</option>
                        </select>
                    </label>
                </div>
            {:else}
                <div class="controls-grid">
                    <label>
                        {$t("remux.labels.target_format")}
                        <select bind:value={videoFormat} disabled={processing}>
                            <option value="mp4">mp4</option>
                            <option value="webm">webm</option>
                        </select>
                    </label>

                    <label>
                        {$t("remux.labels.mode")}
                        <select bind:value={videoProfile} disabled={processing}>
                            <option value="fast">{$t("remux.mode.fast")}</option>
                            <option value="compatible">{$t("remux.mode.compatible")}</option>
                        </select>
                    </label>
                </div>
            {/if}

            <div class="action-row">
                <button
                    class="button submit-button"
                    on:click={startProcessing}
                    disabled={processing || queueItems.length === 0}
                >
                    {$t("remux.buttons.start")}
                </button>

                {#if processing}
                    <button class="button cancel-button" on:click={cancelProcessing}>
                        {$t("remux.buttons.cancel")}
                    </button>
                {/if}

                <button
                    class="button clear-button"
                    on:click={clearCompleted}
                    disabled={processing}
                >
                    {$t("remux.buttons.clear_done")}
                </button>
            </div>

            <div class="subtext remux-description">
                {$t("remux.tips.local_only")}
            </div>

            {#if queueItems.length > 0}
                <div class="batch-meta">
                    {$t("remux.progress.batch")}: {finishedCount}/{totalCount}
                </div>
            {:else}
                <div class="subtext empty-state">{$t("remux.empty.no_files")}</div>
            {/if}

            {#if processing}
                <div id="processing-status">
                    {#if progress && speed}
                        <div class="progress-bar">
                            <Skeleton width="{progress}%" height="20px" class="elevated" />
                        </div>
                        <div class="progress-text">
                            {$t("remux.progress.processing")} ({progress}%, {speed.toFixed(2)}x)
                        </div>
                    {:else if progress}
                        <div class="progress-bar">
                            <Skeleton width="{progress}%" height="20px" class="elevated" />
                        </div>
                        <div class="progress-text">{$t("remux.progress.processing")} ({progress}%)</div>
                    {:else}
                        <div class="progress-text">{$t("remux.progress.processing")}</div>
                    {/if}

                    {#if activeItem}
                        <div class="subtext running-file">
                            {$t("remux.labels.input")}: {activeItem.file.name}
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="queue-list">
                {#each queueItems as item (item.id)}
                    <div class="queue-item" class:done={item.status === "done"} class:error={item.status === "error"}>
                        <div class="queue-item-main">
                            <div class="queue-title">{item.file.name}</div>
                            <div class="subtext queue-meta">
                                {humanSize(item.file.size)} - {$t(statusKey(item.status))}
                            </div>
                            {#if item.summary}
                                <div class="subtext queue-meta">{item.summary}</div>
                            {/if}
                            {#if item.error}
                                <div class="queue-error">{item.error}</div>
                            {/if}
                        </div>

                        <div class="queue-actions">
                            {#if item.result}
                                <button class="button save-button" on:click={() => saveResult(item.id)}>
                                    {$t("remux.buttons.save_file")}
                                </button>
                            {/if}

                            <button
                                class="button remove-button"
                                on:click={() => removeItem(item.id)}
                                disabled={processing}
                            >
                                {$t("remux.buttons.remove")}
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</DropReceiver>

<style>
    :global(#remux-container) {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
    }

    #remux-open {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        max-width: 760px;
        width: 100%;
        text-align: center;
        gap: 20px;
    }

    .remux-panel {
        width: min(760px, calc(100vw - 40px));
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px;
        border-radius: 16px;
        background: var(--button);
        border: 1px solid var(--input-border);
    }

    .mode-row,
    .action-row {
        display: flex;
        gap: 8px;
    }

    .mode-button {
        flex: 1;
    }

    .mode-button.active {
        box-shadow: inset 0 0 0 2px var(--blue);
    }

    .controls-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    label {
        text-align: left;
        font-size: 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    select {
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: var(--background);
        color: var(--text);
        font-size: 14px;
        padding: 10px;
    }

    .submit-button {
        flex: 1;
    }

    .cancel-button,
    .save-button,
    .clear-button,
    .remove-button {
        border-color: var(--input-border);
    }

    .batch-meta,
    .empty-state {
        text-align: left;
    }

    .remux-description {
        text-align: left;
        font-size: 13px;
        line-height: 1.4;
    }

    #processing-status {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .progress-bar {
        height: 20px;
        width: 100%;
        border-radius: 6px;
        background: var(--background);
    }

    .progress-text {
        font-size: 14px;
        text-align: left;
    }

    .running-file {
        text-align: left;
    }

    .queue-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .queue-item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        border: 1px solid var(--input-border);
        border-radius: 10px;
        padding: 10px 12px;
        text-align: left;
    }

    .queue-item.done {
        border-color: var(--success-text, var(--blue));
    }

    .queue-item.error {
        border-color: var(--error);
    }

    .queue-item-main {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .queue-title {
        font-size: 14px;
        word-break: break-word;
    }

    .queue-meta {
        opacity: 0.85;
        word-break: break-word;
    }

    .queue-error {
        color: var(--error);
        font-size: 13px;
        word-break: break-word;
    }

    .queue-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
    }

    @media screen and (max-width: 640px) {
        .controls-grid {
            grid-template-columns: 1fr;
        }

        .action-row {
            flex-direction: column;
        }

        .mode-row {
            flex-direction: column;
        }

        .queue-item {
            flex-direction: column;
        }

        .queue-actions {
            flex-direction: row;
            width: 100%;
        }
    }
</style>
