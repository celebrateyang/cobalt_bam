import { env } from "../../config.js";

const state = {
    nodes: [],
    cursor: 0,
};

const REGION_CN = "cn";
const REGION_GLOBAL = "global";
let healthCheckTimer = null;
let healthCheckRunning = false;

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

const inferRegion = (endpoint) => {
    try {
        const hostname = new URL(endpoint).hostname.toLowerCase();
        const match = hostname.match(/^api(\d+)\./);
        if (!match) return REGION_GLOBAL;

        const nodeNumber = Number(match[1]);
        if (!Number.isFinite(nodeNumber)) return REGION_GLOBAL;

        return nodeNumber % 2 === 0 ? REGION_CN : REGION_GLOBAL;
    } catch {
        return REGION_GLOBAL;
    }
};

const createNode = (rawUrl, existing, region) => {
    const endpoint = normalizeURL(rawUrl);
    if (!endpoint) return null;

    const parsed = new URL(endpoint);
    return {
        url: endpoint,
        origin: parsed.origin,
        region: region || existing?.region || inferRegion(endpoint),
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
    const nodes = new Map();

    const add = (raw, explicitRegion) => {
        const normalized = normalizeURL(raw);
        if (!normalized) return;

        const existing = nodes.get(normalized);
        nodes.set(normalized, {
            url: normalized,
            region: explicitRegion || existing?.region || inferRegion(normalized),
        });
    };

    for (const raw of env.upstreamURLs || []) {
        add(raw);
    }

    for (const raw of env.upstreamGlobalURLs || []) {
        add(raw, REGION_GLOBAL);
    }

    for (const raw of env.upstreamCnURLs || []) {
        add(raw, REGION_CN);
    }

    return [...nodes.values()];
};

export const refreshUpstreamPool = () => {
    const previous = new Map(state.nodes.map((node) => [node.url, node]));
    state.nodes = configuredURLs()
        .map(({ url, region }) => createNode(url, previous.get(url), region))
        .filter(Boolean);

    if (state.cursor >= state.nodes.length) {
        state.cursor = 0;
    }
};

refreshUpstreamPool();

env.subscribe?.([
    "upstreamURLs",
    "upstreamGlobalURLs",
    "upstreamCnURLs",
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

export const selectUpstreamNode = (excluded = new Set(), { regions } = {}) => {
    refreshUpstreamPool();

    const now = Date.now();
    const allowedRegions = Array.isArray(regions) && regions.length > 0
        ? new Set(regions)
        : null;
    const candidates = state.nodes.filter(
        (node) =>
            !excluded.has(node.url) &&
            canTryNode(node, now) &&
            (!allowedRegions || allowedRegions.has(node.region)),
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

const resolveHealthCheckIntervalMs = () =>
    typeof env.upstreamHealthCheckIntervalMs === "number" &&
    Number.isFinite(env.upstreamHealthCheckIntervalMs) &&
    env.upstreamHealthCheckIntervalMs > 0
        ? env.upstreamHealthCheckIntervalMs
        : 600000;

const resolveHealthCheckTimeoutMs = () =>
    typeof env.upstreamTimeoutMs === "number" &&
    Number.isFinite(env.upstreamTimeoutMs) &&
    env.upstreamTimeoutMs > 0
        ? env.upstreamTimeoutMs
        : 12000;

const truncateReason = (value, max = 160) => {
    const text = String(value || "unknown");
    return text.length > max ? `${text.slice(0, max)}...` : text;
};

const checkUpstreamNodeHealth = async (node, reason) => {
    if (!node || isSelfOrigin(node.origin)) return;

    const endpoint = new URL("/health", node.url);
    const timeoutMs = resolveHealthCheckTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
        const response = await fetch(endpoint, {
            method: "GET",
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "ngrok-skip-browser-warning": "true",
            },
        });
        const elapsedMs = Date.now() - startedAt;
        await response.arrayBuffer().catch(() => undefined);

        if (response.ok) {
            markUpstreamSuccess(node, elapsedMs);
            console.log(
                `[UPSTREAM HEALTH] reason=${reason} upstream=${node.origin} region=${node.region} status=ok http=${response.status} elapsed_ms=${elapsedMs}`,
            );
            return;
        }

        markUpstreamFailure(node, `health_http_${response.status}`);
        console.warn(
            `[UPSTREAM HEALTH] reason=${reason} upstream=${node.origin} region=${node.region} status=fail http=${response.status} elapsed_ms=${elapsedMs}`,
        );
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const code = error?.code || error?.name || error?.cause?.code;
        const message = error?.message || String(error);
        const failureReason = truncateReason(["health", code, message].filter(Boolean).join(":"));
        markUpstreamFailure(node, failureReason);
        console.warn(
            `[UPSTREAM HEALTH] reason=${reason} upstream=${node.origin} region=${node.region} status=fail reason=${failureReason} elapsed_ms=${elapsedMs}`,
        );
    } finally {
        clearTimeout(timeout);
    }
};

export const runUpstreamHealthCheck = async (reason = "manual") => {
    refreshUpstreamPool();

    if (healthCheckRunning) return;

    const nodes = state.nodes.filter((node) => !isSelfOrigin(node.origin));
    if (nodes.length === 0) return;

    healthCheckRunning = true;
    try {
        await Promise.allSettled(
            nodes.map((node) => checkUpstreamNodeHealth(node, reason)),
        );
    } finally {
        healthCheckRunning = false;
    }
};

export const startUpstreamHealthChecks = ({ immediate = true } = {}) => {
    if (healthCheckTimer) return;

    refreshUpstreamPool();
    if (state.nodes.length === 0) {
        console.log("[UPSTREAM HEALTH] disabled: no upstream nodes configured");
        return;
    }

    const intervalMs = resolveHealthCheckIntervalMs();
    healthCheckTimer = setInterval(() => {
        void runUpstreamHealthCheck("interval");
    }, intervalMs);
    healthCheckTimer.unref?.();

    console.log(
        `[UPSTREAM HEALTH] enabled interval_ms=${intervalMs} nodes=${state.nodes.length}`,
    );

    if (immediate) {
        void runUpstreamHealthCheck("startup");
    }
};

export const stopUpstreamHealthChecks = () => {
    if (!healthCheckTimer) return;
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
};

export const getUpstreamHealthSnapshot = () => {
    refreshUpstreamPool();

    const now = Date.now();
    const upstreams = state.nodes.map((node) => {
        const circuitOpen = node.circuitOpenUntil > now;
        return {
            url: node.origin,
            region: node.region,
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
