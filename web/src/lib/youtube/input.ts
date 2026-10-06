export function parseYouTubeInput(value: string): { kind: 'search'; query: string } | { kind: 'video'; url: string; id: string } | { kind: 'playlist'; url: string; id: string } | null {
    const text = value.trim();
    if (!text) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
    if (!/^(?:https?:\/\/|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)(?:\/|$))/i.test(text)) {
        return text.length >= 2 && text.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(text)
            ? { kind: 'search', query: text } : null;
    }
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        const host = url.hostname.toLowerCase();
        if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) return null;
        const list = url.searchParams.get('list');
        if (list && /^[A-Za-z0-9_-]{10,150}$/.test(list) && ['/watch', '/playlist'].includes(url.pathname)) {
            return { kind: 'playlist', id: list, url: `https://www.youtube.com/playlist?list=${list}` };
        }
        const id = host.endsWith('youtu.be') ? url.pathname.slice(1).split('/')[0]
            : url.pathname === '/watch' ? url.searchParams.get('v')
            : url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
        return { kind: 'video', id, url: `https://www.youtube.com/watch?v=${id}` };
    } catch {
        return null;
    }
}

export function formatYouTubeDuration(value: number | null) {
    if (value === null || !Number.isFinite(value) || value < 0) return '';
    const seconds = Math.floor(value);
    const minutes = Math.floor(seconds / 60);
    return minutes >= 60
        ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
        : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
