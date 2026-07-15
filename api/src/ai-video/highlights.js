const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const cleanText = (value) => String(value || "").replace(/\s+/gu, " ").trim();

const titleFromText = (value) => {
    const text = cleanText(value);
    const sentence = text.split(/(?<=[.!?。！？])\s*/u).find(Boolean) || text;
    return sentence.slice(0, 60) || "Highlight";
};

const summaryFromText = (value) => cleanText(value).slice(0, 220) || "A concise, self-contained highlight.";

const overlapIoU = (left, right) => {
    const intersection = Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
    if (!intersection) return 0;
    const union = Math.max(left.endMs, right.endMs) - Math.min(left.startMs, right.startMs);
    return union > 0 ? intersection / union : 0;
};

export const maxHighlightClipsForDuration = (durationMs) => {
    if (durationMs <= 60_000) return 1;
    if (durationMs <= 180_000) return 2;
    if (durationMs <= 600_000) return 3;
    return 5;
};

const scoreWindow = (segments) => {
    const text = segments.map((segment) => segment.sourceText).join(" ");
    const words = text.split(/\s+/u).filter(Boolean);
    const unique = new Set(words.map((word) => word.toLocaleLowerCase())).size;
    const questions = (text.match(/[?!？！]/gu) || []).length;
    const density = words.length ? unique / words.length : 0;
    return clamp(0.35 + density * 0.4 + Math.min(0.2, questions * 0.05), 0, 0.95);
};

export const normalizeHighlightClips = ({ clips, durationMs, minSeconds = 15, maxSeconds = 90, maxClips = 5, overlapThreshold = 0.6 }) => {
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
            title: cleanText(candidate.title || "Highlight").slice(0, 120),
            reason: cleanText(candidate.reason || "A concise, self-contained highlight.").slice(0, 500),
            score: clamp(Number(candidate.score) || 0.5, 0, 1),
        });
    }
    const selected = [];
    for (const candidate of normalized.sort((a, b) => b.score - a.score)) {
        if (selected.some((existing) => overlapIoU(existing, candidate) >= overlapThreshold)) continue;
        selected.push(candidate);
        if (selected.length >= maxClips) break;
    }
    return selected;
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
            title: titleFromText(text),
            reason: summaryFromText(text),
            score: scoreWindow(window),
        });
    }
    const sorted = candidates.sort((a, b) => b.score - a.score);
    if (!sorted.length && durationMs >= minMs) {
        const startMs = 0;
        const endMs = Math.min(durationMs, maxSeconds * 1000);
        const window = segments.filter((segment) => segment.endMs > startMs && segment.startMs < endMs);
        const text = window.map((segment) => segment.sourceText).join(" ").trim();
        sorted.push({
            startMs,
            endMs,
            title: titleFromText(text),
            reason: summaryFromText(text),
            score: Math.max(0.2, scoreWindow(window)),
        });
    }
    return normalizeHighlightClips({ clips: sorted, durationMs, minSeconds, maxSeconds, maxClips });
};
