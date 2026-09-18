import {agentError} from "../db/video-agent.js";
import {hashInput} from "./plans.js";
import {getTranslationConfig} from "./translation-config.js";
import {translationAdapter,parseTranslationResponse} from "./translation-adapter.js";
import {prepareTranslation,validateTranslations} from "./translate-cues.js";
import {validateTranslatedClips} from "./translated-contract.js";
export const createTranslateHandler=({provider=translationAdapter}={})=>async({claim,dependencies,checkpoint,signal,readArtifact,artifact,commitCheckpoint})=>{
    signal.throwIfAborted();const config=getTranslationConfig(claim.run.plan),source=claim.run.source_snapshot;
    if(hashInput(config)!==hashInput(claim.step.input_snapshot.config))throw agentError("VIDEO_AGENT_TRANSLATION_CONFIG_CHANGED",409,"Translation configuration changed; create a new run");
    const dependency=dependencies.find(step=>step.stage==="select_clips"),ref=dependency?.checkpoint?.selectedClipsRef;
    if(!ref)throw agentError("VIDEO_AGENT_TRANSLATION_DEPENDENCY_INVALID",409,"Selected clips unavailable");
    const selected=await readArtifact(ref),transcript=await readArtifact(selected.sourceTranscriptRef,{kind:"transcript"});
    if(selected.version!=="selected-clips-v1" || transcript.version!=="normalized-transcript-v1" || [selected,transcript].some(value=>value.sourceChecksum!==source.checksum || value.durationMs!==source.durationMs))throw agentError("VIDEO_AGENT_TRANSLATION_SOURCE_INVALID",409,"Translation source mismatch");
    if(!selected.clips.length)throw agentError("VIDEO_AGENT_NO_VALID_CLIPS",422,"No valid clips to translate");
    const {cues,batches}=prepareTranslation(selected,transcript,config),configHash=hashInput({config,dependencyHash:dependency.input_hash,sourceChecksum:source.checksum});
    if(checkpoint?.version!==config.version || checkpoint.configHash!==configHash)checkpoint={version:config.version,configHash,nodes:[]};
    if(!Array.isArray(checkpoint.nodes) || checkpoint.nodes.length>config.maxNodes || new Set(checkpoint.nodes.map(node=>node.id)).size!==checkpoint.nodes.length || checkpoint.nodes.some(node=>typeof node.id!=="string" || !/^batch-\d+(?:[LR])*$/.test(node.id) || !Array.isArray(node.rawRefs) || node.rawRefs.length>2))throw agentError("VIDEO_AGENT_TRANSLATION_CHECKPOINT_INVALID",409,"Invalid translation checkpoint");
    const refs=()=>checkpoint.nodes.flatMap(node=>[...node.rawRefs,node.validatedRef].filter(Boolean));
    const persist=assets=>commitCheckpoint({checkpoint,assets,outputRefs:refs(),provider:config.provider,model:config.model});
    const process=async batch=>{
        signal.throwIfAborted();let node=checkpoint.nodes.find(value=>value.id===batch.id);const batchHash=hashInput(batch);
        if(!node){if(checkpoint.nodes.length>=config.maxNodes)throw agentError("VIDEO_AGENT_TRANSLATION_TOO_MANY_BATCHES",422,"Translation recovery budget exceeded");node={id:batch.id,batchHash,rawRefs:[]};checkpoint.nodes.push(node);}
        if(node.batchHash!==batchHash)throw agentError("VIDEO_AGENT_TRANSLATION_CHECKPOINT_INVALID",409,"Translation batch mismatch");
        if(node.validatedRef){const stored=await readArtifact(node.validatedRef);if(stored.configHash!==configHash || stored.batchHash!==batchHash)throw agentError("VIDEO_AGENT_TRANSLATION_CHECKPOINT_INVALID",409,"Translation output mismatch");return validateTranslations({translations:stored.translations.map(({cueId,translatedText})=>({cueId,translatedText}))},batch,config);}
        if(!node.split)for(let attempt=0;attempt<2;attempt++){
            if(!node.rawRefs[attempt]){const response=await provider.translate({batch,config,signal,repair:attempt>0});signal.throwIfAborted();const raw=await artifact({configHash,batchHash,response});node.rawRefs[attempt]=raw.id;await persist([raw]);}
            const raw=await readArtifact(node.rawRefs[attempt]);if(raw.configHash!==configHash || raw.batchHash!==batchHash)throw agentError("VIDEO_AGENT_TRANSLATION_CHECKPOINT_INVALID",409,"Translation raw output mismatch");
            let translations;
            try{translations=validateTranslations(parseTranslationResponse(raw.response.raw),batch,config);}catch(error){if(error.code!=="VIDEO_AGENT_TRANSLATION_FORMAT_INVALID")throw error;if(attempt===0)continue;if(batch.items.length===1){node.failedCueId=batch.items[0].cueId;await persist([]);throw agentError("VIDEO_AGENT_TRANSLATION_CUE_FAILED",422,"A subtitle could not be translated",{cueId:node.failedCueId});}node.split=true;await persist([]);break;}
            const output=await artifact({configHash,batchHash,translations});node.validatedRef=output.id;await persist([output]);return translations;
        }
        const middle=Math.floor(batch.items.length/2),child=(items,suffix,adjacent)=>{
            const owned=new Set(items.map(item=>item.cueId)),context=new Map([...batch.context,...adjacent.map(item=>({cueId:item.cueId,text:item.text}))].filter(item=>!owned.has(item.cueId)).map(item=>[item.cueId,item]));
            const result={...batch,id:batch.id+suffix,items,context:[...context.values()]};
            if(Buffer.byteLength(JSON.stringify({...result,glossary:config.glossary}))>config.maxInputBytes)throw agentError("VIDEO_AGENT_TRANSLATION_INPUT_TOO_LARGE",422,"Translation context exceeds budget");return result;
        },left=child(batch.items.slice(0,middle),"L",batch.items.slice(middle,middle+2)),right=child(batch.items.slice(middle),"R",batch.items.slice(Math.max(0,middle-2),middle));
        return [...await process(left),...await process(right)];
    };
    const translations=[];for(const batch of batches)translations.push(...await process(batch));
    signal.throwIfAborted();const byId=new Map(translations.map(item=>[item.cueId,item]));
    const translatedCues=cues.map(cue=>({...cue,translatedText:byId.get(cue.id).translatedText,translationFlags:byId.get(cue.id).flags}));
    const requiresReview=!!transcript.requiresReview || translatedCues.some(cue=>cue.translationFlags.length || cue.flags?.length);
    const handoff=validateTranslatedClips({version:"translated-clips-v1",configHash,config,sourceChecksum:source.checksum,durationMs:source.durationMs,sourceSelectedClipsRef:ref,sourceTranscriptRef:selected.sourceTranscriptRef,clips:selected.clips,cues:translatedCues,shortfall:selected.shortfall,shortfallReason:selected.shortfallReason,requiresReview},{sourceChecksum:source.checksum,durationMs:source.durationMs,targetLanguage:config.targetLanguage,...claim.run.plan.clips});
    const output=await artifact(handoff,{kind:"transcript"});
    return {checkpoint:{...checkpoint,translatedClipsRef:output.id,translatedCueCount:translatedCues.length,selectedCount:selected.clips.length,requiresReview},assets:[output],outputRefs:[...refs(),output.id],provider:config.provider,model:config.model};
};
export const translateHandler=createTranslateHandler();
