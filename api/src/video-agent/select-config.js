import {createHash} from "node:crypto";
export const getSelectConfig=()=>({version:"select-windows-v1",provider:"openai",model:process.env.AI_VIDEO_TEXT_MODEL || "gpt-5-mini",endpointHash:createHash("sha256").update((process.env.OPENAI_BASE_URL || process.env.AI_VIDEO_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/,"")).digest("hex"),windowMs:600000,contextMs:90000,maxInputBytes:32768,coreBytes:16000,maxCoreCues:150,maxWindows:30,maxCandidates:5,maxOutputTokens:4096});
export const selectionConfigured=()=>!!process.env.OPENAI_API_KEY;
