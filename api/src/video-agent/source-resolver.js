import { agentError, agentQuery } from "../db/video-agent.js";
import { createMediaImportToken, getMediaImportCandidate } from "../ai-video/media-import-token.js";
import { addSource } from "./materials.js";

const URL_PATTERN = /https:\/\/[^\s<>"'\u0000-\u001f]+/giu;
export const extractVideoUrl = (content) => {
    const matches = [...String(content).matchAll(URL_PATTERN)].map(item => item[0].replace(/[),.;!?]+$/u, ""));
    if (!matches.length) return null;
    if (matches.length !== 1 || matches[0].length > 2048) throw agentError("VIDEO_AGENT_SOURCE_AMBIGUOUS", 422, "Provide one video URL at a time");
    let parsed;
    try { parsed = new URL(matches[0]); } catch { throw agentError("VIDEO_AGENT_SOURCE_URL_INVALID", 422, "Invalid video URL"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443"))
        throw agentError("VIDEO_AGENT_SOURCE_URL_INVALID", 422, "Invalid video URL");
    return parsed.toString();
};

export const downloadSourceCandidate = async ({ url, messageId, clerkToken, signal, fetcher = fetch }) => {
    if (!clerkToken || clerkToken.length > 8192) throw agentError("VIDEO_AGENT_DOWNLOAD_AUTH_REQUIRED", 401, "Sign in to download a video URL");
    const port = Number(process.env.API_PORT || 9000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw agentError("VIDEO_AGENT_DOWNLOAD_UNAVAILABLE", 503, "Downloader port is invalid");
    const response = await fetcher(`http://127.0.0.1:${port}/`, {
        method: "POST", headers: { "content-type": "application/json", "X-Clerk-Token": clerkToken },
        body: JSON.stringify({ url, queueId: `agent_${messageId.replaceAll("-", "")}` }),
        redirect: "error", signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(120000)]),
    });
    if (!response.ok) throw agentError("VIDEO_AGENT_DOWNLOAD_FAILED", response.status >= 500 ? 503 : 422, "Video download could not be resolved");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 262144) throw agentError("VIDEO_AGENT_DOWNLOAD_FAILED", 502, "Downloader response is too large");
    const reader = response.body?.getReader();
    if (!reader) throw agentError("VIDEO_AGENT_DOWNLOAD_FAILED", 502, "Downloader response is empty");
    const chunks = []; let bytes = 0;
    try { while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 262144) throw agentError("VIDEO_AGENT_DOWNLOAD_FAILED", 502, "Downloader response is too large");
        chunks.push(part.value);
    } } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try { body = JSON.parse(raw); } catch { throw agentError("VIDEO_AGENT_DOWNLOAD_FAILED", 502, "Downloader response is invalid"); }
    const candidate = getMediaImportCandidate(body);
    if (!candidate) throw agentError("VIDEO_AGENT_DOWNLOAD_HANDOFF", 422, "Use the downloader to select a video, then import it into this project");
    return candidate;
};

export const resolveMessageSource = async ({ projectId, userId, messageId, content, clerkToken, signal, download = downloadSourceCandidate,
    importSource = addSource }) => {
    const url = extractVideoUrl(content);
    if (!url) return null;
    const existing = (await agentQuery("SELECT id,status,filename,probe,retention_until FROM video_agent_sources WHERE project_id=$1 AND origin_message_id=$2", [projectId, messageId])).rows[0];
    if (existing) return existing;
    const candidate = await download({ url, messageId, clerkToken, signal });
    const mediaImportToken = createMediaImportToken({ userId, ...candidate });
    const result = await importSource({ projectId, userId, originMessageId: messageId, body: { kind: "download_import", mediaImportToken } });
    return result.source;
};
