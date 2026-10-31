const allowedHosts = new Set([
    "threads.com", "www.threads.com", "threads.net", "www.threads.net",
]);

export const resolveThreadsShare = async (shareId, fetcher = fetch, dispatcher) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareId || "")) return null;
    let target = new URL(`https://www.threads.com/share/${shareId}`);
    try {
        for (let hop = 0; hop < 3; hop++) {
            const response = await fetcher(target, {
                method: "HEAD",
                redirect: "manual",
                dispatcher,
                headers: { "user-agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(10_000),
            });
            const location = response.headers.get("location");
            if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
            target = new URL(location, target);
            if (target.protocol !== "https:" || target.username || target.password ||
                target.port || !allowedHosts.has(target.hostname)) return null;
            const post = /^\/@([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]{1,64})\/?$/.exec(target.pathname);
            if (post) return { username: post[1], postId: post[2] };
            const compact = /^\/t\/([A-Za-z0-9_-]{1,64})\/?$/.exec(target.pathname);
            if (compact) return { postId: compact[1] };
        }
    } catch {
        // A blocked or expired share must not fall through to an undefined post.
    }
    return null;
};
