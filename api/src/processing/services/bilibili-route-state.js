const ROUTE_LOCAL = "local";
const ROUTE_UPSTREAM = "upstream";
const KNOWN_ROUTES = new Set([ROUTE_LOCAL, ROUTE_UPSTREAM]);

const DEFAULT_SCORE = 100;
const MIN_SCORE = 20;
const MAX_SCORE = 180;
const DECAY_POINTS_PER_MINUTE = 1.5;
const STREAK_ROTATE_THRESHOLD = 2;
const STREAK_ROTATE_DELTA = 10;
const STREAM_RETRY_SWITCH_DELTA = 20;
const ERROR_COOLDOWN_MS = 90_000;

const state = {
    routes: {
        [ROUTE_LOCAL]: {
            score: DEFAULT_SCORE,
            lastUpdatedAt: Date.now(),
            consecutiveErrors: 0,
            cooldownUntil: 0,
        },
        [ROUTE_UPSTREAM]: {
            score: DEFAULT_SCORE,
            lastUpdatedAt: Date.now(),
            consecutiveErrors: 0,
            cooldownUntil: 0,
        },
    },
    lastPrimaryRoute: ROUTE_LOCAL,
    primaryRouteStreak: 0,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeRoute = (value) => {
    if (!KNOWN_ROUTES.has(value)) return null;
    return value;
};

const decayRouteState = (routeState, now) => {
    const elapsedMs = Math.max(0, now - routeState.lastUpdatedAt);
    if (!elapsedMs) return;

    const decay = (elapsedMs / 60_000) * DECAY_POINTS_PER_MINUTE;
    if (routeState.score > DEFAULT_SCORE) {
        routeState.score = Math.max(DEFAULT_SCORE, routeState.score - decay);
    } else if (routeState.score < DEFAULT_SCORE) {
        routeState.score = Math.min(DEFAULT_SCORE, routeState.score + decay);
    }

    routeState.lastUpdatedAt = now;
};

const refreshState = () => {
    const now = Date.now();
    decayRouteState(state.routes.local, now);
    decayRouteState(state.routes.upstream, now);

    if (state.routes.local.cooldownUntil <= now) {
        state.routes.local.cooldownUntil = 0;
    }
    if (state.routes.upstream.cooldownUntil <= now) {
        state.routes.upstream.cooldownUntil = 0;
    }
};

const applyScoreDelta = (route, delta, reason) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return;

    refreshState();
    const routeState = state.routes[normalized];
    routeState.score = clamp(routeState.score + delta, MIN_SCORE, MAX_SCORE);
    routeState.lastUpdatedAt = Date.now();

    if (delta < 0) {
        routeState.consecutiveErrors += 1;
        if (routeState.consecutiveErrors >= 3) {
            routeState.cooldownUntil = Date.now() + ERROR_COOLDOWN_MS;
        }
    } else if (delta > 0) {
        routeState.consecutiveErrors = Math.max(0, routeState.consecutiveErrors - 1);
    }

    console.log(
        `[bilibili-route] event route=${normalized} reason=${reason} delta=${delta.toFixed(2)} score=${Math.round(routeState.score)} cooldown_ms=${Math.max(0, routeState.cooldownUntil - Date.now())}`,
    );
};

const isRouteCoolingDown = (route) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return false;
    return state.routes[normalized].cooldownUntil > Date.now();
};

const getScore = (route) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return DEFAULT_SCORE;
    return state.routes[normalized].score;
};

const getOppositeRoute = (route) => {
    if (route === ROUTE_LOCAL) return ROUTE_UPSTREAM;
    if (route === ROUTE_UPSTREAM) return ROUTE_LOCAL;
    return ROUTE_LOCAL;
};

const updatePrimaryRouteHistory = (route) => {
    if (state.lastPrimaryRoute === route) {
        state.primaryRouteStreak += 1;
    } else {
        state.lastPrimaryRoute = route;
        state.primaryRouteStreak = 1;
    }
};

