import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type CuriousCatActionType = "modal" | "link" | "blind_box";

export type CuriousCatActivity = {
    id: number;
    name: string;
    activity_type: string;
    title: string;
    body: string;
    button_text: string;
    action_type: CuriousCatActionType;
    target_url: string | null;
    image_url: string | null;
    copy_text: string | null;
    reward_points: number | null;
    priority: number;
    is_active: boolean;
    starts_at: number | string | null;
    ends_at: number | string | null;
    created_at: number | string;
    updated_at: number | string;
};

export type BlindBoxLink = {
    id: number;
    url: string;
    host: string | null;
    service: string | null;
    expires_at: number;
    remaining_ms: number;
};

export type BlindBoxPagination = {
    page: number;
    limit: number;
    total: number;
    pages: number;
};

type ApiResponse<T> = {
    status: "success" | "error";
    data?: T;
    error?: {
        code: string;
        message: string;
    };
};

const authedUserRequest = async <T>(path: string): Promise<ApiResponse<T>> => {
    const token = await getClerkToken();
    if (!token) {
        return {
            status: "error",
            error: {
                code: "UNAUTHORIZED",
                message: "Unauthenticated",
            },
        };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${currentApiURL()}${path}`, {
        signal: controller.signal,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    }).catch(() => null).finally(() => {
        window.clearTimeout(timeout);
    });

    if (!res) {
        return {
            status: "error",
            error: {
                code: "NETWORK_ERROR",
                message: "Network error",
            },
        };
    }

    return res.json().catch(() => ({
        status: "error",
        error: {
            code: "INVALID_RESPONSE",
            message: "Invalid API response",
        },
    }));
};

const getAdminToken = () =>
    typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;

const adminRequest = async <T>(
    path: string,
    options: RequestInit = {},
): Promise<ApiResponse<T>> => {
    const token = getAdminToken();
    if (!token) {
        return {
            status: "error",
            error: {
                code: "UNAUTHORIZED",
                message: "Missing admin token",
            },
        };
    }

    const headers = new Headers(options.headers || undefined);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${currentApiURL()}${path}`, {
        ...options,
        headers,
    }).catch(() => null);

    if (!res) {
        return {
            status: "error",
            error: {
                code: "NETWORK_ERROR",
                message: "Network error",
            },
        };
    }

    return res.json().catch(() => ({
        status: "error",
        error: {
            code: "INVALID_RESPONSE",
            message: "Invalid API response",
        },
    }));
};

export const curiousCat = {
    activities: async () =>
        authedUserRequest<{ activities: CuriousCatActivity[] }>(
            "/user/curious-cat/activities",
        ),
    blindBoxLinks: async ({ page = 1, limit = 20 } = {}) =>
        authedUserRequest<{
            links: BlindBoxLink[];
            pagination?: BlindBoxPagination;
            lifetimeHours: number;
        }>(
            `/user/blind-box/links?page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`,
        ),
};

export const curiousCatAdmin = {
    listActivities: async () =>
        adminRequest<{ activities: CuriousCatActivity[] }>(
            "/user/admin/curious-cat/activities",
        ),
    createActivity: async (activity: Record<string, unknown>) =>
        adminRequest<{ activity: CuriousCatActivity }>(
            "/user/admin/curious-cat/activities",
            {
                method: "POST",
                body: JSON.stringify(activity),
            },
        ),
    updateActivity: async (id: number, activity: Record<string, unknown>) =>
        adminRequest<{ activity: CuriousCatActivity }>(
            `/user/admin/curious-cat/activities/${id}`,
            {
                method: "PUT",
                body: JSON.stringify(activity),
            },
        ),
    deleteActivity: async (id: number) =>
        adminRequest<{ activity: CuriousCatActivity }>(
            `/user/admin/curious-cat/activities/${id}`,
            {
                method: "DELETE",
            },
        ),
};
