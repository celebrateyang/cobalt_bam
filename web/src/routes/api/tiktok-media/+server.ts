import type { RequestHandler } from "./$types";

const allowedTikTokHosts = [
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokcdn-eu.com",
];

const isAllowedTikTokMediaUrl = (value: string) => {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:") return false;

        const hostname = url.hostname.toLowerCase();
        return allowedTikTokHosts.some(
            (host) => hostname === host || hostname.endsWith(`.${host}`),
        );
    } catch {
        return false;
    }
};

const safeFilename = (value: string | null) => {
    const fallback = "tiktok-video.mp4";
    if (!value) return fallback;

    const normalized = value
        .replace(/[\r\n"]/g, "")
        .replace(/[\\/:*?<>|]/g, "_")
        .trim();

    return normalized || fallback;
};

export const GET: RequestHandler = async ({ request, url, fetch }) => {
    const target = url.searchParams.get("url") || "";
    if (!isAllowedTikTokMediaUrl(target)) {
        return new Response("invalid TikTok media URL", { status: 400 });
    }

    const range = request.headers.get("range");
    let upstream: Response;
    try {
        upstream = await fetch(target, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
                "Referer": "https://www.tiktok.com/",
                ...(range ? { Range: range } : {}),
            },
            redirect: "follow",
        });
    } catch {
        return new Response("TikTok media fetch failed", { status: 502 });
    }

    if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel();
        return new Response("TikTok media fetch failed", {
            status: upstream.status,
        });
    }

    const headers = new Headers();
    for (const name of [
        "accept-ranges",
        "cache-control",
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
    ]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    }

    headers.set(
        "Content-Disposition",
        `attachment; filename="${safeFilename(url.searchParams.get("filename"))}"`,
    );
    headers.set("Cross-Origin-Resource-Policy", "same-origin");

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
};
