import { get } from "svelte/store";

import settings from "$lib/state/settings";

import { getSession, resetSession } from "$lib/api/session";
import { currentApiURL } from "$lib/api/api-url";
import { turnstileCreated, turnstileEnabled, turnstileSolved } from "$lib/state/turnstile";
import cachedInfo from "$lib/state/server-info";
import { getServerInfo } from "$lib/api/server-info";
import { clerkUser, getClerkToken } from "$lib/state/clerk";

import type { Optional } from "$lib/types/generic";
import type { CobaltAPIResponse, CobaltErrorResponse, CobaltSaveRequestBody } from "$lib/types/api";
import type { CobaltExpandResponse } from "$lib/types/expand";
import type { YouTubeSearchResponse } from "$lib/types/youtube";

const sanitizeLogHeaderValue = (value: unknown, maxLength: number) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) return null;
    return trimmed;
};

const createTraceId = () => {
    return globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getClerkEmailHeaderValue = () => {
    const user = get(clerkUser);

    const directEmail = sanitizeLogHeaderValue(
        user?.primaryEmailAddress?.emailAddress,
        256,
    );
    if (directEmail) return directEmail;

    const primaryEmailId = user?.primaryEmailAddressId;
    const emailAddresses = user?.emailAddresses;

    if (primaryEmailId && Array.isArray(emailAddresses)) {
        const primary = emailAddresses.find((email) => email?.id === primaryEmailId);
        const email = sanitizeLogHeaderValue(primary?.emailAddress, 256);
        if (email) return email;
    }

    if (Array.isArray(emailAddresses)) {
        for (const emailAddress of emailAddresses) {
            const email = sanitizeLogHeaderValue(emailAddress?.emailAddress, 256);
            if (email) return email;
        }
    }

    return null;
};

const waitForTurnstile = async () => {
    return await new Promise((resolve, reject) => {
        const unsub = turnstileSolved.subscribe((solved) => {
            if (solved) {
                unsub();
                resolve(true);
            }
        });

        // wait for turnstile to finish for 15 seconds
        setTimeout(() => {
            unsub();
            reject(false);
        }, 15 * 1000)
    });
}

const getAuthorization = async () => {
    const processing = get(settings).processing;
    if (processing.enableCustomApiKey && processing.customApiKey) {
        return `Api-Key ${processing.customApiKey}`;
    }
    if (!get(turnstileEnabled)) {
        return;
    }

    if (!get(turnstileSolved)) {
        turnstileCreated.set(true);
        try {
            await waitForTurnstile();
        } catch {
            return {
                status: "error",
                error: {
                    code: "error.captcha_too_long"
                }
            } as CobaltErrorResponse;
        }
    }

    const session = await getSession();

    if (session) {
        if ("error" in session) {
            if (session.error.code !== "error.api.auth.not_configured") {
                return session;
            }
        } else {
            return `Bearer ${session.token}`;
        }
    }
}

const request = async (requestBody: CobaltSaveRequestBody, justRetried = false) => {
    await getServerInfo();

    const getCachedInfo = get(cachedInfo);

    if (!getCachedInfo) {
        return {
            status: "error",
            error: {
                code: "error.api.unreachable"
            }
        } as CobaltErrorResponse;
    }

    const api = currentApiURL();
    const authorization = await getAuthorization();
    const clerkEmail = getClerkEmailHeaderValue();
    const clerkToken = await getClerkToken();
    const traceId = createTraceId();

    if (authorization && typeof authorization !== "string") {
        return authorization;
    }

    let extraHeaders = {};

    if (authorization) {
        extraHeaders = {
            "Authorization": authorization
        }
    }

    const response: Optional<CobaltAPIResponse> = await fetch(api, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(requestBody),
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...extraHeaders,
            ...(clerkEmail ? { "X-Clerk-Email": clerkEmail } : {}),
            ...(clerkToken ? { "X-Clerk-Token": clerkToken } : {}),
            "X-FSV-Trace-ID": traceId,
        },
    })
    .then(r => r.json())
    .catch((e) => {
        if (e?.message?.includes("timed out")) {
            return {
                status: "error",
                error: {
                    code: "error.api.timed_out"
                }
            } as CobaltErrorResponse;
        }
    });

    if (
        response?.status === 'error'
            && response?.error.code === 'error.api.auth.jwt.invalid'
            && !justRetried
    ) {
        resetSession();
        await getAuthorization();
        return request(requestBody, true);
    }

    if (response && response.status !== "error" && response.mediaImportToken && response.mediaImportExpiresAt) {
        try {
            sessionStorage.setItem("fsv_ai_video_import_v1", JSON.stringify({
                token: response.mediaImportToken,
                expiresAt: response.mediaImportExpiresAt,
                filename: "filename" in response ? response.filename : "imported-video.mp4",
                service: "service" in response ? response.service : null,
            }));
        } catch {}
    }

    return response;
}

