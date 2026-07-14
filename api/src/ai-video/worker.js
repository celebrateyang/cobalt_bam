import os from "node:os";

import { claimAiVideoJob, ensureAiVideoSchema, heartbeatAiVideoJob, heartbeatAiVideoWorker } from "../db/ai-video.js";
import { processAiVideoJob } from "./pipeline.js";

const workerId = process.env.AI_VIDEO_WORKER_ID || `${os.hostname()}:${process.pid}`;
const heartbeatMs = Number(process.env.AI_VIDEO_WORKER_HEARTBEAT_MS || 15000);
const leaseMs = Number(process.env.AI_VIDEO_WORKER_LEASE_MS || 120000);
const pollMs = Number(process.env.AI_VIDEO_WORKER_POLL_MS || 3000);

const heartbeat = async () => {
    await heartbeatAiVideoWorker({
        workerId,
        metadata: { version: "3B", pid: process.pid, hostname: os.hostname() },
    });
};

const main = async () => {
    await ensureAiVideoSchema();
    await heartbeat();
    console.log(`[AI VIDEO WORKER] worker_id=${workerId} product=argoCD stage=3B ready=true`);
    setInterval(() => {
        heartbeat().catch((error) => console.error("[AI VIDEO WORKER] heartbeat failed", error));
    }, heartbeatMs);
    while (true) {
        const job = await claimAiVideoJob({ workerId, leaseMs });
        if (!job) {
            await new Promise((resolve) => setTimeout(resolve, pollMs));
            continue;
        }
        const jobHeartbeat = setInterval(() => {
            heartbeatAiVideoJob({ jobId: job.id, workerId, leaseMs })
                .catch((error) => console.error(`[AI VIDEO WORKER] job_id=${job.id} heartbeat_failed=${error.message}`));
        }, Math.max(5000, Math.floor(leaseMs / 3)));
        try {
            await processAiVideoJob({ job, workerId });
        } finally {
            clearInterval(jobHeartbeat);
        }
    }
};

main().catch((error) => {
    console.error("[AI VIDEO WORKER] startup failed", error);
    process.exitCode = 1;
});
