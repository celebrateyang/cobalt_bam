import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type PlatformRequestStatus = "pending" | "planned" | "supported" | "rejected";

export type PlatformRequest = {
    id: number;
    domain: string;
    homepageUrl: string;
    status: PlatformRequestStatus;
    voteCount: number;
    votedByMe: boolean;
    source: "request_page" | "unsupported_download";
    adminNote: string | null;
    createdAt: number;
    updatedAt: number;
    supportedAt: number | null;
};

export type PlatformPreview = {
    result: "new" | "already_requested" | "already_supported" | "created";
    domain: string;
    homepageUrl: string;
    service?: string;
    temporarilyDisabled?: boolean;
    request?: PlatformRequest;
};

type ApiResult<T> = {
    status: "success";
    data: T;
} | {
    status: "error";
    error: { code: string; message?: string };
};

const authHeaders = async () => {
    const token = await getClerkToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> => {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body) headers.set("Content-Type", "application/json");
    const auth = await authHeaders();
    for (const [key, value] of Object.entries(auth)) headers.set(key, value);

    try {
        const response = await fetch(`${currentApiURL()}/platform-requests${path}`, {
            ...options,
            headers,
        });
        return await response.json();
    } catch {
        return {
            status: "error",
            error: { code: "NETWORK_ERROR", message: "Failed to connect to server" },
        };
    }
};

export const platformRequestsApi = {
    list: (params: {
        page?: number;
        limit?: number;
        sort?: "votes" | "newest";
        status?: PlatformRequestStatus;
        search?: string;
    } = {}) => {
        const search = new URLSearchParams();
        if (params.page) search.set("page", String(params.page));
        if (params.limit) search.set("limit", String(params.limit));
        if (params.sort) search.set("sort", params.sort);
        if (params.status) search.set("status", params.status);
        if (params.search) search.set("search", params.search);
        const suffix = search.size ? `?${search}` : "";
        return request<{
            requests: PlatformRequest[];
            pagination: { page: number; limit: number; total: number; pages: number };
        }>(`/${suffix}`);
    },
    get: (id: number) => request<{ request: PlatformRequest }>(`/${id}`),
    preview: (url: string) => request<PlatformPreview>("/preview", {
        method: "POST",
        body: JSON.stringify({ url }),
    }),
    create: (url: string, source: "request_page" | "unsupported_download") => request<PlatformPreview>("/", {
        method: "POST",
        body: JSON.stringify({ url, source }),
    }),
    vote: (id: number) => request<{ request: PlatformRequest }>(`/${id}/vote`, { method: "POST" }),
    unvote: (id: number) => request<{ request: PlatformRequest }>(`/${id}/vote`, { method: "DELETE" }),
};

const adminHeaders = (): Record<string, string> => {
    const token = typeof window === "undefined" ? null : window.localStorage.getItem("admin_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const platformRequestsAdminApi = {
    list: async (params: { page?: number; status?: PlatformRequestStatus; search?: string } = {}) => {
        const search = new URLSearchParams();
        if (params.page) search.set("page", String(params.page));
        if (params.status) search.set("status", params.status);
        if (params.search) search.set("search", params.search);
        const response = await fetch(`${currentApiURL()}/platform-requests/admin?${search}`, {
            headers: adminHeaders(),
        });
        return response.json() as Promise<ApiResult<{
            requests: PlatformRequest[];
            pagination: { page: number; limit: number; total: number; pages: number };
        }>>;
    },
    update: async (id: number, status: PlatformRequestStatus, adminNote: string) => {
        const response = await fetch(`${currentApiURL()}/platform-requests/admin/${id}`, {
            method: "PATCH",
            headers: {
                ...adminHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status, adminNote }),
        });
        return response.json() as Promise<ApiResult<{ request: PlatformRequest }>>;
    },
};
