import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";

export type AiVideoJob = {
    id: string;
    status: string;
    progress: number;
    draftRevision: number;
    sourceFilename: string | null;
    sourceDurationMs: number | null;
    sourceWidth: number | null;
    sourceHeight: number | null;
    errorCode: string | null;
    errorRetryable: boolean;
    failedStage: string | null;
    createdAt: number;
};

export type AiVideoSegment = {
    id: string;
    segmentIndex: number;
    startMs: number;
    endMs: number;
    sourceText: string;
    translatedText: string;
    speaker: string | null;
};

export type AiVideoClip = {
    id: string;
    sortOrder: number;
    startMs: number;
    endMs: number;
    title: string;
    reason: string;
    score: number;
    enabled: boolean;
    focusX: number;
};

export type AiVideoDraft = {
    job: AiVideoJob;
    segments: AiVideoSegment[];
    clips: AiVideoClip[];
    sourcePreviewUrl: string;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getClerkToken();
    if (!token) throw Object.assign(new Error("Sign in required"), { code: "SIGN_IN_REQUIRED" });
    const response = await fetch(`${currentApiURL()}/user/ai-video${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
            ...init.headers,
        },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok || (payload && payload.status !== "success")) {
        const error = Object.assign(new Error(payload?.error?.message || `Request failed (${response.status})`), {
            code: payload?.error?.code || "AI_VIDEO_REQUEST_FAILED",
            status: response.status,
            context: payload?.error?.context,
        });
        throw error;
    }
    return payload?.data as T;
};

const sha256Base64 = async (data: Blob) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer()));
    let binary = "";
    for (const byte of digest) binary += String.fromCharCode(byte);
    return btoa(binary);
};

export const createFileFingerprint = async (file: File) => {
    const sampleSize = Math.min(64 * 1024, file.size);
    const first = file.slice(0, sampleSize);
    const last = file.slice(Math.max(0, file.size - sampleSize));
    return [file.name, file.size, file.lastModified, await sha256Base64(first), await sha256Base64(last)].join(":");
};

export const listAiVideoJobs = () => request<{ jobs: AiVideoJob[] }>("/jobs?limit=20");
export const getAiVideoJob = (jobId: string) => request<{ job: AiVideoJob }>(`/jobs/${jobId}`);
export const getAiVideoDraft = (jobId: string) => request<AiVideoDraft>(`/jobs/${jobId}/draft`);

export const createAndUploadAiVideo = async ({
    file,
    sourceLanguage,
    targetLanguage,
    subtitleMode,
    onProgress,
}: {
    file: File;
    sourceLanguage: string;
    targetLanguage: string;
    subtitleMode: "translated" | "bilingual";
    onProgress: (value: number) => void;
}) => {
    const fingerprint = await createFileFingerprint(file);
    type UploadState = {
        job: AiVideoJob;
        chunkSizeBytes: number;
        committedBytes: number;
    };
    const storageKey = "fsv_ai_video_upload_v1";
    let created: UploadState | null = null;
    let saved: { jobId?: string; fingerprint?: string } | null = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); }
    catch { localStorage.removeItem(storageKey); }
    if (saved?.jobId && saved.fingerprint === fingerprint) {
        try {
            const upload = await request<{ chunkSizeBytes: number; committedBytes: number; totalBytes: number; fileFingerprint: string }>(`/jobs/${saved.jobId}/upload`);
            if (upload.fileFingerprint === fingerprint && upload.totalBytes === file.size) {
                const job = (await getAiVideoJob(saved.jobId)).job;
                created = { job, chunkSizeBytes: upload.chunkSizeBytes, committedBytes: upload.committedBytes };
            }
        } catch {
            localStorage.removeItem(storageKey);
        }
    }
    if (!created) {
        created = await request<UploadState>("/jobs", {
            method: "POST",
            body: JSON.stringify({
                sourceKind: "upload",
                filename: file.name,
                contentType: file.type || "video/mp4",
                sizeBytes: file.size,
                fileFingerprint: fingerprint,
                sourceLanguage,
                targetLanguage,
                subtitleMode,
            }),
        });
        localStorage.setItem(storageKey, JSON.stringify({ jobId: created.job.id, fingerprint }));
    }
    let offset = created.committedBytes;
    onProgress(offset / file.size);
    while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(file.size, offset + created.chunkSizeBytes));
        const digest = await sha256Base64(chunk);
        await request<void>(`/jobs/${created.job.id}/upload`, {
            method: "PUT",
            body: chunk,
            headers: {
                "Content-Type": "application/octet-stream",
                "Upload-Offset": String(offset),
                Digest: `sha-256=${digest}`,
            },
        });
        offset += chunk.size;
        onProgress(offset / file.size);
    }
    const completed = await request<{ job: AiVideoJob }>(`/jobs/${created.job.id}/upload-complete`, { method: "POST", body: "{}" });
    localStorage.removeItem(storageKey);
    return completed.job;
};

export const saveAiVideoDraft = (draft: AiVideoDraft) => request<{ job: AiVideoJob }>(`/jobs/${draft.job.id}/draft`, {
    method: "PUT",
    body: JSON.stringify({
        revision: draft.job.draftRevision,
        segments: draft.segments.map((segment) => ({ id: segment.id, segmentIndex: segment.segmentIndex, translatedText: segment.translatedText })),
        clips: draft.clips.map((clip) => ({
            id: clip.id,
            startMs: Math.round(Number(clip.startMs)),
            endMs: Math.round(Number(clip.endMs)),
            title: clip.title,
            enabled: clip.enabled,
            focusX: Number(clip.focusX),
        })),
    }),
});

export const retryAiVideoJob = (jobId: string) => request<{ job: AiVideoJob }>(`/jobs/${jobId}/retry`, { method: "POST", body: "{}" });
export const cancelAiVideoJob = (jobId: string) => request<{ job: AiVideoJob }>(`/jobs/${jobId}/cancel`, { method: "POST", body: "{}" });
