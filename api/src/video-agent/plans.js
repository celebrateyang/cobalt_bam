import { createHash } from "node:crypto";
import { agentError } from "../db/video-agent.js";
import { AUDIO_CHUNK_CONFIG } from "./chunk-plan.js";
import { getAsrConfig } from "./asr-config.js";
import { NORMALIZE_CONFIG } from "./normalize-config.js";
import { getSelectConfig } from "./select-config.js";
import { getTranslationConfig,normalizeGlossary } from "./translation-config.js";
import {SUBTITLE_CONFIG,RENDER_CONFIG,VERIFY_CONFIG} from "./delivery-config.js";
import {estimateRunTtsBudget,getTtsConfig} from "./tts-config.js";

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
export const normalizeEdits=(value)=>{
    object(value,["baseRunId","clips","subtitles"]);
    if(Buffer.byteLength(JSON.stringify(value))>32768)invalid("Result edit snapshot is too large");
    if(!UUID.test(value.baseRunId || ""))invalid("Invalid edit base run");
    const clips=value.clips ?? {},subtitles=value.subtitles ?? {};
    if(!clips || typeof clips!=="object" || Array.isArray(clips) || Object.keys(clips).length>5 ||
        !subtitles || typeof subtitles!=="object" || Array.isArray(subtitles) || Object.keys(subtitles).length>50)invalid("Too many edits");
    for(const [id,patch] of Object.entries(clips)){
        if(!id || id.length>128 || !/^[A-Za-z0-9_-]+$/.test(id))invalid("Invalid clip id");
        object(patch,["title","focusX","startCueId","endCueId"]);
        if(patch.title!==undefined && (typeof patch.title!=="string" || !patch.title.trim() || patch.title.length>120 || /[\u0000-\u001f\u007f]/u.test(patch.title)))invalid("Invalid clip title");
        if(patch.focusX!==undefined && (typeof patch.focusX!=="number" || !Number.isFinite(patch.focusX) || patch.focusX<0 || patch.focusX>1))invalid("Invalid frame focus");
        for(const key of ["startCueId","endCueId"])if(patch[key]!==undefined && (typeof patch[key]!=="string" || patch[key].length>128 || !/^[A-Za-z0-9_-]+$/.test(patch[key])))invalid("Invalid clip boundary");
    }
    for(const [id,text] of Object.entries(subtitles))if(!id || id.length>128 || !/^[A-Za-z0-9_-]+$/.test(id) || typeof text!=="string" || !text.trim() || text.length>2048 || /[\u0000-\u001f\u007f]/u.test(text))invalid("Invalid subtitle edit");
    return {baseRunId:value.baseRunId.toLowerCase(),clips,subtitles};
};
export const normalizePlan = (input) => {
    object(input, ["sourceRef", "operation", "sourceLanguage", "targetLanguage", "clips", "video", "subtitles", "dubbing", "executionMode", "glossary", "edits"]);
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
    let voiceId=null;
    if(dubbing.enabled===true){
        if(process.env.VIDEO_AGENT_DUBBING_ENABLED!=="1")invalid("Dubbing is not available yet");
        const config=getTtsConfig();
        if(dubbing.voiceId!==config.voiceId)invalid("Unsupported dubbing voice");
        estimateRunTtsBudget({requestedCount,maxSeconds},config);
        voiceId=config.voiceId;
    }else if(dubbing.enabled!==false || (dubbing.voiceId!==undefined && dubbing.voiceId!==null))invalid("Invalid dubbing settings");
    if (input.executionMode !== undefined && input.executionMode !== "execute") invalid("Unsupported execution mode");
    return { sourceRef: input.sourceRef.toLowerCase(), operation: "highlight_clips", sourceLanguage, targetLanguage: input.targetLanguage,
        clips: { requestedCount, minSeconds, maxSeconds }, video: { aspectRatio: "9:16", preset: "tiktok" },
        subtitles: { enabled: true, mode: subtitles.mode }, glossary:normalizeGlossary(input.glossary),dubbing: { enabled:!!voiceId, voiceId }, executionMode: "execute",
        ...(input.edits?{edits:normalizeEdits(input.edits)}:{}) };
};

// Only server-defined stages/dependencies. Client plans cannot provide commands or a custom graph.
export const compilePlan = ({ plan, sourceSnapshot, revision }) => {
    const stages = ["probe", "chunk", "transcribe", "normalize", "select_clips", "translate_selected",
        ...(plan.dubbing?.enabled?["prepare_dub_text","tts","fit_dub_timeline","build_dub_subtitles"]:["build_subtitles"]),"render", "verify", "publish_results"];
    let upstreamHash = null;
    return stages.map((stage, index) => {
        const config = stage === "chunk" ? AUDIO_CHUNK_CONFIG : stage === "transcribe" ? { sourceLanguage: plan.sourceLanguage,...getAsrConfig() }
            : stage === "normalize" ? NORMALIZE_CONFIG : stage === "select_clips" ? {...getSelectConfig(),limits:plan.clips} : stage === "translate_selected" ? getTranslationConfig(plan)
            : stage === "build_subtitles" ? {...SUBTITLE_CONFIG,...plan.subtitles,...(plan.edits?{edits:plan.edits}:{})}
            : ["prepare_dub_text","tts","fit_dub_timeline","build_dub_subtitles"].includes(stage) ? {dubbing:plan.dubbing,budget:estimateRunTtsBudget(plan.clips,getTtsConfig()),tts:getTtsConfig(),...(plan.edits?{edits:plan.edits}:{})}
            : stage === "render" ? {...RENDER_CONFIG,...plan.video,...(plan.dubbing?.enabled?{dubbing:plan.dubbing}:{})} : stage === "verify" ? VERIFY_CONFIG : {};
        const seed = { pipelineVersion: PIPELINE_VERSION, source: sourceSnapshot, stage, config, upstreamHash };
        const inputHash = hashInput(seed);
        upstreamHash = inputHash;
        return { stage, ordinal: index, scopeId: "project", dependsOn: index ? [stages[index - 1]] : [],
            input: { ...seed, revision }, inputHash };
    });
};
