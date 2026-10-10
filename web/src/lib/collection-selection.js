export const COLLECTION_PAGE_SIZE = 20;
export const COLLECTION_SELECTION_LIMIT = 20;

/** @param {string} title */
function collectionTitleKey(title) {
    const normalized = title.normalize('NFKC').replace(/\s+/gu, '');
    const withoutResolution = normalized.replace(/[\[\u3010](?:\d{3,4}p|\d+k)[\]\u3011]/gi, '');
    const episode = withoutResolution.match(/\((\d{1,6})\)|\[(\d{1,6})\]|\u3010(\d{1,6})\u3011|\u7b2c(\d{1,6})(?:\u96c6|\u8bdd|\u671f)/u);
    return {
        title: normalized,
        series: episode
            ? withoutResolution.slice(0, episode.index).replace(/[\p{P}\p{S}]/gu, '')
            : normalized,
        episode: episode ? Number(episode.slice(1).find(value => value !== undefined)) : null,
    };
}

/**
 * Sort display indices, leaving the underlying items and their selections intact.
 * @param {{ title?: string, url: string }[]} items
 * @param {'original' | 'title-asc' | 'title-desc'} order
 * @param {string} locale
 */
export function collectionItemOrder(items, order, locale) {
    const indices = items.map((_, index) => index);
    if (order === 'original') return indices;
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    const direction = order === 'title-desc' ? -1 : 1;
    const keys = items.map(item => collectionTitleKey(item.title || item.url));
    return indices.sort((a, b) => {
        const left = keys[a];
        const right = keys[b];
        const seriesOrder = collator.compare(left.series, right.series);
        const episodeOrder = left.episode !== null && right.episode !== null
            ? left.episode - right.episode : 0;
        return direction * (seriesOrder || episodeOrder || collator.compare(left.title, right.title)) || a - b;
    });
}

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
