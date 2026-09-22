import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {getSelectConfig} from "./select-config.js";
import {selectionAdapter,parseSelectionResponse} from "./selection-adapter.js";
import {buildSelectionWindows,validateCandidates,rankCandidates} from "./select-clips.js";

export const createSelectHandler=({provider=selectionAdapter}={})=>async({claim,dependencies,checkpoint,signal,readArtifact,artifact,commitCheckpoint})=>{
    signal.throwIfAborted();
    const config=getSelectConfig(),limits=claim.run.plan.clips,source=claim.run.source_snapshot;
    if(hashInput(claim.step.input_snapshot.config)!==hashInput({...config,limits}))throw agentError("VIDEO_AGENT_SELECTION_CONFIG_CHANGED",409,"Selection configuration changed; create a new run");
    const dependency=dependencies.find(step=>step.stage==="normalize"),ref=dependency?.checkpoint?.normalizedTranscriptRef;
    if(!ref)throw agentError("VIDEO_AGENT_SELECTION_DEPENDENCY_INVALID",409,"Normalized transcript unavailable");
    const transcript=await readArtifact(ref,{kind:"transcript"});
    if(transcript.version!=="normalized-transcript-v1" || transcript.sourceChecksum!==source.checksum || transcript.durationMs!==source.durationMs)throw agentError("VIDEO_AGENT_SELECTION_SOURCE_INVALID",409,"Selection source mismatch");
    const windows=buildSelectionWindows(transcript,config),configHash=hashInput({config,limits,sourceChecksum:source.checksum,dependencyHash:dependency.input_hash});
    if(checkpoint?.version!==config.version || checkpoint.configHash!==configHash)checkpoint={version:config.version,configHash,windows:[]};
    if(!Array.isArray(checkpoint.windows) || checkpoint.windows.length>windows.length || new Set(checkpoint.windows.map(item=>item.ordinal)).size!==checkpoint.windows.length || checkpoint.windows.some(item=>!Number.isInteger(item.ordinal) || !windows[item.ordinal] || !Array.isArray(item.rawRefs) || item.rawRefs.length>2))throw agentError("VIDEO_AGENT_SELECTION_CHECKPOINT_INVALID",409,"Invalid selection checkpoint");
    const refs=()=>[ref,...checkpoint.windows.flatMap(item=>[...item.rawRefs,item.validatedRef].filter(Boolean))];
    const persist=assets=>commitCheckpoint({checkpoint,assets,outputRefs:refs(),provider:config.provider,model:config.model});
    const batches=[];
    for(const window of windows){
        signal.throwIfAborted();let saved=checkpoint.windows.find(item=>item.ordinal===window.ordinal);
        if(!saved){saved={ordinal:window.ordinal,rawRefs:[]};checkpoint.windows.push(saved);}
        let batch;
        if(saved.validatedRef){const stored=await readArtifact(saved.validatedRef);if(stored.configHash!==configHash || stored.ordinal!==window.ordinal)throw agentError("VIDEO_AGENT_SELECTION_CHECKPOINT_INVALID",409,"Invalid candidate artifact");batch=stored.batch;}
        else for(let attempt=0;attempt<2;attempt++){
            if(!saved.rawRefs[attempt]){const response=await provider.suggest({window,limits,config,signal,repair:attempt>0});signal.throwIfAborted();const raw=await artifact({configHash,ordinal:window.ordinal,response});saved.rawRefs[attempt]=raw.id;await persist([raw]);}
            const raw=await readArtifact(saved.rawRefs[attempt]);if(raw.configHash!==configHash || raw.ordinal!==window.ordinal)throw agentError("VIDEO_AGENT_SELECTION_CHECKPOINT_INVALID",409,"Invalid raw selection artifact");
            try{batch=validateCandidates(parseSelectionResponse(raw.response.raw),window,transcript.cues,limits);}catch(error){
                if(["VIDEO_AGENT_SELECTION_FORMAT_INVALID","VIDEO_AGENT_SELECTION_INCOMPLETE"].includes(error.code) && attempt===0)continue;
                if(error.code==="VIDEO_AGENT_SELECTION_INCOMPLETE"){
                    console.warn(`[VIDEO AGENT SELECTION] ${JSON.stringify({runId:claim.run.id,stepId:claim.step.id,windowOrdinal:window.ordinal,event:"window.skipped",reason:error.context?.reason || "incomplete"})}`);
                    batch={clips:[],rejected:[{code:"model_incomplete",windowOrdinal:window.ordinal,reason:error.context?.reason || null}]};
                }else throw error;
            }
            const output=await artifact({configHash,ordinal:window.ordinal,batch});saved.validatedRef=output.id;await persist([output]);break;
        }
        batches.push(batch);
    }
    signal.throwIfAborted();const result=rankCandidates(batches,{requestedCount:limits.requestedCount,sourceChecksum:source.checksum,configHash});
    const output=await artifact({version:"selected-clips-v1",sourceChecksum:source.checksum,durationMs:source.durationMs,sourceTranscriptRef:ref,configHash,config,...result});
    return {checkpoint:{...checkpoint,selectedClipsRef:output.id,selectedCount:result.selectedCount,shortfall:result.shortfall,shortfallReason:result.shortfallReason},assets:[output],outputRefs:[...refs(),output.id],provider:config.provider,model:config.model};
};
export const selectHandler=createSelectHandler();
