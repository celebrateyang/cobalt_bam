import { ensureVideoAgentSchema } from "../db/video-agent.js";
import { closePool } from "../db/pg-client.js";
try { await ensureVideoAgentSchema(); console.log("Video Agent schema initialized"); }
catch (error) { console.error(`Video Agent schema initialization failed: ${error.code || "SERVER_ERROR"}`); process.exitCode = 1; }
finally { await closePool(); }
