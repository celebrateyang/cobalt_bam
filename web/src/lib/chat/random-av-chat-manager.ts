import { currentApiURL } from "$lib/api/api-url";

type MatchRole = "initiator" | "receiver";
export type ChatMatchPhase = "icebreaker" | "video_connecting" | "video";
export type ChatSelfGender = "unspecified" | "male" | "female";
export type ChatTargetGender = "any" | "male" | "female";

export type ChatMatchProfile = {
    selfGender?: ChatSelfGender;
    country?: string;
    language?: string;
    useTextIcebreaker?: boolean;
};

export type ChatMatchFilters = {
    targetGender?: ChatTargetGender;
    targetCountry?: string;
    language?: string;
    targetRegion?: "any" | "asia" | "western";
};

export type ChatMatchEnqueueOptions = {
    profile?: ChatMatchProfile;
    filters?: ChatMatchFilters;
};

type ChatEventMap = {
    error: { message: string; code?: string };
    socket_closed: undefined;
    auth_ok: undefined;
    auth_failed: { reason: string; message: string };
    enqueued: undefined;
    queue_cancelled: undefined;
    matched: {
        matchId: string;
        role: MatchRole;
        phase: ChatMatchPhase;
        icebreakerExpiresAt: number | null;
        videoExpiresAt: number | null;
        peer?: ChatMatchProfile;
    };
    text: { clientMessageId: string; text: string; sentAt: number };
    video_invited: undefined;
    video_accepted: undefined;
    phase_changed: { phase: ChatMatchPhase; videoExpiresAt: number | null };
    match_ended: { reason: string };
    local_stream: { stream: MediaStream };
    remote_stream: { stream: MediaStream };
};

type ChatEventKey = keyof ChatEventMap;

type ChatEventListener<T extends ChatEventKey> = (
    payload: ChatEventMap[T],
) => void;

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.miwifi.com" },
    { urls: "stun:stun.qq.com" },
    { urls: "stun:stun.3cx.com" },
];

export class RandomAvChatManager {
    private ws: WebSocket | null = null;

    private pc: RTCPeerConnection | null = null;

    private localStream: MediaStream | null = null;

    private remoteStream: MediaStream | null = null;

    private matchId: string | null = null;

    private role: MatchRole | null = null;

    private phase: ChatMatchPhase | null = null;

    private videoConnectedSent = false;

    private pendingIceCandidates: RTCIceCandidateInit[] = [];

    private attachedTrackIds = new Set<string>();

    private listeners = new Map<ChatEventKey, Set<ChatEventListener<any>>>();

    private authPromise:
        | {
            resolve: () => void;
            reject: (error: Error) => void;
        }
        | null = null;

    on<T extends ChatEventKey>(
        event: T,
        listener: ChatEventListener<T>,
    ): () => void {
        const bucket = this.listeners.get(event) ?? new Set();
        bucket.add(listener);
        this.listeners.set(event, bucket);

        return () => {
            bucket.delete(listener);
        };
    }

    private emit<T extends ChatEventKey>(
        event: T,
        payload: ChatEventMap[T],
    ): void {
        const bucket = this.listeners.get(event);
        if (!bucket?.size) return;

        for (const listener of bucket) {
            listener(payload);
        }
    }

