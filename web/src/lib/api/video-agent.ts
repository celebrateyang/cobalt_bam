import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";
import { createFileFingerprint } from "$lib/api/ai-video";

export type AgentProject = { id: string; title: string; status: string; revision: number; createdAt: number; updatedAt: number };
export type AgentSource = { id: string; kind: string; filename: string; mime: string; sizeBytes: number; status: string;
    errorCode: string | null; retentionUntil: number; assetId: string | null; probe: { durationSeconds: number; width: number; height: number } | null };
type UploadState = { status: string; committedBytes: number; totalBytes: number; chunkSizeBytes: number; fileFingerprint: string; expiresAt: number };
export type AgentDetail = { project: AgentProject; sources: AgentSource[] };
export type AgentMessage = {id:string;clientMessageId:string;role:"user"|"assistant";content:string;status:"received"|"processing"|"awaiting_source"|"completed"|"failed";createdAt:number;
    outcome?:{status:"ready"|"needs_input"|"unsupported";planId:string|null;pendingSourceId:string|null;execution:{status:"started"|"blocked";runId:string|null;errorCode:string|null}|null}|null};
export type AgentPlannerOutcome = {status:"ready"|"needs_input"|"unsupported";reply:string;sourceRef:string|null;sourceExplicit:boolean;sourceLanguage:string;targetLanguage:string|null;
    targetLanguageExplicit:boolean;requestedCount:number;minSeconds:number;maxSeconds:number;subtitleMode:"translated"|"bilingual";executionIntent:"plan_only"|"execute";
    missing:("source"|"target_language")[];unsupportedCapabilities:"dubbing"[];planId?:string;revision?:number;plan?:AgentPlanInput;pendingSourceId?:string;
    execution?:{status:"started"|"blocked";runId?:string;runStatus?:string;errorCode?:string}};
export type AgentResult = {id:string;title?:string;startMs:number;endMs:number;video:{id:string};dubAudio?:{id:string}|null;
    fit?:{originalMs:number;fittedMs:number;spokenDurationMs:number;speed:number;peakDb:number;meanDb:number;timingQuality:string};subtitles:Record<string,{id:string}>};
