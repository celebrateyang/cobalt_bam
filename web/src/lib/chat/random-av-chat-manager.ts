import { currentApiURL } from "$lib/api/api-url";

type MatchRole = "initiator" | "receiver";
export type ChatSelfGender = "unspecified" | "male" | "female";
export type ChatTargetGender = "any" | "male" | "female";

export type ChatMatchProfile = {
    selfGender?: ChatSelfGender;
    country?: string;
    language?: string;
};

export type ChatMatchFilters = {
    targetGender?: ChatTargetGender;
    targetCountry?: string;
    language?: string;
};

export type ChatMatchEnqueueOptions = {
    profile?: ChatMatchProfile;
    filters?: ChatMatchFilters;
};

type ChatEventMap = {
    error: { message: string };
    socket_closed: undefined;
    auth_ok: undefined;
    auth_failed: { reason: string; message: string };
    enqueued: undefined;
    queue_cancelled: undefined;
    matched: {
        matchId: string;
        role: MatchRole;
        expiresAt: number;
        peer?: ChatMatchProfile;
    };
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

        await this.ensureLocalMedia();

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

        await this.ensureLocalMedia();

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
                    this.authPromise.reject(
                        new Error(message?.message || "Authentication failed"),
                    );
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
        const expiresAt = Number.isFinite(message?.expiresAt)
            ? Number(message.expiresAt)
            : Date.now() + 10 * 60 * 1000;

        if (!matchId || !role) {
            this.emit("error", { message: "Invalid match payload" });
            return;
        }

        this.matchId = matchId;
        this.role = role;
        this.pendingIceCandidates = [];

        await this.ensurePeerConnection();
        await this.ensureLocalMedia();

        const peer =
            message?.peer && typeof message.peer === "object"
                ? (message.peer as ChatMatchProfile)
                : undefined;

        this.emit("matched", { matchId, role, expiresAt, peer });

        if (role === "initiator") {
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
            if (state === "failed" || state === "closed" || state === "disconnected") {
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
        if (!this.pc) return;

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

        if (!this.pc || !this.pc.remoteDescription) {
            this.pendingIceCandidates.push(candidate);
            return;
        }

        await this.pc.addIceCandidate(candidate);
    }

    private resetCallState(): void {
        this.matchId = null;
        this.role = null;
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
