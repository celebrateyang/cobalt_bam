import { createReadStream } from "node:fs";
import OpenAI from "openai";

const getClient = () => {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error("OPENAI_API_KEY is not configured");
        error.code = "AI_VIDEO_PROVIDER_NOT_CONFIGURED";
        throw error;
    }
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || process.env.AI_VIDEO_OPENAI_BASE_URL || undefined,
        timeout: Number(process.env.AI_VIDEO_OPENAI_TIMEOUT_MS || process.env.AI_VIDEO_PROVIDER_TIMEOUT_MS || 180000),
        maxRetries: Number(process.env.AI_VIDEO_OPENAI_MAX_RETRIES || process.env.AI_VIDEO_PROVIDER_MAX_RETRIES || 2),
    });
};

const textModel = () => process.env.AI_VIDEO_TEXT_MODEL || "gpt-5-mini";
const speechModel = () => process.env.AI_VIDEO_TRANSCRIPTION_MODEL || process.env.AI_VIDEO_TRANSCRIBE_MODEL || "gpt-4o-transcribe-diarize";

const structuredResponse = async ({ name, schema, system, input }) => {
    const response = await getClient().responses.create({
        model: textModel(),
        input: [
            { role: "system", content: system },
            { role: "user", content: input },
        ],
        text: { format: { type: "json_schema", name, strict: true, schema } },
    });
    if (!response.output_text) {
        const error = new Error("Provider returned no structured output");
        error.code = "AI_VIDEO_PROVIDER_EMPTY_RESPONSE";
        throw error;
    }
    return JSON.parse(response.output_text);
};

export const openAiSpeechProvider = {
    async transcribe({ chunks, language }) {
        const model = speechModel();
        const all = [];
        for (const chunk of chunks) {
            const common = {
                file: createReadStream(chunk.path),
                model,
                ...(language && language !== "auto" ? { language } : {}),
            };
            const transcript = model === "whisper-1"
                ? await getClient().audio.transcriptions.create({
                    ...common,
                    response_format: "verbose_json",
                    timestamp_granularities: ["segment", "word"],
                })
                : await getClient().audio.transcriptions.create({
                    ...common,
                    response_format: "diarized_json",
                    chunking_strategy: "auto",
                });
            const offsetMs = chunk.offsetSeconds * 1000;
            const segments = Array.isArray(transcript.segments) ? transcript.segments : [];
            for (const segment of segments) {
                const startMs = offsetMs + Math.round(Number(segment.start) * 1000);
                const endMs = offsetMs + Math.round(Number(segment.end) * 1000);
                const words = model === "whisper-1" && Array.isArray(transcript.words)
                    ? transcript.words
                        .filter((word) => Number(word.start) >= Number(segment.start) && Number(word.end) <= Number(segment.end) + 0.01)
                        .map((word) => ({ word: word.word, startMs: offsetMs + Math.round(Number(word.start) * 1000), endMs: offsetMs + Math.round(Number(word.end) * 1000) }))
                    : null;
                if (endMs > startMs && String(segment.text || "").trim()) {
                    all.push({ startMs, endMs, sourceText: String(segment.text).trim(), speaker: segment.speaker || null, confidence: null, words });
                }
            }
        }
        return all;
    },
};

const translationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["translations"],
    properties: {
        translations: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["segmentIndex", "translatedText"],
                properties: {
                    segmentIndex: { type: "integer", minimum: 0 },
                    translatedText: { type: "string" },
                },
            },
        },
    },
};

export const openAiTranslationProvider = {
    async translate({ segments, sourceLanguage, targetLanguage }) {
        const batches = [];
        let current = [];
        let length = 0;
        for (const segment of segments) {
            const item = { segmentIndex: segment.segmentIndex, text: segment.sourceText };
            const itemLength = item.text.length + 32;
            if (current.length && length + itemLength > 24000) {
                batches.push(current);
                current = [];
                length = 0;
            }
            current.push(item);
            length += itemLength;
        }
        if (current.length) batches.push(current);
        const translations = [];
        for (const batch of batches) {
            const parsed = await structuredResponse({
                name: "ai_video_translations",
                schema: translationSchema,
                system: `Translate subtitle segments from ${sourceLanguage || "auto-detected language"} to ${targetLanguage}. Preserve meaning, tone, names, and concise subtitle phrasing. Return every segment index exactly once.`,
                input: JSON.stringify(batch),
            });
            translations.push(...parsed.translations);
        }
        const expected = new Set(segments.map((segment) => segment.segmentIndex));
        const returned = new Set(translations.map((item) => item.segmentIndex));
        if (translations.length !== expected.size || returned.size !== expected.size || translations.some((item) => !expected.has(item.segmentIndex))) {
            const error = new Error("Translation response omitted or added segments");
            error.code = "AI_VIDEO_TRANSLATION_SCHEMA_INVALID";
            throw error;
        }
        return translations;
    },
};

const highlightSchema = {
    type: "object",
    additionalProperties: false,
    required: ["clips"],
    properties: {
        clips: {
            type: "array",
            maxItems: 5,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["startMs", "endMs", "title", "reason", "score"],
                properties: {
                    startMs: { type: "integer", minimum: 0 },
                    endMs: { type: "integer", minimum: 1 },
                    title: { type: "string" },
                    reason: { type: "string" },
                    score: { type: "number", minimum: 0, maximum: 1 },
                },
            },
        },
    },
};

export const openAiHighlightProvider = {
    async suggest({ segments, minSeconds, maxSeconds, maxClips }) {
        const transcript = segments.map((segment) => ({ i: segment.segmentIndex, startMs: segment.startMs, endMs: segment.endMs, text: segment.sourceText }));
        const parsed = await structuredResponse({
            name: "ai_video_highlights",
            schema: highlightSchema,
            system: `Select up to ${maxClips} compelling, self-contained short-video clips. Returning only one clip is valid and preferred when the source is short or contains only one strong idea. Each clip must be ${minSeconds}-${maxSeconds} seconds, use exact millisecond boundaries from the transcript, avoid overlap, and never invent similar clips just to reach the limit. Use title for a short headline and reason for a concise viewer-facing summary, not the raw transcript. Favor strong hooks, complete ideas, emotional or practical value.`,
            input: JSON.stringify(transcript),
        });
        return parsed.clips;
    },
};

export const classifyProviderError = (error) => {
    const status = Number(error?.status);
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500
        || new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]).has(error?.code);
    return { retryable, detail: status ? `provider_http_${status}` : String(error?.code || "provider_error") };
};
