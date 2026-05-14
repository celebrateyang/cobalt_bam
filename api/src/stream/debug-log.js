const isEnabled = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const tunnelDebugEnabled = isEnabled(process.env.TUNNEL_DEBUG_LOGS);

export const tunnelDebugLog = (...args) => {
    if (tunnelDebugEnabled) {
        console.log(...args);
    }
};

export const tunnelDebugWarn = (...args) => {
    if (tunnelDebugEnabled) {
        console.warn(...args);
    }
};
