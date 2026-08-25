import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import WebSocket from "ws";

import {
    getChatInitialPhase,
    isMatchCompatible,
    normalizeChatPreferences,
    normalizeChatText,
    setupSignalingServer,
} from "./signaling.js";

const nextMessage = (socket, expectedType, timeoutMs = 2_000) =>
    new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for ${expectedType}`));
        }, timeoutMs);
        const onMessage = (raw) => {
            const message = JSON.parse(raw.toString());
            if (message.type !== expectedType) return;
            cleanup();
            resolve(message);
        };
        const cleanup = () => {
            clearTimeout(timeout);
            socket.off("message", onMessage);
        };
        socket.on("message", onMessage);
    });

const createHarness = async (options = {}) => {
    const server = http.createServer();
    const wss = setupSignalingServer(server, {
        verifyChatToken: async (token) => ({ sub: token }),
        getChatEligibility: async () => ({ eligible: true }),
        getChatBlockedUsers: async () => [],
        ...options,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return {
        url: `ws://127.0.0.1:${port}/ws`,
        close: async (sockets) => {
            for (const socket of sockets) socket.terminate();
            await new Promise((resolve) => wss.close(resolve));
            await new Promise((resolve) => server.close(resolve));
        },
    };
};

const openAndAuth = async (url, userId) => {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
    });
    const authenticated = nextMessage(socket, "chat_auth_ok");
    socket.send(JSON.stringify({ type: "chat_auth", token: userId }));
    await authenticated;
    return socket;
};

const enqueuePair = async (a, b, useTextA = true, useTextB = true) => {
    const matchedA = nextMessage(a, "chat_matched");
    const matchedB = nextMessage(b, "chat_matched");
    a.send(JSON.stringify({
        type: "chat_match_enqueue",
        profile: { country: "US", language: "en", useTextIcebreaker: useTextA },
        filters: { targetCountry: "ANY", targetRegion: "asia" },
    }));
    b.send(JSON.stringify({
        type: "chat_match_enqueue",
        profile: { country: "JP", language: "ja", useTextIcebreaker: useTextB },
        filters: { targetCountry: "ANY", targetRegion: "western" },
    }));
    return Promise.all([matchedA, matchedB]);
};

test("random chat preference normalization defaults to text icebreaker", () => {
    const normalized = normalizeChatPreferences({
        profile: { selfGender: "female", country: "jp", language: "JA" },
        filters: { targetGender: "male", targetCountry: "us", language: "EN" },
    });

    assert.deepEqual(normalized, {
        profile: {
            selfGender: "female",
            country: "JP",
            language: "ja",
            useTextIcebreaker: true,
        },
        filters: {
            targetGender: "male",
            targetCountry: "US",
            language: "en",
            targetRegion: "any",
        },
    });
});

test("random chat regional defaults target the complementary market", () => {
    const base = { targetGender: "any", targetCountry: "ANY", language: "" };
    assert.equal(
        isMatchCompatible(
            { ...base, targetRegion: "asia" },
            { selfGender: "female", country: "JP", language: "ja" },
        ),
        true,
    );
    assert.equal(
        isMatchCompatible(
            { ...base, targetRegion: "asia" },
            { selfGender: "female", country: "US", language: "en" },
        ),
        false,
    );
    assert.equal(
        isMatchCompatible(
            { ...base, targetRegion: "western" },
            { selfGender: "male", country: "DE", language: "de" },
        ),
        true,
    );
});

test("random chat starts video directly only when both users skip text", () => {
    for (const [a, b, expected] of [
        [true, true, "icebreaker"],
        [true, false, "icebreaker"],
        [false, true, "icebreaker"],
        [false, false, "video_connecting"],
    ]) {
        assert.equal(
            getChatInitialPhase(
                { useTextIcebreaker: a },
                { useTextIcebreaker: b },
            ),
            expected,
        );
    }
});

test("random chat text is trimmed and capped by Unicode code points", () => {
    assert.equal(normalizeChatText("  hello  "), "hello");
    assert.equal(normalizeChatText(null), "");

    const input = `${"😀".repeat(500)}extra`;
    const normalized = normalizeChatText(input);
    assert.equal(Array.from(normalized).length, 500);
    assert.equal(normalized, "😀".repeat(500));
});

