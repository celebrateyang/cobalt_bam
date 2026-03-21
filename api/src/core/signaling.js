import { verifyToken } from "@clerk/express";
import { WebSocketServer } from "ws";

import { hasPaidCreditOrderByClerkUserId } from "../db/credit-orders.js";
import { Green } from "../misc/console-text.js";
import { verifyClipboardPersonalWsTicket } from "./clipboard-personal.js";

const CLIPBOARD_SESSION_TTL_MS = 30 * 60 * 1000;
const CLIPBOARD_PEER_ONLINE_WINDOW_MS = 45 * 1000;
const CHAT_MATCH_TTL_MS = 10 * 60 * 1000;
const CHAT_REQUIRE_PAID = ["1", "true", "yes", "on"].includes(
    String(process.env.CHAT_REQUIRE_PAID || "").toLowerCase().trim(),
);
const CHAT_ALLOW_SELF_MATCH = ["1", "true", "yes", "on"].includes(
    String(process.env.CHAT_ALLOW_SELF_MATCH || "").toLowerCase().trim(),
);
const CHAT_SELF_GENDERS = new Set(["unspecified", "male", "female"]);
const CHAT_TARGET_GENDERS = new Set(["any", "male", "female"]);
const CHAT_MESSAGE_TYPES = new Set([
    "chat_auth",
    "chat_match_enqueue",
    "chat_match_cancel",
    "chat_offer",
    "chat_answer",
    "chat_ice_candidate",
    "chat_leave",
    "chat_next",
]);
const CLIPBOARD_MESSAGE_TYPES = new Set([
    "create_session",
    "join_session",
    "offer",
    "answer",
    "ice_candidate",
    "disconnect",
    "file_selection_start",
    "file_selection_complete",
    "recovery",
    "keep_alive",
    "keep_alive_ack",
]);
const SYSTEM_MESSAGE_TYPES = new Set(["heartbeat", "ping", "pong"]);

// clipboard sessions (random + personal)
// sessionId -> { type, ownerClerkUserId?, creator, joiner, createdAt, updatedAt, maxPeers }
const clipboardSessions = new Map();

const isWsOpen = (ws) => !!ws && ws.readyState === ws.OPEN;

const sendJson = (ws, payload) => {
    if (!isWsOpen(ws)) return;
    ws.send(JSON.stringify(payload));
};

const classifyWsTrafficBucket = (messageType) => {
    if (!messageType) return "unknown";
    if (CHAT_MESSAGE_TYPES.has(messageType)) return "chat";
    if (CLIPBOARD_MESSAGE_TYPES.has(messageType)) return "clipboard";
    if (SYSTEM_MESSAGE_TYPES.has(messageType)) return "system";
    return "unknown";
};

const normalizeText = (value, max = 24) => {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
};

const normalizeCountry = (value) => {
    const raw = normalizeText(value, 8).toUpperCase();
    if (!raw) return "ANY";
    if (raw === "ANY") return "ANY";
    if (!/^[A-Z]{2,3}$/.test(raw)) return "ANY";
    return raw;
};

const normalizeLanguage = (value) => {
    const raw = normalizeText(value, 16).toLowerCase();
    if (!raw || raw === "auto") return "";
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(raw)) return "";
    return raw;
};

const normalizeSelfGender = (value) => {
    const raw = normalizeText(value, 16).toLowerCase();
    return CHAT_SELF_GENDERS.has(raw) ? raw : "unspecified";
};

const normalizeTargetGender = (value) => {
    const raw = normalizeText(value, 16).toLowerCase();
    return CHAT_TARGET_GENDERS.has(raw) ? raw : "any";
};

const normalizeChatPreferences = (message) => {
    const profileInput =
        message?.profile && typeof message.profile === "object"
            ? message.profile
            : {};
    const filtersInput =
        message?.filters && typeof message.filters === "object"
            ? message.filters
            : {};

    return {
        profile: {
            selfGender: normalizeSelfGender(profileInput.selfGender),
            country: normalizeCountry(profileInput.country),
            language: normalizeLanguage(profileInput.language),
        },
        filters: {
            targetGender: normalizeTargetGender(filtersInput.targetGender),
            targetCountry: normalizeCountry(filtersInput.targetCountry),
            language: normalizeLanguage(filtersInput.language),
        },
    };
};

