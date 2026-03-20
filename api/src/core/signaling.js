import { verifyToken } from "@clerk/express";
import { WebSocketServer } from "ws";

import { hasPaidCreditOrderByClerkUserId } from "../db/credit-orders.js";
import { Green } from "../misc/console-text.js";

const CLIPBOARD_SESSION_TTL_MS = 30 * 60 * 1000;
const CHAT_MATCH_TTL_MS = 10 * 60 * 1000;
const CHAT_REQUIRE_PAID = ["1", "true", "yes", "on"].includes(
    String(process.env.CHAT_REQUIRE_PAID || "").toLowerCase().trim(),
);

const isWsOpen = (ws) => !!ws && ws.readyState === ws.OPEN;

const sendJson = (ws, payload) => {
    if (!isWsOpen(ws)) return;
    ws.send(JSON.stringify(payload));
};

export const setupSignalingServer = (httpServer) => {
    const wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
    });

    // clipboard sessions: sessionId -> { creator, joiner, createdAt }
    const sessions = new Map();

    // random chat queue: [{ clerkUserId, ws, enqueuedAt }]
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
        });
        sendJson(b.ws, {
            type: "chat_matched",
            matchId,
            role: "receiver",
            expiresAt,
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
                if (chatQueue[i].clerkUserId === a.clerkUserId) continue;
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

    const handleChatEnqueue = (ws, authState) => {
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
        removeChatQueueByUser(authState.clerkUserId, ws);

        chatQueue.push({
            clerkUserId: authState.clerkUserId,
            ws,
            enqueuedAt: Date.now(),
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

    console.log(
        `${Green("[✅]")} WebSocket signaling server started successfully, listening on path: /ws`,
    );

    // Clean up expired clipboard sessions.
    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of sessions.entries()) {
            if (now - session.createdAt > CLIPBOARD_SESSION_TTL_MS) {
                sessions.delete(sessionId);
                console.log(`Cleaned up expired session: ${sessionId}`);
            }
        }
    }, 5 * 60 * 1000);

    wss.on("connection", (ws, req) => {
        const clientIP =
            req.headers["x-forwarded-for"] ||
            req.headers["x-real-ip"] ||
            req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "Unknown";
        console.log(
            `WebSocket connection established: ${clientIP}, URL: ${req.url}, User-Agent: ${userAgent}`,
        );

        let sessionId = null;
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

        const pingInterval = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;

            const now = Date.now();
            if (now - lastPongTime > 75_000) {
                missedPongs += 1;
                console.warn(
                    `Missed pong from ${clientIP} (session: ${sessionId || "none"}), count: ${missedPongs}`,
                );

                if (missedPongs >= maxMissedPongs) {
                    console.error(
                        `Too many missed pongs from ${clientIP}, closing connection`,
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
                    `Closing stale connection from ${clientIP} due to inactivity`,
                );
                ws.close(1000, "Connection cleanup due to inactivity");
            }
        }, 60_000);

        ws.on("pong", () => {
            lastPongTime = Date.now();
            missedPongs = 0;
        });

        ws.on("message", async (data) => {
            try {
                const raw = typeof data === "string" ? data : data.toString();
                const message = JSON.parse(raw);

                switch (message.type) {
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
                        handleDisconnect(sessionId, userRole);
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
                        handleChatEnqueue(ws, chatAuthState);
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
                    default:
                        sendJson(ws, {
                            type: "error",
                            message: "Unknown message type",
                        });
                }
            } catch (error) {
                console.error(
                    `WebSocket message processing error (sessionId: ${sessionId || "None"}):`,
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
                `WebSocket connection closed: code=${code}, reason="${reasonStr}", sessionId=${sessionId || "None"}, role=${userRole || "None"}, duration=${connectionDuration}ms, clientIP=${clientIP}`,
            );

            handleChatSocketClose(ws);

            if (sessionId && userRole) {
                handleDisconnect(sessionId, userRole);
            }
        });

        ws.on("error", (error) => {
            console.error(
                `WebSocket error (sessionId: ${sessionId || "None"}, role: ${userRole || "None"}):`,
                error.message || error,
            );
        });

        function handleCreateSession(socket, message) {
            if (message.existingSessionId) {
                const existingSession = sessions.get(message.existingSessionId);
                if (existingSession && !existingSession.creator) {
                    sessionId = message.existingSessionId;
                    userRole = "creator";
                    existingSession.creator = { ws: socket, publicKey: message.publicKey };

                    sendJson(socket, {
                        type: "session_reconnected",
                        sessionId,
                    });

                    if (
                        existingSession.joiner &&
                        isWsOpen(existingSession.joiner.ws)
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
            userRole = "creator";

            sessions.set(sessionId, {
                creator: { ws: socket, publicKey: message.publicKey },
                joiner: null,
                createdAt: Date.now(),
            });

            sendJson(socket, {
                type: "session_created",
                sessionId,
            });
        }

        function handleJoinSession(socket, message) {
            const session = sessions.get(message.sessionId);
            if (!session) {
                sendJson(socket, {
                    type: "error",
                    message: "Session does not exist or has expired",
                });
                return;
            }

            if (session.joiner && isWsOpen(session.joiner.ws)) {
                sendJson(socket, {
                    type: "error",
                    message: "Session is full",
                });
                return;
            }

            sessionId = message.sessionId;
            userRole = "joiner";
            session.joiner = { ws: socket, publicKey: message.publicKey };

            if (session.creator && isWsOpen(session.creator.ws)) {
                sendJson(session.creator.ws, {
                    type: "peer_joined",
                    publicKey: message.publicKey,
                });
                sendJson(socket, {
                    type: "session_joined",
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
                    message: "Not joined to any session",
                });
                return;
            }

            const session = sessions.get(currentSessionId);
            if (!session) {
                sendJson(socket, {
                    type: "error",
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

        function handleDisconnect(currentSessionId, currentUserRole) {
            if (!currentSessionId) return;

            const session = sessions.get(currentSessionId);
            if (!session) return;

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

            if (!session.creator && !session.joiner) {
                sessions.delete(currentSessionId);
            }
        }
    });

    console.log(`${Green("[✅]")} WebSocket signaling server started successfully`);
    return wss;
};
