<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { copyURL, openFile } from "$lib/download";

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
    export let extensionUrls: string[] = [];

    let close: () => void;
    let controller: AbortController | null = null;
    let activeUrl = "";
    let file: File | null = null;
    let filePreviewUrl = "";
    let progress = 0;
    let receivedBytes = 0;
    let totalBytes: number | null = null;
    let startedAt = 0;
    let status: "idle" | "downloading" | "done" | "fallback" | "error" = "idle";
    let statusText = "Preparing download...";
    let copied = false;
    let extensionStarted = false;

    $: displayProgress = Math.max(0, Math.min(100, Math.round(progress)));
    $: sizeText = totalBytes
        ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`
        : receivedBytes > 0
            ? formatBytes(receivedBytes)
            : "";
    $: speedText = status === "downloading" || status === "fallback"
        ? formatSpeed(receivedBytes, startedAt)
        : "";
    $: primaryUrl = uniqueUrls()[0] || activeUrl;

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

    const formatSpeed = (bytes: number, started: number) => {
        if (!bytes || !started) return "";
        const elapsedSeconds = Math.max(0.1, (Date.now() - started) / 1000);
        return `${formatBytes(bytes / elapsedSeconds)}/s`;
    };

    const uniqueUrls = () => {
        const list = urls.filter((value): value is string => (
            typeof value === "string" && value.length > 0
        ));
        return list.filter((value, index) => list.indexOf(value) === index);
    };

    const uniqueExtensionUrls = () => extensionUrls.filter((value, index, list) => (
        typeof value === "string" &&
        value.length > 0 &&
        list.indexOf(value) === index
    ));

    const isVideoResponse = (response: Response) => {
        const contentType = response.headers.get("content-type")?.toLowerCase() || "";
        return contentType.startsWith("video/") ||
            contentType === "application/octet-stream" ||
            contentType === "binary/octet-stream" ||
            contentType === "";
    };

    const looksLikeHtmlError = (chunks: Uint8Array[]) => {
        const first = chunks[0];
        if (!first?.length) return false;

        const sample = new TextDecoder("utf-8", { fatal: false })
            .decode(first.slice(0, 1024))
            .trimStart()
            .toLowerCase();

        return sample.startsWith("<!doctype html") ||
            sample.startsWith("<html") ||
            sample.includes("access denied") ||
            sample.includes("permission to access");
    };

    const requestExtensionDownload = (url: string) => new Promise<boolean>((resolve) => {
        const requestId = `tiktok-extension-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            resolve(false);
        }, 3500);

        const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
        };

        const onMessage = (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.origin !== window.location.origin) return;

            const data = event.data;
            if (!data || data.source !== "freesavevideo-extension") return;
            if (data.type !== "FSV_EXTENSION_DOWNLOAD_RESULT") return;
            if (data.requestId !== requestId) return;

            cleanup();
            resolve(data.ok === true);
        };

        window.addEventListener("message", onMessage);
        window.postMessage({
            source: "freesavevideo-page",
            type: "FSV_EXTENSION_DOWNLOAD",
            requestId,
            url,
            filename,
        }, window.location.origin);
    });

    const openDirectDownload = (url: string) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.target = "_blank";
        anchor.rel = "noreferrer noopener nofollow";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    };

    const downloadFromUrl = async (url: string, signal: AbortSignal) => {
        activeUrl = url;
        statusText = "Downloading video...";
        progress = 0;
        receivedBytes = 0;
        totalBytes = null;
        startedAt = Date.now();

        const response = await fetch(url, {
            cache: "no-store",
            referrerPolicy: "no-referrer",
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

        if (looksLikeHtmlError(chunks)) {
            throw new Error("html_error");
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
        extensionStarted = false;
        status = "downloading";
        statusText = "Preparing download...";

        const candidates = uniqueUrls();
        for (const candidate of candidates) {
            try {
                await downloadFromUrl(candidate, controller.signal);
                return;
            } catch (error) {
                if (controller.signal.aborted) return;
                console.warn("[tiktok-download-dialog] candidate failed", error);
            }
        }

        const extensionCandidates = uniqueExtensionUrls();
        if (extensionCandidates.length) {
            status = "fallback";
            statusText = "Trying browser extension fallback...";
            for (const extensionCandidate of extensionCandidates) {
                const started = await requestExtensionDownload(extensionCandidate);
                if (controller.signal.aborted) return;
                if (started) {
                    extensionStarted = true;
                    progress = 100;
                    status = "done";
                    statusText = "Download started in Chrome.";
                    return;
                }
            }
        }

        status = "error";
        statusText = "Direct fetch was blocked. Use the browser download link or copy the URL.";
    };

    const save = () => {
        if (file) {
            openFile(file);
        } else {
            const url = primaryUrl || activeUrl;
            if (url) openDirectDownload(url);
        }
    };

    const copy = async () => {
        const url = primaryUrl || activeUrl;
        if (!url) return;
        await copyURL(url);
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
                <span class="spin">
                    <IconLoader2 />
                </span>
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
                {#if sizeText || speedText}
                    <span>{[sizeText, speedText].filter(Boolean).join(" | ")}</span>
                {/if}
            </div>
            <div class="progress-track">
                <div class="progress-fill" style={`width: ${displayProgress}%`}></div>
            </div>
        </div>

        <div class="actions">
            {#if status === "error"}
                <button type="button" class="button elevated" on:click={save}>
                    <IconDownload />
                    {$t("button.download")}
                </button>
            {:else}
                <button
                    type="button"
                    class="button elevated"
                    disabled={status !== "done" || extensionStarted}
                    on:click={save}
                >
                    <IconDownload />
                    {$t("button.download")}
                </button>
            {/if}

            <button
                type="button"
                class="button elevated"
                disabled={!primaryUrl && !activeUrl}
                on:click={copy}
            >
                <IconCopy />
                {copied ? $t("button.copied") : $t("button.copy")}
            </button>

            {#if primaryUrl}
                <button type="button" class="button" on:click={() => openDirectDownload(primaryUrl)}>
                    Open link
                </button>
            {/if}

            {#if status === "error"}
                <button type="button" class="button" on:click={start}>
                    <IconRefresh />
                    Retry
                </button>
            {/if}

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
        display: inline-flex;
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
