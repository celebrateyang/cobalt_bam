import "../config.js";
import { query } from "../db/pg-client.js";

const parseEpochMs = (value) => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    // Heuristic: seconds vs milliseconds.
    if (parsed < 1e12) return Math.round(parsed * 1000);
    return Math.round(parsed);
};

const parseHexEpochMs = (value) => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const parsed = Number.parseInt(raw, 16);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    // Heuristic: seconds vs milliseconds.
    if (parsed < 1e12) return Math.round(parsed * 1000);
    return Math.round(parsed);
};

const parseThumbnailExpiresAtMs = (thumbnailUrl) => {
    if (!thumbnailUrl) return null;

    let url;
    try {
        url = new URL(thumbnailUrl);
    } catch {
        return null;
    }

    // TikTok signed CDN URLs often include x-expires / Expires.
    const tiktokExpires =
        parseEpochMs(url.searchParams.get("x-expires")) ??
        parseEpochMs(url.searchParams.get("Expires")) ??
        parseEpochMs(url.searchParams.get("expires"));
    if (tiktokExpires) return tiktokExpires;

    // Instagram / FB CDN URLs often include oe=<hex timestamp>.
    const instagramExpires = parseHexEpochMs(url.searchParams.get("oe"));
    if (instagramExpires) return instagramExpires;

    return null;
};

const fmtDuration = (ms) => {
    if (!Number.isFinite(ms)) return "n/a";
    const abs = Math.abs(ms);
    const sign = ms < 0 ? "-" : "";

    const sec = Math.round(abs / 1000);
    const min = Math.floor(sec / 60);
    const hour = Math.floor(min / 60);
    const day = Math.floor(hour / 24);

    if (day > 0) return `${sign}${day}d ${hour % 24}h`;
    if (hour > 0) return `${sign}${hour}h ${min % 60}m`;
    if (min > 0) return `${sign}${min}m`;
    return `${sign}${sec}s`;
};

const quantile = (sorted, q) => {
    if (!sorted.length) return null;
    const idx = Math.floor((sorted.length - 1) * q);
    return sorted[idx];
};

const summarize = (values) => {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    return {
        count: sorted.length,
        min: sorted[0] ?? null,
        p50: quantile(sorted, 0.5),
        p90: quantile(sorted, 0.9),
        max: sorted[sorted.length - 1] ?? null,
    };
};

const run = async () => {
    const args = process.argv.slice(2);
    const limitArg = args.find((a) => a.startsWith("--limit="));
    const platformArg = args.find((a) => a.startsWith("--platform="));

    const limit = (() => {
        const raw = limitArg?.split("=")[1];
        if (!raw) return 2000;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
    })();

    const platform = (() => {
        const raw = platformArg?.split("=")[1];
        if (!raw) return null;
        const normalized = raw.trim().toLowerCase();
        if (!normalized) return null;
        return normalized;
    })();

    const params = [];
    let where = "thumbnail_url IS NOT NULL AND thumbnail_url != ''";
    if (platform) {
        where += ` AND platform = $1`;
        params.push(platform);
    }
    params.push(limit);

    const sql = `
        SELECT platform, thumbnail_url, updated_at
        FROM social_videos
        WHERE ${where}
        ORDER BY updated_at DESC
        LIMIT $${params.length}
    `;

    const res = await query(sql, params);

    const now = Date.now();
    const grouped = new Map();

    for (const row of res.rows) {
        const key = row.platform || "unknown";
        if (!grouped.has(key)) {
            grouped.set(key, {
                rows: 0,
                parsed: 0,
                expiredNow: 0,
                ttlMs: [],
                expiresInMs: [],
            });
        }

        const group = grouped.get(key);
        group.rows += 1;

        const expiresAt = parseThumbnailExpiresAtMs(row.thumbnail_url);
        if (!expiresAt) continue;

        group.parsed += 1;
        const ttlMs = expiresAt - Number(row.updated_at);
        const expiresInMs = expiresAt - now;
        group.ttlMs.push(ttlMs);
        group.expiresInMs.push(expiresInMs);
        if (expiresAt <= now) group.expiredNow += 1;
    }

    console.log(`thumbnail expiry analysis (limit=${limit}${platform ? `, platform=${platform}` : ""})`);

    for (const [key, group] of grouped) {
        const ttl = summarize(group.ttlMs);
        const expiresIn = summarize(group.expiresInMs);
        const parsedPct = group.rows ? Math.round((group.parsed / group.rows) * 1000) / 10 : 0;

        console.log(`\n[${key}] rows=${group.rows}, parsed=${group.parsed} (${parsedPct}%), expired_now=${group.expiredNow}`);
        console.log(
            `  ttl: min=${fmtDuration(ttl.min)} p50=${fmtDuration(ttl.p50)} p90=${fmtDuration(ttl.p90)} max=${fmtDuration(ttl.max)}`,
        );
        console.log(
            `  expires_in: min=${fmtDuration(expiresIn.min)} p50=${fmtDuration(expiresIn.p50)} p90=${fmtDuration(expiresIn.p90)} max=${fmtDuration(expiresIn.max)}`,
        );
    }
};

await run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

