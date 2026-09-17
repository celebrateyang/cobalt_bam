const mediaHost = /(^|\.)xpccdn\.com$/i;

export function safeMediaUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && mediaHost.test(url.hostname) ? url.href : undefined;
    } catch { return undefined; }
}

export function readVideoData(html) {
    const json = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    try { return JSON.parse(json)?.props?.pageProps?.detail?.video; }
    catch { return undefined; }
}

export function selectProgressive(resource, quality = 'max') {
    const candidates = (Array.isArray(resource?.progressive) ? resource.progressive : [])
        .filter(item => safeMediaUrl(item?.url))
        .sort((a, b) => Number(b.height || 0) - Number(a.height || 0));
    const target = Number(quality);
    return target > 0
        ? candidates.find(item => Number(item.height) <= target) || candidates.at(-1)
        : candidates[0];
}

export default async function xinpianchang({ id, quality, fetchImpl = fetch }) {
    const sourceUrl = `https://www.xinpianchang.com/a${id}`;
    const request = (url, headers = {}) => fetchImpl(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: sourceUrl, ...headers },
        signal: AbortSignal.timeout(20000),
    });
    try {
        const page = await request(sourceUrl);
        if (page.status === 403 || page.status === 429) return { error: 'xinpianchang.browser_required' };
        if (page.status === 404 || page.status === 410) return { error: 'content.video.unavailable' };
        if (!page.ok) return { error: 'fetch.fail' };
        const html = await page.text();
        const video = readVideoData(html);
        if (!video?.vid || !video?.appKey) {
            return { error: /captcha|challenge|\u6821\u9a8c\u6d4f\u89c8\u5668/i.test(html)
                ? 'xinpianchang.browser_required' : 'fetch.empty' };
        }
        const endpoint = new URL(`https://mod-api.xinpianchang.com/mod/api/v2/media/${encodeURIComponent(video.vid)}`);
        endpoint.searchParams.set('appKey', video.appKey);
        const response = await request(endpoint);
        if (response.status === 403 || response.status === 429) return { error: 'xinpianchang.browser_required' };
        if (!response.ok) return { error: 'fetch.fail' };
        const data = (await response.json())?.data;
        const selected = selectProgressive(data?.resource, quality);
        if (!selected) return { error: 'fetch.empty' };
        const urls = safeMediaUrl(selected.url);
        // Signed resources can also reject the API egress even when extraction succeeds.
        const probe = await request(urls, { Range: 'bytes=0-31' });
        if (probe.status === 403 || probe.status === 401) {
            await probe.body?.cancel();
            return { error: 'xinpianchang.browser_required' };
        }
        const reader = probe.body?.getReader();
        const bytes = [];
        try {
            while (reader && bytes.length < 8) {
                const { value, done } = await reader.read();
                if (done) break;
                bytes.push(...value.slice(0, 8 - bytes.length));
            }
        } finally { await reader?.cancel(); }
        const prefix = new Uint8Array(bytes);
        if (!probe.ok || prefix.length < 8 || String.fromCharCode(...prefix.slice(4, 8)) !== 'ftyp') {
            return { error: 'fetch.fail' };
        }
        return {
            service: 'xinpianchang', urls,
            headers: { referer: sourceUrl, Range: 'bytes=0-' },
            duration: Number(data.duration) || undefined,
            fileMetadata: { title: data.title, artist: data.owner?.username },
            filenameAttributes: { service: 'xinpianchang', id: `a${id}`, title: data.title,
                author: data.owner?.username, extension: 'mp4', qualityLabel: `${selected.height || 720}p` },
        };
    } catch { return { error: 'fetch.fail' }; }
}
