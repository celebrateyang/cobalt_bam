const normalizeText = (value) => String(value || "").replace(/\r\n?/g, "\n").trim();

const pad = (value, length = 2) => String(value).padStart(length, "0");

const srtTime = (ms) => {
    const safe = Math.max(0, Math.round(ms));
    const hours = Math.floor(safe / 3_600_000);
    const minutes = Math.floor((safe % 3_600_000) / 60_000);
    const seconds = Math.floor((safe % 60_000) / 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(safe % 1000, 3)}`;
};

const vttTime = (ms) => srtTime(ms).replace(",", ".");

const assTime = (ms) => {
    const centiseconds = Math.max(0, Math.round(ms / 10));
    const hours = Math.floor(centiseconds / 360_000);
    const minutes = Math.floor((centiseconds % 360_000) / 6000);
    const seconds = Math.floor((centiseconds % 6000) / 100);
    return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds % 100)}`;
};

export const escapeAssText = (value) => normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");

const cueText = (segment, mode) => {
    const source = normalizeText(segment.sourceText);
    const translated = normalizeText(segment.translatedText);
    if (mode === "bilingual" && source && translated && source !== translated) return `${source}\n${translated}`;
    return translated || source;
};

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

const textUnits = (value) => Array.from(normalizeText(value)).reduce((total, character) =>
    total + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Thai}/u.test(character) ? 2 : 1), 0);

const splitBalanced = (value, count) => {
    const text = normalizeText(value);
    if (!text) return Array.from({ length: count }, () => "");
    if (count <= 1) return [text];
    let tokens = Array.from(wordSegmenter.segment(text), (item) => item.segment);
    if (tokens.length < count) tokens = Array.from(text);
    const parts = [];
    let cursor = 0;
    let remainingUnits = textUnits(text);
    for (let index = 0; index < count; index += 1) {
        const slotsLeft = count - index;
        const targetUnits = Math.max(1, Math.ceil(remainingUnits / slotsLeft));
        let part = "";
        let units = 0;
        while (cursor < tokens.length) {
            const token = tokens[cursor];
            const tokenUnits = textUnits(token);
            const tokensNeeded = slotsLeft - 1;
            if (part && units >= targetUnits && tokens.length - cursor > tokensNeeded) break;
            part += token;
            units += tokenUnits;
            cursor += 1;
        }
        parts.push(normalizeText(part));
        remainingUnits = Math.max(0, remainingUnits - units);
    }
    return parts;
};

const splitSegmentCues = ({ segment, clip, subtitleMode }) => {
    const startMs = Math.max(0, segment.startMs - clip.startMs);
    const endMs = Math.min(clip.endMs, segment.endMs) - clip.startMs;
    const durationMs = endMs - startMs;
    if (durationMs <= 0) return [];
    const source = normalizeText(segment.sourceText);
    const translated = normalizeText(segment.translatedText);
    const bilingual = subtitleMode === "bilingual" && source && translated && source !== translated;
    const relevant = bilingual ? [source, translated] : [translated || source];
    const maxUnits = bilingual ? 44 : 60;
    const desiredCount = Math.max(
        1,
        Math.ceil(durationMs / 3500),
        ...relevant.map((text) => Math.ceil(textUnits(text) / maxUnits)),
    );
    const count = Math.min(desiredCount, Math.max(1, Math.floor(durationMs / 1200)));
    const sourceParts = splitBalanced(source, count);
    const translatedParts = splitBalanced(translated, count);
    return Array.from({ length: count }, (_, index) => {
        const cueStart = startMs + Math.round((durationMs * index) / count);
        const cueEnd = startMs + Math.round((durationMs * (index + 1)) / count);
        const text = cueText({ sourceText: sourceParts[index], translatedText: translatedParts[index] }, subtitleMode);
        return { startMs: cueStart, endMs: cueEnd, text };
    }).filter((cue) => cue.endMs > cue.startMs && cue.text);
};

export const buildClipCues = ({ segments, clip, subtitleMode }) => (segments || [])
    .filter((segment) => segment.endMs > clip.startMs && segment.startMs < clip.endMs)
    .flatMap((segment) => splitSegmentCues({ segment, clip, subtitleMode }));

export const renderSrt = (cues) => `${cues.map((cue, index) => `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`;

export const renderVtt = (cues) => `WEBVTT\n\n${cues.map((cue) => `${vttTime(cue.startMs)} --> ${vttTime(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`;

export const renderAss = (cues, { bilingual = false } = {}) => {
    const fontSize = bilingual ? 38 : 46;
    const events = cues.map((cue) => `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,,0,0,0,,${escapeAssText(cue.text)}`).join("\n");
    return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\nCollisions: Normal\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,96,96,190,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`;
};

export const sanitizeOutputFilename = (value, fallback = "clip") => {
    const cleaned = String(value || "")
        .normalize("NFKC")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/^\.+|\.+$/g, "")
        .trim()
        .slice(0, 80);
    return cleaned || fallback;
};
