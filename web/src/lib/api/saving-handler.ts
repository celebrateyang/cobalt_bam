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
import { addToHistory } from "$lib/history";
import { currentApiURL } from "$lib/api/api-url";
import {
    checkSignedIn,
    clerkEnabled,
    getClerkToken,
    isSignedIn,
    signIn,
} from "$lib/state/clerk";

import type { CobaltAPIResponse, CobaltSaveRequestBody } from "$lib/types/api";

type SavingHandlerArgs = {
    url?: string,
    request?: CobaltSaveRequestBody,
    oldTaskId?: string,
    response?: CobaltAPIResponse,
    skipPoints?: boolean,
}

const accountPath = () => {
    const lang = get(page)?.params?.lang || "en";
    return `/${lang}/account`;
};

const normalizeTunnelUrl = (url?: string) => {
    if (!url || typeof window === "undefined") return url;

    const apiBase = currentApiURL();
    if (apiBase !== "/api") return url;

    try {
        const parsed = new URL(url);
        return `${window.location.origin}${apiBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return url;
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
                action: () => {},
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

const showPointsError = () => {
    createDialog({
        id: "points-error",
        type: "small",
        meowbalt: "error",
        bodyText: get(t)("dialog.batch.points_check_failed"),
        buttons: [
            {
                text: get(t)("button.gotit"),
                main: true,
                action: () => {},
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

const fetchUserPoints = async () => {
    const token = await getClerkToken();
    if (!token) throw new Error("missing token");

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/me`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status !== "success") {
        throw new Error(data?.error?.message || "failed to load points");
    }

    const points = data?.data?.user?.points;
    if (!Number.isFinite(points)) {
        throw new Error("invalid points");
    }

    return points as number;
};

const consumePoints = async (points: number) => {
    const token = await getClerkToken();
    if (!token) throw new Error("missing token");

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/points/consume`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ points }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status !== "success") {
        return {
            ok: false,
            code: data?.error?.code as string | undefined,
        };
    }

    return { ok: true };
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

export const savingHandler = async ({
    url,
    request,
    oldTaskId,
    response: preFetchedResponse,
    skipPoints,
}: SavingHandlerArgs) => {
    downloadButtonState.set("think");

    const targetUrl = (url || request?.url)?.toLowerCase();
    if (targetUrl && (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be"))) {
        downloadButtonState.set("idle");
        return createDialog({
            id: "youtube-disabled",
            type: "small",
            meowbalt: "error",
            bodyHtml: get(t)("error.api.youtube.disabled"),
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
        });
    }

    const error = (errorText: string) => {
        return createDialog({
            id: "save-error",
            type: "small",
            meowbalt: "error",
            buttons: [
                {
                    text: get(t)("button.gotit"),
                    main: true,
                    action: () => {},
                },
            ],
            bodyText: errorText,
        });
    }

    if (!request && !url) return;

    const selectedRequest = request || buildSaveRequest(url!);

    const response = preFetchedResponse ?? await API.request(selectedRequest);

    if (!response) {
        downloadButtonState.set("error");
        return error(get(t)("error.api.unreachable"));
    }

    const shouldChargePoints = clerkEnabled && !skipPoints && !oldTaskId;

    if (response.status !== "error" && shouldChargePoints) {
        const duration =
            typeof response.duration === "number" && Number.isFinite(response.duration)
                ? response.duration
                : 0;
        const requiredPoints = duration > 0 ? Math.ceil(duration / 60) : 0;

        if (requiredPoints > 0) {
            const signedIn = await ensureSignedIn();
            if (!signedIn) {
                downloadButtonState.set("idle");
                return;
            }

            let currentPoints;
            try {
                currentPoints = await fetchUserPoints();
            } catch {
                downloadButtonState.set("idle");
                showPointsError();
                return;
            }

            if (currentPoints < requiredPoints) {
                downloadButtonState.set("idle");
                showPointsInsufficient(currentPoints, requiredPoints);
                return;
            }

            try {
                const result = await consumePoints(requiredPoints);
                if (!result.ok) {
                    downloadButtonState.set("idle");
                    if (result.code === "INSUFFICIENT_POINTS") {
                        showPointsInsufficient(currentPoints, requiredPoints);
                    } else {
                        showPointsError();
                    }
                    return;
                }
            } catch {
                downloadButtonState.set("idle");
                showPointsError();
                return;
            }
        }
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
        downloadButtonState.set("error");

        return error(
            get(t)(response.error.code, response?.error?.context)
        );
    }

    if (response.status === "redirect") {
        downloadButtonState.set("done");

        return downloadFile({
            url: response.url,
            urlType: "redirect",
        });
    }

    if (response.status === "tunnel") {
        downloadButtonState.set("check");

        const tunnelUrl = normalizeTunnelUrl(response.url) || response.url;
        const probeResult = await API.probeCobaltTunnel(tunnelUrl);

        if (probeResult === 200) {
            downloadButtonState.set("done");

            return downloadFile({
                url: tunnelUrl,
            });
        } else {
            downloadButtonState.set("error");
            return error(get(t)("error.tunnel.probe"));
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
        return createSavePipeline(normalizedResponse, selectedRequest, oldTaskId);
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

        return createDialog({
            id: "download-picker",
            type: "picker",
            items: response.picker,
            buttons,
        });
    }

    downloadButtonState.set("error");
    return error(get(t)("error.api.unknown_response"));
}
