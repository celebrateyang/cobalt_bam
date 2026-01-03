import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type CollectionMemoryMarkItem = {
    itemKey: string;
    url?: string;
    title?: string;
};

export const getCollectionDownloadedItemKeys = async (collectionKey: string) => {
    const token = await getClerkToken();
    if (!token) return [];

    const apiBase = currentApiURL();
    const res = await fetch(
        `${apiBase}/user/collection-memory?collectionKey=${encodeURIComponent(
            collectionKey,
        )}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    ).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    if (!res?.ok || data?.status !== "success") {
        return [];
    }

    const keys = data?.data?.downloadedItemKeys;
    if (!Array.isArray(keys)) return [];

    return keys.filter((key: unknown) => typeof key === "string" && key.length > 0);
};

export const markCollectionDownloadedItems = async ({
    collectionKey,
    title,
    sourceUrl,
    items,
}: {
    collectionKey: string;
    title?: string;
    sourceUrl?: string;
    items: CollectionMemoryMarkItem[];
}) => {
    const token = await getClerkToken();
    if (!token) return false;

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/collection-memory/mark`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            collectionKey,
            title,
            sourceUrl,
            items,
        }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    return !!res?.ok && data?.status === "success";
};

export const clearCollectionMemory = async (collectionKey: string) => {
    const token = await getClerkToken();
    if (!token) return false;

    const apiBase = currentApiURL();
    const res = await fetch(`${apiBase}/user/collection-memory/clear`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ collectionKey }),
    }).catch(() => null);

    const data = await res?.json().catch(() => ({}));
    return !!res?.ok && data?.status === "success";
};
