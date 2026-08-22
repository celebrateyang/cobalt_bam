import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type ClipboardPersonalDevicePayload = {
    deviceId: string;
    deviceName?: string | null;
    platform: "web" | "ios" | "android" | "macos" | "windows" | "linux" | "unknown";
};

export type ClipboardPersonalSessionTicket = {
    sessionType: "personal";
    sessionId: string;
    codeVersion: number;
    maxPeers: number;
    onlinePeers: number;
    wsTicket: string;
    wsTicketExpiresAt: number;
    personalCode?: string;
    action?: "create" | "join";
    recommendedAction?: ClipboardPersonalRecommendedAction;
    currentDeviceConnected?: boolean;
    currentDeviceRole?: ClipboardPersonalDeviceRole;
};

export type ClipboardPersonalRecommendedAction = "create" | "join" | "resume" | "manage";
export type ClipboardPersonalDeviceRole = "creator" | "joiner" | null;

export type ClipboardPersonalSessionStatus = {
    personalCode: string;
    codeVersion: number;
    hasActiveSession: boolean;
    onlinePeers: number;
    maxPeers: number;
    currentDeviceConnected: boolean;
    currentDeviceRole: ClipboardPersonalDeviceRole;
    recommendedAction: ClipboardPersonalRecommendedAction;
    activeSession: {
        sessionId: string;
        onlinePeers: number;
        maxPeers: number;
        expiresAt: number | null;
    } | null;
};

type ApiSuccess<T> = {
    status: "success";
    data: T;
};

type ApiError = {
    status: "error";
    error: {
        code: string;
        message: string;
    };
};

type ApiResult<T> = ApiSuccess<T> | ApiError;

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return "Network error";
};

const postPersonal = async <T>(
    endpoint: "open" | "join" | "enter",
    payload: ClipboardPersonalDevicePayload,
): Promise<ApiResult<T>> => {
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

    try {
        const response = await fetch(
            `${currentApiURL()}/user/clipboard/personal/${endpoint}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            },
        );

        const data = (await response.json()) as ApiResult<T>;
        return data;
    } catch (error) {
        return {
            status: "error",
            error: {
                code: "NETWORK_ERROR",
                message: getErrorMessage(error),
            },
        };
    }
};

export const openClipboardPersonalSession = async (
    payload: ClipboardPersonalDevicePayload,
) => postPersonal<ClipboardPersonalSessionTicket>("open", payload);

export const joinClipboardPersonalSession = async (
    payload: ClipboardPersonalDevicePayload,
) => postPersonal<ClipboardPersonalSessionTicket>("join", payload);

export const enterClipboardPersonalSession = async (
    payload: ClipboardPersonalDevicePayload,
) => postPersonal<ClipboardPersonalSessionTicket>("enter", payload);

export const getClipboardPersonalSessionStatus = async (
    deviceId: string,
): Promise<ApiResult<ClipboardPersonalSessionStatus>> => {
    const token = await getClerkToken();
    if (!token) {
        return {
            status: "error",
            error: { code: "UNAUTHORIZED", message: "Unauthenticated" },
        };
    }

    try {
        const url = new URL(`${currentApiURL()}/user/clipboard/personal`);
        url.searchParams.set("deviceId", deviceId);
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return (await response.json()) as ApiResult<ClipboardPersonalSessionStatus>;
    } catch (error) {
        return {
            status: "error",
            error: { code: "NETWORK_ERROR", message: getErrorMessage(error) },
        };
    }
};
