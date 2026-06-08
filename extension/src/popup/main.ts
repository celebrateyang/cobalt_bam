import type { DetectedMedia, PageScanResult } from '../shared/messages';
import { buildFreeSaveVideoUrl, isYouTubeUrl } from '../shared/url';
import './styles.css';

type State =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; result: PageScanResult; copiedUrl: string | null; activeKind: DetectedMedia['kind'] | 'all' };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');

let state: State = { kind: 'loading' };

const escapeHtml = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

const mediaIcon = (kind: DetectedMedia['kind']) => {
    switch (kind) {
        case 'video':
            return 'VID';
        case 'audio':
            return 'AUD';
        case 'image':
            return 'IMG';
        case 'playlist':
            return 'HLS';
        case 'subtitle':
            return 'SUB';
        default:
            return 'URL';
    }
};

const shortUrl = (value: string) => {
    try {
        const url = new URL(value);
        const path = `${url.pathname}${url.search}`.replace(/\s+/g, '');
        return `${url.hostname}${path}`.slice(0, 96);
    } catch {
        return value.slice(0, 96);
    }
};

const setState = (next: State) => {
    state = next;
    render();
};

const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
};

const scanPage = async () => {
    setState({ kind: 'loading' });
    const tab = await getActiveTab();
    if (!tab.id || !tab.url) {
        setState({ kind: 'error', message: 'No active tab found.' });
        return;
    }
    if (!/^https?:\/\//i.test(tab.url)) {
        setState({ kind: 'error', message: 'Open a normal web page to scan media.' });
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['assets/content.js'],
        });
        const result = (await chrome.tabs.sendMessage(tab.id, {
            type: 'FSV_SCAN_PAGE',
        })) as PageScanResult;
        setState({ kind: 'ready', result, copiedUrl: null, activeKind: chooseDefaultKind(result.media) });
    } catch {
        setState({
            kind: 'error',
            message: 'This page cannot be scanned yet. Reload the tab and try again.',
        });
    }
};

const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    if (state.kind === 'ready') setState({ ...state, copiedUrl: url });
};

const chooseDefaultKind = (media: DetectedMedia[]): DetectedMedia['kind'] | 'all' => {
    for (const kind of ['video', 'playlist', 'audio', 'image', 'subtitle'] as const) {
        if (media.some((item) => item.kind === kind)) return kind;
    }
    return 'all';
};

const openFreeSaveVideo = async (url: string) => {
    await chrome.runtime.sendMessage({ type: 'FSV_OPEN_FREESAVEVIDEO', url });
};

const bindActions = () => {
    document.querySelector<HTMLButtonElement>('[data-action="rescan"]')?.addEventListener('click', () => {
        void scanPage();
    });
    document.querySelector<HTMLButtonElement>('[data-action="open-page"]')?.addEventListener('click', () => {
        if (state.kind !== 'ready') return;
        void chrome.tabs.create({ url: buildFreeSaveVideoUrl(state.result.pageUrl) });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-copy-url]').forEach((button) => {
        button.addEventListener('click', () => {
            const url = button.dataset.copyUrl;
            if (url) void copyUrl(url);
        });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-open-url]').forEach((button) => {
        button.addEventListener('click', () => {
            const url = button.dataset.openUrl;
            if (url) void openFreeSaveVideo(url);
        });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-filter-kind]').forEach((button) => {
        button.addEventListener('click', () => {
            const kind = button.dataset.filterKind as State extends { activeKind: infer K } ? K : never;
            if (state.kind === 'ready') setState({ ...state, activeKind: kind });
        });
    });
};