export const classifyBilibiliStreamRoute = (rawUrl) => {
    try {
        const target = new URL(String(rawUrl));
        if (target.pathname === "/tunnel" || target.pathname === "/relay") {
            return ROUTE_UPSTREAM;
        }
    } catch {
        // keep local as fallback
    }

    return ROUTE_LOCAL;
};

export const reportBilibiliRouteRequestEvent = ({ route, event }) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return;

    switch (event) {
        case "request_success":
            applyScoreDelta(normalized, 2, event);
            break;

        case "request_fail":
            applyScoreDelta(normalized, -6, event);
            break;
    }
};

export const reportBilibiliRouteStreamEvent = ({
    route,
    event,
    elapsedMs,
    bytes,
}) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return;

    if (event === "error") {
        applyScoreDelta(normalized, -8, "stream_error");
        return;
    }

    if (event !== "success") return;

    if (
        typeof elapsedMs !== "number" ||
        !Number.isFinite(elapsedMs) ||
        elapsedMs <= 0 ||
        typeof bytes !== "number" ||
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {
        return;
    }

    const kbps = (bytes * 8) / 1024 / (elapsedMs / 1000);
    let delta = 0;

    if (kbps >= 8000) delta = 2;
    else if (kbps >= 3000) delta = 1;
    else if (kbps >= 1000) delta = 0;
    else if (kbps >= 500) delta = -1;
    else delta = -2;

    if (elapsedMs >= 15_000 && bytes <= 1_200_000) {
        delta -= 1;
    }

    if (delta !== 0) {
        applyScoreDelta(normalized, delta, `stream_success_kbps_${Math.round(kbps)}`);
    }
};

export const pickBilibiliRoutePlan = ({
    canUseUpstream,
    streamRetry = false,
}) => {
    refreshState();

    if (!canUseUpstream) {
        updatePrimaryRouteHistory(ROUTE_LOCAL);
        return {
            primary: ROUTE_LOCAL,
            secondary: null,
            scores: {
                local: Math.round(getScore(ROUTE_LOCAL)),
                upstream: Math.round(getScore(ROUTE_UPSTREAM)),
            },
            reason: "upstream_unavailable",
        };
    }

    let primary =
        getScore(ROUTE_LOCAL) >= getScore(ROUTE_UPSTREAM)
            ? ROUTE_LOCAL
            : ROUTE_UPSTREAM;
    let reason = "score";

    const localCooling = isRouteCoolingDown(ROUTE_LOCAL);
    const upstreamCooling = isRouteCoolingDown(ROUTE_UPSTREAM);
    if (localCooling && !upstreamCooling) {
        primary = ROUTE_UPSTREAM;
        reason = "local_cooldown";
    } else if (upstreamCooling && !localCooling) {
        primary = ROUTE_LOCAL;
        reason = "upstream_cooldown";
    }

    const scoreDelta = Math.abs(getScore(ROUTE_LOCAL) - getScore(ROUTE_UPSTREAM));
    const opposite = getOppositeRoute(primary);

    if (
        scoreDelta <= STREAK_ROTATE_DELTA &&
        state.lastPrimaryRoute === primary &&
        state.primaryRouteStreak >= STREAK_ROTATE_THRESHOLD &&
        !isRouteCoolingDown(opposite)
    ) {
        primary = opposite;
        reason = "streak_rotate";
    }

    if (
        streamRetry &&
        scoreDelta <= STREAM_RETRY_SWITCH_DELTA &&
        !isRouteCoolingDown(opposite)
    ) {
        primary = opposite;
        reason = "stream_retry_switch";
    }

    updatePrimaryRouteHistory(primary);

    return {
        primary,
        secondary: getOppositeRoute(primary),
        scores: {
            local: Math.round(getScore(ROUTE_LOCAL)),
            upstream: Math.round(getScore(ROUTE_UPSTREAM)),
        },
        reason,
    };
};
