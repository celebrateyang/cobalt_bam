// The browser prototype can decode VP9 and Opus. Restrict clip inputs to
// separate progressive WebM tracks with known exact lengths; a manifest or an
// estimated length cannot safely back the browser's random-access device.
export function selectYoutubeClipFormats(formats, maxHeight) {
    if (!Array.isArray(formats) || !Number.isFinite(maxHeight) || maxHeight <= 0) return null;
    const usable = formats.filter(format => {
        if (!format || format.ext !== 'webm' || format.protocol !== 'https'
            || !Number.isSafeInteger(format.filesize) || format.filesize <= 0
            // The current browser build failed on an input above 2 GiB; keep
            // seeking within the tested signed 32-bit range until verified.
            || format.filesize > 0x7fffffff
            || typeof format.url !== 'string') return false;
        try { return new URL(format.url).protocol === 'https:'; } catch { return false; }
    });
    const video = usable.filter(format => /^(?:vp9|vp09)/i.test(format.vcodec || '')
        && (!format.acodec || format.acodec === 'none')
        && Number.isFinite(format.height) && format.height > 0 && format.height <= maxHeight)
        .sort((a, b) => b.height - a.height || (b.tbr || 0) - (a.tbr || 0))[0];
    const isDrc = format => /(?:^|[-_])drc(?:$|[-_])/i.test(String(format.format_id || ''))
        || /\bdrc\b/i.test(String(format.format_note || ''));
    const audio = usable.filter(format => format.vcodec === 'none'
        && /^opus(?:\b|$)/i.test(format.acodec || ''))
        .sort((a, b) => Number(isDrc(a)) - Number(isDrc(b))
            || (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
    return video && audio ? { video, audio } : null;
}
