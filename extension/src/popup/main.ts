import type { AdapterStatus, DetectedMedia, PageScanResult } from '../shared/messages';
import { buildDownloadFilename } from '../downloader/filename';
import './styles.css';

type State =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; result: PageScanResult; copiedUrl: string | null; activeKind: DetectedMedia['kind'] | 'all' };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');

let state: State = { kind: 'loading' };
let scanInFlight = false;
let autoRefreshTimer: number | undefined;

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

const sendPageDownload = async (item: DetectedMedia, filename?: string) => {
    const tab = await getActiveTab();
    if (!tab.id) {
        throw new Error('No active tab found.');
    }

    const result = await chrome.runtime.sendMessage({
        type: 'FSV_PAGE_DOWNLOAD',
        tabId: tab.id,
        url: item.url,
        filename,
        media: item,
    });

    if (!result?.ok) {
        throw new Error(result?.error || 'Page-context download failed.');
    }
};

const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to load captured thumbnail.'));
        image.src = src;
    });

const cropCapturedThumbnail = async (dataUrl: string, rect: NonNullable<DetectedMedia['thumbnailRect']>, tab: chrome.tabs.Tab) => {
    const image = await loadImage(dataUrl);
    const scaleX = image.naturalWidth / Math.max(1, tab.width || image.naturalWidth);
    const scaleY = image.naturalHeight / Math.max(1, tab.height || image.naturalHeight);
    const sourceX = Math.max(0, rect.x * scaleX);
    const sourceY = Math.max(0, rect.y * scaleY);
    const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.max(1, rect.width * scaleX));
    const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.max(1, rect.height * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = 152;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
};

const withCapturedPlatformThumbnails = async (result: PageScanResult, tab: chrome.tabs.Tab): Promise<PageScanResult> => {
    if (result.platform !== 'tiktok' && result.platform !== 'instagram' && result.platform !== 'douyin') return result;
    const needsCapture = result.media.some((item) => item.kind === 'video' && !item.thumbnailUrl && item.thumbnailRect);
    if (!needsCapture) return result;

    try {
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
        const media = await Promise.all(
            result.media.map(async (item) => {
                if (item.kind !== 'video' || item.thumbnailUrl || !item.thumbnailRect) return item;
                return {
                    ...item,
                    thumbnailUrl: await cropCapturedThumbnail(screenshot, item.thumbnailRect, tab),
                };
            }),
        );
        return { ...result, media };
    } catch {
        return result;
    }
};

const scanPage = async (options: { silent?: boolean } = {}) => {
    if (scanInFlight) return;
    scanInFlight = true;
    if (!options.silent) setState({ kind: 'loading' });
    const tab = await getActiveTab();
    if (!tab.id || !tab.url) {
        scanInFlight = false;
        setState({ kind: 'error', message: 'No active tab found.' });
        return;
    }
    if (!/^https?:\/\//i.test(tab.url)) {
        scanInFlight = false;
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
        const enrichedResult = await withCapturedPlatformThumbnails(result, tab);
        const previousState = state;
        const activeKind =
            previousState.kind === 'ready' &&
            (previousState.activeKind === 'all' || enrichedResult.media.some((item) => item.kind === previousState.activeKind))
                ? previousState.activeKind
                : chooseDefaultKind(enrichedResult.media);
        setState({ kind: 'ready', result: enrichedResult, copiedUrl: null, activeKind });
    } catch {
        if (!options.silent) {
            setState({
                kind: 'error',
                message: 'This page cannot be scanned yet. Reload the tab and try again.',
            });
        }
    } finally {
        scanInFlight = false;
    }
};

const chooseDefaultKind = (media: DetectedMedia[]): DetectedMedia['kind'] | 'all' => {
    for (const kind of ['video', 'playlist', 'audio', 'image', 'subtitle'] as const) {
        if (media.some((item) => item.kind === kind)) return kind;
    }
    return 'all';
};

