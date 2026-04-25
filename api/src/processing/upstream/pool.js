import { env } from "../../config.js";

const state = {
    nodes: [],
    cursor: 0,
};

const normalizeURL = (raw) => {
    try {
        const url = new URL(String(raw));
        url.pathname = "/";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return null;
    }
};

const nowIso = (value) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
        ? new Date(value).toISOString()
        : null;

const createNode = (rawUrl, existing) => {
    const endpoint = normalizeURL(rawUrl);
    if (!endpoint) return null;

    const parsed = new URL(endpoint);
    return {
        url: endpoint,
        origin: parsed.origin,
        healthy: existing?.healthy ?? true,
        consecutiveFailures: existing?.consecutiveFailures ?? 0,
        inFlight: existing?.inFlight ?? 0,
        lastSuccessAt: existing?.lastSuccessAt ?? 0,
        lastFailureAt: existing?.lastFailureAt ?? 0,
        lastFailureReason: existing?.lastFailureReason ?? "",
        circuitOpenUntil: existing?.circuitOpenUntil ?? 0,
        latencyMs: existing?.latencyMs ?? null,
    };
};

const configuredURLs = () => {
    const seen = new Set();
    const urls = [];

    for (const raw of env.upstreamURLs || []) {
        const normalized = normalizeURL(raw);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push(normalized);
    }

    return urls;
};

export const refreshUpstreamPool = () => {
    const previous = new Map(state.nodes.map((node) => [node.url, node]));
    state.nodes = configuredURLs()
        .map((url) => createNode(url, previous.get(url)))
        .filter(Boolean);

    if (state.cursor >= state.nodes.length) {
        state.cursor = 0;
    }
};

refreshUpstreamPool();

env.subscribe?.([
    "upstreamURLs",
    "upstreamCircuitFailures",
    "upstreamCircuitCooldownMs",
], refreshUpstreamPool);

export const hasUpstreams = () => state.nodes.length > 0;

export const getUpstreamNodes = () => state.nodes;

export const isSelfOrigin = (origin) => {
    try {
        return new URL(env.apiURL).origin === origin;
    } catch {
        return false;
    }
};

const canTryNode = (node, now) => {
    if (isSelfOrigin(node.origin)) return false;
    if (node.circuitOpenUntil <= now) return true;
    return false;
};

export const selectUpstreamNode = (excluded = new Set()) => {
    refreshUpstreamPool();

    const now = Date.now();
    const candidates = state.nodes.filter(
        (node) => !excluded.has(node.url) && canTryNode(node, now),
    );

    if (candidates.length === 0) return null;

    for (let i = 0; i < state.nodes.length; i++) {
        const idx = (state.cursor + i) % state.nodes.length;
        const node = state.nodes[idx];
        if (!candidates.includes(node)) continue;

        state.cursor = (idx + 1) % state.nodes.length;
        return node;
    }

    return candidates[0];
};

export const markUpstreamSuccess = (node, elapsedMs) => {
    if (!node) return;

    node.healthy = true;
    node.consecutiveFailures = 0;
    node.lastSuccessAt = Date.now();
    node.circuitOpenUntil = 0;
    node.lastFailureReason = "";

    if (typeof elapsedMs === "number" && Number.isFinite(elapsedMs)) {
        node.latencyMs = Math.round(elapsedMs);
    }
};

export const markUpstreamFailure = (node, reason) => {
    if (!node) return;

    node.consecutiveFailures += 1;
    node.lastFailureAt = Date.now();
    node.lastFailureReason = String(reason || "unknown").slice(0, 160);

    const threshold =
        typeof env.upstreamCircuitFailures === "number" &&
        Number.isFinite(env.upstreamCircuitFailures) &&
        env.upstreamCircuitFailures > 0
            ? env.upstreamCircuitFailures
            : 3;

    if (node.consecutiveFailures >= threshold) {
        const cooldownMs =
            typeof env.upstreamCircuitCooldownMs === "number" &&
            Number.isFinite(env.upstreamCircuitCooldownMs) &&
            env.upstreamCircuitCooldownMs > 0
                ? env.upstreamCircuitCooldownMs
                : 60000;

        node.healthy = false;
        node.circuitOpenUntil = Date.now() + cooldownMs;
        console.warn(
            `[UPSTREAM CIRCUIT] upstream=${node.origin} state=open failures=${node.consecutiveFailures} cooldown_ms=${cooldownMs} reason=${node.lastFailureReason}`,
        );
    }
};

export const getUpstreamHealthSnapshot = () => {
    refreshUpstreamPool();

    const now = Date.now();
    const upstreams = state.nodes.map((node) => {
        const circuitOpen = node.circuitOpenUntil > now;
        return {
            url: node.origin,
            healthy: node.healthy && !circuitOpen,
            circuitOpen,
            inFlight: node.inFlight,
            consecutiveFailures: node.consecutiveFailures,
            latencyMs: node.latencyMs,
            lastSuccessAt: nowIso(node.lastSuccessAt),
            lastFailureAt: nowIso(node.lastFailureAt),
            lastFailureReason: node.lastFailureReason || null,
            circuitOpenUntil: nowIso(node.circuitOpenUntil),
        };
    });

    return {
        status: "ok",
        configured: state.nodes.length > 0,
        total: state.nodes.length,
        available: upstreams.filter((node) => node.healthy).length,
        upstreams,
    };
};