test("icebreaker forwards text, blocks early WebRTC, then accepts video", async () => {
    const harness = await createHarness();
    const sockets = [];
    try {
        const a = await openAndAuth(harness.url, "user_a");
        const b = await openAndAuth(harness.url, "user_b");
        sockets.push(a, b);
        const [matchA, matchB] = await enqueuePair(a, b, false, true);
        assert.equal(matchA.phase, "icebreaker");
        assert.equal(matchB.phase, "icebreaker");

        const textAtB = nextMessage(b, "chat_text");
        a.send(JSON.stringify({ type: "chat_text", clientMessageId: "m1", text: "hello" }));
        assert.equal((await textAtB).text, "hello");

        const earlyError = nextMessage(a, "chat_error");
        a.send(JSON.stringify({ type: "chat_offer", offer: { type: "offer", sdp: "x" } }));
        assert.equal((await earlyError).code, "VIDEO_NOT_AUTHORIZED");

        const invited = nextMessage(b, "chat_video_invited");
        a.send(JSON.stringify({ type: "chat_video_invite" }));
        await invited;
        const phaseA = nextMessage(a, "chat_phase_changed");
        const phaseB = nextMessage(b, "chat_phase_changed");
        b.send(JSON.stringify({ type: "chat_video_accept" }));
        assert.equal((await phaseA).phase, "video_connecting");
        assert.equal((await phaseB).phase, "video_connecting");

        const offerAtB = nextMessage(b, "chat_offer");
        a.send(JSON.stringify({ type: "chat_offer", offer: { type: "offer", sdp: "ok" } }));
        assert.equal((await offerAtB).offer.sdp, "ok");
    } finally {
        await harness.close(sockets);
    }
});

test("declining video ends the icebreaker for both users", async () => {
    const harness = await createHarness();
    const sockets = [];
    try {
        const a = await openAndAuth(harness.url, "user_c");
        const b = await openAndAuth(harness.url, "user_d");
        sockets.push(a, b);
        await enqueuePair(a, b);
        const endedA = nextMessage(a, "chat_match_ended");
        const endedB = nextMessage(b, "chat_match_ended");
        b.send(JSON.stringify({ type: "chat_video_decline" }));
        assert.equal((await endedA).reason, "video_declined");
        assert.equal((await endedB).reason, "video_declined");
    } finally {
        await harness.close(sockets);
    }
});

test("reporting derives the peer on the server and ends the match", async () => {
    let savedReport = null;
    const harness = await createHarness({
        createChatReport: async (report) => {
            savedReport = report;
            return { id: 42 };
        },
    });
    const sockets = [];
    try {
        const a = await openAndAuth(harness.url, "reporter");
        const b = await openAndAuth(harness.url, "reported");
        sockets.push(a, b);
        const [matchA] = await enqueuePair(a, b);
        const received = nextMessage(a, "chat_report_received");
        const endedA = nextMessage(a, "chat_match_ended");
        const endedB = nextMessage(b, "chat_match_ended");

        a.send(JSON.stringify({
            type: "chat_report",
            reason: "harassment",
            details: "Repeated insults",
            reportedClerkUserId: "spoofed_user",
        }));

        assert.equal((await received).reportId, 42);
        assert.equal((await endedA).reason, "reported");
        assert.equal((await endedB).reason, "reported");
        assert.deepEqual(savedReport, {
            matchId: matchA.matchId,
            reporterClerkUserId: "reporter",
            reportedClerkUserId: "reported",
            reason: "harassment",
            details: "Repeated insults",
            phase: "icebreaker",
        });
    } finally {
        await harness.close(sockets);
    }
});

test("icebreaker timeout ends both users and direct-video requires two opt-outs", async () => {
    const timeoutHarness = await createHarness({ chatIcebreakerTtlMs: 30 });
    const timeoutSockets = [];
    try {
        const a = await openAndAuth(timeoutHarness.url, "user_e");
        const b = await openAndAuth(timeoutHarness.url, "user_f");
        timeoutSockets.push(a, b);
        const endedA = nextMessage(a, "chat_match_ended");
        const endedB = nextMessage(b, "chat_match_ended");
        await enqueuePair(a, b);
        assert.equal((await endedA).reason, "icebreaker_timeout");
        assert.equal((await endedB).reason, "icebreaker_timeout");
    } finally {
        await timeoutHarness.close(timeoutSockets);
    }

    const directHarness = await createHarness();
    const directSockets = [];
    try {
        const a = await openAndAuth(directHarness.url, "user_g");
        const b = await openAndAuth(directHarness.url, "user_h");
        directSockets.push(a, b);
        const [matchA, matchB] = await enqueuePair(a, b, false, false);
        assert.equal(matchA.phase, "video_connecting");
        assert.equal(matchB.phase, "video_connecting");
        assert.equal(matchA.icebreakerExpiresAt, null);
        assert.ok(Number.isFinite(matchA.videoExpiresAt));
    } finally {
        await directHarness.close(directSockets);
    }
});
