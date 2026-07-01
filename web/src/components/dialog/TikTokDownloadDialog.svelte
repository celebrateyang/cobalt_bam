<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
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
    export let title = "";
    export let filename: string;
    export let urls: string[] = [];
    export let extensionUrls: string[] = [];
    export let sourceUrl = "";

    const EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/freesavevideo-downloader/pcpbaaiagdihbnbpbcdkeofheepadcid";
    const EXTENSION_DISMISSED_KEY = "fsv:tiktok-extension-dismissed-at";
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
    let statusText = "";
    let copied = false;
    let extensionStarted = false;
    let extensionCandidateUrls: string[] = [];
    let previewFailed = false;
    let extensionInstalled = false;
    let extensionCheckComplete = false;
    let extensionPromptDismissed = false;

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
    $: showExtensionPrompt = isChromiumLike() &&
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

    const tt = (key: string) => get(t)(key);

    const uniqueUrls = () => {
        const list = [...extensionCandidateUrls, ...urls].filter((value): value is string => (
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

    const isChromiumLike = () => {
        if (typeof navigator === "undefined") return false;
        const ua = navigator.userAgent || "";
        return /\b(?:Chrome|Chromium|Edg)\//.test(ua) &&
            !/\b(?:OPR|Opera|SamsungBrowser|CriOS|FxiOS)\//.test(ua);
    };

    const readExtensionPromptDismissed = () => {
        try {
            const dismissedAt = Number(localStorage.getItem(EXTENSION_DISMISSED_KEY) || "0");
            return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < EXTENSION_DISMISS_MS;
        } catch {
            return false;
        }
    };

    const dismissExtensionPrompt = () => {
        extensionPromptDismissed = true;
        try {
            localStorage.setItem(EXTENSION_DISMISSED_KEY, String(Date.now()));
        } catch {
            // Best effort only.
        }
    };

    const openExtensionStore = () => {
        window.open(EXTENSION_STORE_URL, "_blank", "noopener,noreferrer");
    };

    const detectExtensionInstalled = () => new Promise<boolean>((resolve) => {
        const requestId = `tiktok-extension-ping-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            resolve(false);
        }, 900);

        const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
        };

        const onMessage = (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.origin !== window.location.origin) return;

            const data = event.data;
            if (!data || data.source !== "freesavevideo-extension") return;
            if (data.type === "FSV_EXTENSION_READY") {
                cleanup();
                resolve(true);
                return;
            }
            if (data.type !== "FSV_EXTENSION_PONG") return;
            if (data.requestId !== requestId) return;

            cleanup();
            resolve(data.ok === true);
        };

        window.addEventListener("message", onMessage);
        window.postMessage({
            source: "freesavevideo-page",
            type: "FSV_EXTENSION_PING",
            requestId,
        }, window.location.origin);
    });

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

    const requestExtensionCandidates = () => new Promise<string[]>((resolve) => {
        if (!sourceUrl) {
            resolve([]);
            return;
        }

        const requestId = `tiktok-candidates-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            resolve([]);
        }, 2500);

        const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
        };

        const onMessage = (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.source !== "freesavevideo-extension") return;
            if (data.type !== "FSV_EXTENSION_TIKTOK_CANDIDATES_RESULT") return;
            if (data.requestId !== requestId) return;

            cleanup();
            extensionInstalled = true;
            const items: { url?: unknown }[] = Array.isArray(data.items) ? data.items : [];
            resolve(items
                .map((item) => typeof item?.url === "string" ? item.url : "")
                .filter(Boolean));
        };

        window.addEventListener("message", onMessage);
        window.postMessage({
            source: "freesavevideo-page",
            type: "FSV_EXTENSION_TIKTOK_CANDIDATES",
            requestId,
            pageUrl: sourceUrl,
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

    const noReferrer = (node: HTMLVideoElement) => {
        node.setAttribute("referrerpolicy", "no-referrer");
        return {};
    };

    const downloadFromUrl = async (url: string, signal: AbortSignal) => {
        activeUrl = url;
        previewFailed = false;
        statusText = tt("dialog.tiktok_download.status.downloading");
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
        statusText = tt("dialog.tiktok_download.status.complete");
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
        extensionCandidateUrls = [];
        previewFailed = false;
        status = "downloading";
        statusText = tt("dialog.tiktok_download.status.checking_extension");

        extensionCandidateUrls = await requestExtensionCandidates();
        if (controller.signal.aborted) return;
        statusText = extensionCandidateUrls.length
            ? tt("dialog.tiktok_download.status.using_extension_candidates")
            : tt("dialog.tiktok_download.status.preparing");

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
            statusText = tt("dialog.tiktok_download.status.extension_fallback");
            for (const extensionCandidate of extensionCandidates) {
                const started = await requestExtensionDownload(extensionCandidate);
                if (controller.signal.aborted) return;
                if (started) {
                    extensionInstalled = true;
                    extensionStarted = true;
                    progress = 100;
                    status = "done";
                    statusText = tt("dialog.tiktok_download.status.extension_started");
                    return;
                }
            }
        }

        status = "error";
        statusText = tt("dialog.tiktok_download.status.blocked_error");
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
        statusText = tt("dialog.tiktok_download.status.preparing");
        extensionPromptDismissed = readExtensionPromptDismissed();
        void detectExtensionInstalled().then((installed) => {
            extensionInstalled = installed;
            extensionCheckComplete = true;
        }).catch(() => {
            extensionCheckComplete = true;
        });
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
                <h2>{title || $t("dialog.tiktok_download.title")}</h2>
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
            {#if filePreviewUrl && !previewFailed}
                <video
                    src={filePreviewUrl}
                    controls
                    playsinline
                    preload="metadata"
                    on:error={() => (previewFailed = true)}
                ></video>
            {:else if activeUrl && !previewFailed}
                <video
                    src={activeUrl}
                    controls
                    playsinline
                    muted
                    preload="metadata"
                    use:noReferrer
                    on:error={() => (previewFailed = true)}
                ></video>
            {:else if extensionStarted}
                <div class="preview-placeholder">
                    {$t("dialog.tiktok_download.preview.blocked")}
                </div>
            {:else if previewFailed}
                <div class="preview-placeholder">
                    {$t("dialog.tiktok_download.preview.unavailable")}
                </div>
            {:else}
                <div class="preview-placeholder">{$t("dialog.tiktok_download.preview.preparing")}</div>
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
            <div class="extension-prompt">
                <div class="extension-prompt-copy">
                    <strong>{$t("dialog.tiktok_download.extension.title")}</strong>
                    <p>{$t("dialog.tiktok_download.extension.body")}</p>
                    <div class="extension-trust">
                        <span>{$t("dialog.tiktok_download.extension.trust.easy")}</span>
                        <span>{$t("dialog.tiktok_download.extension.trust.safe")}</span>
                        <span>{$t("dialog.tiktok_download.extension.trust.free")}</span>
                    </div>
                </div>
                <div class="extension-prompt-actions">
                    <button type="button" class="install-button chrome" on:click={openExtensionStore}>
                        <span class="browser-icon chrome-icon"></span>
                        {$t("dialog.tiktok_download.extension.chrome")}
                    </button>
                    <button type="button" class="install-button edge" on:click={openExtensionStore}>
                        <span class="browser-icon edge-icon"></span>
                        {$t("dialog.tiktok_download.extension.edge")}
                    </button>
                    <button type="button" class="later-button" on:click={dismissExtensionPrompt}>
                        {$t("dialog.tiktok_download.extension.later")}
                    </button>
                </div>
            </div>
        {/if}

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
                    {$t("dialog.tiktok_download.open_link")}
                </button>
            {/if}

            {#if status === "error"}
                <button type="button" class="button" on:click={start}>
                    <IconRefresh />
                    {$t("button.retry")}
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

    .extension-prompt {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 14px;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid color-mix(in srgb, var(--secondary) 26%, var(--button-stroke));
        background:
            radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 36%),
            linear-gradient(135deg, color-mix(in srgb, var(--secondary) 13%, var(--background)), color-mix(in srgb, var(--popup-bg) 94%, var(--secondary)));
        box-shadow: 0 12px 34px color-mix(in srgb, var(--secondary) 14%, transparent);
        color: var(--text);
    }

    .extension-prompt-copy {
        min-width: 0;
    }

    .extension-prompt strong {
        display: block;
        margin-bottom: 6px;
        font-size: 1.05rem;
        line-height: 1.25;
    }

    .extension-prompt p {
        margin: 0;
        color: var(--subtext);
        font-size: 0.9rem;
        line-height: 1.45;
        max-width: 58ch;
    }

    .extension-trust {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        margin-top: 12px;
    }

    .extension-trust span {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--text);
        font-size: 0.78rem;
        opacity: 0.86;
    }

    .extension-trust span::before {
        content: "✓";
        display: inline-grid;
        place-items: center;
        width: 15px;
        height: 15px;
        border-radius: 999px;
        color: white;
        font-size: 0.68rem;
        background: var(--secondary);
    }

    .extension-prompt-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-start;
        width: 100%;
    }

    .install-button,
    .later-button {
        border: 0;
        border-radius: 14px;
        font: inherit;
        cursor: pointer;
        transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
    }

    .install-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-width: 168px;
        padding: 11px 18px;
        color: var(--text);
        background: color-mix(in srgb, var(--popup-bg) 84%, white);
        box-shadow: 0 8px 18px color-mix(in srgb, black 9%, transparent);
    }

    .install-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 22px color-mix(in srgb, black 12%, transparent);
    }

    .later-button {
        padding: 11px 16px;
        color: var(--subtext);
        background: color-mix(in srgb, var(--button-hover) 58%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--button-stroke) 68%, transparent);
    }

    .later-button:hover {
        color: var(--text);
        background: color-mix(in srgb, var(--button-hover) 72%, transparent);
    }

    .browser-icon {
        position: relative;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        border-radius: 50%;
    }

    .chrome-icon {
        background: conic-gradient(#ea4335 0 33%, #fbbc05 0 66%, #34a853 0 83%, #ea4335 0);
    }

    .chrome-icon::before,
    .edge-icon::before {
        content: "";
        position: absolute;
        inset: 6px;
        border-radius: inherit;
        background: #4285f4;
        box-shadow: 0 0 0 2px white;
    }

    .edge-icon {
        background: conic-gradient(#0aa5ff, #00c2a8, #2cc36b, #0a5fdc, #0aa5ff);
    }

    .edge-icon::before {
        background: #fff;
        opacity: 0.92;
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

    @media (max-width: 640px) {
        .install-button,
        .later-button {
            flex: 1 1 100%;
        }
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
