<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { copyURL, openFile, openURL } from "$lib/download";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";
    import IconCopy from "@tabler/icons-svelte/IconCopy.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconLoader2 from "@tabler/icons-svelte/IconLoader2.svelte";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";

    export let id: string;
    export let dismissable = true;
    export let title = "TikTok video";
    export let filename: string;
    export let urls: string[] = [];
    export let fallbackUrl: string | undefined = undefined;

    let close: () => void;
    let controller: AbortController | null = null;
    let activeUrl = "";
    let file: File | null = null;
    let filePreviewUrl = "";
    let progress = 0;
    let receivedBytes = 0;
    let totalBytes: number | null = null;
    let status: "idle" | "downloading" | "done" | "fallback" | "error" = "idle";
    let statusText = "Preparing download...";
    let copied = false;

    $: displayProgress = Math.max(0, Math.min(100, Math.round(progress)));
    $: sizeText = totalBytes
        ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`
        : receivedBytes > 0
            ? formatBytes(receivedBytes)
            : "";

    const formatBytes = (value: number) => {
        if (!Number.isFinite(value) || value <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        let size = value;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit += 1;
        }
        return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    };

    const uniqueUrls = () => {
        const list = [...urls, fallbackUrl].filter((value): value is string => (
            typeof value === "string" && value.length > 0
        ));
        return list.filter((value, index) => list.indexOf(value) === index);
    };

    const isVideoResponse = (response: Response) => {
        const contentType = response.headers.get("content-type")?.toLowerCase() || "";
        return contentType.startsWith("video/") ||
            contentType === "application/octet-stream" ||
            contentType === "binary/octet-stream";
    };

    const downloadFromUrl = async (url: string, signal: AbortSignal) => {
        activeUrl = url;
        statusText = "Downloading video...";
        progress = 0;
        receivedBytes = 0;
        totalBytes = null;

        const response = await fetch(url, {
            cache: "no-store",
            signal,
        });

        if (!response.ok || !response.body || !isVideoResponse(response)) {
            await response.body?.cancel().catch(() => undefined);
            throw new Error("bad_response");
        }

        const length = Number(response.headers.get("content-length"));
        totalBytes = Number.isFinite(length) && length > 0 ? length : null;

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes) {
                progress = Math.min(99, (receivedBytes / totalBytes) * 100);
            }
        }

        if (receivedBytes < 64 * 1024) {
            throw new Error("too_small");
        }

        if (totalBytes && receivedBytes !== totalBytes) {
            throw new Error("size_mismatch");
        }

        const blob = new Blob(chunks, {
            type: response.headers.get("content-type") || "video/mp4",
        });

        if (blob.size < 64 * 1024) {
            throw new Error("empty_file");
        }

        file = new File([blob], filename, {
            type: blob.type || "video/mp4",
        });
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        filePreviewUrl = URL.createObjectURL(file);
        progress = 100;
        status = "done";
        statusText = "Download complete. Preview the video, then save it.";
    };

    const start = async () => {
        controller?.abort();
        controller = new AbortController();
        file = null;
        if (filePreviewUrl) {
            URL.revokeObjectURL(filePreviewUrl);
            filePreviewUrl = "";
        }
        status = "downloading";
        statusText = "Preparing download...";

        const candidates = uniqueUrls();
        for (const candidate of candidates) {
            try {
                if (candidate === fallbackUrl) {
                    status = "fallback";
                    statusText = "Direct download failed. Trying tunnel fallback...";
                }
                await downloadFromUrl(candidate, controller.signal);
                return;
            } catch (error) {
                if (controller.signal.aborted) return;
                console.warn("[tiktok-download-dialog] candidate failed", error);
            }
        }

        status = "error";
        statusText = "Download failed. Please try again.";
    };

    const save = () => {
        if (file) {
            openFile(file);
        } else if (activeUrl) {
            openURL(activeUrl);
        }
    };

    const copy = async () => {
        if (!activeUrl) return;
        await copyURL(activeUrl);
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 1500);
    };

    onMount(() => {
        void start();
    });

    onDestroy(() => {
        controller?.abort();
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    });
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body tiktok-download-dialog">
        <header class="header">
            <div>
                <h2>{title}</h2>
                <p>{filename}</p>
            </div>
            {#if status === "downloading" || status === "fallback"}
                <IconLoader2 class="spin" />
            {:else if status === "done"}
                <IconCheck />
            {/if}
        </header>

        <div class="preview-frame">
            {#if filePreviewUrl}
                <video src={filePreviewUrl} controls playsinline></video>
            {:else if activeUrl}
                <video src={activeUrl} controls playsinline muted></video>
            {:else}
                <div class="preview-placeholder">Preparing preview...</div>
            {/if}
        </div>

        <div class="progress-area">
            <div class="progress-label">
                <span>{statusText}</span>
                {#if sizeText}
                    <span>{sizeText}</span>
                {/if}
            </div>
            <div class="progress-track">
                <div class="progress-fill" style={`width: ${displayProgress}%`}></div>
            </div>
        </div>

        <div class="actions">
            {#if status === "error"}
                <button type="button" class="button elevated" on:click={start}>
                    <IconRefresh />
                    Retry
                </button>
            {:else}
                <button
                    type="button"
                    class="button elevated"
                    disabled={status !== "done"}
                    on:click={save}
                >
                    <IconDownload />
                    {$t("button.download")}
                </button>
            {/if}

            <button
                type="button"
                class="button elevated"
                disabled={!activeUrl}
                on:click={copy}
            >
                <IconCopy />
                {copied ? $t("button.copied") : $t("button.copy")}
            </button>

            <button type="button" class="button" on:click={close}>
                {$t("button.done")}
            </button>
        </div>
    </div>
</DialogContainer>

<style>
    .tiktok-download-dialog {
        width: min(720px, calc(100vw - 32px));
        max-height: min(860px, calc(100vh - 32px));
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--text);
    }

    .header h2 {
        margin: 0;
        font-size: 1.2rem;
    }

    .header p {
        margin: 4px 0 0;
        color: var(--subtext);
        overflow-wrap: anywhere;
    }

    .header :global(svg) {
        color: var(--secondary);
        flex: 0 0 auto;
    }

    .spin {
        animation: spin 1s linear infinite;
    }

    .preview-frame {
        border-radius: 18px;
        overflow: hidden;
        background: #000;
        border: 1px solid var(--button-stroke);
        aspect-ratio: 16 / 9;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .preview-frame video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
    }

    .preview-placeholder {
        color: #fff;
        opacity: 0.72;
    }

    .progress-area {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .progress-label {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--subtext);
        font-size: 0.9rem;
    }

    .progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: var(--button-hover);
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--secondary);
        transition: width 0.2s ease;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
    }

    .actions .button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .actions .button :global(svg) {
        width: 18px;
        height: 18px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
