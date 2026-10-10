export const COLLECTION_PAGE_SIZE = 20;
export const COLLECTION_SELECTION_LIMIT = 20;

/** @param {string} value */
export function collectionVideoIdentity(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        if (host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)) {
            const id = host === 'youtu.be' ? url.pathname.split('/')[1]
                : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1];
            return id ? `youtube:${id}` : null;
        }
        if (/(^|\.)bilibili\.com$/.test(host)) {
            const id = url.pathname.match(/^\/video\/([^/]+)/)?.[1];
            return id ? `bilibili:${id}:p=${url.searchParams.get('p') || '1'}` : null;
        }
        if (/(^|\.)douyin\.com$/.test(host)) {
            const id = url.pathname.match(/^\/(?:video|note)\/([^/]+)/)?.[1];
            return id ? `douyin:${id}` : null;
        }
        if (/(^|\.)tiktok\.com$/.test(host)) {
            const id = url.pathname.match(/\/(?:video|photo)\/([^/]+)/)?.[1];
            return id ? `tiktok:${id}` : null;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Preserve selections on other pages and fill remaining slots in page order.
 * @param {boolean[]} selection
 * @param {number[]} indices
 * @param {boolean} checked
 * @param {number} [limit]
 */
export function selectCollectionPage(selection, indices, checked, limit = COLLECTION_SELECTION_LIMIT) {
    const next = [...selection];
    let count = next.filter(Boolean).length;
    for (const index of indices) {
        if (!checked) {
            if (next[index]) count--;
            next[index] = false;
        } else if (!next[index] && count < limit) {
            next[index] = true;
            count++;
        }
    }
    return next;
}
