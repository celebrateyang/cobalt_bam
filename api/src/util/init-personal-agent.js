import "../config.js";
import { ensurePersonalAgentSchema } from "../db/personal-agent.js";
import { closePool } from "../db/pg-client.js";

try {
    await ensurePersonalAgentSchema();
    console.log("Personal agent schema initialized");
} catch {
    console.error("Personal agent schema initialization failed");
    process.exitCode = 1;
} finally { await closePool(); }
