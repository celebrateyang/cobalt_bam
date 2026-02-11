import { page } from "$app/stores";
import { goto } from "$app/navigation";

import env from "$lib/env";
import API from "$lib/api/api";
import settings from "$lib/state/settings";
import lazySettingGetter from "$lib/settings/lazy-get";

import { get } from "svelte/store";
import { t } from "$lib/i18n/translations";
import { downloadFile } from "$lib/download";
import { createDialog } from "$lib/state/dialogs";
import { downloadButtonState } from "$lib/state/omnibox";
import { createSavePipeline } from "$lib/task-manager/queue";
import { updateItem } from "$lib/state/task-manager/queue";
import { addToHistory } from "$lib/history";
import { currentApiURL } from "$lib/api/api-url";
import { finalizePointsHold } from "$lib/api/points";
import { markCollectionDownloadedItems } from "$lib/api/collection-memory";
import {
    checkSignedIn,
    clerkEnabled,
    isSignedIn,
    signIn,
} from "$lib/state/clerk";

import type { CobaltAPIResponse, CobaltSaveRequestBody } from "$lib/types/api";
import type { CobaltQueueItemCollectionMemory } from "$lib/types/queue";

type SavingHandlerArgs = {
    url?: string,
    request?: CobaltSaveRequestBody,
    oldTaskId?: string,
    response?: CobaltAPIResponse,
    skipPoints?: boolean,
    queueMeta?: {
        collectionMemory?: CobaltQueueItemCollectionMemory;
    },
    suppressErrors?: string[],
}

const accountPath = () => {
    const lang = get(page)?.params?.lang || "en";
    return `/${lang}/account`;
};

const isPrivateHostname = (hostname: string) => {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host === "::1") return true;
    if (host.endsWith(".local")) return true;
    if (/^127\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
};

