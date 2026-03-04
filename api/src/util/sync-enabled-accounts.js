import "../config.js";
import { query, closePool } from "../db/pg-client.js";
import { updateAccount, updateVideo } from "../db/social-media.js";
import { fetchOembedForAccount, syncAccountVideos } from "../processing/social/sync.js";
import { isPlayUrlFresh, resolveDirectPlayUrlForVideo } from "../processing/social/play-url.js";

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
        SELECT id, platform, video_url, play_url, play_url_expires_at
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
    const startedAt =
        typeof options?.startedAt === "number" && Number.isFinite(options.startedAt)
            ? options.startedAt
            : Date.now();
    const clearSyncError = options?.clearSyncError !== false;
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

    const accountUpdates = {
        sync_last_run_at: startedAt,
    };
    if (clearSyncError) {
        accountUpdates.sync_error = null;
    }

    await updateAccount(account.id, accountUpdates);

    return { refreshed, total: videos.length, started_at: startedAt };
};

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));

const randomBetween = (minMs, maxMs) => {
    const low = Math.max(0, Math.floor(Math.min(minMs, maxMs)));
    const high = Math.max(0, Math.floor(Math.max(minMs, maxMs)));
    if (high <= low) return low;
    return Math.floor(Math.random() * (high - low + 1)) + low;
};

const refreshAccountPlayUrls = async (account, options) => {
    const startedAt =
        typeof options?.startedAt === "number" && Number.isFinite(options.startedAt)
            ? options.startedAt
            : Date.now();
    const limit =
        typeof options?.playLimit === "number" && options.playLimit > 0
            ? Math.floor(options.playLimit)
            : options.pinnedLimit + options.recentLimit;
    const refreshSafetyMs =
        typeof options?.playUrlSafetyMs === "number" && options.playUrlSafetyMs >= 0
            ? Math.floor(options.playUrlSafetyMs)
            : minutesToMs(15);

    const videos = await getAccountVideos(account.id, limit);
    let refreshed = 0;
    let skippedFresh = 0;
    let failed = 0;

    for (const video of videos) {
        if (isPlayUrlFresh(video.play_url, video.play_url_expires_at, { safetyMs: refreshSafetyMs })) {
            skippedFresh += 1;
            continue;
        }

        try {
            const resolved = await resolveDirectPlayUrlForVideo(video);
            await updateVideo(video.id, {
                play_url: resolved.playUrl,
                play_url_expires_at: resolved.expiresAt,
                play_url_synced_at: startedAt,
                play_url_error: null,
            });
            refreshed += 1;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await updateVideo(video.id, {
                play_url_error: message.slice(0, 500),
                play_url_synced_at: startedAt,
            }).catch(() => null);
            failed += 1;
        }
    }

    return { refreshed, failed, skippedFresh, total: videos.length, started_at: startedAt };
};

const pruneAccountVideos = async (account, options) => {
    const limit =
        typeof options?.pruneLimit === "number" && options.pruneLimit > 0
            ? Math.floor(options.pruneLimit)
            : options.pinnedLimit + options.recentLimit;
    const refreshCutoff =
        typeof options?.refreshCutoff === "number" && Number.isFinite(options.refreshCutoff)
            ? options.refreshCutoff
            : null;
    const label = `${account.platform}:${account.username} (#${account.id})`;
    const keepIds = await getAccountVideoIdsToKeep(account.id, limit);
    if (!keepIds.length) {
        console.log(
            `sync-enabled-accounts: prune skipped ${label} reason=no_keep_ids limit=${limit}`,
        );
        return { deleted: 0, kept: 0 };
    }

    const params = [account.id];
    let paramIndex = 2;
    let sql = `
        DELETE FROM social_videos
        WHERE account_id = $1
          AND source = 'sync'
    `;

    if (refreshCutoff !== null) {
        sql += ` AND (synced_at IS NULL OR synced_at < $${paramIndex + 1} OR NOT (id = ANY($${paramIndex}::int[])))`;
        if (options?.keepFeatured !== false) {
            sql += ` AND NOT (is_featured = true AND synced_at IS NOT NULL AND synced_at >= $${paramIndex + 1})`;
        }
        params.push(keepIds, refreshCutoff);
        paramIndex += 2;
    } else {
        sql += ` AND NOT (id = ANY($${paramIndex}::int[]))`;
        if (options?.keepFeatured !== false) {
            sql += " AND is_featured = false";
        }
        params.push(keepIds);
        paramIndex += 1;
    }

    console.log(
        `sync-enabled-accounts: prune start ${label} limit=${limit} keep=${keepIds.length} keepFeatured=${options?.keepFeatured !== false} refreshCutoff=${refreshCutoff ?? "none"}`,
    );
    const result = await query(sql, params);
    const deleted = result.rowCount ?? 0;
    console.log(
        `sync-enabled-accounts: prune done ${label} deleted=${deleted} kept=${keepIds.length}`,
    );
    return { deleted, kept: keepIds.length };
};

