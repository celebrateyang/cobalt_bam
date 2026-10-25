// Metadata-only estimate for the selected streams. Never treat a missing
// stream size as zero, or a live playlist bitrate as a finite file size.
export const estimateYoutubeSize = (candidates, duration) => {
    if (!candidates.length) return {};
    let total = 0;
    let source = "metadata";
    for (const candidate of candidates) {
        if (!candidate?.rangeDownloadable) return {};
        const format = candidate.format || {};
        let bytes = Number(format.filesize);
        if (!(bytes > 0 && Number.isFinite(bytes))) {
            bytes = Number(format.filesize_approx);
            source = source === "bitrate" ? source : "approximate";
        }
        if (!(bytes > 0 && Number.isFinite(bytes))) {
            const bitrate = Number(candidate.tbr);
            if (!(Number.isFinite(duration) && duration > 0 && Number.isFinite(bitrate) && bitrate > 0)) return {};
            bytes = bitrate * 1000 * duration / 8;
            source = "bitrate";
        }
        total += bytes;
    }
    if (!Number.isSafeInteger(Math.round(total)) || total <= 0) return {};
    return { estimatedSizeBytes: Math.round(total), estimatedSizeSource: source };
};
