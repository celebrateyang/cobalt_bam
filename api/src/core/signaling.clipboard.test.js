import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import WebSocket from "ws";

import {
    buildClipboardPersonalSessionId,
    createClipboardPersonalWsTicket,
} from "./clipboard-personal.js";
import {
    getClipboardPersonalSessionRuntime,
    setupSignalingServer,
} from "./signaling.js";

const openSocket = async (url) => {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
    });
    return socket;
};

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

const createHarness = async () => {
    const server = http.createServer();
    const wss = setupSignalingServer(server);
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

const personalTicket = ({ owner, sessionId, deviceId, action }) =>
    createClipboardPersonalWsTicket({
        clerkUserId: owner,
        sessionId,
        deviceId,
        codeVersion: 1,
        action,
    }).token;

const connectPersonalPair = async (harness, sockets) => {
    const owner = `user_${Date.now()}_${Math.random()}`;
    const sessionId = buildClipboardPersonalSessionId(owner, 1);
    const creator = await openSocket(harness.url);
    sockets.push(creator);
    const createdPromise = nextMessage(creator, "session_created");
    creator.send(JSON.stringify({
        type: "create_session",
        sessionType: "personal",
        sessionId,
        deviceId: "creator-device",
        wsTicket: personalTicket({ owner, sessionId, deviceId: "creator-device", action: "create" }),
        publicKey: [1],
    }));
    await createdPromise;

    const joiner = await openSocket(harness.url);
    sockets.push(joiner);
    const joinedPromise = nextMessage(joiner, "session_joined");
    const peerPromise = nextMessage(creator, "peer_joined");
    joiner.send(JSON.stringify({
        type: "join_session",
        sessionType: "personal",
        sessionId,
        deviceId: "joiner-device",
        wsTicket: personalTicket({ owner, sessionId, deviceId: "joiner-device", action: "join" }),
        publicKey: [2],
    }));
    await Promise.all([joinedPromise, peerPromise]);
    return { creator, joiner, sessionId };
};

test("creator can release a random-session peer", async () => {
    const harness = await createHarness();
    const sockets = [];

    try {
        const creator = await openSocket(harness.url);
        sockets.push(creator);
        const createdPromise = nextMessage(creator, "session_created");
        creator.send(JSON.stringify({ type: "create_session", publicKey: [1] }));
        const created = await createdPromise;

        const joiner = await openSocket(harness.url);
        sockets.push(joiner);
        const joinedPromise = nextMessage(joiner, "session_joined");
        const peerJoinedPromise = nextMessage(creator, "peer_joined");
        joiner.send(JSON.stringify({
            type: "join_session",
            sessionId: created.sessionId,
            publicKey: [2],
        }));
        await Promise.all([joinedPromise, peerJoinedPromise]);

        const removedPromise = nextMessage(creator, "peer_removed");
        const replacedPromise = nextMessage(joiner, "session_replaced");
        creator.send(JSON.stringify({ type: "remove_peer" }));

        const [removed, replaced] = await Promise.all([removedPromise, replacedPromise]);
        assert.equal(removed.type, "peer_removed");
        assert.equal(replaced.code, "SESSION_REPLACED");
    } finally {
        await harness.close(sockets);
    }
});

test("a third personal-session device can replace the occupied joiner", async () => {
    const harness = await createHarness();
    const sockets = [];
    const owner = `user_${Date.now()}_${Math.random()}`;
    const sessionId = buildClipboardPersonalSessionId(owner, 1);

    try {
        const creator = await openSocket(harness.url);
        sockets.push(creator);
        const createdPromise = nextMessage(creator, "session_created");
        creator.send(JSON.stringify({
            type: "create_session",
            sessionType: "personal",
            sessionId,
            deviceId: "creator-device",
            wsTicket: personalTicket({ owner, sessionId, deviceId: "creator-device", action: "create" }),
            publicKey: [1],
        }));
        await createdPromise;

        assert.deepEqual(
            {
                action: getClipboardPersonalSessionRuntime(sessionId, "creator-device").recommendedAction,
                role: getClipboardPersonalSessionRuntime(sessionId, "creator-device").currentDeviceRole,
            },
            { action: "resume", role: "creator" },
        );
        assert.equal(
            getClipboardPersonalSessionRuntime(sessionId, "new-device").recommendedAction,
            "join",
        );

        const oldJoiner = await openSocket(harness.url);
        sockets.push(oldJoiner);
        const oldJoinedPromise = nextMessage(oldJoiner, "session_joined");
        const firstPeerPromise = nextMessage(creator, "peer_joined");
        oldJoiner.send(JSON.stringify({
            type: "join_session",
            sessionType: "personal",
            sessionId,
            deviceId: "old-device",
            wsTicket: personalTicket({ owner, sessionId, deviceId: "old-device", action: "join" }),
            publicKey: [2],
        }));
        await Promise.all([oldJoinedPromise, firstPeerPromise]);

        assert.equal(
            getClipboardPersonalSessionRuntime(sessionId, "third-device").recommendedAction,
            "manage",
        );
        assert.deepEqual(
            {
                action: getClipboardPersonalSessionRuntime(sessionId, "old-device").recommendedAction,
                role: getClipboardPersonalSessionRuntime(sessionId, "old-device").currentDeviceRole,
            },
            { action: "resume", role: "joiner" },
        );

        const replacement = await openSocket(harness.url);
        sockets.push(replacement);
        const request = {
            type: "join_session",
            sessionType: "personal",
            sessionId,
            deviceId: "new-device",
            wsTicket: personalTicket({ owner, sessionId, deviceId: "new-device", action: "join" }),
            publicKey: [3],
        };

        const fullPromise = nextMessage(replacement, "error");
        replacement.send(JSON.stringify(request));
        const full = await fullPromise;
        assert.equal(full.code, "SESSION_FULL_ONLINE");
        assert.equal(full.canReplace, true);

        const oldReplacedPromise = nextMessage(oldJoiner, "session_replaced");
        const replacementJoinedPromise = nextMessage(replacement, "session_joined");
        const secondPeerPromise = nextMessage(creator, "peer_joined");
        replacement.send(JSON.stringify({ ...request, forceReplace: true }));

        const [oldReplaced, replacementJoined] = await Promise.all([
            oldReplacedPromise,
            replacementJoinedPromise,
            secondPeerPromise,
        ]);
        assert.equal(oldReplaced.code, "SESSION_REPLACED");
        assert.equal(replacementJoined.sessionId, sessionId);
    } finally {
        await harness.close(sockets);
    }
});

test("reconnecting from the same personal device closes its stale socket", async () => {
    const harness = await createHarness();
    const sockets = [];
    const owner = `user_${Date.now()}_${Math.random()}`;
    const sessionId = buildClipboardPersonalSessionId(owner, 1);
    const deviceId = "same-device";

    try {
        const first = await openSocket(harness.url);
        sockets.push(first);
        const firstCreatedPromise = nextMessage(first, "session_created");
        first.send(JSON.stringify({
            type: "create_session",
            sessionType: "personal",
            sessionId,
            deviceId,
            wsTicket: personalTicket({ owner, sessionId, deviceId, action: "create" }),
            publicKey: [1],
        }));
        await firstCreatedPromise;

        const second = await openSocket(harness.url);
        sockets.push(second);
        const staleReplacedPromise = nextMessage(first, "session_replaced");
        const secondCreatedPromise = nextMessage(second, "session_created");
        second.send(JSON.stringify({
            type: "create_session",
            sessionType: "personal",
            sessionId,
            deviceId,
            wsTicket: personalTicket({ owner, sessionId, deviceId, action: "create" }),
            publicKey: [2],
        }));

        const [staleReplaced, secondCreated] = await Promise.all([
            staleReplacedPromise,
            secondCreatedPromise,
        ]);
        assert.equal(staleReplaced.code, "SESSION_REPLACED");
        assert.equal(secondCreated.sessionId, sessionId);
    } finally {
        await harness.close(sockets);
    }
});

test("rejoining from the same personal joiner device replaces its stale socket", async () => {
    const harness = await createHarness();
    const sockets = [];
    const owner = `user_${Date.now()}_${Math.random()}`;
    const sessionId = buildClipboardPersonalSessionId(owner, 1);
    const joinerDeviceId = "same-joiner-device";

    try {
        const creator = await openSocket(harness.url);
        sockets.push(creator);
        const createdPromise = nextMessage(creator, "session_created");
        creator.send(JSON.stringify({
            type: "create_session",
            sessionType: "personal",
            sessionId,
            deviceId: "creator-device",
            wsTicket: personalTicket({ owner, sessionId, deviceId: "creator-device", action: "create" }),
            publicKey: [1],
        }));
        await createdPromise;

        const firstJoiner = await openSocket(harness.url);
        sockets.push(firstJoiner);
        const firstJoinedPromise = nextMessage(firstJoiner, "session_joined");
        const firstPeerPromise = nextMessage(creator, "peer_joined");
        firstJoiner.send(JSON.stringify({
            type: "join_session",
            sessionType: "personal",
            sessionId,
            deviceId: joinerDeviceId,
            wsTicket: personalTicket({ owner, sessionId, deviceId: joinerDeviceId, action: "join" }),
            publicKey: [2],
        }));
        await Promise.all([firstJoinedPromise, firstPeerPromise]);

        const secondJoiner = await openSocket(harness.url);
        sockets.push(secondJoiner);
        const staleReplacedPromise = nextMessage(firstJoiner, "session_replaced");
        const secondJoinedPromise = nextMessage(secondJoiner, "session_joined");
        const secondPeerPromise = nextMessage(creator, "peer_joined");
        secondJoiner.send(JSON.stringify({
            type: "join_session",
            sessionType: "personal",
            sessionId,
            deviceId: joinerDeviceId,
            wsTicket: personalTicket({ owner, sessionId, deviceId: joinerDeviceId, action: "join" }),
            publicKey: [3],
        }));

        const [staleReplaced, secondJoined] = await Promise.all([
            staleReplacedPromise,
            secondJoinedPromise,
            secondPeerPromise,
        ]);
        assert.equal(staleReplaced.code, "SESSION_REPLACED");
        assert.equal(secondJoined.sessionId, sessionId);
    } finally {
        await harness.close(sockets);
    }
});

test("creator explicitly ending a session disconnects the joiner and removes runtime", async () => {
    const harness = await createHarness();
    const sockets = [];

    try {
        const { creator, joiner, sessionId } = await connectPersonalPair(harness, sockets);
        const creatorLeftPromise = nextMessage(creator, "session_left");
        const endedPromise = nextMessage(joiner, "session_ended");
        creator.send(JSON.stringify({ type: "leave_session" }));

        const [creatorLeft, ended] = await Promise.all([creatorLeftPromise, endedPromise]);
        assert.equal(creatorLeft.scope, "session");
        assert.equal(ended.reason, "creator_left");
        assert.equal(getClipboardPersonalSessionRuntime(sessionId).hasActiveSession, false);
    } finally {
        await harness.close(sockets);
    }
});

test("joiner explicitly leaving releases only the joiner slot", async () => {
    const harness = await createHarness();
    const sockets = [];

    try {
        const { creator, joiner, sessionId } = await connectPersonalPair(harness, sockets);
        const joinerLeftPromise = nextMessage(joiner, "session_left");
        const peerLeftPromise = nextMessage(creator, "peer_left");
        joiner.send(JSON.stringify({ type: "leave_session" }));

        const [joinerLeft, peerLeft] = await Promise.all([joinerLeftPromise, peerLeftPromise]);
        assert.equal(joinerLeft.scope, "device");
        assert.equal(peerLeft.reason, "joiner_left");
        const runtime = getClipboardPersonalSessionRuntime(sessionId, "third-device");
        assert.equal(runtime.onlinePeers, 1);
        assert.equal(runtime.recommendedAction, "join");
    } finally {
        await harness.close(sockets);
    }
});

test("an unexpected creator disconnect keeps the joiner available for recovery", async () => {
    const harness = await createHarness();
    const sockets = [];

    try {
        const { creator, joiner, sessionId } = await connectPersonalPair(harness, sockets);
        const disconnectedPromise = nextMessage(joiner, "peer_disconnected");
        creator.terminate();
        await disconnectedPromise;

        const runtime = getClipboardPersonalSessionRuntime(sessionId, "replacement-creator");
        assert.equal(runtime.onlinePeers, 1);
        assert.equal(runtime.recommendedAction, "create");
    } finally {
        await harness.close(sockets);
    }
});
