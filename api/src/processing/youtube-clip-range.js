// Validate against metadata obtained by the extractor, not client-provided duration.
export const validateYoutubeClipRange = (range, sourceDuration, durationLimit) => {
    if (!range || typeof range !== "object" || Array.isArray(range)) return null;
    const { start, end } = range;
    if (![start, end, sourceDuration, durationLimit].every(Number.isFinite)
        || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || sourceDuration <= 0 || durationLimit <= 0
        || start < 0 || end <= start || end > sourceDuration
        || end - start > durationLimit) {
        return null;
    }
    return { start, end, duration: end - start };
};
