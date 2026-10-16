export function parseGoogleDriveVideoInput(value: string): string | null {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) return null;
        if (!/^\/file\/d\/[A-Za-z0-9_-]+\/(?:view|preview)\/?$/.test(url.pathname)) return null;
        return url.toString();
    } catch {
        return null;
    }
}