const isMatchCompatible = (filters, peerProfile) => {
    if (
        filters.targetGender !== "any" &&
        peerProfile.selfGender !== filters.targetGender
    ) {
        return false;
    }

    if (
        filters.targetCountry !== "ANY" &&
        peerProfile.country !== filters.targetCountry
    ) {
        return false;
    }

    if (filters.language && peerProfile.language !== filters.language) {
        return false;
    }

    return true;
};

const isClipboardPeerOnline = (peer, now = Date.now()) => {
    if (!peer || !isWsOpen(peer.ws)) return false;
    return now - (peer.lastSeenAt || 0) <= CLIPBOARD_PEER_ONLINE_WINDOW_MS;
};

const getClipboardSessionOnlinePeers = (session, now = Date.now()) => {
    if (!session) return 0;
    let online = 0;
    if (isClipboardPeerOnline(session.creator, now)) online += 1;
    if (isClipboardPeerOnline(session.joiner, now)) online += 1;
    return online;
};

export const getClipboardPersonalSessionRuntime = (sessionId) => {
    const session = clipboardSessions.get(sessionId);
    if (!session || session.type !== "personal") {
        return {
            hasActiveSession: false,
            onlinePeers: 0,
            maxPeers: 2,
            expiresAt: null,
        };
    }

    const onlinePeers = getClipboardSessionOnlinePeers(session);
    return {
        hasActiveSession: onlinePeers > 0,
        onlinePeers,
        maxPeers: session.maxPeers || 2,
        expiresAt: session.createdAt + CLIPBOARD_SESSION_TTL_MS,
    };
};

export const invalidateClipboardPersonalSession = (
    sessionId,
    reason = "PERSONAL_CODE_ROTATED",
) => {
    const session = clipboardSessions.get(sessionId);
    if (!session || session.type !== "personal") {
        return {
            invalidated: false,
            kickedPeers: 0,
        };
    }

    const peers = [session.creator, session.joiner].filter(Boolean);
    let kickedPeers = 0;

    for (const peer of peers) {
        if (!peer?.ws) continue;

        if (isWsOpen(peer.ws)) {
            sendJson(peer.ws, {
                type: "error",
                code: reason,
                message: "Personal session has been invalidated",
            });
            kickedPeers += 1;
        }

        try {
            peer.ws.close(4001, reason);
        } catch {
            // ignore
        }
    }

    clipboardSessions.delete(sessionId);
    return {
        invalidated: true,
        kickedPeers,
    };
};