const normalizeTunnelUrl = (url?: string) => {
    if (!url || typeof window === "undefined") return url;

    const apiBase = currentApiURL();
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.pathname !== "/tunnel") return parsed.toString();

        if (apiBase === "/api") {
            return `${window.location.origin}${apiBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }

        const apiOrigin = new URL(apiBase, window.location.origin).origin;
        const shouldRewrite =
            parsed.origin !== apiOrigin ||
            parsed.port === "9000" ||
            isPrivateHostname(parsed.hostname);
        if (shouldRewrite) {
            return new URL(parsed.pathname + parsed.search + parsed.hash, apiOrigin).toString();
        }

        return parsed.toString();
    } catch {
        return url;
    }
};

const isTunnelUrl = (url?: string) => {
    if (!url || typeof window === "undefined") return false;
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.pathname === "/tunnel";
    } catch {
        return false;
    }
};

const applyQueueMeta = (
    taskId: string | undefined,
    response: CobaltAPIResponse | null,
    queueMeta?: SavingHandlerArgs["queueMeta"],
) => {
    if (!taskId) return;

    const points = response && "points" in response ? response.points : undefined;
    const holdId = points?.holdId ?? null;
    const required = points?.required ?? null;
    const status = points?.outcome ?? (holdId ? "held" : undefined);

    console.log("[queue] applyQueueMeta", {
        taskId,
        holdId,
        required,
        status,
        hasCollectionMemory: Boolean(queueMeta?.collectionMemory),
    });

    if (!holdId && !required && !queueMeta?.collectionMemory) return;

    updateItem(taskId, (current) => ({
        ...current,
        points: {
            ...current.points,
            holdId: holdId ?? current.points?.holdId ?? null,
            required: required ?? current.points?.required ?? null,
            status: status ?? current.points?.status ?? null,
        },
        collectionMemory: queueMeta?.collectionMemory ?? current.collectionMemory,
    }));
};

const guessMimeTypeFromFilename = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "mp4":
            return "video/mp4";
        case "webm":
            return "video/webm";
        case "mkv":
            return "video/x-matroska";
        case "mov":
            return "video/quicktime";
        case "mp3":
            return "audio/mpeg";
        case "m4a":
            return "audio/mp4";
        case "opus":
            return "audio/opus";
        case "ogg":
            return "audio/ogg";
        case "wav":
            return "audio/wav";
        case "flac":
            return "audio/flac";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        case "vtt":
            return "text/vtt";
        case "srt":
            return "application/x-subrip";
        default:
            return "application/octet-stream";
    }
};

const showPointsInsufficient = (currentPoints: number, requiredPoints: number) => {
    createDialog({
        id: "points-insufficient",
        type: "small",
        meowbalt: "error",
        title: get(t)("dialog.batch.points_insufficient.title"),
        bodyText: get(t)("dialog.batch.points_insufficient.body", {
            current: currentPoints,
            required: requiredPoints,
        }),
        buttons: [
            {
                text: get(t)("button.cancel"),
                main: false,
                action: () => { },
            },
            {
                text: get(t)("button.buy_points"),
                main: true,
                action: () => {
                    void goto(accountPath());
                },
            },
        ],
    });
};

const ensureSignedIn = async () => {
    if (get(isSignedIn)) return true;

    const alreadySignedIn = await checkSignedIn();
    if (alreadySignedIn) return true;

    const currentUrl = get(page)?.url?.href;
    await signIn({
        fallbackRedirectUrl: currentUrl,
        signUpFallbackRedirectUrl: currentUrl,
    });
    return false;
};

export const buildSaveRequest = (url: string): CobaltSaveRequestBody => {
    const getSetting = lazySettingGetter(get(settings));

    return {
        url,

        // not lazy cuz default depends on device capabilities
        localProcessing: get(settings).save.localProcessing,

        alwaysProxy: getSetting("save", "alwaysProxy"),
        downloadMode: getSetting("save", "downloadMode"),

        subtitleLang: getSetting("save", "subtitleLang"),
        filenameStyle: getSetting("save", "filenameStyle"),
        disableMetadata: getSetting("save", "disableMetadata"),

        audioFormat: getSetting("save", "audioFormat"),
        audioBitrate: getSetting("save", "audioBitrate"),
        tiktokFullAudio: getSetting("save", "tiktokFullAudio"),
        youtubeDubLang: getSetting("save", "youtubeDubLang"),
        youtubeBetterAudio: getSetting("save", "youtubeBetterAudio"),

        videoQuality: getSetting("save", "videoQuality"),
        youtubeVideoCodec: getSetting("save", "youtubeVideoCodec"),
        youtubeVideoContainer: getSetting("save", "youtubeVideoContainer"),
        youtubeHLS: env.ENABLE_DEPRECATED_YOUTUBE_HLS
            ? getSetting("save", "youtubeHLS")
            : undefined,

        allowH265: getSetting("save", "allowH265"),
        convertGif: getSetting("save", "convertGif"),
    };
};

const pointsForDuration = (durationSeconds: number | undefined) => {
    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
        return null;
    }

    if (durationSeconds <= 60) return 1;
    return Math.ceil(durationSeconds / 60);
};

const estimatePointsForUrl = async (url: string) => {
    try {
        const expanded = await API.expand(url);
        if (!expanded || expanded.status === "error") {
            return { points: null, hasEstimate: false };
        }

        const items = expanded.items ?? [];
        if (items.length !== 1) {
            return { points: null, hasEstimate: false };
        }

        const points = pointsForDuration(items[0]?.duration);
        if (!Number.isFinite(points)) {
            return { points: null, hasEstimate: false };
        }

        return { points, hasEstimate: true };
    } catch {
        return { points: null, hasEstimate: false };
    }
};

const confirmPointsPreview = async (url: string) => {
    const { points, hasEstimate } = await estimatePointsForUrl(url);

    return new Promise<boolean>((resolve) => {
        createDialog({
            id: `points-preview-${Date.now()}`,
            type: "small",
            title: get(t)("dialog.points_preview.title"),
            bodyText: hasEstimate
                ? get(t)("dialog.points_preview.body", { required: points })
                : get(t)("dialog.points_preview.unknown"),
            buttons: [
                {
                    text: get(t)("button.cancel"),
                    main: false,
                    action: () => resolve(false),
                },
                {
                    text: get(t)("button.download"),
                    main: true,
                    action: () => resolve(true),
                },
            ],
        });
    });
};

export const savingHandler = async ({
    url,
    request,
    oldTaskId,
    response: preFetchedResponse,
    skipPoints,
    queueMeta,
    suppressErrors,
}: SavingHandlerArgs) => {
    downloadButtonState.set("think");

    const targetUrl = (url || request?.url)?.toLowerCase();
    if (targetUrl && (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be"))) {
        downloadButtonState.set("idle");
        createDialog({
            id: "youtube-disabled",
            type: "small",
            meowbalt: "error",
            bodyHtml: get(t)("error.api.youtube.disabled"),
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => { },
                },
            ],
        });
        return null;
    }

    const showError = (errorText: string) => {
        createDialog({
            id: "save-error",
            type: "small",
            meowbalt: "error",
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => { },
                },
            ],
            bodyText: errorText,
        });
    }

    if (!request && !url) return null;

    const selectedRequest = request || buildSaveRequest(url!);

    if (clerkEnabled) {
        const signedIn = await ensureSignedIn();
        if (!signedIn) {
            downloadButtonState.set("idle");
            return null;
        }
    }

    if (!preFetchedResponse && !skipPoints && clerkEnabled && selectedRequest?.url) {
        const approved = await confirmPointsPreview(selectedRequest.url);
        if (!approved) {
            downloadButtonState.set("idle");
            return null;
        }
    }

    const response = preFetchedResponse ?? await API.request(selectedRequest);

    if (!response) {
        downloadButtonState.set("error");
        showError(get(t)("error.api.unreachable"));
        return null;
    }

    if (response.status !== "error") {
        let title = selectedRequest.url;
        if ('filename' in response && response.filename) {
            title = response.filename;
        }
        addToHistory({
            url: selectedRequest.url,
            title: title,
            type: response.status
        });
    }

    if (response.status === "error") {
        if (response.error.code === "error.api.points.insufficient") {
            downloadButtonState.set("idle");
            const current = Number(response.error?.context?.current);
            const required = Number(response.error?.context?.required);
            if (Number.isFinite(current) && Number.isFinite(required)) {
                showPointsInsufficient(current, required);
                return response;
            }
        }

        downloadButtonState.set("error");
        if (!suppressErrors?.includes(response.error.code)) {
            showError(
                get(t)(response.error.code, response?.error?.context)
            );
        }
        return response;
    }

    if (response.status === "redirect") {
        const redirectUrl = normalizeTunnelUrl(response.url) || response.url;

        // For batch requests forced into the queue, treat redirects as queue items.
        if (selectedRequest.localProcessing === "forced" && selectedRequest.batch) {
            // Only tunnel links should be queued for fetch workers.
            // Direct CDN redirects usually fail in fetch worker due cross-origin restrictions.
            if (!isTunnelUrl(redirectUrl)) {
                downloadButtonState.set("done");

                downloadFile({
                    url: redirectUrl,
                    urlType: "redirect",
                });

                const holdId = response?.points?.holdId;
                if (holdId) {
                    void finalizePointsHold(holdId, "redirect_download_started").catch(() => false);
                }

                const memory = queueMeta?.collectionMemory;
                if (memory?.collectionKey && memory?.itemKey) {
                    void markCollectionDownloadedItems({
                        collectionKey: memory.collectionKey,
                        title: memory.title,
                        sourceUrl: memory.sourceUrl,
                        items: [
                            {
                                itemKey: memory.itemKey,
                                url: memory.itemUrl,
                                title: memory.itemTitle,
                            },
                        ],
                    }).catch(() => false);
                }

                return response;
            }

            downloadButtonState.set("done");

            createSavePipeline(
                {
                    type: "proxy",
                    tunnel: [redirectUrl],
                    output: {
                        type: guessMimeTypeFromFilename(response.filename),
                        filename: response.filename,
                    },
                } as any,
                selectedRequest,
                oldTaskId
            );
            applyQueueMeta(oldTaskId, response, queueMeta);
            return response;
        }

        downloadButtonState.set("done");

        downloadFile({
            url: redirectUrl,
            urlType: "redirect",
        });
        return response;
    }

    if (response.status === "tunnel") {
        const tunnelUrl = normalizeTunnelUrl(response.url) || response.url;

        // In forced local-processing mode, even tunnel responses should be queued.
        // This is especially useful for batch downloads where user activation can expire.
        if (selectedRequest.localProcessing === "forced") {
            downloadButtonState.set("done");

            createSavePipeline(
                {
                    type: "proxy",
                    tunnel: [tunnelUrl],
                    output: {
                        type: guessMimeTypeFromFilename(response.filename),
                        filename: response.filename,
                    },
                } as any,
                selectedRequest,
                oldTaskId
            );
            applyQueueMeta(oldTaskId, response, queueMeta);
            return response;
        }

        downloadButtonState.set("check");
        const probeResult = await API.probeCobaltTunnel(tunnelUrl);

        if (probeResult === 200) {
            downloadButtonState.set("done");

            downloadFile({
                url: tunnelUrl,
            });
            return response;
        } else {
            downloadButtonState.set("error");
            showError(get(t)("error.tunnel.probe"));
            return response;
        }
    }

    if (response.status === "local-processing") {
        downloadButtonState.set("done");
        const normalizedResponse = {
            ...response,
            tunnel: Array.isArray(response.tunnel)
                ? response.tunnel.map((url) => normalizeTunnelUrl(url) || url)
                : response.tunnel,
        };

        try {
            createSavePipeline(normalizedResponse, selectedRequest, oldTaskId);
            applyQueueMeta(oldTaskId, response, queueMeta);
        } catch (error) {
            console.error("Failed to create save pipeline:", error);

            // Release hold if pipeline creation fails
            const holdId = response?.points?.holdId;
            if (holdId) {
                import("$lib/api/points").then(({ releasePointsHold }) => {
                    releasePointsHold(holdId, "pipeline_creation_failed").catch(() => { });
                });
            }

            downloadButtonState.set("error");
            showError(get(t)("error.api.generic"));
        }

        return response;
    }

    if (response.status === "picker") {
        downloadButtonState.set("done");
        const buttons = [
            {
                text: get(t)("button.done"),
                main: true,
                action: () => { },
            },
        ];

        if (response.audio) {
            const pickerAudio = normalizeTunnelUrl(response.audio) || response.audio;
            buttons.unshift({
                text: get(t)("button.download.audio"),
                main: false,
                action: () => {
                    downloadFile({
                        url: pickerAudio,
                    });
                },
            });
        }

        createDialog({
            id: "download-picker",
            type: "picker",
            items: response.picker,
            buttons,
        });
        return response;
    }

    downloadButtonState.set("error");
    showError(get(t)("error.api.unknown_response"));
    return response;
}
