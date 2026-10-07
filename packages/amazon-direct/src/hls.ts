export const isAmazonMediaUrl = (value: string, extension = 'm3u8') => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
            /(^|\.)media-amazon\.com$/i.test(url.hostname) &&
            url.pathname.toLowerCase().endsWith(`.${extension}`);
    } catch { return false; }
};

export const parseAmazonPlaylist = (url: string, text: string) => {
    if (!isAmazonMediaUrl(url)) throw new Error('Unsupported Amazon media URL.');
    const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines[0] !== '#EXTM3U' || !lines.includes('#EXT-X-ENDLIST')) {
        throw new Error('This replay does not have a complete download playlist.');
    }
    if (lines.some(line => /^#EXT-X-(KEY|MAP|BYTERANGE|STREAM-INF|DISCONTINUITY)/.test(line))) {
        throw new Error('This replay uses an unsupported media format.');
    }
    const segments = lines.filter(line => !line.startsWith('#')).map(line => new URL(line, url).href);
    if (!segments.length || !segments.every(segment => isAmazonMediaUrl(segment, 'ts'))) {
        throw new Error('Invalid Amazon video segments.');
    }
    return segments;
};

// Bound memory for the browser remuxer, which holds both input and MP4 output.
const MAX_BYTES = 256 * 1024 * 1024;
export const fetchAmazonReplay = async (
    url: string,
    signal: AbortSignal,
    onProgress: (bytes: number, percent: number) => void,
) => {
    const request = async (resource: string, maxBytes: number) => {
        signal.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 30_000);
        try {
            const response = await fetch(resource, {
                signal: controller.signal, referrerPolicy: 'no-referrer', cache: 'no-store',
            });
            if (!response.ok) throw new Error(`Amazon media request failed (${response.status}).`);
            const finalUrl = response.url || resource;
            if (!isAmazonMediaUrl(finalUrl, new URL(resource).pathname.endsWith('.ts') ? 'ts' : 'm3u8')) {
                await response.body?.cancel();
                throw new Error('Unexpected Amazon media redirect.');
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Amazon returned an empty response.');
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.length;
                if (bytes > maxBytes) {
                    await reader.cancel();
                    throw new Error('This video is too large for browser MP4 processing.');
                }
                chunks.push(chunk.value);
            }
            return { url: finalUrl, bytes: new Uint8Array(await new Blob(chunks).arrayBuffer()) };
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
        }
    };
    if (!isAmazonMediaUrl(url)) throw new Error('Unsupported Amazon media URL.');
    let playlist = await request(url, 1024 * 1024);
    const masterLines = new TextDecoder().decode(playlist.bytes).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (masterLines.some(line => line.startsWith('#EXT-X-STREAM-INF:'))) {
        const variants = masterLines.flatMap((line, index) => line.startsWith('#EXT-X-STREAM-INF:') && masterLines[index + 1] && masterLines[index + 1][0] !== '#'
            ? [{ url: new URL(masterLines[index + 1], playlist.url).href, bandwidth: Number(line.match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1]) || 0 }]
            : []);
        variants.sort((a, b) => b.bandwidth - a.bandwidth);
        if (!variants.length || !isAmazonMediaUrl(variants[0].url)) throw new Error('Invalid Amazon quality playlist.');
        playlist = await request(variants[0].url, 1024 * 1024);
    }
    const segments = parseAmazonPlaylist(playlist.url, new TextDecoder().decode(playlist.bytes));
    const parts: Uint8Array[] = [];
    let size = 0;
    for (let index = 0; index < segments.length; index++) {
        const { bytes } = await request(segments[index], MAX_BYTES - size);
        // Reject an HTML error or truncated segment before creating any file.
        if (bytes.length < 188 || bytes.length % 188 || bytes[0] !== 0x47) {
            throw new Error('Amazon returned an invalid video segment.');
        }
        size += bytes.length;
        if (size > MAX_BYTES) throw new Error('This video is too large for browser MP4 processing.');
        parts.push(bytes);
        onProgress(size, ((index + 1) / segments.length) * 80);
    }
    return new Blob(parts, { type: 'video/mp2t' });
};
