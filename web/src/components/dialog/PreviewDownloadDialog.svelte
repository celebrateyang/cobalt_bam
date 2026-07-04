<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { copyURL, openFile } from "$lib/download";
    import {
        detectFreeSaveVideoExtensionInstalled,
        isChromiumLike,
        openFreeSaveVideoExtensionStore,
    } from "$lib/extension/freesavevideo";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";
    import ExtensionInstallPrompt from "$components/dialog/ExtensionInstallPrompt.svelte";

    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";
    import IconCopy from "@tabler/icons-svelte/IconCopy.svelte";
    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconLoader2 from "@tabler/icons-svelte/IconLoader2.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

    export let id: string;
    export let dismissable = true;
    export let title = "Video preview and download";
    export let filename: string;
    export let urls: string[] = [];
    export let extensionUrls: string[] = [];
    export let mediaType: "video" | "audio" | "image" = "video";
    export let autoSave = true;
    export let extensionPromptTitleKey = "";
    export let extensionPromptBodyKey = "";
    export let extensionPromptKey = "preview";

    const EXTENSION_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

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
    let autoSaved = false;
    let extensionInstalled = false;
    let extensionCheckComplete = false;
    let extensionPromptDismissed = false;
    let extensionStoreOpened = false;
    let extensionInstallPoll: number | undefined;

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
    $: showExtensionPrompt = Boolean(extensionPromptTitleKey && extensionPromptBodyKey) &&
        isChromiumLike() &&
        extensionCheckComplete &&
        !extensionInstalled &&
        !extensionPromptDismissed;

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

    const extensionDismissedStorageKey = () => `fsv:${extensionPromptKey || "preview"}-extension-dismissed-at`;

    const readExtensionPromptDismissed = () => {
        try {
            const dismissedAt = Number(localStorage.getItem(extensionDismissedStorageKey()) || "0");
            return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < EXTENSION_DISMISS_MS;
        } catch {
            return false;
        }
    };

    const dismissExtensionPrompt = () => {
        extensionPromptDismissed = true;
        try {
            localStorage.setItem(extensionDismissedStorageKey(), String(Date.now()));
        } catch {
            // Best effort only.
        }
    };

    const maybeRetryAfterExtensionInstall = () => {
        if (!extensionStoreOpened) return;
        extensionStoreOpened = false;
        if (status === "error" || status === "fallback") {
            void start();
        }
    };

    const checkExtensionAfterFocus = async () => {
        const installed = await detectFreeSaveVideoExtensionInstalled();
        extensionInstalled = installed;
        extensionCheckComplete = true;
        if (installed) maybeRetryAfterExtensionInstall();
    };

    const startExtensionInstallPolling = () => {
        if (extensionInstallPoll !== undefined) return;
        const startedAt = Date.now();
        extensionInstallPoll = window.setInterval(() => {
            if (Date.now() - startedAt > 90_000) {
                if (extensionInstallPoll !== undefined) {
                    window.clearInterval(extensionInstallPoll);
                    extensionInstallPoll = undefined;
                }
                return;
            }

            void detectFreeSaveVideoExtensionInstalled().then((installed) => {
                extensionInstalled = installed;
                extensionCheckComplete = true;
                if (!installed) return;
                if (extensionInstallPoll !== undefined) {
                    window.clearInterval(extensionInstallPoll);
                    extensionInstallPoll = undefined;
                }
                maybeRetryAfterExtensionInstall();
            });
        }, 1500);
    };

    const openExtensionStore = () => {
        extensionStoreOpened = true;
        startExtensionInstallPolling();
        openFreeSaveVideoExtensionStore();
    };

    const isExpectedResponse = (response: Response) => {
        const contentType = response.headers.get("content-type")?.toLowerCase() || "";
        if (mediaType === "audio") return contentType.startsWith("audio/") || contentType === "";
        if (mediaType === "image") return contentType.startsWith("image/") || contentType === "";
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
        const requestId = `preview-extension-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
            if (data.ok === true) extensionInstalled = true;
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
        statusText = "Downloading media...";
        progress = 0;
        receivedBytes = 0;
        totalBytes = null;
        startedAt = Date.now();

        const response = await fetch(url, {
            cache: "no-store",
            referrerPolicy: "no-referrer",
            signal,
        });

        if (!response.ok || !response.body || !isExpectedResponse(response)) {
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

        if (receivedBytes < 1024) {
            throw new Error("too_small");
        }

        if (looksLikeHtmlError(chunks)) {
            throw new Error("html_error");
        }

        if (totalBytes && receivedBytes !== totalBytes) {
            throw new Error("size_mismatch");
        }

        const blob = new Blob(chunks, {
            type: response.headers.get("content-type") || (
                mediaType === "audio" ? "audio/mpeg" :
                mediaType === "image" ? "image/jpeg" :
                "video/mp4"
            ),
        });

        if (blob.size < 1024) {
            throw new Error("empty_file");
        }

        file = new File([blob], filename, {
            type: blob.type || "application/octet-stream",
        });
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        filePreviewUrl = URL.createObjectURL(file);
        progress = 100;
        status = "done";
        statusText = "Download complete. Preview the file, then save it.";

        if (autoSave && !autoSaved) {
            autoSaved = true;
            openFile(file);
        }
    };

    const start = async () => {
        controller?.abort();
        controller = new AbortController();
        file = null;
        autoSaved = false;
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
                console.warn("[preview-download-dialog] candidate failed", error);
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

        status = "fallback";
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
        extensionPromptDismissed = readExtensionPromptDismissed();
        void detectFreeSaveVideoExtensionInstalled().then((installed) => {
            extensionInstalled = installed;
            extensionCheckComplete = true;
        }).catch(() => {
            extensionCheckComplete = true;
        });
        window.addEventListener("focus", checkExtensionAfterFocus);
        void start();
    });

    onDestroy(() => {
        controller?.abort();
        window.removeEventListener("focus", checkExtensionAfterFocus);
        if (extensionInstallPoll !== undefined) {
            window.clearInterval(extensionInstallPoll);
        }
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    });
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body preview-download-dialog">
        <header class="header">
            <div>
                <h2>{title}</h2>
                <p>{filename}</p>
            </div>
            <div class="header-actions">
                {#if status === "downloading" || status === "fallback"}
                    <span class="spin">
                        <IconLoader2 />
                    </span>
                {:else if status === "done"}
                    <IconCheck />
                {/if}
                <button type="button" class="close-button" aria-label="Close" on:click={close}>
                    <IconX />
                </button>
            </div>
        </header>

        <div class="preview-frame" class:preview-frame--audio={mediaType === "audio"}>
            {#if mediaType === "audio"}
                <audio src={filePreviewUrl || activeUrl} controls></audio>
            {:else if mediaType === "image" && (filePreviewUrl || activeUrl)}
                <img src={filePreviewUrl || activeUrl} alt={filename} referrerpolicy="no-referrer" />
            {:else if filePreviewUrl || activeUrl}
                <video src={filePreviewUrl || activeUrl} controls playsinline muted></video>
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

        {#if showExtensionPrompt}
            <ExtensionInstallPrompt
                titleKey={extensionPromptTitleKey}
                bodyKey={extensionPromptBodyKey}
                onInstall={openExtensionStore}
                onDismiss={dismissExtensionPrompt}
            />
        {/if}

        <div class="actions">
            {#if status === "fallback" || status === "error"}
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
        </div>
    </div>
</DialogContainer>

<style>
    .preview-download-dialog {
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

    .header-actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
    }

    .close-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid var(--button-stroke);
        border-radius: 999px;
        background: var(--button-hover);
        color: var(--text);
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }

    .close-button:hover {
        background: var(--button);
        border-color: var(--secondary);
        transform: translateY(-1px);
    }

    .close-button :global(svg) {
        width: 18px;
        height: 18px;
        color: currentColor;
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

    .preview-frame--audio {
        aspect-ratio: auto;
        min-height: 96px;
        background: var(--button-hover);
    }

    .preview-frame video,
    .preview-frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
    }

    .preview-frame audio {
        width: calc(100% - 32px);
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
