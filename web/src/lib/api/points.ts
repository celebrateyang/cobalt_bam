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

export const finalizePointsHold = async (
    holdId: string,
    reason?: string,
): Promise<PointsHoldFinalizeResult> => {
    const token = await getTokenWithRetry();
    if (!token) {
        return { ok: false };
    }

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/points/hold/finalize`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ holdId, reason }),
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
): Promise<PointsHoldReleaseResult> => {
    console.log(`[points] releasePointsHold: start holdId=${holdId} reason=${reason}`);

    const token = await getTokenWithRetry();
    if (!token) {
        console.error(`[points] releasePointsHold: no token holdId=${holdId}`);
        return { ok: false };
    }

    const apiBase = currentApiURL();
    console.log(`[points] releasePointsHold: calling API ${apiBase}/user/points/hold/release`);

    const res = await fetch(`${apiBase}/user/points/hold/release`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ holdId, reason }),
    }).catch((error) => {
        console.error(`[points] releasePointsHold: fetch failed holdId=${holdId} error=`, error);
        return null;
    });

    if (!res) {
        console.error(`[points] releasePointsHold: no response holdId=${holdId}`);
        return { ok: false };
    }

    const data = await res.json().catch((error) => {
        console.error(`[points] releasePointsHold: json parse failed holdId=${holdId} error=`, error);
        return {};
    });

    console.log(`[points] releasePointsHold: response holdId=${holdId} status=${res.status} ok=${res.ok} data=`, data);

    if (!res.ok || data?.status !== "success") {
        console.error(`[points] releasePointsHold: API returned error holdId=${holdId} status=${res.status} data=`, data);
        return { ok: false };
    }

    console.log(`[points] releasePointsHold: success holdId=${holdId} status=${data?.data?.status}`);
    return {
        ok: true,
        status: data?.data?.status,
    };
};