const run = async () => {
    const args = process.argv.slice(2);
    const concurrency = parseIntArg(args, "concurrency", 2, { min: 1 });
    const recentLimit = parseIntArg(args, "recent", 5, { min: 1 });
    const pinnedLimit = parseIntArg(args, "pinned", 3, { min: 0 });
    const thumbnailLimit = parseIntArg(args, "thumbnailLimit", 0, { min: 0 });
    const playLimit = parseIntArg(args, "playLimit", 0, { min: 0 });
    const pruneLimit = parseIntArg(args, "pruneLimit", 0, { min: 0 });
    const keepFeatured = parseIntArg(args, "keepFeatured", 1, { min: 0 }) !== 0;
    const instagramSerialized = parseIntArg(args, "instagramSerialized", 1, { min: 0 }) !== 0;
    const instagramDelayMinMs = parseIntArg(args, "instagramDelayMinMs", 8000, { min: 0 });
    const instagramDelayMaxMs = parseIntArg(args, "instagramDelayMaxMs", 20000, { min: 0 });

    // TikTok thumbnails expire quickly; refresh frequently.
    // Instagram thumbnails are fairly stable; avoid needless requests.
    const tiktokIntervalMinutes = parseIntArg(args, "tiktokIntervalMinutes", 240, { min: 0 });
    const instagramIntervalMinutes = parseIntArg(args, "instagramIntervalMinutes", 720, { min: 0 });
    const otherIntervalMinutes = parseIntArg(args, "otherIntervalMinutes", 720, { min: 0 });
    const intervalSlackMinutes = parseIntArg(args, "intervalSlackMinutes", 5, { min: 0 });
    const playUrlSafetyMinutes = parseIntArg(args, "playUrlSafetyMinutes", 15, { min: 0 });

    const intervals = {
        tiktok: minutesToMs(tiktokIntervalMinutes),
        instagram: minutesToMs(instagramIntervalMinutes),
        other: minutesToMs(otherIntervalMinutes),
        slack: minutesToMs(intervalSlackMinutes),
    };
    const playUrlSafetyMs = minutesToMs(playUrlSafetyMinutes);

    console.log(
        `sync-enabled-accounts: start (concurrency=${concurrency}, recent=${recentLimit}, pinned=${pinnedLimit}, thumbnailLimit=${thumbnailLimit || "auto"}, playLimit=${playLimit || "auto"}, pruneLimit=${pruneLimit || "auto"}, keepFeatured=${keepFeatured ? "yes" : "no"}, instagramSerialized=${instagramSerialized ? "yes" : "no"}, instagramDelayMs=${Math.min(instagramDelayMinMs, instagramDelayMaxMs)}-${Math.max(instagramDelayMinMs, instagramDelayMaxMs)}, tiktokEvery=${tiktokIntervalMinutes}m, instagramEvery=${instagramIntervalMinutes}m, playUrlSafety=${playUrlSafetyMinutes}m)`,
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
    let playUrlsRefreshedAccounts = 0;
    let playUrlsRefreshedVideos = 0;
    let instagramGate = Promise.resolve();

    const withInstagramGate = async (account, worker) => {
        if (account.platform !== "instagram" || !instagramSerialized) {
            return await worker();
        }

        let release;
        const previous = instagramGate;
        instagramGate = new Promise((resolve) => {
            release = resolve;
        });

        await previous;
        try {
            return await worker();
        } finally {
            release();
        }
    };

    await mapLimit(accounts, concurrency, async (account) => {
        return await withInstagramGate(account, async () => {
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
                console.log(
                    `sync-enabled-accounts: skipped ${label} lastRunAt=${account.sync_last_run_at ?? "none"} intervalMs=${intervalMs}`,
                );
                skippedCount += 1;
                return { ok: true, label, skipped: true };
            }

            if (account.platform === "instagram") {
                const jitterMs = randomBetween(instagramDelayMinMs, instagramDelayMaxMs);
                if (jitterMs > 0) {
                    console.log(`sync-enabled-accounts: instagram jitter ${label} wait=${jitterMs}ms`);
                    await sleep(jitterMs);
                }
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
                        startedAt: summary.started_at,
                    });
                    refreshedAccounts += 1;
                    console.log(
                        `sync-enabled-accounts: tiktok thumbs refreshed ${label} refreshed=${refreshed.refreshed}/${refreshed.total}`,
                    );
                }

                await pruneAccountVideos(account, {
                    recentLimit,
                    pinnedLimit,
                    pruneLimit,
                    keepFeatured,
                    refreshCutoff: summary.started_at,
                });

                try {
                    const playRefresh = await refreshAccountPlayUrls(account, {
                        recentLimit,
                        pinnedLimit,
                        playLimit,
                        playUrlSafetyMs,
                        startedAt: summary.started_at,
                    });
                    playUrlsRefreshedAccounts += 1;
                    playUrlsRefreshedVideos += playRefresh.refreshed;
                    console.log(
                        `sync-enabled-accounts: play urls refreshed ${label} refreshed=${playRefresh.refreshed} skippedFresh=${playRefresh.skippedFresh} failed=${playRefresh.failed} total=${playRefresh.total}`,
                    );
                } catch (playError) {
                    const playMessage =
                        playError instanceof Error ? playError.message : String(playError);
                    console.warn(`sync-enabled-accounts: play url refresh failed ${label}: ${playMessage}`);
                }

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
                let fallbackResult = null;
                let fallbackMessage = null;
                try {
                    const refreshed = await refreshAccountThumbnails(account, {
                        recentLimit,
                        pinnedLimit,
                        thumbnailLimit,
                        startedAt,
                        clearSyncError: false,
                    });
                    console.log(
                        `sync-enabled-accounts: fallback ok ${label} refreshed=${refreshed.refreshed}/${refreshed.total}`,
                    );
                    fallbackResult = refreshed;
                } catch (fallbackError) {
                    fallbackMessage =
                        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                    console.warn(`sync-enabled-accounts: fallback failed ${label}: ${fallbackMessage}`);
                }

                try {
                    await pruneAccountVideos(account, {
                        recentLimit,
                        pinnedLimit,
                        pruneLimit,
                        keepFeatured,
                        refreshCutoff: startedAt,
                    });
                } catch (pruneError) {
                    const pruneMessage =
                        pruneError instanceof Error ? pruneError.message : String(pruneError);
                    console.warn(`sync-enabled-accounts: prune failed ${label}: ${pruneMessage}`);
                }

                if (fallbackResult) {
                    okCount += 1;
                    return { ok: true, label, fallback: true, refreshed: fallbackResult };
                }

                failedCount += 1;
                await updateAccount(account.id, {
                    sync_last_run_at: Date.now(),
                    sync_error: `sync failed: ${message}; fallback failed: ${fallbackMessage ?? "unknown"}`.slice(0, 500),
                }).catch(() => null);
                return { ok: false, label, error: message, fallbackError: fallbackMessage };
            }
        });
    });

    console.log(
        `sync-enabled-accounts: done ok=${okCount} failed=${failedCount} attemptsFailed=${attemptFailedCount} skipped=${skippedCount} tiktokThumbsRefreshed=${refreshedAccounts} playUrlAccounts=${playUrlsRefreshedAccounts} playUrlsRefreshed=${playUrlsRefreshedVideos}`,
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
