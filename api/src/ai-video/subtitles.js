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

export const buildClipCues = ({ segments, clip, subtitleMode }) => (segments || [])
    .filter((segment) => segment.endMs > clip.startMs && segment.startMs < clip.endMs)
    .map((segment) => ({
        startMs: Math.max(0, segment.startMs - clip.startMs),
        endMs: Math.min(clip.endMs, segment.endMs) - clip.startMs,
        text: cueText(segment, subtitleMode),
    }))
    .filter((cue) => cue.endMs > cue.startMs && cue.text);

export const renderSrt = (cues) => `${cues.map((cue, index) => `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`;

export const renderVtt = (cues) => `WEBVTT\n\n${cues.map((cue) => `${vttTime(cue.startMs)} --> ${vttTime(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`;

export const renderAss = (cues, { bilingual = false } = {}) => {
    const fontSize = bilingual ? 46 : 54;
    const events = cues.map((cue) => `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,,0,0,0,,${escapeAssText(cue.text)}`).join("\n");
    return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,70,70,150,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`;
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
