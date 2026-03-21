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
    endpoint: "open" | "join",
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
