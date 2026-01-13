import { get } from "svelte/store";

import settings from "$lib/state/settings";

import { getSession, resetSession } from "$lib/api/session";
import { currentApiURL } from "$lib/api/api-url";
import { turnstileEnabled, turnstileSolved } from "$lib/state/turnstile";
import cachedInfo from "$lib/state/server-info";
import { getServerInfo } from "$lib/api/server-info";
import { clerkUser } from "$lib/state/clerk";

import type { Optional } from "$lib/types/generic";
import type { CobaltAPIResponse, CobaltErrorResponse, CobaltSaveRequestBody } from "$lib/types/api";
import type { CobaltExpandResponse } from "$lib/types/expand";

const sanitizeLogHeaderValue = (value: unknown, maxLength: number) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) return null;
    return trimmed;
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
    if (!get(turnstileEnabled)) {
        return;
    }

    if (!get(turnstileSolved)) {
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
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify(requestBody),
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...extraHeaders,
            ...(clerkEmail ? { "X-Clerk-Email": clerkEmail } : {}),
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

const probeCobaltTunnel = async (url: string) => {
    const request = await fetch(`${url}&p=1`).catch(() => {});
    if (request?.status === 200) {
        return request?.status;
    }
    return 0;
}

export default {
    request,
    expand,
    probeCobaltTunnel,
}
