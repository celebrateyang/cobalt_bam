import { writable } from "svelte/store";

import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export const feedbackUnread = writable(0);

let refreshPromise: Promise<void> | null = null;

export const clearFeedbackNotifications = () => {
    feedbackUnread.set(0);
};

export const refreshFeedbackNotifications = async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const token = await getClerkToken();
        if (!token) {
            clearFeedbackNotifications();
            return;
        }

        try {
            const res = await fetch(`${currentApiURL()}/user/notifications/status`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") return;

            const count = Number(data?.data?.feedbackUnread);
            feedbackUnread.set(Number.isFinite(count) && count > 0 ? count : 0);
        } catch {
            // Keep the last known state during transient network failures.
        }
    })().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
};

export const markFeedbackNotificationsSeen = async (seenThrough: number) => {
    if (!Number.isFinite(seenThrough) || seenThrough <= 0) return false;
    const token = await getClerkToken();
    if (!token) return false;

    try {
        const res = await fetch(`${currentApiURL()}/user/feedback/mark-seen`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ seenThrough }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.status !== "success") return false;

        feedbackUnread.set(0);
        return true;
    } catch {
        return false;
    }
};
