const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scoreWindow = (segments) => {
    const text = segments.map((segment) => segment.sourceText).join(" ");
    const words = text.split(/\s+/u).filter(Boolean);
    const unique = new Set(words.map((word) => word.toLocaleLowerCase())).size;
    const questions = (text.match(/[?!？！]/gu) || []).length;
    const density = words.length ? unique / words.length : 0;
    return clamp(0.35 + density * 0.4 + Math.min(0.2, questions * 0.05), 0, 0.95);
};

export const normalizeHighlightClips = ({ clips, durationMs, minSeconds = 15, maxSeconds = 90, maxClips = 5 }) => {
    const minMs = minSeconds * 1000;
    const maxMs = maxSeconds * 1000;
    const normalized = [];
    for (const candidate of clips || []) {
        let startMs = Math.round(Number(candidate.startMs));
        let endMs = Math.round(Number(candidate.endMs));
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
        startMs = clamp(startMs, 0, durationMs);
        endMs = clamp(endMs, 0, durationMs);
        if (endMs - startMs < minMs) {
            endMs = Math.min(durationMs, startMs + minMs);
            startMs = Math.max(0, endMs - minMs);
        }
        if (endMs - startMs > maxMs) endMs = startMs + maxMs;
        if (endMs - startMs < minMs || endMs > durationMs) continue;
        normalized.push({
            startMs,
            endMs,
            title: String(candidate.title || "Highlight").slice(0, 120),
            reason: String(candidate.reason || "High information density").slice(0, 500),
            score: clamp(Number(candidate.score) || 0.5, 0, 1),
        });
    }
    return normalized.sort((a, b) => b.score - a.score).slice(0, maxClips);
};

export const deterministicHighlights = ({ segments, durationMs, minSeconds = 15, maxSeconds = 90, maxClips = 3 }) => {
    const minMs = minSeconds * 1000;
    const targetMs = Math.min(maxSeconds * 1000, Math.max(minMs, 45_000));
    const candidates = [];
    for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
        const start = segments[startIndex].startMs;
        let endIndex = startIndex;
        while (endIndex + 1 < segments.length && segments[endIndex].endMs - start < targetMs) endIndex += 1;
        const end = Math.min(durationMs, segments[endIndex].endMs);
        if (end - start < minMs) continue;
        const window = segments.slice(startIndex, endIndex + 1);
        const text = window.map((segment) => segment.sourceText).join(" ").trim();
        candidates.push({
            startMs: start,
            endMs: Math.min(end, start + maxSeconds * 1000),
            title: text.slice(0, 80) || "Highlight",
            reason: "Selected by the deterministic fallback for complete sentences and information density.",
            score: scoreWindow(window),
        });
    }
    const sorted = candidates.sort((a, b) => b.score - a.score);
    if (sorted.length < maxClips && durationMs >= minMs) {
        const windowMs = Math.min(maxSeconds * 1000, Math.max(minMs, Math.floor(durationMs / Math.min(maxClips, Math.max(1, Math.floor(durationMs / minMs))))));
        const spread = maxClips === 1 ? 0 : Math.max(0, durationMs - windowMs) / (maxClips - 1);
        for (let index = 0; index < maxClips; index += 1) {
            const startMs = Math.round(index * spread);
            const endMs = Math.min(durationMs, startMs + windowMs);
            const window = segments.filter((segment) => segment.endMs > startMs && segment.startMs < endMs);
            const text = window.map((segment) => segment.sourceText).join(" ").trim();
            sorted.push({
                startMs,
                endMs,
                title: text.slice(0, 80) || `Highlight ${index + 1}`,
                reason: "Selected by the deterministic fallback to provide evenly distributed editable candidates.",
                score: Math.max(0.2, scoreWindow(window) - index * 0.01),
            });
        }
    }
    return normalizeHighlightClips({ clips: sorted, durationMs, minSeconds, maxSeconds, maxClips });
};
