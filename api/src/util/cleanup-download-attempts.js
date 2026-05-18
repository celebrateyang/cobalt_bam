import "../config.js";
import { closePool } from "../db/pg-client.js";
import {
    cleanupOldDownloadAttempts,
    initDownloadAttemptsDatabase,
} from "../db/download-attempts.js";

const RETENTION_DAYS = 2;

const run = async () => {
    await initDownloadAttemptsDatabase();
    const result = await cleanupOldDownloadAttempts({
        retentionDays: RETENTION_DAYS,
    });

    console.log(
        `[download-attempts-cleanup] retention_days=${RETENTION_DAYS} cutoff=${result.cutoff ?? "n/a"} deleted=${result.deleted ?? 0}`,
    );
};

run()
    .then(async () => {
        await closePool();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error("[download-attempts-cleanup] failed:", error);
        try {
            await closePool();
        } catch {
            // ignore close failure
        }
        process.exit(1);
    });
