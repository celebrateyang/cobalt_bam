import "../config.js";
import { closePool, query } from "../db/pg-client.js";

const RETENTION_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const run = async () => {
    const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
    const result = await query(
        `
        DELETE FROM user_points_holds
        WHERE created_at < $1;
        `,
        [cutoff],
    );

    console.log(
        `[points-holds-cleanup] retention_days=${RETENTION_DAYS} cutoff=${cutoff} deleted=${result.rowCount ?? 0}`,
    );
};

run()
    .then(async () => {
        await closePool();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error("[points-holds-cleanup] failed:", error);
        try {
            await closePool();
        } catch {
            // ignore close failure
        }
        process.exit(1);
    });
