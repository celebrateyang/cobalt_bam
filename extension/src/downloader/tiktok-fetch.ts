import { isTikTokMediaUrl } from './tiktok-job';

export async function fetchTikTokBlob(url: string, signal: AbortSignal) {
    if (!isTikTokMediaUrl(url)) throw new Error('Unsupported TikTok resource.');
    const response = await fetch(url, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || (type && !type.startsWith('video/') && !['application/octet-stream', 'binary/octet-stream'].includes(type))) {
        await response.body?.cancel();
        throw new Error(`TikTok CDN did not return video (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    signal.throwIfAborted();
    // Check the actual bytes even when a CDN mislabels its error page as video.
    const prefix = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (blob.size < 12 || String.fromCharCode(...prefix.slice(4, 8)) !== 'ftyp') {
        throw new Error('TikTok CDN returned an invalid MP4 file. Try extracting the video again.');
    }
    const length = Number(response.headers.get('content-length'));
    if (!response.headers.get('content-encoding') && length > 0 && length !== blob.size) {
        throw new Error('TikTok video download was incomplete.');
    }
    return new Blob([blob], { type: 'video/mp4' });
}