const expand = async (url: string, justRetried = false) => {
    await getServerInfo();

    const getCachedInfo = get(cachedInfo);

    if (!getCachedInfo) {
        return {
            status: "error",
            error: {
                code: "error.api.unreachable"
            }
        } as CobaltErrorResponse;
    }

    const api = currentApiURL();
    const authorization = await getAuthorization();
    const clerkEmail = getClerkEmailHeaderValue();
    const clerkToken = await getClerkToken();

    if (authorization && typeof authorization !== "string") {
        return authorization as CobaltExpandResponse;
    }

    let extraHeaders = {};

    if (authorization) {
        extraHeaders = {
            "Authorization": authorization
        }
    }

    const response: Optional<CobaltExpandResponse> = await fetch(`${api}/expand`, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ url }),
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...extraHeaders,
            ...(clerkEmail ? { "X-Clerk-Email": clerkEmail } : {}),
            ...(clerkToken ? { "X-Clerk-Token": clerkToken } : {}),
        },
    })
    .then(r => r.json())
    .catch((e) => {
        if (e?.message?.includes("timed out")) {
            return {
                status: "error",
                error: {
                    code: "error.api.timed_out"
                }
            } as CobaltErrorResponse;
        }
    });

    if (
        response?.status === 'error'
            && response?.error.code === 'error.api.auth.jwt.invalid'
            && !justRetried
    ) {
        resetSession();
        await getAuthorization();
        return expand(url, true);
    }

    return response;
}

const probeCobaltTunnel = async (url: string, attempts = 3) => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const request = await fetch(`${url}&p=1`, {
            signal: AbortSignal.timeout(5000),
        }).catch(() => {});

        if (request?.status === 200) {
            return request.status;
        }

        if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 300));
        }
    }

    return 0;
}

const probeCobaltTunnelMedia = async (url: string, timeoutMs = 8000) => {
    try {
        const response = await fetch(url, {
            headers: {
                Range: "bytes=0-1",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const contentType = response.headers.get("content-type") || "";
        await response.body?.cancel();

        return (
            (response.status === 200 || response.status === 206) &&
            contentType.toLowerCase().startsWith("video/")
        );
    } catch {
        return false;
    }
}

const searchYouTube = async (query: string, signal?: AbortSignal, justRetried = false): Promise<YouTubeSearchResponse> => {
    if (!await getServerInfo()) {
        return { status: 'error', error: { code: 'error.api.unreachable' } } as CobaltErrorResponse;
    }
    const authorization = await getAuthorization();
    if (authorization && typeof authorization !== 'string') return authorization;
    const timeout = AbortSignal.timeout(55000);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    timeout.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
        const response: YouTubeSearchResponse = await fetch(`${currentApiURL()}/youtube/search`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: authorization } : {}),
            },
            body: JSON.stringify({ query }),
        }).then(response => response.json());
        if (response.status === 'error' && response.error.code === 'error.api.auth.jwt.invalid' && !justRetried) {
            resetSession();
            return searchYouTube(query, signal, true);
        }
        return response;
    } catch (error) {
        if (signal?.aborted) throw error;
        return { status: 'error', error: { code: timeout.aborted ? 'error.api.youtube.search.timeout' : 'error.api.unreachable' } } as CobaltErrorResponse;
    } finally {
        signal?.removeEventListener('abort', abort);
        timeout.removeEventListener('abort', abort);
    }
};

export default {
    request,
    expand,
    searchYouTube,
    probeCobaltTunnel,
    probeCobaltTunnelMedia,
}
