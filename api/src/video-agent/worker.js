import { mkdtemp,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { advanceRuns,claimStep,failStep,heartbeatStep,saveCheckpoint,commitCheckpoint,succeedStep } from "./worker-store.js";
import { uploadJsonArtifact, readJsonArtifact,uploadAudioArtifact,readAudioArtifact } from "./worker-artifacts.js";
import { productionHandlers,availableProductionHandlers } from "./worker-handlers.js";

export const executeClaim = async (claim,{ handlers=productionHandlers,signal,leaseMs=120000,heartbeatMs=15000,timeoutMs=30*60*1000 }={}) => {
    const startedAt=Date.now();
    const context={projectId:claim.projectId,runId:claim.run.id,stepId:claim.step.id,stage:claim.step.stage,attempt:claim.step.attempt,fencingToken:claim.step.fencing_token};
    console.info("[VIDEO AGENT WORKER]",JSON.stringify({...context,event:"attempt.started"}));
    const controller=new AbortController();
    const abort=() => controller.abort(Object.assign(new Error("Worker stopping"),{ code:"VIDEO_AGENT_WORKER_INTERRUPTED" }));
    signal?.addEventListener("abort",abort,{ once:true }); if(signal?.aborted) abort();
    let deadline,active=true,workDir;
    const watchdog=(expiresAt) => { if(!active)return;clearTimeout(deadline);deadline=setTimeout(()=>controller.abort(Object.assign(new Error("Lease watchdog expired"),{ code:"VIDEO_AGENT_LEASE_LOST" })),Math.max(1,expiresAt-Date.now()-100)); };
    watchdog(Number(claim.step.lease_expires_at));
    const timeout=setTimeout(()=>controller.abort(Object.assign(new Error("Step timed out"),{ code:"ETIMEDOUT" })),timeoutMs);
    let beating=false;
    const heartbeat=setInterval(async () => { if(beating || controller.signal.aborted)return;beating=true;try{ const renewed=await heartbeatStep(claim,{ leaseMs });watchdog(renewed.leaseExpiresAt); }catch(error){ controller.abort(error); }finally{ beating=false; } },heartbeatMs);
    try {
        workDir=await mkdtemp(path.join(os.tmpdir(),"fsv-agent-step-"));
        controller.signal.throwIfAborted();
        const handler=handlers[claim.step.stage]; if(!handler)throw new Error("No stage handler");
        const result=await handler({ claim,signal:controller.signal,workDir,checkpoint:claim.step.checkpoint,dependencies:claim.dependencies,
            saveCheckpoint:(checkpoint)=>saveCheckpoint(claim,checkpoint),commitCheckpoint:(result)=>commitCheckpoint(claim,result),readArtifact:(id,options)=>readJsonArtifact(claim,id,{...options,signal:controller.signal}),artifact:(value,options)=>uploadJsonArtifact(claim,value,{...options,signal:controller.signal}),
            audioArtifact:(filename)=>uploadAudioArtifact(claim,filename,{signal:controller.signal}),
            fileArtifact:(filename,options)=>uploadAudioArtifact(claim,filename,{...options,signal:controller.signal}),
            readFileArtifact:(id,filename,options)=>readAudioArtifact(claim,id,{...options,filename,signal:controller.signal}),
            readAudioArtifact:(id,filename)=>readAudioArtifact(claim,id,{signal:controller.signal,filename}) });
        controller.signal.throwIfAborted(); await succeedStep(claim,result);
        console.info("[VIDEO AGENT WORKER]",JSON.stringify({...context,event:"attempt.succeeded",durationMs:Date.now()-startedAt}));
    }catch(error){
        console.info("[VIDEO AGENT WORKER]",JSON.stringify({...context,event:"attempt.interrupted",durationMs:Date.now()-startedAt,errorCode:/^[A-Z0-9_]{1,80}$/.test(error.code || "")?error.code:"VIDEO_AGENT_STEP_FAILED"}));
        try{ await failStep(claim,error); }catch(lost){ if(lost.code!=="VIDEO_AGENT_LEASE_LOST")throw lost; }
    }
    finally{ active=false;clearTimeout(deadline);clearTimeout(timeout);clearInterval(heartbeat);signal?.removeEventListener("abort",abort);if(workDir)await rm(workDir,{ recursive:true,force:true }); }
};
export const workerTick = async ({ workerId,handlers=availableProductionHandlers(),signal,leaseMs=120000,heartbeatMs=15000 }={}) => {
    await advanceRuns(); if(signal?.aborted)return false;
    const claim=await claimStep({ workerId,stages:Object.keys(handlers),leaseMs });
    if(!claim)return false;
    await executeClaim(claim,{ handlers,signal,leaseMs,heartbeatMs });await advanceRuns();return true;
};
