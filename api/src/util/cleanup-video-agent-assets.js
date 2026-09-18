import { cleanupVideoAgent } from "../video-agent/cleanup.js";
import { closePool } from "../db/pg-client.js";
try { console.log("[VIDEO AGENT CLEANUP]", await cleanupVideoAgent()); }
catch (error) { console.error(`[VIDEO AGENT CLEANUP] failed code=${error.code || "SERVER_ERROR"}`); process.exitCode = 1; }
finally { await closePool(); }
