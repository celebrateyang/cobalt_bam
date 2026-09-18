import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";
import { createFileFingerprint } from "$lib/api/ai-video";

export type AgentProject = { id: string; title: string; status: string; revision: number; createdAt: number; updatedAt: number };
export type AgentSource = { id: string; kind: string; filename: string; mime: string; sizeBytes: number; status: string;
    errorCode: string | null; retentionUntil: number; assetId: string | null; probe: { durationSeconds: number; width: number; height: number } | null };
type UploadState = { status: string; committedBytes: number; totalBytes: number; chunkSizeBytes: number; fileFingerprint: string; expiresAt: number };
export type AgentDetail = { project: AgentProject; sources: AgentSource[] };
export const agentRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getClerkToken();
    if (!token) throw Object.assign(new Error("Sign in required"), { code: "SIGN_IN_REQUIRED" });
    const response = await fetch(`${currentApiURL()}/user/video-agent${path}`, { ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok || (payload && payload.status !== "success")) throw Object.assign(new Error(payload?.error?.message || "Request failed"), {
        code: payload?.error?.code || "VIDEO_AGENT_REQUEST_FAILED", status: response.status, context: payload?.error?.context });
    return payload?.data as T;
};
const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
export const listAgentProjects = (cursor?: string) => agentRequest<{ projects: AgentProject[]; nextCursor: string | null }>(`/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
export const createAgentProject = (title: string) => agentRequest<{ project: AgentProject }>("/projects", { method: "POST", body: JSON.stringify({ title }) });
export const getAgentProject = (id: string) => agentRequest<AgentDetail>(projectPath(id));
export const deleteAgentProject = (id: string) => agentRequest<void>(projectPath(id), { method: "DELETE" });
export const importAgentSource = (id: string, mediaImportToken: string) => agentRequest<{ source: AgentSource }>(`${projectPath(id)}/sources`, {
    method: "POST", body: JSON.stringify({ kind: "download_import", mediaImportToken }) });

export const uploadAgentSource = async ({ projectId, file, sourceId, onProgress, signal }: {
    projectId: string; file: File; sourceId?: string; onProgress: (percent: number) => void; signal: AbortSignal;
}) => {
    const fileFingerprint = await createFileFingerprint(file);
    const prefix = projectPath(projectId);
    if (!sourceId) {
        const contentType = file.type || ({ mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", m4v: "video/x-m4v" }[file.name.split(".").at(-1)?.toLowerCase() || ""]);
        const result = await agentRequest<{ source: AgentSource }>(`${prefix}/sources`, { method: "POST", signal,
            body: JSON.stringify({ kind: "upload", filename: file.name, contentType, sizeBytes: file.size, fileFingerprint }) });
        sourceId = result.source.id;
    }
    const path = `${prefix}/sources/${sourceId}`;
    let state = await agentRequest<UploadState>(`${path}/upload`, { signal });
    if (state.fileFingerprint !== fileFingerprint || state.totalBytes !== file.size) throw Object.assign(new Error("Select the original file to resume"), { code: "VIDEO_AGENT_FINGERPRINT_MISMATCH" });
    onProgress(Math.round(100 * state.committedBytes / file.size));
    while (state.committedBytes < file.size) {
        const chunk = file.slice(state.committedBytes, state.committedBytes + state.chunkSizeBytes);
        const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await chunk.arrayBuffer()));
        const digest = btoa(String.fromCharCode(...bytes));
        let committedBytes: number;
        try {
            ({ committedBytes } = await agentRequest<{ committedBytes: number }>(`${path}/upload`, { method: "PUT", body: chunk, signal,
                headers: { "Content-Type": "application/octet-stream", "Upload-Offset": String(state.committedBytes), Digest: `sha-256=${digest}` } }));
        } catch (error) {
            // A lost response or concurrent tab can leave storage ahead of the browser.
            if (signal.aborted) throw error;
            const remote = await agentRequest<UploadState>(`${path}/upload`, { signal });
            if (remote.committedBytes <= state.committedBytes) throw error;
            committedBytes = remote.committedBytes;
        }
        if (committedBytes <= state.committedBytes || committedBytes > file.size) throw new Error("Invalid upload offset");
        state = { ...state, committedBytes };
        onProgress(Math.round(100 * committedBytes / file.size));
    }
    return agentRequest<{ source: AgentSource }>(`${path}/upload-complete`, { method: "POST", body: "{}", signal });
};
export const downloadAgentAsset = async (projectId: string, assetId: string, filename: string) => {
    const path = `${projectPath(projectId)}/assets/${encodeURIComponent(assetId)}/download`;
    const signed = await agentRequest<{ url: string | null }>(`${path}?url=1`);
    if (signed.url) {
        const link = document.createElement("a");
        link.href = signed.url; link.download = filename; link.rel = "noreferrer"; link.click();
        return;
    }
    const token = await getClerkToken();
    const response = await fetch(`${currentApiURL()}/user/video-agent${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Download failed");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};
