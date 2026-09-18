import { ensureVideoAgentSchema } from "../db/video-agent.js";
import { closePool } from "../db/pg-client.js";
import { ensureAiVideoSchema } from "../db/ai-video.js";
try { await ensureVideoAgentSchema(); await ensureAiVideoSchema(); console.log("Video Agent and shared usage schema initialized"); }
catch (error) { console.error(`Video Agent schema initialization failed: ${error.code || "SERVER_ERROR"}`); process.exitCode = 1; }
finally { await closePool(); }
