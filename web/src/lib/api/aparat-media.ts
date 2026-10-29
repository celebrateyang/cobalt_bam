export const isAparatMediaURL = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && /^(?:[a-z0-9-]+\.)*aparat\.(?:com|cloud)$/i.test(url.hostname)
            && /^\/aparat-(?:video|short)\/[a-zA-Z0-9_.-]+\.(?:mp4|apt)$/.test(url.pathname);
    } catch { return false; }
};
