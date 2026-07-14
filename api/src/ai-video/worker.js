import os from "node:os";

import { ensureAiVideoSchema, heartbeatAiVideoWorker } from "../db/ai-video.js";

const workerId = process.env.AI_VIDEO_WORKER_ID || `${os.hostname()}:${process.pid}`;
const heartbeatMs = Number(process.env.AI_VIDEO_WORKER_HEARTBEAT_MS || 15000);

const heartbeat = async () => {
    await heartbeatAiVideoWorker({
        workerId,
        metadata: { version: "3A", pid: process.pid, hostname: os.hostname() },
    });
};

const main = async () => {
    await ensureAiVideoSchema();
    await heartbeat();
    console.log(`[AI VIDEO WORKER] worker_id=${workerId} product=argoCD stage=3A ready=true`);
    setInterval(() => {
        heartbeat().catch((error) => console.error("[AI VIDEO WORKER] heartbeat failed", error));
    }, heartbeatMs);
};

main().catch((error) => {
    console.error("[AI VIDEO WORKER] startup failed", error);
    process.exitCode = 1;
});
