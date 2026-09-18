import { createHash } from "node:crypto";
import { agentError } from "../db/video-agent.js";

export const PIPELINE_VERSION = "video-agent-v1";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const languages = new Set(["de", "en", "es", "fr", "id", "ja", "ko", "ru", "th", "vi", "zh"]);
const invalid = (message) => { throw agentError("VIDEO_AGENT_PLAN_INVALID", 400, message); };
const object = (value, keys) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalid("Unsupported plan fields");
};
export const canonicalJson = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
};
export const hashInput = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export const validateSettings = (input) => {
    object(input, ["sourceLanguage", "targetLanguage", "subtitleMode"]);
    if (input.sourceLanguage !== undefined && input.sourceLanguage !== "auto" && !languages.has(input.sourceLanguage)) invalid("Unsupported source language");
    if (input.targetLanguage !== undefined && !languages.has(input.targetLanguage)) invalid("Unsupported target language");
    if (input.subtitleMode !== undefined && !["translated", "bilingual"].includes(input.subtitleMode)) invalid("Unsupported subtitle mode");
    return input;
};
export const normalizePlan = (input) => {
    object(input, ["sourceRef", "operation", "sourceLanguage", "targetLanguage", "clips", "video", "subtitles", "dubbing", "executionMode"]);
    if (typeof input.sourceRef !== "string" || !UUID.test(input.sourceRef)) invalid("Invalid source reference");
    if (input.operation !== "highlight_clips") invalid("Only highlight_clips is supported in the initial pipeline");
    const sourceLanguage = input.sourceLanguage ?? "auto";
    if (sourceLanguage !== "auto" && !languages.has(sourceLanguage)) invalid("Unsupported source language");
    if (!languages.has(input.targetLanguage)) invalid("Unsupported target language");
    object(input.clips, ["requestedCount", "minSeconds", "maxSeconds"]);
    const { requestedCount, minSeconds = 15, maxSeconds = 90 } = input.clips;
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 5 || !Number.isInteger(minSeconds) || !Number.isInteger(maxSeconds)
        || minSeconds < 15 || maxSeconds > 90 || maxSeconds < minSeconds) invalid("Invalid clip limits");
    const video = input.video ?? { aspectRatio: "9:16", preset: "tiktok" };
    object(video, ["aspectRatio", "preset"]);
    if (video.aspectRatio !== "9:16" || video.preset !== "tiktok") invalid("Unsupported video preset");
    const subtitles = input.subtitles ?? { enabled: true, mode: "translated" };
    object(subtitles, ["enabled", "mode"]);
    if (subtitles.enabled !== true || !["translated", "bilingual"].includes(subtitles.mode)) invalid("Unsupported subtitle settings");
    const dubbing = input.dubbing ?? { enabled: false, voiceId: null };
    object(dubbing, ["enabled", "voiceId"]);
    if (dubbing.enabled !== false || (dubbing.voiceId !== undefined && dubbing.voiceId !== null)) invalid("Dubbing is not available yet");
    if (input.executionMode !== undefined && input.executionMode !== "execute") invalid("Unsupported execution mode");
    return { sourceRef: input.sourceRef.toLowerCase(), operation: "highlight_clips", sourceLanguage, targetLanguage: input.targetLanguage,
        clips: { requestedCount, minSeconds, maxSeconds }, video: { aspectRatio: "9:16", preset: "tiktok" },
        subtitles: { enabled: true, mode: subtitles.mode }, dubbing: { enabled: false, voiceId: null }, executionMode: "execute" };
};

// Only server-defined stages/dependencies. Client plans cannot provide commands or a custom graph.
export const compilePlan = ({ plan, sourceSnapshot, revision }) => {
    const stages = ["probe", "chunk", "transcribe", "normalize", "select_clips", "translate_selected", "build_subtitles", "render", "verify", "publish_results"];
    let upstreamHash = null;
    return stages.map((stage, index) => {
        const config = stage === "transcribe" ? { sourceLanguage: plan.sourceLanguage }
            : stage === "select_clips" ? plan.clips : stage === "translate_selected" ? { targetLanguage: plan.targetLanguage }
            : stage === "build_subtitles" ? plan.subtitles : stage === "render" ? plan.video : {};
        const seed = { pipelineVersion: PIPELINE_VERSION, source: sourceSnapshot, stage, config, upstreamHash };
        const inputHash = hashInput(seed);
        upstreamHash = inputHash;
        return { stage, ordinal: index, scopeId: "project", dependsOn: index ? [stages[index - 1]] : [],
            input: { ...seed, revision }, inputHash };
    });
};
