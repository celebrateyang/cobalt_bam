import { claimSource, ingestSource } from "../video-agent/ingestion.js";
import { closePool } from "../db/pg-client.js";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
try {
    if (process.env.VIDEO_AGENT_INGEST_ENABLED !== "1") throw new Error("Set VIDEO_AGENT_INGEST_ENABLED=1 to run material ingestion");
    do {
        const source = await claimSource();
        if (source) await ingestSource(source);
        else if (process.argv.includes("--once")) break;
        else await new Promise((resolve) => setTimeout(resolve, 3000));
    } while (!stopping && !process.argv.includes("--once"));
} catch (error) {
    console.error(`[VIDEO AGENT] ingestion_stopped code=${error.code || "SERVER_ERROR"}`);
    process.exitCode = 1;
} finally { await closePool(); }
