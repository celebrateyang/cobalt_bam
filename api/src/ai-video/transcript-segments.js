const normalizeText = (value) => String(value || "").replace(/\s+/gu, " ").trim();

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export const transcriptTextUnits = (value) => Array.from(normalizeText(value)).reduce((total, character) =>
    total + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Thai}/u.test(character) ? 2 : 1), 0);

const splitBalanced = (value, count) => {
    const text = normalizeText(value);
    if (!text) return [];
    if (count <= 1) return [text];
    const targetUnits = Math.max(1, Math.ceil(transcriptTextUnits(text) / count));
    const phrases = text.match(/[^。！？!?；;，,、：:]+[。！？!?；;，,、：:]?/gu) || [text];
    let tokens = phrases.flatMap((phrase) => transcriptTextUnits(phrase) <= targetUnits * 1.35
        ? [phrase]
        : Array.from(wordSegmenter.segment(phrase), (item) => item.segment));
    if (tokens.length < count) tokens = Array.from(text);
    const parts = [];
    let cursor = 0;
    let remainingUnits = transcriptTextUnits(text);
    for (let index = 0; index < count; index += 1) {
        const slotsLeft = count - index;
        const partTargetUnits = Math.max(1, Math.ceil(remainingUnits / slotsLeft));
        let part = "";
        let units = 0;
        while (cursor < tokens.length) {
            const token = tokens[cursor];
            const tokenUnits = transcriptTextUnits(token);
            const tokensNeeded = slotsLeft - 1;
            const enoughTokensRemain = tokensNeeded > 0 && tokens.length - cursor >= tokensNeeded;
            if (part && enoughTokensRemain && (
                units >= partTargetUnits
                || (units >= partTargetUnits * 0.7 && units + tokenUnits > partTargetUnits * 1.2)
            )) break;
            part += token;
            units += tokenUnits;
            cursor += 1;
        }
        parts.push(normalizeText(part));
        remainingUnits = Math.max(0, remainingUnits - units);
    }
    return parts.filter(Boolean);
};

const sameSpeaker = (left, right) => (left?.speaker || null) === (right?.speaker || null);

const joinText = (left, right) => {
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (!a) return b;
    if (!b) return a;
    const noSpace = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]$/u.test(a)
        || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}。，、！？；：,.!?;:]/u.test(b);
    return `${a}${noSpace ? "" : " "}${b}`;
};

const mergeSegments = (left, right) => {
    const words = [...(Array.isArray(left.words) ? left.words : []), ...(Array.isArray(right.words) ? right.words : [])];
    return {
        ...left,
        startMs: Math.min(left.startMs, right.startMs),
        endMs: Math.max(left.endMs, right.endMs),
        sourceText: joinText(left.sourceText, right.sourceText),
        translatedText: joinText(left.translatedText, right.translatedText) || null,
        words: words.length ? words : null,
        confidence: left.confidence ?? right.confidence ?? null,
    };
};

const splitSegment = (segment, { maxDurationMs, minDurationMs, maxTextUnits }) => {
    const durationMs = segment.endMs - segment.startMs;
    const desiredCount = Math.max(
        1,
        Math.ceil(durationMs / maxDurationMs),
        Math.ceil(transcriptTextUnits(segment.sourceText) / maxTextUnits),
    );
    const count = Math.min(desiredCount, Math.max(1, Math.floor(durationMs / minDurationMs)));
    const sourceParts = splitBalanced(segment.sourceText, count);
    const translatedParts = splitBalanced(segment.translatedText, sourceParts.length);
    return sourceParts.map((sourceText, index) => {
        const startMs = segment.startMs + Math.round((durationMs * index) / sourceParts.length);
        const endMs = segment.startMs + Math.round((durationMs * (index + 1)) / sourceParts.length);
        const words = Array.isArray(segment.words)
            ? segment.words.filter((word) => Number(word.endMs) > startMs && Number(word.startMs) < endMs)
            : null;
        return {
            ...segment,
            startMs,
            endMs,
            sourceText,
            translatedText: translatedParts[index] || null,
            words,
        };
    });
};

export const normalizeTranscriptSegments = (segments, {
    maxDurationMs = 4000,
    minDurationMs = 700,
    maxTextUnits = 40,
    mergeGapMs = 800,
    dropNoiseDurationMs = 300,
    dropNoiseTextUnits = 18,
} = {}) => {
    const split = (segments || [])
        .map((segment) => ({
            ...segment,
            startMs: Math.max(0, Math.round(Number(segment.startMs))),
            endMs: Math.max(0, Math.round(Number(segment.endMs))),
            sourceText: normalizeText(segment.sourceText),
            translatedText: normalizeText(segment.translatedText) || null,
        }))
        .filter((segment) => segment.endMs > segment.startMs && segment.sourceText)
        .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
        .flatMap((segment) => splitSegment(segment, { maxDurationMs, minDurationMs, maxTextUnits }));

    const cleaned = [];
    for (let index = 0; index < split.length; index += 1) {
        const segment = split[index];
        const durationMs = segment.endMs - segment.startMs;
        if (durationMs >= minDurationMs) {
            cleaned.push(segment);
            continue;
        }
        const previous = cleaned.at(-1);
        if (previous && sameSpeaker(previous, segment) && segment.startMs - previous.endMs <= mergeGapMs) {
            cleaned[cleaned.length - 1] = mergeSegments(previous, segment);
            continue;
        }
        const next = split[index + 1];
        if (next && sameSpeaker(segment, next) && next.startMs - segment.endMs <= mergeGapMs) {
            split[index + 1] = mergeSegments(segment, next);
            continue;
        }
        if (durationMs <= dropNoiseDurationMs && transcriptTextUnits(segment.sourceText) <= dropNoiseTextUnits) continue;
        cleaned.push(segment);
    }

    return cleaned.map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
};