    private getWebSocketURL(): string {
        if (typeof window === "undefined") {
            return "ws://localhost:9000/ws";
        }

        const api = currentApiURL();
        if (api.startsWith("/")) {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            return `${protocol}//${window.location.host}/ws`;
        }

        const parsed = new URL(api, window.location.origin);
        const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${parsed.host}/ws`;
    }

    async connect(token: string): Promise<void> {
        if (!token?.trim()) {
            throw new Error("Missing Clerk token");
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        await this.disconnect(false);

        const wsUrl = this.getWebSocketURL();

        await new Promise<void>((resolve, reject) => {
            try {
                const ws = new WebSocket(wsUrl);
                this.ws = ws;

                ws.onopen = () => {
                    this.authPromise = {
                        resolve: () => resolve(),
                        reject: (error) => reject(error),
                    };

                    this.send({
                        type: "chat_auth",
                        token,
                    });
                };

                ws.onmessage = (event) => {
                    void this.handleWsMessage(event.data);
                };

                ws.onclose = () => {
                    if (this.authPromise) {
                        this.authPromise.reject(
                            new Error("WebSocket closed before authentication"),
                        );
                        this.authPromise = null;
                    }

                    if (this.matchId) {
                        this.emit("match_ended", { reason: "peer_disconnected" });
                    }

                    this.resetCallState();
                    this.emit("socket_closed", undefined);
                    this.ws = null;
                };

                ws.onerror = () => {
                    this.emit("error", { message: "WebSocket connection failed" });
                };
            } catch (error) {
                reject(error instanceof Error ? error : new Error("Failed to connect"));
            }
        });
    }

    async startMatching(options?: ChatMatchEnqueueOptions): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        if (options?.profile?.useTextIcebreaker === false) {
            await this.ensureLocalMedia();
        }

        this.send({
            type: "chat_match_enqueue",
            profile: options?.profile,
            filters: options?.filters,
        });
    }

    async nextMatch(options?: ChatMatchEnqueueOptions): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        if (options?.profile?.useTextIcebreaker === false) {
            await this.ensureLocalMedia();
        }

        this.send({
            type: "chat_next",
            profile: options?.profile,
            filters: options?.filters,
        });
    }

    cancelMatching(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({ type: "chat_match_cancel" });
        }
        this.resetCallState();
    }

    leaveMatch(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({ type: "chat_leave" });
        }
    }

    sendText(text: string, clientMessageId: string): void {
        this.send({ type: "chat_text", text, clientMessageId });
    }

    async inviteVideo(): Promise<void> {
        await this.ensureLocalMedia();
        this.send({ type: "chat_video_invite" });
    }

    async acceptVideo(): Promise<void> {
        await this.ensureLocalMedia();
        this.send({ type: "chat_video_accept" });
    }

    declineVideo(): void {
        this.send({ type: "chat_video_decline" });
    }

    async disconnect(closeSocket = true): Promise<void> {
        this.leaveMatch();
        this.cancelMatching();
        this.resetCallState();

        if (closeSocket && this.ws) {
            this.ws.close(1000, "Manual disconnect");
            this.ws = null;
        }
    }

    private send(payload: Record<string, unknown>): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(payload));
    }

    private async handleWsMessage(raw: unknown): Promise<void> {
        let message: any = null;
        try {
            message = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
        } catch {
            this.emit("error", { message: "Invalid signaling payload" });
            return;
        }

        switch (message?.type) {
            case "chat_auth_ok":
                if (this.authPromise) {
                    this.authPromise.resolve();
                    this.authPromise = null;
                }
                this.emit("auth_ok", undefined);
                break;
            case "chat_auth_failed":
                if (this.authPromise) {
                    const authError = new Error(
                        message?.message || "Authentication failed",
                    ) as Error & { code?: string };
                    authError.code =
                        typeof message?.reason === "string"
                            ? message.reason
                            : "auth_failed";
                    this.authPromise.reject(authError);
                    this.authPromise = null;
                }
                this.emit("auth_failed", {
                    reason: message?.reason || "auth_failed",
                    message: message?.message || "Authentication failed",
                });
                this.ws?.close(4001, "auth failed");
                break;
            case "chat_enqueued":
                this.emit("enqueued", undefined);
                break;
            case "chat_queue_cancelled":
                this.emit("queue_cancelled", undefined);
                break;
            case "chat_matched":
                await this.handleMatched(message);
                break;
            case "chat_text":
                this.emit("text", {
                    clientMessageId:
                        typeof message?.clientMessageId === "string"
                            ? message.clientMessageId
                            : "",
                    text: typeof message?.text === "string" ? message.text : "",
                    sentAt: Number.isFinite(message?.sentAt)
                        ? Number(message.sentAt)
                        : Date.now(),
                });
                break;
            case "chat_video_invited":
                this.emit("video_invited", undefined);
                break;
            case "chat_video_accepted":
                this.emit("video_accepted", undefined);
                break;
            case "chat_phase_changed":
                await this.handlePhaseChanged(message);
                break;
            case "chat_offer":
                await this.handleOffer(message.offer);
                break;
            case "chat_answer":
                await this.handleAnswer(message.answer);
                break;
            case "chat_ice_candidate":
                await this.handleRemoteIceCandidate(message.candidate);
                break;
            case "chat_match_ended":
                this.emit("match_ended", { reason: message?.reason || "ended" });
                this.resetCallState();
                break;
            case "chat_error":
                this.emit("error", {
                    message: message?.message || "Signaling error",
                    code:
                        typeof message?.code === "string"
                            ? message.code
                            : undefined,
                });
                break;
            case "error":
                this.emit("error", {
                    message: message?.message || "Signaling error",
                });
                break;
            default:
                break;
        }
    }

    private async handleMatched(message: any): Promise<void> {
        const matchId =
            typeof message?.matchId === "string" ? message.matchId : "";
        const role =
            message?.role === "initiator" || message?.role === "receiver"
                ? message.role
                : null;
        const phase = this.normalizePhase(message?.phase);
        const icebreakerExpiresAt = Number.isFinite(message?.icebreakerExpiresAt)
            ? Number(message.icebreakerExpiresAt)
            : null;
        const videoExpiresAt = Number.isFinite(message?.videoExpiresAt)
            ? Number(message.videoExpiresAt)
            : null;

        if (!matchId || !role || !phase) {
            this.emit("error", { message: "Invalid match payload" });
            return;
        }

        this.matchId = matchId;
        this.role = role;
        this.phase = phase;
        this.videoConnectedSent = false;
        this.pendingIceCandidates = [];

        const peer =
            message?.peer && typeof message.peer === "object"
                ? (message.peer as ChatMatchProfile)
                : undefined;

        this.emit("matched", {
            matchId,
            role,
            phase,
            icebreakerExpiresAt,
            videoExpiresAt,
            peer,
        });

        if (phase === "video_connecting") {
            await this.startVideoNegotiation();
        }
    }

    private normalizePhase(value: unknown): ChatMatchPhase | null {
        return value === "icebreaker" ||
            value === "video_connecting" ||
            value === "video"
            ? value
            : null;
    }

    private async handlePhaseChanged(message: any): Promise<void> {
        const phase = this.normalizePhase(message?.phase);
        if (!phase || !this.matchId) return;

        this.phase = phase;
        const videoExpiresAt = Number.isFinite(message?.videoExpiresAt)
            ? Number(message.videoExpiresAt)
            : null;
        this.emit("phase_changed", { phase, videoExpiresAt });

        if (phase === "video_connecting") {
            await this.startVideoNegotiation();
        }
    }

    private async startVideoNegotiation(): Promise<void> {
        if (this.phase !== "video_connecting" && this.phase !== "video") return;
        await this.ensureLocalMedia();
        await this.ensurePeerConnection();

        if (this.role === "initiator" && !this.pc?.localDescription) {
            await this.createAndSendOffer();
        }
    }

    private async ensurePeerConnection(): Promise<void> {
        if (this.pc) return;

        const pc = new RTCPeerConnection({
            iceServers: DEFAULT_ICE_SERVERS,
            iceCandidatePoolSize: 10,
        });

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            this.send({
                type: "chat_ice_candidate",
                candidate: event.candidate,
            });
        };

        pc.ontrack = (event) => {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
            }
            this.remoteStream.addTrack(event.track);
            this.emit("remote_stream", { stream: this.remoteStream });
        };

        pc.onconnectionstatechange = () => {
            if (!this.pc) return;

            const state = this.pc.connectionState;
            if (state === "connected" && !this.videoConnectedSent) {
                this.videoConnectedSent = true;
                this.send({ type: "chat_video_connected" });
            }
            if (state === "failed" || state === "closed" || state === "disconnected") {
                this.send({ type: "chat_leave" });
                this.emit("match_ended", { reason: state });
                this.resetCallState();
            }
        };

        this.pc = pc;
        this.attachLocalTracks();
    }

    private attachLocalTracks(): void {
        if (!this.pc || !this.localStream) return;

        for (const track of this.localStream.getTracks()) {
            if (this.attachedTrackIds.has(track.id)) continue;
            this.pc.addTrack(track, this.localStream);
            this.attachedTrackIds.add(track.id);
        }
    }

    private async ensureLocalMedia(): Promise<void> {
        if (this.localStream) return;

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });
        this.localStream = stream;
        this.emit("local_stream", { stream });
        this.attachLocalTracks();
    }

    private async createAndSendOffer(): Promise<void> {
        if (!this.pc) {
            throw new Error("Peer connection is not ready");
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        this.send({
            type: "chat_offer",
            offer,
        });
    }

    private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (this.phase !== "video_connecting" && this.phase !== "video") return;
        await this.ensurePeerConnection();
        await this.ensureLocalMedia();

        if (!this.pc) {
            throw new Error("Peer connection is not ready");
        }

        await this.pc.setRemoteDescription(offer);

        if (this.pendingIceCandidates.length) {
            for (const candidate of this.pendingIceCandidates) {
                await this.pc.addIceCandidate(candidate);
            }
            this.pendingIceCandidates = [];
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.send({
            type: "chat_answer",
            answer,
        });
    }

    private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (
            !this.pc ||
            (this.phase !== "video_connecting" && this.phase !== "video")
        ) return;

        await this.pc.setRemoteDescription(answer);

        if (this.pendingIceCandidates.length) {
            for (const candidate of this.pendingIceCandidates) {
                await this.pc.addIceCandidate(candidate);
            }
            this.pendingIceCandidates = [];
        }
    }

    private async handleRemoteIceCandidate(
        candidate: RTCIceCandidateInit,
    ): Promise<void> {
        if (!candidate) return;
        if (this.phase !== "video_connecting" && this.phase !== "video") return;

        if (!this.pc || !this.pc.remoteDescription) {
            this.pendingIceCandidates.push(candidate);
            return;
        }

        await this.pc.addIceCandidate(candidate);
    }

    private resetCallState(): void {
        this.matchId = null;
        this.role = null;
        this.phase = null;
        this.videoConnectedSent = false;
        this.pendingIceCandidates = [];
        this.attachedTrackIds.clear();

        if (this.pc) {
            this.pc.onicecandidate = null;
            this.pc.ontrack = null;
            this.pc.onconnectionstatechange = null;
            this.pc.close();
            this.pc = null;
        }

        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                track.stop();
            }
            this.localStream = null;
        }

        if (this.remoteStream) {
            for (const track of this.remoteStream.getTracks()) {
                track.stop();
            }
            this.remoteStream = null;
        }
    }
}
