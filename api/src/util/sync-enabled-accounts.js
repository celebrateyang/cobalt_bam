import "../config.js";
import { query, closePool } from "../db/pg-client.js";
import { updateAccount, updateVideo } from "../db/social-media.js";
import { fetchOembedForAccount, syncAccountVideos } from "../processing/social/sync.js";

const parseIntArg = (args, name, fallback, { min = 1 } = {}) => {
    const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const mapLimit = async (items, limit, mapper) => {
    const concurrency = Math.max(1, Math.floor(limit));
    const results = new Array(items.length);
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (index < items.length) {
            const current = index++;
            try {
                results[current] = await mapper(items[current], current);
            } catch (error) {
                results[current] = { error };
            }
        }
    });

    await Promise.all(workers);
    return results;
};

const toMsTimestamp = (value) => {
    if (value === null || value === undefined) return null;

    const raw = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
    if (!Number.isFinite(raw)) return null;

    // Some environments store timestamps as seconds; normalize to ms.
    return raw < 1e12 ? raw * 1000 : raw;
};

const minutesToMs = (minutes) => Math.max(0, Math.floor(minutes)) * 60_000;

const shouldRunByInterval = (lastRunAt, nowMs, intervalMs, slackMs) => {
    if (!intervalMs || intervalMs <= 0) return true;
    const lastMs = toMsTimestamp(lastRunAt);
    if (!lastMs) return true;

    const requiredMs = Math.max(0, intervalMs - Math.max(0, slackMs));
    return nowMs - lastMs >= requiredMs;
};

const getEnabledAccounts = async () => {
    const res = await query(
        `
        SELECT id, platform, username, display_name, sync_last_run_at
        FROM social_accounts
        WHERE sync_enabled = true AND is_active = true
        ORDER BY priority DESC, updated_at DESC
        `,
    );
    return res.rows ?? [];
};

const getAccountVideos = async (accountId, limit) => {
    const res = await query(
        `
        SELECT id, platform, video_url
        FROM social_videos
        WHERE account_id = $1
          AND is_active = true
          AND video_url IS NOT NULL
          AND video_url != ''
        ORDER BY is_pinned DESC, pinned_order DESC, updated_at DESC
        LIMIT $2
        `,
        [accountId, limit],
    );
    return res.rows ?? [];
};

const getAccountVideoIdsToKeep = async (accountId, limit) => {
    const res = await query(
        `
        SELECT id
        FROM social_videos
        WHERE account_id = $1
        ORDER BY is_pinned DESC, pinned_order DESC, updated_at DESC
        LIMIT $2
        `,
        [accountId, limit],
    );
    return (res.rows ?? []).map((row) => row.id);
};

const refreshAccountThumbnails = async (account, options) => {
    const startedAt = Date.now();
    const limit =
        typeof options?.thumbnailLimit === "number" && options.thumbnailLimit > 0
            ? Math.floor(options.thumbnailLimit)
            : options.pinnedLimit + options.recentLimit;
    const videos = await getAccountVideos(account.id, limit);

    let refreshed = 0;

    for (const video of videos) {
        const meta = await fetchOembedForAccount(account, video.video_url).catch(() => null);
        const thumbnailUrl = meta?.thumbnail_url;
        if (!thumbnailUrl) continue;

        await updateVideo(video.id, {
            thumbnail_url: thumbnailUrl,
            synced_at: startedAt,
        });
        refreshed += 1;
    }

    await updateAccount(account.id, {
        sync_last_run_at: startedAt,
        sync_error: null,
    });

    return { refreshed, total: videos.length };
};

const pruneAccountVideos = async (account, options) => {
    const limit =
        typeof options?.pruneLimit === "number" && options.pruneLimit > 0
            ? Math.floor(options.pruneLimit)
            : options.pinnedLimit + options.recentLimit;
    const keepIds = await getAccountVideoIdsToKeep(account.id, limit);
    if (!keepIds.length) return { deleted: 0, kept: 0 };

    const params = [account.id, keepIds];
    let sql = `
        DELETE FROM social_videos
        WHERE account_id = $1
          AND source = 'sync'
          AND NOT (id = ANY($2::int[]))
    `;

    if (options?.keepFeatured !== false) {
        sql += " AND is_featured = false";
    }

    const result = await query(sql, params);
    return { deleted: result.rowCount ?? 0, kept: keepIds.length };
};

