const isMediaURL = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
        return false;
    }
};

// Reject incomplete albums instead of silently dropping missing items.
export const getInstagramUpstreamPicker = (body) => {
    if (body?.status !== "picker" || !Array.isArray(body.picker) || !body.picker.length) return null;
    if (!body.picker.every((item) => item && ["photo", "video"].includes(item.type) && isMediaURL(item.url))) return null;
    return body.picker.map(({ type, url, thumb }) => ({ type, url, ...(isMediaURL(thumb) ? { thumb } : {}) }));
};

export const isInstagramUpstreamMedia = (body) => Boolean(
    (body?.status === "redirect" && isMediaURL(body.url)) || getInstagramUpstreamPicker(body),
);
