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
    const token = await getTokenWithRetry();
    if (!token) {
        return { ok: false };
    }

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/points/hold/release`, {
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
    };
};