const run = async () => {
    const args = process.argv.slice(2);
    const concurrency = parseIntArg(args, "concurrency", 2, { min: 1 });
    const recentLimit = parseIntArg(args, "recent", 5, { min: 1 });
    const pinnedLimit = parseIntArg(args, "pinned", 3, { min: 0 });
    const thumbnailLimit = parseIntArg(args, "thumbnailLimit", 0, { min: 0 });
    const pruneLimit = parseIntArg(args, "pruneLimit", 0, { min: 0 });
    const keepFeatured = parseIntArg(args, "keepFeatured", 1, { min: 0 }) !== 0;

    // TikTok thumbnails expire quickly; refresh frequently.
    // Instagram thumbnails are fairly stable; avoid needless requests.
    const tiktokIntervalMinutes = parseIntArg(args, "tiktokIntervalMinutes", 240, { min: 0 });
    const instagramIntervalMinutes = parseIntArg(args, "instagramIntervalMinutes", 720, { min: 0 });
    const otherIntervalMinutes = parseIntArg(args, "otherIntervalMinutes", 720, { min: 0 });
    const intervalSlackMinutes = parseIntArg(args, "intervalSlackMinutes", 5, { min: 0 });

    const intervals = {
        tiktok: minutesToMs(tiktokIntervalMinutes),
        instagram: minutesToMs(instagramIntervalMinutes),
        other: minutesToMs(otherIntervalMinutes),
        slack: minutesToMs(intervalSlackMinutes),
    };

    console.log(
        `sync-enabled-accounts: start (concurrency=${concurrency}, recent=${recentLimit}, pinned=${pinnedLimit}, thumbnailLimit=${thumbnailLimit || "auto"}, pruneLimit=${pruneLimit || "auto"}, keepFeatured=${keepFeatured ? "yes" : "no"}, tiktokEvery=${tiktokIntervalMinutes}m, instagramEvery=${instagramIntervalMinutes}m)`,
    );

    const accounts = await getEnabledAccounts();
    if (!accounts.length) {
        console.log("sync-enabled-accounts: no enabled accounts");
        return;
    }

    console.log(`sync-enabled-accounts: syncing ${accounts.length} accounts`);

    let okCount = 0;
    let skippedCount = 0;
    let attemptFailedCount = 0;
    let failedCount = 0;
    let refreshedAccounts = 0;

    await mapLimit(accounts, concurrency, async (account) => {
        const label = `${account.platform}:${account.username} (#${account.id})`;
        const startedAt = Date.now();

        const nowMs = startedAt;
        const intervalMs =
            account.platform === "tiktok"
                ? intervals.tiktok
                : account.platform === "instagram"
                    ? intervals.instagram
                    : intervals.other;
        const due = shouldRunByInterval(account.sync_last_run_at, nowMs, intervalMs, intervals.slack);

        if (!due) {
            skippedCount += 1;
            return { ok: true, label, skipped: true };
        }

        try {
            const summary = await syncAccountVideos(account, { recentLimit, pinnedLimit });
            console.log(
                `sync-enabled-accounts: ok ${label} created=${summary.created} updated=${summary.updated} total=${summary.total} in=${Date.now() - startedAt}ms`,
            );

            if (account.platform === "tiktok") {
                const refreshed = await refreshAccountThumbnails(account, {
                    recentLimit,
                    pinnedLimit,
                    thumbnailLimit,
                });
                refreshedAccounts += 1;
                console.log(
                    `sync-enabled-accounts: tiktok thumbs refreshed ${label} refreshed=${refreshed.refreshed}/${refreshed.total}`,
                );
            }

            const pruned = await pruneAccountVideos(account, {
                recentLimit,
                pinnedLimit,
                pruneLimit,
                keepFeatured,
            });
            console.log(
                `sync-enabled-accounts: pruned ${label} deleted=${pruned.deleted} kept=${pruned.kept}`,
            );

            okCount += 1;
            return { ok: true, label, summary };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`sync-enabled-accounts: failed ${label}: ${message}`);
            attemptFailedCount += 1;

            await updateAccount(account.id, {
                sync_last_run_at: Date.now(),
                sync_error: message.slice(0, 500),
            }).catch(() => null);

            // Fallback: refresh thumbnails for existing videos using oEmbed.
            try {
                const refreshed = await refreshAccountThumbnails(account, {
                    recentLimit,
                    pinnedLimit,
                    thumbnailLimit,
                });
                console.log(
                    `sync-enabled-accounts: fallback ok ${label} refreshed=${refreshed.refreshed}/${refreshed.total}`,
                );
                okCount += 1;
                return { ok: true, label, fallback: true, refreshed };
            } catch (fallbackError) {
                const fallbackMessage =
                    fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                console.warn(`sync-enabled-accounts: fallback failed ${label}: ${fallbackMessage}`);
                failedCount += 1;
                await updateAccount(account.id, {
                    sync_last_run_at: Date.now(),
                    sync_error: `sync failed: ${message}; fallback failed: ${fallbackMessage}`.slice(0, 500),
                }).catch(() => null);
                return { ok: false, label, error: message, fallbackError: fallbackMessage };
            }
        }
    });

    console.log(
        `sync-enabled-accounts: done ok=${okCount} failed=${failedCount} attemptsFailed=${attemptFailedCount} skipped=${skippedCount} tiktokThumbsRefreshed=${refreshedAccounts}`,
    );
};

await run()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool().catch(() => null);
    });
