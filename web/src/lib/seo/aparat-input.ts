export const parseAparatInput = (input: string): { url: string; playlist: boolean } | null => {
    try {
        const url = new URL(input.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
            !['aparat.com', 'www.aparat.com', 'shorts.aparat.com'].includes(url.hostname)) return null;
        if (!/^\/(?:v\/[a-zA-Z0-9]{1,32}|shorts\/\d{1,24}|playlist\/\d{1,20})\/?$/.test(url.pathname)) return null;
        return { url: `https://www.aparat.com${url.pathname.replace(/\/$/, '')}`, playlist: url.pathname.startsWith('/playlist/') };
    } catch { return null; }
};