export type AgentEditable = {runId:string;clips:{id:string;title:string;startMs:number;endMs:number;cues:{id:string;startMs:number;endMs:number;sourceText:string;translatedText:string}[]}[]};
export const getAgentResults=(projectId:string,runId:string)=>agentRequest<{results:AgentResult[];selectionShortfall:number;requiresReview?:boolean}>(`${projectPath(projectId)}/runs/${encodeURIComponent(runId)}/results`);
export const getAgentEditable=(projectId:string,runId:string)=>agentRequest<AgentEditable>(`${projectPath(projectId)}/runs/${encodeURIComponent(runId)}/editable`);
export const getAgentPreview=async(projectId:string,assetId:string)=>{
    const path=`${projectPath(projectId)}/assets/${encodeURIComponent(assetId)}/download`,signed=await agentRequest<{url:string|null}>(`${path}?url=1&preview=1`);
    if(signed.url)return signed.url;
    const token=await getClerkToken(),response=await fetch(`${currentApiURL()}/user/video-agent${path}?preview=1`,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error("Preview unavailable");return URL.createObjectURL(await response.blob());
};
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
export const listAgentMessages=(id:string,cursor?:string)=>agentRequest<{messages:AgentMessage[];nextCursor:string|null}>(`${projectPath(id)}/messages${cursor?`?cursor=${encodeURIComponent(cursor)}`:""}`);
export const saveAgentMessage=(id:string,content:string,clientMessageId:string)=>agentRequest<{message:AgentMessage}>(`${projectPath(id)}/messages`,{method:"POST",body:JSON.stringify({content,clientMessageId})});
export const planAgentMessage=(id:string,messageId:string)=>agentRequest<{message:AgentMessage;assistantMessage:AgentMessage|null;outcome:AgentPlannerOutcome;replayed:boolean}>(`${projectPath(id)}/messages/${encodeURIComponent(messageId)}/plan`,{method:"POST",body:"{}"});
export const deleteAgentProject = (id: string) => agentRequest<void>(projectPath(id), { method: "DELETE" });
export const importAgentSource = (id: string, mediaImportToken: string) => agentRequest<{ source: AgentSource }>(`${projectPath(id)}/sources`, {
    method: "POST", body: JSON.stringify({ kind: "download_import", mediaImportToken }) });

export type AgentPlanInput = {
    sourceRef: string; operation: "highlight_clips"; sourceLanguage?: string; targetLanguage: string;
    clips: { requestedCount: number; minSeconds?: number; maxSeconds?: number };
    video?: { aspectRatio: "9:16"; preset: "tiktok" };
    subtitles?: { enabled: true; mode: "translated" | "bilingual" };
    dubbing?: { enabled: boolean; voiceId: string|null }; executionMode?: "execute";
    edits?:{baseRunId:string;clips:Record<string,{title?:string;focusX?:number;startCueId?:string;endCueId?:string}>;subtitles:Record<string,string>};
};
export type AgentCommand = { expectedRevision: number; idempotencyKey: string } & (
    { type: "update_settings"; input: { sourceLanguage?: string; targetLanguage?: string; subtitleMode?: "translated" | "bilingual" } }
    | { type: "create_plan"; input: AgentPlanInput } | { type: "start_run"; input: { planId: string } }
    | { type: "cancel_run" | "retry_run"; input: { runId: string } }
    | { type:"update_clip";input:{runId:string;clipId:string;patch:{title?:string;focusX?:number;startCueId?:string;endCueId?:string}} }
    | { type:"update_subtitles";input:{runId:string;cueId:string;text:string} }
    | { type:"restore_revision";input:{revision:number} });
export type AgentReceipt = { commandId: string; status: "accepted" | "completed"; revision: number; replayed: boolean;
    planId?: string; runId?: string; runRevision?: number; runStatus?: string; admissionStatus?: "pending" | "admitted" | "rejected" };
export type AgentRun = { id: string; projectId: string; revision: number; planId: string; plan: AgentPlanInput;
    status: "queued" | "planning" | "awaiting_input" | "running" | "cancelling" | "cancelled" | "completed" | "partially_completed" | "failed";
    admissionStatus: "pending" | "admitted" | "rejected"; pipelineVersion: string; retryOfRunId: string | null;
    requestedCount: number; producedCount: number; errorCode: string | null; createdAt: number; updatedAt: number; completedAt: number | null };
export type AgentStep = { id: string; stage: string; scopeId: string; dependencies: string[];
    status: "pending" | "ready" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled" | "skipped";
    attempt: number; reusedStepId: string | null; errorCode: string | null };
export type AgentEvent = { id: string; type: string; schemaVersion: number; runId: string | null; data: Record<string, unknown>; createdAt: number };
export type AgentEvents = { events: AgentEvent[]; nextCursor: string; hasMore?: boolean; resetRequired: boolean; snapshotRequired?: boolean };
export type AgentCapabilities = { commandsEnabled: boolean; runAcceptanceEnabled: boolean; executionEnabled: boolean; pipelineReady: boolean; admissionPolicy: string; operations: string[]; dubbingEnabled: boolean;
    dubbing:{voiceId:string;maxRunChars:number;maxRunAudioMs:number;maxRunMicroUsd:number;rateMicroUsdPerMillionChars:number}|null };
export type AgentUsage = { limitSeconds: number; usedSeconds: number; reservedSeconds: number; remainingSeconds: number; periodKey: string; resetsAt: number };
export const getAgentCapabilities = () => agentRequest<AgentCapabilities>("/capabilities");
export const getAgentUsage = () => agentRequest<{ usage: AgentUsage }>("/usage");
export const submitAgentCommand = (projectId: string, command: AgentCommand) => agentRequest<AgentReceipt>(`${projectPath(projectId)}/commands`, { method: "POST", body: JSON.stringify(command) });
export const getAgentRun = (projectId: string, runId: string) => agentRequest<{ run: AgentRun; steps: AgentStep[]; eventCursor: string }>(`${projectPath(projectId)}/runs/${encodeURIComponent(runId)}`);
export const listAgentRuns = (projectId: string, cursor?: string) => agentRequest<{ runs: AgentRun[]; nextCursor: string | null }>(`${projectPath(projectId)}/runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
export const getAgentEvents = (projectId: string, after = "0", signal?: AbortSignal) => agentRequest<AgentEvents>(`${projectPath(projectId)}/events?after=${encodeURIComponent(after)}`, { signal });
export const listAgentRevisions = (projectId: string, cursor?: string) => agentRequest<{ revision: number; revisions: { revision: number; parentRevision: number | null; settings: Record<string, unknown>; edits: Record<string, unknown>; createdAt: number }[]; nextCursor: string | null }>(`${projectPath(projectId)}/revisions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
export const getAgentPlan = (projectId: string, planId: string) => agentRequest<{ plan: { id: string; revision: number; input: AgentPlanInput; pipelineVersion: string } }>(`${projectPath(projectId)}/plans/${encodeURIComponent(planId)}`);
export const getCurrentAgentPlan = (projectId:string)=>agentRequest<{revision:number;plan:{id:string;revision:number;input:AgentPlanInput;pipelineVersion:string}|null}>(`${projectPath(projectId)}/plan`);

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