const downloadUrl = async (item: DetectedMedia, filename?: string) => {
    try {
        if (item.requiresPageContext) {
            await sendPageDownload(item, filename);
            return;
        }

        await chrome.runtime.sendMessage({ type: 'FSV_DOWNLOAD_URL', url: item.url, filename, media: item });
    } catch {
        await sendPageDownload(item, filename);
    }
};

const bindActions = () => {
    document.querySelectorAll<HTMLButtonElement>('[data-download-url]').forEach((button) => {
        button.addEventListener('click', () => {
            const url = button.dataset.downloadUrl;
            if (!url || state.kind !== 'ready') return;
            const item = state.result.media.find((candidate) => candidate.url === url);
            if (item) void downloadUrl(item, button.dataset.downloadFilename);
        });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-filter-kind]').forEach((button) => {
        button.addEventListener('click', () => {
            const kind = button.dataset.filterKind as State extends { activeKind: infer K } ? K : never;
            if (state.kind === 'ready') setState({ ...state, activeKind: kind });
        });
    });
};

const platformLabel = (platform: PageScanResult['platform']) =>
    platform
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');

const statusText: Record<AdapterStatus, string> = {
    ok: 'Ready to download',
    empty: 'No direct media found yet',
    needsPlayback: 'Start playback, then scan again',
    needsLogin: 'Log in on this site, then scan again',
    blockedByPlatform: 'This platform blocked the current request',
    unsupportedContent: 'This content is not supported for direct download',
    fallbackOnly: 'Showing generic fallback results',
    policyBlocked: 'Policy restricted in the extension',
};

const statusHelpText: Partial<Record<AdapterStatus, string>> = {
    needsPlayback: 'Play the target media for a moment, then scan again.',
    needsLogin: 'Sign in on this site in the current tab, then run the scan again.',
    blockedByPlatform: 'The platform did not expose a stable direct file on this page. Copy the link or open it in FreeSaveVideo.',
    unsupportedContent: 'This page may be live, private, DRM-protected, or otherwise unsupported for direct download.',
    fallbackOnly: 'The platform adapter could not produce a clean direct result, so fallback candidates are shown below.',
    policyBlocked: 'Chrome Web Store policy blocks download actions for this page in the extension.',
};

const renderMediaItem = (result: PageScanResult, item: DetectedMedia, copiedUrl: string | null, disabled: boolean) => `
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
                ${item.durationLabel ? `<span>${escapeHtml(item.durationLabel)}</span>` : ''}
            </div>
        </div>
        <div class="media-actions">
            <button
                type="button"
                class="primary"
                data-download-url="${escapeHtml(item.url)}"
                data-download-filename="${escapeHtml(buildDownloadFilename(result, item))}"
                ${disabled ? 'disabled' : ''}
            >
                Download
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
    const youtubeBlocked = result.status === 'policyBlocked';
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
            </header>

            <section class="meta-strip">
                <span class="meta-pill">${escapeHtml(platformLabel(result.platform))}</span>
                <span class="meta-text">${escapeHtml(statusText[result.status])}</span>
            </section>

            ${
                youtubeBlocked
                    ? `<section class="policy-box">
                        YouTube downloads are not supported in this extension because of Chrome Web Store policy.
                    </section>`
                    : ''
            }

            ${
                result.warnings?.length
                    ? `<section class="warning-list">
                        ${result.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join('')}
                    </section>`
                    : ''
            }

            ${
                statusHelpText[result.status]
                    ? `<section class="status-help">${escapeHtml(statusHelpText[result.status] || '')}</section>`
                    : ''
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
                        ${visibleMedia.map((item) => renderMediaItem(result, item, copiedUrl, youtubeBlocked)).join('')}
                    </section>`
                    : `<div class="empty">No ${activeKind === 'all' ? '' : activeKind} media found. Start playback, then scan again.</div>`
            }
        </section>
    `;
    bindActions();
};

void scanPage();
autoRefreshTimer = window.setInterval(() => {
    void scanPage({ silent: true });
}, 1800);

window.addEventListener('pagehide', () => {
    if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
});
