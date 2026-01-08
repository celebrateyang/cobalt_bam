import "../config.js";
import { query, closePool } from "../db/pg-client.js";
import { updateAccount, updateVideo } from "../db/social-media.js";
import { fetchOembedForAccount, syncAccountVideos } from "../processing/social/sync.js";

const parseIntArg = (args, name, fallback) => {
    const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

const getEnabledAccounts = async () => {
    const res = await query(
        `
        SELECT id, platform, username, display_name
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

const refreshAccountThumbnails = async (account, options) => {
    const startedAt = Date.now();
    const limit = options.pinnedLimit + options.recentLimit;
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

const run = async () => {
    const args = process.argv.slice(2);
    const concurrency = parseIntArg(args, "concurrency", 2);
    const recentLimit = parseIntArg(args, "recent", 5);
    const pinnedLimit = parseIntArg(args, "pinned", 3);

    console.log(
        `sync-enabled-accounts: start (concurrency=${concurrency}, recent=${recentLimit}, pinned=${pinnedLimit})`,
    );

    const accounts = await getEnabledAccounts();
    if (!accounts.length) {
        console.log("sync-enabled-accounts: no enabled accounts");
        return;
    }

    console.log(`sync-enabled-accounts: syncing ${accounts.length} accounts`);

    await mapLimit(accounts, concurrency, async (account) => {
        const label = `${account.platform}:${account.username} (#${account.id})`;
        const startedAt = Date.now();

        try {
            const summary = await syncAccountVideos(account, { recentLimit, pinnedLimit });
            console.log(
                `sync-enabled-accounts: ok ${label} created=${summary.created} updated=${summary.updated} total=${summary.total} in=${Date.now() - startedAt}ms`,
            );
            return { ok: true, label, summary };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`sync-enabled-accounts: failed ${label}: ${message}`);

            await updateAccount(account.id, {
                sync_last_run_at: Date.now(),
                sync_error: message.slice(0, 500),
            }).catch(() => null);

            // Fallback: refresh thumbnails for existing videos using oEmbed.
            try {
                const refreshed = await refreshAccountThumbnails(account, { recentLimit, pinnedLimit });
                console.log(
                    `sync-enabled-accounts: fallback ok ${label} refreshed=${refreshed.refreshed}/${refreshed.total}`,
                );
                return { ok: true, label, fallback: true, refreshed };
            } catch (fallbackError) {
                const fallbackMessage =
                    fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                console.warn(`sync-enabled-accounts: fallback failed ${label}: ${fallbackMessage}`);
                await updateAccount(account.id, {
                    sync_last_run_at: Date.now(),
                    sync_error: `sync failed: ${message}; fallback failed: ${fallbackMessage}`.slice(0, 500),
                }).catch(() => null);
                return { ok: false, label, error: message, fallbackError: fallbackMessage };
            }
        }
    });
};

await run()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool().catch(() => null);
    });
