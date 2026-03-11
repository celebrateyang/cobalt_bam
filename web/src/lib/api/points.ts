import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type PointsHoldFinalizeResult = {
    ok: boolean;
    status?: string;
    charged?: number;
    before?: number | null;
    after?: number | null;
};

export type PointsHoldReleaseResult = {
    ok: boolean;
    status?: string;
};

export type PointsHoldRequestContext = {
    queueId?: string;
    itemId?: string;
    errorCode?: string;
};


const getTokenWithRetry = async (attempts = 6, delayMs = 250) => {
    let token = await getClerkToken();
    if (token) return token;

    for (let i = 0; i < attempts; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        token = await getClerkToken();
        if (token) return token;
    }

    return null;
};

const createRequestId = () =>
    `pts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const finalizePointsHold = async (
    holdId: string,
    reason?: string,
    context?: PointsHoldRequestContext,
): Promise<PointsHoldFinalizeResult> => {
    const token = await getTokenWithRetry();
    if (!token) {
        return { ok: false };
    }

    const apiBase = currentApiURL();
    const requestId = createRequestId();
    const res = await fetch(`${apiBase}/user/points/hold/finalize`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
        },
        body: JSON.stringify({
            holdId,
            reason,
            requestId,
            queueId: context?.queueId,
            itemId: context?.itemId,
            errorCode: context?.errorCode,
        }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    if (!res?.ok || data?.status !== "success") {
        return { ok: false };
    }

    return {
        ok: true,
        status: data?.data?.status,
        charged: data?.data?.charged,
        before: data?.data?.before ?? null,
        after: data?.data?.after ?? null,
    };
};

export const releasePointsHold = async (
    holdId: string,
    reason?: string,
    context?: PointsHoldRequestContext,
): Promise<PointsHoldReleaseResult> => {
    console.log(`[points] releasePointsHold: start holdId=${holdId} reason=${reason} queueId=${context?.queueId ?? "none"} itemId=${context?.itemId ?? "none"} errorCode=${context?.errorCode ?? "none"}`);

    const token = await getTokenWithRetry();
    if (!token) {
        console.error(`[points] releasePointsHold: no token holdId=${holdId}`);
        return { ok: false };
    }

    const apiBase = currentApiURL();
    const requestId = createRequestId();
    console.log(`[points] releasePointsHold: calling API ${apiBase}/user/points/hold/release requestId=${requestId}`);

    const res = await fetch(`${apiBase}/user/points/hold/release`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
        },
        body: JSON.stringify({
            holdId,
            reason,
            requestId,
            queueId: context?.queueId,
            itemId: context?.itemId,
            errorCode: context?.errorCode,
        }),
    }).catch((error) => {
        console.error(`[points] releasePointsHold: fetch failed holdId=${holdId} requestId=${requestId} error=`, error);
        return null;
    });

    if (!res) {
        console.error(`[points] releasePointsHold: no response holdId=${holdId} requestId=${requestId}`);
        return { ok: false };
    }

    const data = await res.json().catch((error) => {
        console.error(`[points] releasePointsHold: json parse failed holdId=${holdId} requestId=${requestId} error=`, error);
        return {};
    });

    console.log(`[points] releasePointsHold: response holdId=${holdId} requestId=${requestId} status=${res.status} ok=${res.ok} data=`, data);

    if (!res.ok || data?.status !== "success") {
        console.error(`[points] releasePointsHold: API returned error holdId=${holdId} requestId=${requestId} status=${res.status} data=`, data);
        return { ok: false };
    }

    console.log(`[points] releasePointsHold: success holdId=${holdId} requestId=${requestId} status=${data?.data?.status}`);
    return {
        ok: true,
        status: data?.data?.status,
    };
};
