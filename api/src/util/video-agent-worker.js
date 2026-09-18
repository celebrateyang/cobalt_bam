import { randomUUID } from "node:crypto";
import { workerTick } from "../video-agent/worker.js";
import { closePool } from "../db/pg-client.js";
import { ensureAiVideoSchema } from "../db/ai-video.js";
const controller=new AbortController();
process.on("SIGTERM",()=>controller.abort());process.on("SIGINT",()=>controller.abort());
const workerId=`${process.env.HOSTNAME || "local"}-${randomUUID()}`;
try{
    if(process.env.VIDEO_AGENT_WORKER_ENABLED!=="1")throw new Error("Worker is not enabled");
    await ensureAiVideoSchema();
    do{
        const worked=await workerTick({ workerId,signal:controller.signal });
        if(!worked && !controller.signal.aborted && !process.argv.includes("--once"))await new Promise((resolve)=>setTimeout(resolve,3000));
    }while(!controller.signal.aborted && !process.argv.includes("--once"));
}catch(error){ console.error(`[VIDEO AGENT WORKER] stopped code=${error.code || "SERVER_ERROR"}`);process.exitCode=1; }
finally{ await closePool(); }
