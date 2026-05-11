import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type ShortcutTokenItem = {
    id: number;
    tokenPreview: string;
    tokenName: string | null;
    platform: string;
    createdAt: number;
    updatedAt: number;
    lastUsedAt: number | null;
    expiresAt: number | null;
    revokedAt: number | null;
    isActive: boolean;
};

type ApiSuccess<T> = {
    ok: true;
    data: T;
};

type ApiFailure = {
    ok: false;
    code: string;
    message: string;
};

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type ApiEnvelope<T> = {
    status?: string;
    data?: T;
    error?: {
        code?: string;
        message?: string;
    };
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

const requestWithAuth = async <T>(
    path: string,
    init: RequestInit = {},
): Promise<ApiResult<T>> => {
    const token = await getTokenWithRetry();
    if (!token) {
        return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "Unauthenticated",
        };
    }

    try {
        const response = await fetch(`${currentApiURL()}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(init.headers || {}),
            },
        });

        const payload =
            ((await response.json().catch(() => ({}))) as ApiEnvelope<T>) || {};

        if (!response.ok || payload?.status !== "success") {
            return {
                ok: false,
                code: payload?.error?.code || "REQUEST_FAILED",
                message: payload?.error?.message || "Request failed",
            };
        }

        return {
            ok: true,
            data: payload.data as T,
        };
    } catch (error) {
        return {
            ok: false,
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "Network error",
        };
    }
};

export const listShortcutTokens = async (): Promise<ApiResult<{ tokens: ShortcutTokenItem[] }>> =>
    requestWithAuth<{ tokens: ShortcutTokenItem[] }>("/user/shortcut/tokens");

export const createShortcutToken = async (payload?: {
    tokenName?: string;
    ttlDays?: number;
    platform?: string;
}): Promise<
    ApiResult<{
        token: string;
        tokenMeta: {
            id: number;
            tokenPreview: string;
            tokenName: string | null;
            platform: string;
            createdAt: number;
            expiresAt: number | null;
        };
    }>
> =>
    requestWithAuth("/user/shortcut/tokens", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload || {}),
    });

export const revokeShortcutToken = async (
    tokenId: number,
): Promise<ApiResult<{ tokenId: number; revokedAt: number }>> =>
    requestWithAuth("/user/shortcut/tokens/revoke", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ tokenId }),
    });