export const setupSignalingServer = (httpServer) => {
    const wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
    });

    // random chat queue: [{ clerkUserId, ws, enqueuedAt, profile, filters }]
    const chatQueue = [];

    // random chat matches: matchId -> { a, b, startedAt, expiresAt, timer }
    const chatMatches = new Map();

    // ws -> matchId
    const wsChatMatchId = new Map();

    const removeChatQueueByWs = (ws) => {
        let removed = false;
        for (let i = chatQueue.length - 1; i >= 0; i -= 1) {
            if (chatQueue[i].ws === ws) {
                chatQueue.splice(i, 1);
                removed = true;
            }
        }
        return removed;
    };

    const removeChatQueueByUser = (clerkUserId, keepWs = null) => {
        for (let i = chatQueue.length - 1; i >= 0; i -= 1) {
            const row = chatQueue[i];
            if (
                row.clerkUserId === clerkUserId &&
                (!keepWs || row.ws !== keepWs)
            ) {
                chatQueue.splice(i, 1);
            }
        }
    };

    const pruneChatQueue = () => {
        for (let i = chatQueue.length - 1; i >= 0; i -= 1) {
            if (!isWsOpen(chatQueue[i].ws)) {
                chatQueue.splice(i, 1);
            }
        }
    };

    const endChatMatch = (matchId, reason) => {
        const match = chatMatches.get(matchId);
        if (!match) return;

        chatMatches.delete(matchId);
        clearTimeout(match.timer);
        wsChatMatchId.delete(match.a.ws);
        wsChatMatchId.delete(match.b.ws);

        sendJson(match.a.ws, {
            type: "chat_match_ended",
            reason,
        });
        sendJson(match.b.ws, {
            type: "chat_match_ended",
            reason,
        });
    };

    const createChatMatch = (a, b) => {
        const matchId = Math.random().toString(36).slice(2, 12);
        const startedAt = Date.now();
        const expiresAt = startedAt + CHAT_MATCH_TTL_MS;

        const timer = setTimeout(() => {
            endChatMatch(matchId, "timeout");
        }, CHAT_MATCH_TTL_MS);

        const match = {
            id: matchId,
            a,
            b,
            startedAt,
            expiresAt,
            timer,
        };

        chatMatches.set(matchId, match);
        wsChatMatchId.set(a.ws, matchId);
        wsChatMatchId.set(b.ws, matchId);

        sendJson(a.ws, {
            type: "chat_matched",
            matchId,
            role: "initiator",
            expiresAt,
            peer: match.b.profile,
        });
        sendJson(b.ws, {
            type: "chat_matched",
            matchId,
            role: "receiver",
            expiresAt,
            peer: match.a.profile,
        });
    };

    const tryCreateChatMatches = () => {
        pruneChatQueue();

        while (chatQueue.length >= 2) {
            let aIndex = -1;
            let bIndex = -1;

            for (let i = 0; i < chatQueue.length; i += 1) {
                if (!isWsOpen(chatQueue[i].ws)) continue;
                aIndex = i;
                break;
            }

            if (aIndex < 0) break;

            const a = chatQueue[aIndex];
            for (let i = aIndex + 1; i < chatQueue.length; i += 1) {
                if (!isWsOpen(chatQueue[i].ws)) continue;
                if (
                    !CHAT_ALLOW_SELF_MATCH &&
                    chatQueue[i].clerkUserId === a.clerkUserId
                ) {
                    continue;
                }
                if (
                    !isMatchCompatible(a.filters, chatQueue[i].profile) ||
                    !isMatchCompatible(chatQueue[i].filters, a.profile)
                ) {
                    continue;
                }
                bIndex = i;
                break;
            }

            if (bIndex < 0) break;

            const [b] = chatQueue.splice(bIndex, 1);
            const [nextA] = chatQueue.splice(aIndex, 1);
            createChatMatch(nextA, b);
        }
    };

    const handleChatSocketClose = (ws) => {
        removeChatQueueByWs(ws);

        const matchId = wsChatMatchId.get(ws);
        if (matchId) {
            endChatMatch(matchId, "peer_disconnected");
        }
    };

    const forwardChatSignaling = (ws, type, payload) => {
        const matchId = wsChatMatchId.get(ws);
        if (!matchId) {
            sendJson(ws, {
                type: "chat_error",
                code: "NOT_IN_MATCH",
                message: "Not in an active match",
            });
            return;
        }

        const match = chatMatches.get(matchId);
        if (!match) {
            wsChatMatchId.delete(ws);
            sendJson(ws, {
                type: "chat_error",
                code: "MATCH_NOT_FOUND",
                message: "Match no longer exists",
            });
            return;
        }

        const peer = match.a.ws === ws ? match.b.ws : match.a.ws;
        if (!isWsOpen(peer)) {
            endChatMatch(matchId, "peer_disconnected");
            return;
        }

        sendJson(peer, {
            type,
            ...payload,
        });
    };

    const handleChatAuth = async (ws, message, authState) => {
        const token = typeof message?.token === "string" ? message.token.trim() : "";
        if (!token) {
            sendJson(ws, {
                type: "chat_auth_failed",
                reason: "missing_token",
                message: "Missing Clerk token",
            });
            return;
        }

        if (!process.env.CLERK_SECRET_KEY) {
            sendJson(ws, {
                type: "chat_auth_failed",
                reason: "clerk_not_configured",
                message: "Clerk is not configured on this server",
            });
            return;
        }

        try {
            const payload = await verifyToken(token, {
                secretKey: process.env.CLERK_SECRET_KEY,
            });

            const clerkUserId =
                typeof payload?.sub === "string" ? payload.sub.trim() : "";
            if (!clerkUserId) {
                sendJson(ws, {
                    type: "chat_auth_failed",
                    reason: "invalid_token",
                    message: "Invalid Clerk token",
                });
                return;
            }

            const hasPaidOrder = CHAT_REQUIRE_PAID
                ? await hasPaidCreditOrderByClerkUserId(clerkUserId)
                : true;

            if (CHAT_REQUIRE_PAID && !hasPaidOrder) {
                sendJson(ws, {
                    type: "chat_auth_failed",
                    reason: "payment_required",
                    message: "Paid order is required for random chat",
                });
                return;
            }

            authState.authenticated = true;
            authState.clerkUserId = clerkUserId;
            authState.hasPaidOrder = hasPaidOrder;

            sendJson(ws, {
                type: "chat_auth_ok",
                clerkUserId,
            });
        } catch {
            sendJson(ws, {
                type: "chat_auth_failed",
                reason: "invalid_token",
                message: "Invalid Clerk token",
            });
        }
    };

    const handleChatEnqueue = (ws, authState, message) => {
        if (!authState.authenticated || !authState.clerkUserId) {
            sendJson(ws, {
                type: "chat_error",
                code: "UNAUTHORIZED",
                message: "Authenticate before enqueuing",
            });
            return;
        }

        if (CHAT_REQUIRE_PAID && !authState.hasPaidOrder) {
            sendJson(ws, {
                type: "chat_error",
                code: "PAYMENT_REQUIRED",
                message: "Paid order is required",
            });
            return;
        }

        if (wsChatMatchId.has(ws)) {
            sendJson(ws, {
                type: "chat_error",
                code: "ALREADY_MATCHED",
                message: "Already in an active match",
            });
            return;
        }

        removeChatQueueByWs(ws);
        if (!CHAT_ALLOW_SELF_MATCH) {
            removeChatQueueByUser(authState.clerkUserId, ws);
        }
        const { profile, filters } = normalizeChatPreferences(message);

        chatQueue.push({
            clerkUserId: authState.clerkUserId,
            ws,
            enqueuedAt: Date.now(),
            profile,
            filters,
        });

        sendJson(ws, {
            type: "chat_enqueued",
        });

        tryCreateChatMatches();
    };

    const handleChatCancel = (ws) => {
        const removed = removeChatQueueByWs(ws);
        sendJson(ws, {
            type: "chat_queue_cancelled",
            removed,
        });
    };

    const handleChatLeave = (ws) => {
        const matchId = wsChatMatchId.get(ws);
        if (matchId) {
            endChatMatch(matchId, "left");
            return;
        }

        handleChatCancel(ws);
    };

    const handleChatNext = (ws, authState, message) => {
        if (!authState.authenticated || !authState.clerkUserId) {
            sendJson(ws, {
                type: "chat_error",
                code: "UNAUTHORIZED",
                message: "Authenticate before using next",
            });
            return;
        }

        if (CHAT_REQUIRE_PAID && !authState.hasPaidOrder) {
            sendJson(ws, {
                type: "chat_error",
                code: "PAYMENT_REQUIRED",
                message: "Paid order is required",
            });
            return;
        }

        const activeMatchId = wsChatMatchId.get(ws);
        if (activeMatchId) {
            endChatMatch(activeMatchId, "left");
        } else {
            removeChatQueueByWs(ws);
        }

        if (!CHAT_ALLOW_SELF_MATCH) {
            removeChatQueueByUser(authState.clerkUserId, ws);
        }
        const { profile, filters } = normalizeChatPreferences(message);

        chatQueue.push({
            clerkUserId: authState.clerkUserId,
            ws,
            enqueuedAt: Date.now(),
            profile,
            filters,
        });

        sendJson(ws, {
            type: "chat_enqueued",
        });

        tryCreateChatMatches();
    };

    console.log(
        `${Green("[✅]")} WebSocket signaling server started successfully, listening on path: /ws`,
    );

    // Clean up expired clipboard sessions.
    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of clipboardSessions.entries()) {
            const isExpired = now - session.createdAt > CLIPBOARD_SESSION_TTL_MS;
            const hasOnlinePeers = getClipboardSessionOnlinePeers(session, now) > 0;

            if (isExpired && !hasOnlinePeers) {
                clipboardSessions.delete(sessionId);
                console.log(`Cleaned up expired session: ${sessionId}`);
            }
        }
    }, 5 * 60 * 1000);

    wss.on("connection", (ws, req) => {
        const connectionId = Math.random().toString(36).slice(2, 10);
        const clientIP =
            req.headers["x-forwarded-for"] ||
            req.headers["x-real-ip"] ||
            req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "Unknown";
        const wsTrafficStats = {
            chat: 0,
            clipboard: 0,
            system: 0,
            unknown: 0,
        };
        let wsTrafficType = "unknown";
        const logPrefix = () => `[WS ${connectionId} ${wsTrafficType}]`;
        const refreshTrafficType = () => {
            const hasChat = wsTrafficStats.chat > 0;
            const hasClipboard = wsTrafficStats.clipboard > 0;
            if (hasChat && hasClipboard) return "mixed";
            if (hasChat) return "chat";
            if (hasClipboard) return "clipboard";
            return "unknown";
        };
        const trackWsTrafficType = (messageType) => {
            const bucket = classifyWsTrafficBucket(messageType);
            wsTrafficStats[bucket] += 1;
            const nextType = refreshTrafficType();
            if (nextType !== wsTrafficType) {
                wsTrafficType = nextType;
                console.log(
                    `${logPrefix()} traffic classified by message type="${messageType}"`,
                );
            }
        };
        console.log(
            `${logPrefix()} connection established: ip=${clientIP}, url=${req.url}, ua=${userAgent}`,
        );

        let sessionId = null;
        let sessionType = "random";
        let userRole = null; // 'creator' | 'joiner'
        let connectionStartTime = Date.now();
        let lastPingTime = Date.now();
        let lastPongTime = Date.now();
        let missedPongs = 0;
        const maxMissedPongs = 3;

        const chatAuthState = {
            authenticated: false,
            clerkUserId: null,
            hasPaidOrder: false,
        };

        const touchClipboardSessionPeer = () => {
            if (!sessionId || !userRole) return;
            const session = clipboardSessions.get(sessionId);
            if (!session) return;

            const peer = userRole === "creator" ? session.creator : session.joiner;
            if (!peer || peer.ws !== ws) return;

            const now = Date.now();
            peer.lastSeenAt = now;
            session.updatedAt = now;
        };

        const pingInterval = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;

            const now = Date.now();
            if (now - lastPongTime > 75_000) {
                missedPongs += 1;
                console.warn(
                    `${logPrefix()} missed pong: ip=${clientIP}, session=${sessionId || "none"}, count=${missedPongs}`,
                );

                if (missedPongs >= maxMissedPongs) {
                    console.error(
                        `${logPrefix()} too many missed pongs, closing connection: ip=${clientIP}`,
                    );
                    ws.terminate();
                    return;
                }
            }

            ws.ping();
            lastPingTime = now;
        }, 25_000);

        const healthCheckInterval = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;

            const now = Date.now();
            const connectionAge = now - connectionStartTime;
            const lastActivity = Math.min(now - lastPingTime, now - lastPongTime);

            if (connectionAge > 2 * 60 * 60 * 1000 && lastActivity > 300_000) {
                console.log(
                    `${logPrefix()} closing stale connection due to inactivity: ip=${clientIP}`,
                );
                ws.close(1000, "Connection cleanup due to inactivity");
            }
        }, 60_000);

        ws.on("pong", () => {
            lastPongTime = Date.now();
            missedPongs = 0;
            touchClipboardSessionPeer();
        });

        ws.on("message", async (data) => {
            try {
                const raw = typeof data === "string" ? data : data.toString();
                const message = JSON.parse(raw);
                const messageType =
                    typeof message?.type === "string" ? message.type : "";
                trackWsTrafficType(messageType);
                touchClipboardSessionPeer();

                switch (messageType) {
                    case "create_session":
                        handleCreateSession(ws, message);
                        break;
                    case "join_session":
                        handleJoinSession(ws, message);
                        break;
                    case "offer":
                    case "answer":
                    case "ice_candidate":
                        handleSignaling(ws, message, sessionId, userRole);
                        break;
                    case "disconnect":
                        handleDisconnect(sessionId, userRole, ws);
                        break;
                    case "keep_alive":
                        sendJson(ws, {
                            type: "keep_alive_ack",
                            message: "Keep alive acknowledged by server",
                            timestamp: Date.now(),
                        });
                        break;
                    case "keep_alive_ack":
                        break;
                    case "file_selection_start":
                    case "file_selection_complete":
                    case "recovery":
                        handleSignaling(ws, message, sessionId, userRole);
                        break;
                    case "heartbeat":
                        break;
                    case "ping":
                        sendJson(ws, { type: "pong" });
                        break;
                    case "pong":
                        lastPongTime = Date.now();
                        missedPongs = 0;
                        break;

                    case "chat_auth":
                        await handleChatAuth(ws, message, chatAuthState);
                        break;
                    case "chat_match_enqueue":
                        handleChatEnqueue(ws, chatAuthState, message);
                        break;
                    case "chat_match_cancel":
                        handleChatCancel(ws);
                        break;
                    case "chat_offer":
                        forwardChatSignaling(ws, "chat_offer", {
                            offer: message.offer,
                        });
                        break;
                    case "chat_answer":
                        forwardChatSignaling(ws, "chat_answer", {
                            answer: message.answer,
                        });
                        break;
                    case "chat_ice_candidate":
                        forwardChatSignaling(ws, "chat_ice_candidate", {
                            candidate: message.candidate,
                        });
                        break;
                    case "chat_leave":
                        handleChatLeave(ws);
                        break;
                    case "chat_next":
                        handleChatNext(ws, chatAuthState, message);
                        break;
                    default:
                        sendJson(ws, {
                            type: "error",
                            message: "Unknown message type",
                        });
                }
            } catch (error) {
                console.error(
                    `${logPrefix()} message processing error (sessionId=${sessionId || "None"}):`,
                    error,
                );
                sendJson(ws, {
                    type: "error",
                    message: "Message format error",
                });
            }
        });

        ws.on("close", (code, reason) => {
            clearInterval(pingInterval);
            clearInterval(healthCheckInterval);

            const connectionDuration = Date.now() - connectionStartTime;
            const reasonStr = reason ? reason.toString() : "No reason provided";

            console.log(
                `${logPrefix()} connection closed: code=${code}, reason="${reasonStr}", sessionId=${sessionId || "None"}, role=${userRole || "None"}, duration=${connectionDuration}ms, ip=${clientIP}, trafficStats=chat:${wsTrafficStats.chat}, clipboard:${wsTrafficStats.clipboard}, system:${wsTrafficStats.system}, unknown:${wsTrafficStats.unknown}`,
            );

            handleChatSocketClose(ws);

            if (sessionId && userRole) {
                handleDisconnect(sessionId, userRole, ws);
            }
        });

        ws.on("error", (error) => {
            console.error(
                `${logPrefix()} socket error (sessionId=${sessionId || "None"}, role=${userRole || "None"}):`,
                error.message || error,
            );
        });

        const sendClipboardError = (socket, code, message) => {
            sendJson(socket, {
                type: "error",
                code,
                message,
            });
        };

        const buildPeer = ({
            socket,
            publicKey,
            clerkUserId = null,
            deviceId = null,
        }) => ({
            ws: socket,
            publicKey,
            clerkUserId,
            deviceId,
            lastSeenAt: Date.now(),
        });

        function handleCreateSession(socket, message) {
            const now = Date.now();
            const isPersonal = message?.sessionType === "personal";

            if (isPersonal) {
                const verified = verifyClipboardPersonalWsTicket(message?.wsTicket);
                if (!verified.ok) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Invalid personal session ticket");
                    return;
                }

                const ticket = verified.payload;
                if (ticket.action !== "create") {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket action mismatch");
                    return;
                }

                if (message?.sessionId && message.sessionId !== ticket.sessionId) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket session mismatch");
                    return;
                }

                if (message?.deviceId !== ticket.deviceId) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket device mismatch");
                    return;
                }

                const targetSessionId = ticket.sessionId;
                let personalSession = clipboardSessions.get(targetSessionId);

                if (!personalSession) {
                    personalSession = {
                        type: "personal",
                        ownerClerkUserId: ticket.clerkUserId,
                        codeVersion: ticket.codeVersion,
                        creator: null,
                        joiner: null,
                        maxPeers: 2,
                        createdAt: now,
                        updatedAt: now,
                    };
                    clipboardSessions.set(targetSessionId, personalSession);
                }

                if (
                    personalSession.type !== "personal" ||
                    personalSession.ownerClerkUserId !== ticket.clerkUserId
                ) {
                    sendClipboardError(socket, "PERSONAL_SESSION_FORBIDDEN", "Session owner mismatch");
                    return;
                }

                if (
                    isClipboardPeerOnline(personalSession.creator, now) &&
                    personalSession.creator?.deviceId !== ticket.deviceId
                ) {
                    sendClipboardError(socket, "SESSION_FULL_ONLINE", "Session has no free online slot");
                    return;
                }

                sessionId = targetSessionId;
                sessionType = "personal";
                userRole = "creator";

                personalSession.creator = buildPeer({
                    socket,
                    publicKey: message.publicKey,
                    clerkUserId: ticket.clerkUserId,
                    deviceId: ticket.deviceId,
                });
                personalSession.updatedAt = now;

                sendJson(socket, {
                    type: "session_created",
                    sessionId,
                    sessionType: "personal",
                });

                if (
                    personalSession.joiner &&
                    isClipboardPeerOnline(personalSession.joiner, now)
                ) {
                    sendJson(personalSession.joiner.ws, {
                        type: "creator_reconnected",
                        publicKey: message.publicKey,
                    });

                    sendJson(socket, {
                        type: "peer_already_joined",
                        publicKey: personalSession.joiner.publicKey,
                    });
                }

                return;
            }

            if (message.existingSessionId) {
                const existingSession = clipboardSessions.get(message.existingSessionId);
                if (
                    existingSession &&
                    existingSession.type === "random" &&
                    !isClipboardPeerOnline(existingSession.creator, now)
                ) {
                    sessionId = message.existingSessionId;
                    sessionType = "random";
                    userRole = "creator";
                    existingSession.creator = buildPeer({
                        socket,
                        publicKey: message.publicKey,
                    });
                    existingSession.updatedAt = now;

                    sendJson(socket, {
                        type: "session_reconnected",
                        sessionId,
                        sessionType: "random",
                    });

                    if (
                        existingSession.joiner &&
                        isClipboardPeerOnline(existingSession.joiner, now)
                    ) {
                        sendJson(existingSession.joiner.ws, {
                            type: "creator_reconnected",
                            publicKey: message.publicKey,
                        });

                        sendJson(socket, {
                            type: "peer_already_joined",
                            publicKey: existingSession.joiner.publicKey,
                        });
                    }

                    return;
                }
            }

            sessionId = Math.random().toString(36).substring(2, 10);
            sessionType = "random";
            userRole = "creator";

            clipboardSessions.set(sessionId, {
                type: "random",
                ownerClerkUserId: null,
                codeVersion: null,
                creator: buildPeer({
                    socket,
                    publicKey: message.publicKey,
                }),
                joiner: null,
                maxPeers: 2,
                createdAt: now,
                updatedAt: now,
            });

            sendJson(socket, {
                type: "session_created",
                sessionId,
                sessionType: "random",
            });
        }

        function handleJoinSession(socket, message) {
            const now = Date.now();
            const isPersonal = message?.sessionType === "personal";
            let ticket = null;

            if (isPersonal) {
                const verified = verifyClipboardPersonalWsTicket(message?.wsTicket);
                if (!verified.ok) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Invalid personal session ticket");
                    return;
                }

                ticket = verified.payload;
                if (ticket.action !== "join") {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket action mismatch");
                    return;
                }

                if (message?.sessionId !== ticket.sessionId) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket session mismatch");
                    return;
                }

                if (message?.deviceId !== ticket.deviceId) {
                    sendClipboardError(socket, "WS_TICKET_INVALID", "Ticket device mismatch");
                    return;
                }
            }

            const targetSessionId = message?.sessionId;
            const session = clipboardSessions.get(targetSessionId);
            if (!session) {
                sendClipboardError(
                    socket,
                    "SESSION_NOT_FOUND",
                    "Session does not exist or has expired",
                );
                return;
            }

            if (!isPersonal && session.type === "personal") {
                sendClipboardError(
                    socket,
                    "PERSONAL_SESSION_FORBIDDEN",
                    "Personal session requires authenticated ticket",
                );
                return;
            }

            if (isPersonal) {
                if (
                    session.type !== "personal" ||
                    session.ownerClerkUserId !== ticket.clerkUserId
                ) {
                    sendClipboardError(
                        socket,
                        "PERSONAL_SESSION_FORBIDDEN",
                        "Session owner mismatch",
                    );
                    return;
                }
            }

            const joinerOnline = isClipboardPeerOnline(session.joiner, now);
            if (joinerOnline) {
                if (!isPersonal) {
                    sendClipboardError(socket, "SESSION_FULL_ONLINE", "Session is full");
                    return;
                }

                if (
                    session.joiner?.deviceId &&
                    message?.deviceId &&
                    session.joiner.deviceId !== message.deviceId
                ) {
                    sendClipboardError(socket, "SESSION_FULL_ONLINE", "Session is full");
                    return;
                }
            }

            sessionId = targetSessionId;
            sessionType = session.type || "random";
            userRole = "joiner";
            session.joiner = buildPeer({
                socket,
                publicKey: message.publicKey,
                clerkUserId: ticket?.clerkUserId || null,
                deviceId: message?.deviceId || ticket?.deviceId || null,
            });
            session.updatedAt = now;

            if (session.creator && isClipboardPeerOnline(session.creator, now)) {
                sendJson(session.creator.ws, {
                    type: "peer_joined",
                    publicKey: message.publicKey,
                });
                sendJson(socket, {
                    type: "session_joined",
                    sessionType,
                    sessionId,
                    publicKey: session.creator.publicKey,
                });
                return;
            }

            sendJson(socket, {
                type: "waiting_for_creator",
                message: "Waiting for creator to reconnect",
            });
        }

        function handleSignaling(socket, message, currentSessionId, currentUserRole) {
            if (!currentSessionId || !currentUserRole) {
                sendJson(socket, {
                    type: "error",
                    code: "SESSION_NOT_JOINED",
                    message: "Not joined to any session",
                });
                return;
            }

            const session = clipboardSessions.get(currentSessionId);
            if (!session) {
                sendJson(socket, {
                    type: "error",
                    code: "SESSION_NOT_FOUND",
                    message: "Session does not exist",
                });
                return;
            }

            const peer =
                currentUserRole === "creator" ? session.joiner : session.creator;
            if (peer && isWsOpen(peer.ws)) {
                sendJson(peer.ws, message);
            }
        }

        function handleDisconnect(currentSessionId, currentUserRole, currentSocket = null) {
            if (!currentSessionId) return;

            const session = clipboardSessions.get(currentSessionId);
            if (!session) return;

            const ownPeer =
                currentUserRole === "creator" ? session.creator : session.joiner;
            if (currentSocket && ownPeer?.ws !== currentSocket) {
                return;
            }

            const peer =
                currentUserRole === "creator" ? session.joiner : session.creator;
            if (peer && isWsOpen(peer.ws)) {
                sendJson(peer.ws, {
                    type: "peer_disconnected",
                });
            }

            if (currentUserRole === "creator") {
                session.creator = null;
            } else {
                session.joiner = null;
            }
            session.updatedAt = Date.now();

            if (!session.creator && !session.joiner) {
                clipboardSessions.delete(currentSessionId);
            }
        }
    });

    console.log(`${Green("[✅]")} WebSocket signaling server started successfully`);
    return wss;
};