const renderMediaItem = (item: DetectedMedia, copiedUrl: string | null, disabled: boolean) => `
    <article class="media-item">
        ${
            item.thumbnailUrl
                ? `<div class="thumb"><img src="${escapeHtml(item.thumbnailUrl)}" alt="" /></div>`
                : `<div class="media-kind">${mediaIcon(item.kind)}</div>`
        }
        <div class="media-body">
            <div class="media-label">${escapeHtml(item.label || item.kind)}</div>
            <div class="media-url" title="${escapeHtml(item.url)}">${escapeHtml(shortUrl(item.url))}</div>
            <div class="badges">
                <span>${escapeHtml(item.format || mediaIcon(item.kind))}</span>
                ${item.qualityLabel ? `<span>${escapeHtml(item.qualityLabel)}</span>` : ''}
                ${item.sizeLabel ? `<span>${escapeHtml(item.sizeLabel)}</span>` : ''}
                <span>${escapeHtml(item.source)}</span>
            </div>
        </div>
        <div class="media-actions">
            <button type="button" class="icon-button" data-copy-url="${escapeHtml(item.url)}">
                ${copiedUrl === item.url ? 'Copied' : 'Copy'}
            </button>
            <button type="button" class="primary" data-open-url="${escapeHtml(item.url)}" ${disabled ? 'disabled' : ''}>
                Open
            </button>
        </div>
    </article>
`;

const render = () => {
    if (state.kind === 'loading') {
        app.innerHTML = `
            <section class="shell">
                <header>
                    <div class="brand">FreeSaveVideo</div>
                    <div class="status">Scanning...</div>
                </header>
                <div class="empty">Looking for public media on this page.</div>
            </section>
        `;
        return;
    }

    if (state.kind === 'error') {
        app.innerHTML = `
            <section class="shell">
                <header>
                    <div class="brand">FreeSaveVideo</div>
                    <button type="button" data-action="rescan">Retry</button>
                </header>
                <div class="empty error">${escapeHtml(state.message)}</div>
            </section>
        `;
        bindActions();
        return;
    }

    const { result, copiedUrl } = state;
    const activeKind = state.activeKind;
    const youtubeBlocked = result.isYouTube || isYouTubeUrl(result.pageUrl);
    const media = result.media;
    const counts = media.reduce<Record<string, number>>((acc, item) => {
        acc[item.kind] = (acc[item.kind] || 0) + 1;
        acc.all = (acc.all || 0) + 1;
        return acc;
    }, {});
    const filterKinds: Array<{ kind: DetectedMedia['kind'] | 'all'; label: string }> = [
        { kind: 'video', label: 'Video' },
        { kind: 'playlist', label: 'Stream' },
        { kind: 'audio', label: 'Audio' },
        { kind: 'subtitle', label: 'CC' },
        { kind: 'image', label: 'Image' },
        { kind: 'all', label: 'All' },
    ];
    const visibleMedia =
        state.activeKind === 'all'
            ? media
            : media.filter((item) => item.kind === activeKind);

    app.innerHTML = `
        <section class="shell">
            <header class="topbar">
                <div class="logo-mark">FSV</div>
                <div class="brand-wrap">
                    <div class="brand">FreeSaveVideo</div>
                    <div class="page-title" title="${escapeHtml(result.pageTitle)}">${escapeHtml(result.pageTitle)}</div>
                </div>
                <button type="button" class="scan-button" data-action="rescan">Scan</button>
            </header>

            ${
                youtubeBlocked
                    ? `<section class="policy-box">
                        YouTube downloads are not supported in this extension because of Chrome Web Store policy.
                    </section>`
                    : `<section class="summary">
                        <span>${media.length} item${media.length === 1 ? '' : 's'} found</span>
                        <button type="button" data-action="open-page">Open page link</button>
                    </section>`
            }

            ${
                youtubeBlocked
                    ? ''
                    : `<nav class="filters" aria-label="Media filters">
                        ${filterKinds
                            .filter((item) => item.kind === 'all' || counts[item.kind])
                            .map(
                                (item) => `
                                    <button
                                        type="button"
                                        class="${activeKind === item.kind ? 'active' : ''}"
                                        data-filter-kind="${item.kind}"
                                    >
                                        ${escapeHtml(item.label)}
                                        <span>${counts[item.kind] || 0}</span>
                                    </button>
                                `,
                            )
                            .join('')}
                    </nav>`
            }

            ${
                visibleMedia.length
                    ? `<section class="media-list">
                        ${visibleMedia.map((item) => renderMediaItem(item, copiedUrl, youtubeBlocked)).join('')}
                    </section>`
                    : `<div class="empty">No ${activeKind === 'all' ? '' : activeKind} media found. Start playback, then scan again.</div>`
            }
        </section>
    `;
    bindActions();
};

void scanPage();
