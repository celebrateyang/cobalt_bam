import {randomUUID} from "node:crypto";
import {agentError,agentQuery,ownedProject,transaction} from "../db/video-agent.js";
import {normalizePlan,UUID} from "./plans.js";
import {getPlan,submitCommand} from "./execution.js";
import {parsePlannerResponse,plannerAdapter} from "./planner-adapter.js";
import {editAdapter,isEditRequest,validateEditCandidate} from "./edit-adapter.js";
import {getEditableResults} from "./results.js";
import {executePlanTools} from "./tools.js";
import {messageDTO} from "./conversation.js";
import {resolveMessageSource} from "./source-resolver.js";
import {getTtsConfig,ttsConfigured} from "./tts-config.js";

const requiredKeys=["status","reply","sourceRef","sourceExplicit","sourceLanguage","targetLanguage","targetLanguageExplicit","requestedCount","minSeconds","maxSeconds","subtitleMode","executionIntent","missing","unsupportedCapabilities"];
const languageCodes=new Set(["de","en","es","fr","id","ja","ko","ru","th","vi","zh"]);
const safeReply=value=>typeof value==="string" && value.trim() && value.trim().length<=800 && Buffer.byteLength(value.trim())<=4096 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const safeMetadata=value=>typeof value==="string" && value.length<=200 && /^[A-Za-z0-9._:/-]+$/.test(value)?value:null;
const explicitDubIntent=text=>{
    const request=String(text || "");
    if(/\b(?:no|not|without|don't|do not)\s+(?:\w+\s+){0,2}(?:dub|dubbing|voiceover)\b|不要配音|不配音|保留原音|吹き替えない|더빙하지|sin doblaje|sans doublage/iu.test(request))return false;
    return /\b(?:dub|dubbing|voice.?over|synchronisier|doublage|doblaje|doblar|sulih suara|ozvuch|long tieng)\b|配音|吹き替え|더빙|озвуч|พากย์|lồng tiếng/iu.test(request);
};

const validateCandidate=(value,sources,requestText="")=>{
    if(!value || typeof value!=="object" || Array.isArray(value) || ![requiredKeys.length,requiredKeys.length+1].includes(Object.keys(value).length) || Object.keys(value).some(key=>![...requiredKeys,"dubbingRequested"].includes(key)))throw agentError("VIDEO_AGENT_PLANNER_FORMAT_INVALID",422,"Planner fields are invalid");
    if(!["ready","needs_input","unsupported"].includes(value.status) || !safeReply(value.reply)
        || typeof value.sourceExplicit!=="boolean" || !["auto",...languageCodes].includes(value.sourceLanguage) || (value.targetLanguage!==null && !languageCodes.has(value.targetLanguage))
        || typeof value.targetLanguageExplicit!=="boolean" || !Number.isInteger(value.requestedCount) || value.requestedCount<1 || value.requestedCount>5
        || !Number.isInteger(value.minSeconds) || !Number.isInteger(value.maxSeconds) || value.minSeconds<15 || value.maxSeconds>90 || value.maxSeconds<value.minSeconds
        || !["translated","bilingual"].includes(value.subtitleMode) || !["plan_only","execute"].includes(value.executionIntent)
        || !Array.isArray(value.missing) || value.missing.some(item=>!["source","target_language"].includes(item)) || new Set(value.missing).size!==value.missing.length
        || !Array.isArray(value.unsupportedCapabilities) || value.unsupportedCapabilities.some(item=>item!=="dubbing") || value.unsupportedCapabilities.length>1
        || (value.dubbingRequested!==undefined && typeof value.dubbingRequested!=="boolean"))throw agentError("VIDEO_AGENT_PLANNER_FORMAT_INVALID",422,"Planner values are invalid");
    const available=new Map(sources.map(source=>[source.id.toLowerCase(),source]));
    let sourceRef=value.sourceRef;
    if(sourceRef!==null && (typeof sourceRef!=="string" || !UUID.test(sourceRef) || !available.has(sourceRef.toLowerCase())))throw agentError("VIDEO_AGENT_PLANNER_FORMAT_INVALID",422,"Planner selected an unavailable source");
    if(sources.length===1)sourceRef=sources[0].id;
    if(sources.length>1 && !value.sourceExplicit)sourceRef=null;
    const needsSource=!sourceRef;
    const needsTarget=!value.targetLanguageExplicit || value.targetLanguage===null;
    const dubbingRequested=value.dubbingRequested===true;
    if(dubbingRequested && !explicitDubIntent(requestText))throw agentError("VIDEO_AGENT_PLANNER_FORMAT_INVALID",422,"Dubbing requires an explicit user request");
    const unsupported=value.unsupportedCapabilities.length>0 || dubbingRequested&&!ttsConfigured();
    const expectedStatus=unsupported?"unsupported":needsSource || needsTarget?"needs_input":"ready";
    const expectedMissing=[...(needsSource?["source"]:[]),...(needsTarget?["target_language"]:[])];
    if(value.status!==expectedStatus || value.missing.length!==expectedMissing.length || expectedMissing.some(item=>!value.missing.includes(item)))throw agentError("VIDEO_AGENT_PLANNER_FORMAT_INVALID",422,"Planner readiness is inconsistent");
    const base={...value,dubbingRequested,reply:value.reply.trim(),sourceRef:sourceRef?.toLowerCase() || null,missing:expectedMissing};
    if(expectedStatus!=="ready")return {outcome:base,plan:null};
    const plan=normalizePlan({sourceRef:base.sourceRef,operation:"highlight_clips",sourceLanguage:base.sourceLanguage,targetLanguage:base.targetLanguage,
        clips:{requestedCount:base.requestedCount,minSeconds:base.minSeconds,maxSeconds:base.maxSeconds},video:{aspectRatio:"9:16",preset:"tiktok"},
        subtitles:{enabled:true,mode:base.subtitleMode},dubbing:{enabled:dubbingRequested,voiceId:dubbingRequested?getTtsConfig().voiceId:null},executionMode:"execute"});
    return {outcome:base,plan};
};

const assistantClientId=messageId=>`assistant_${messageId.replaceAll("-","")}`;
const terminalSourceStatuses=new Set(["failed","expired","deleting","deleted"]);
const claimMessage=input=>transaction(async client=>{
    const project=await ownedProject(client,{...input,lock:true});
    const row=(await client.query("SELECT * FROM video_agent_messages WHERE id=$1 AND project_id=$2 AND user_id=$3 FOR UPDATE",[input.messageId,project.id,input.userId])).rows[0];
    if(!row || row.role!=="user")throw agentError("VIDEO_AGENT_MESSAGE_NOT_FOUND",404,"Message not found");
    if(row.status==="completed" && row.planner_output){
        const assistant=(await client.query("SELECT * FROM video_agent_messages WHERE project_id=$1 AND user_id=$2 AND client_message_id=$3",[project.id,input.userId,assistantClientId(row.id)])).rows[0];
        return {replayed:true,message:messageDTO(row),assistantMessage:assistant?messageDTO(assistant):null,outcome:row.planner_output};
    }
    let linked=(await client.query("SELECT id,filename,probe,status,retention_until FROM video_agent_sources WHERE project_id=$1 AND origin_message_id=$2",[project.id,row.id])).rows[0];
    if(row.status==="awaiting_source" && (!linked || linked.status!=="ready")){
        if(terminalSourceStatuses.has(linked?.status))throw agentError("VIDEO_AGENT_SOURCE_INGEST_FAILED",409,"Video source ingestion failed");
        throw agentError("VIDEO_AGENT_SOURCE_PENDING",409,"Video source is still being checked");
    }
    const now=Date.now();
    if(row.status==="processing" && Number(row.planner_claim_until)>now)throw agentError("VIDEO_AGENT_MESSAGE_PROCESSING",409,"Message is already being planned",{retryAfterMs:Number(row.planner_claim_until)-now});
    if(Number(row.planner_attempt)>=3 && !(row.status==="processing" && Number(row.planner_claim_until)<=now && (await client.query(`SELECT 1 FROM video_agent_commands WHERE project_id=$1 AND user_id=$2 AND idempotency_key=$3`,[project.id,input.userId,`planner_${row.id.replaceAll("-","")}`])).rowCount))
        throw agentError("VIDEO_AGENT_PLANNER_RETRY_LIMIT",409,"Planner retry limit reached");
    if(row.status==="failed" && terminalSourceStatuses.has(linked?.status)){
        await client.query("UPDATE video_agent_sources SET origin_message_id=NULL WHERE id=$1",[linked.id]);
        linked=null;
    }
    const configuredTimeout=Number(process.env.VIDEO_AGENT_PLANNER_TIMEOUT_MS || process.env.AI_VIDEO_OPENAI_TIMEOUT_MS || process.env.AI_VIDEO_PROVIDER_TIMEOUT_MS || 180000);
    const callTimeout=Number.isSafeInteger(configuredTimeout) && configuredTimeout>=1000 && configuredTimeout<=300000?configuredTimeout:180000;
    const token=randomUUID(),leaseUntil=now+callTimeout*3+150000;
    const claimed=(await client.query(`UPDATE video_agent_messages SET status='processing',planner_attempt=planner_attempt+1,planner_claim_token=$2,planner_claim_until=$3,error_code=NULL WHERE id=$1 RETURNING *`,[row.id,token,leaseUntil])).rows[0];
    const sources=(await client.query(`SELECT id,filename,probe FROM video_agent_sources WHERE project_id=$1 AND status='ready' AND retention_until>$2
        AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC LIMIT 10`,[project.id,now,linked?.id || null])).rows;
    const historyRows=(await client.query(`SELECT role,content FROM video_agent_messages WHERE project_id=$1 AND user_id=$2 AND id<>$3 AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 12`,[project.id,input.userId,row.id])).rows;
    const history=[];let historyBytes=0;
    for(const item of historyRows){const bytes=Buffer.byteLength(item.content);if(historyBytes+bytes>32768)break;history.push(item);historyBytes+=bytes;}history.reverse();
    return {replayed:false,token,revision:project.current_revision,pendingOutcome:row.planner_output?.status==="ready" && row.planner_output?.plan && !row.planner_output.planId?row.planner_output:null,
        pendingEdit:row.planner_output?.status==="edit_pending"?row.planner_output:null,message:messageDTO(claimed),context:{latestRequest:row.content,
        conversation:history.map(item=>({role:item.role,content:item.content})),readySources:sources.map(source=>({id:source.id,label:source.filename,durationSeconds:source.probe?.durationSeconds ?? null}))},sources};
});

const awaitSource=({projectId,userId,messageId,token,sourceId})=>transaction(async client=>{
    await ownedProject(client,{projectId,userId,lock:true});
    const outcome={status:"needs_input",reply:"Video download queued. Planning resumes after media verification.",pendingSourceId:sourceId,missing:["source"]};
    const row=(await client.query(`UPDATE video_agent_messages SET status='awaiting_source',planner_output=$3,safe_metadata=$4,
        planner_claim_token=NULL,planner_claim_until=NULL WHERE id=$1 AND user_id=$2 AND status='processing' AND planner_claim_token=$5 RETURNING *`,
    [messageId,userId,outcome,{pendingSourceId:sourceId},token])).rows[0];
    if(!row)throw agentError("VIDEO_AGENT_MESSAGE_CLAIM_LOST",409,"Planner message claim expired");
    const now=Date.now();
    const assistant=(await client.query(`INSERT INTO video_agent_messages(id,project_id,user_id,client_message_id,role,content,status,planner_output,created_at)
        VALUES($1,$2,$3,$4,'assistant',$5,'completed',$6,$7) ON CONFLICT(project_id,user_id,client_message_id)
        DO UPDATE SET content=EXCLUDED.content,planner_output=EXCLUDED.planner_output RETURNING *`,
    [randomUUID(),projectId,userId,assistantClientId(messageId),outcome.reply,outcome,now])).rows[0];
    return {message:messageDTO(row),assistantMessage:messageDTO(assistant),outcome,replayed:false};
});

const completeMessage=({projectId,userId,messageId,token,outcome,requestId,model})=>transaction(async client=>{
    const project=await ownedProject(client,{projectId,userId,lock:true});
    const row=(await client.query("SELECT * FROM video_agent_messages WHERE id=$1 AND project_id=$2 AND user_id=$3 FOR UPDATE",[messageId,projectId,userId])).rows[0];
    if(!row || row.planner_claim_token!==token || row.status!=="processing")throw agentError("VIDEO_AGENT_MESSAGE_CLAIM_LOST",409,"Planner message claim expired");
    const now=Date.now(),metadata={plannerRequestId:safeMetadata(requestId),plannerModel:safeMetadata(model)};
    const message=(await client.query(`UPDATE video_agent_messages SET status='completed',planner_output=$2,safe_metadata=$3,planner_claim_token=NULL,planner_claim_until=NULL,error_code=NULL WHERE id=$1 RETURNING *`,[messageId,outcome,metadata])).rows[0];
    const assistant=(await client.query(`INSERT INTO video_agent_messages(id,project_id,user_id,client_message_id,role,content,status,safe_metadata,planner_output,created_at)
        VALUES($1,$2,$3,$4,'assistant',$5,'completed',$6,$7,$8) ON CONFLICT(project_id,user_id,client_message_id) DO UPDATE SET content=EXCLUDED.content,status='completed',safe_metadata=EXCLUDED.safe_metadata,planner_output=EXCLUDED.planner_output RETURNING *`,
    [randomUUID(),projectId,userId,assistantClientId(messageId),outcome.reply,metadata,outcome,now])).rows[0];
    const event=(await client.query(`INSERT INTO video_agent_events(project_id,type,safe_payload,created_at) VALUES($1,'conversation.plan.completed',$2,$3) RETURNING id`,[projectId,{messageId,assistantMessageId:assistant.id,status:outcome.status,planId:outcome.planId || null},now])).rows[0];
    await client.query("UPDATE video_agent_projects SET last_event_id=$2,updated_at=$3 WHERE id=$1",[projectId,event.id,now]);
    return {message:messageDTO(message),assistantMessage:messageDTO(assistant),outcome};
});

const failMessage=({projectId,userId,messageId,token,error})=>transaction(async client=>{
    await ownedProject(client,{projectId,userId,lock:true});
    await client.query(`UPDATE video_agent_messages SET status='failed',planner_claim_token=NULL,planner_claim_until=NULL,error_code=$3,
        planner_output=CASE WHEN planner_output->>'status'='edit_pending' THEN planner_output WHEN $3 IN ('VIDEO_AGENT_REVISION_CONFLICT','VIDEO_AGENT_SOURCE_NOT_READY','VIDEO_AGENT_SOURCE_CHANGED','VIDEO_AGENT_SOURCE_NOT_FOUND','VIDEO_AGENT_SOURCE_TOO_SHORT') THEN NULL ELSE planner_output END
        WHERE id=$1 AND user_id=$2 AND planner_claim_token=$4`,[messageId,userId,error.code || "VIDEO_AGENT_PLANNER_FAILED",token]);
});

const saveCandidate=({projectId,userId,messageId,token,outcome})=>transaction(async client=>{
    await ownedProject(client,{projectId,userId,lock:true});
    const saved=await client.query(`UPDATE video_agent_messages SET planner_output=$3 WHERE id=$1 AND user_id=$2 AND status='processing' AND planner_claim_token=$4`,[messageId,userId,outcome,token]);
    if(!saved.rowCount)throw agentError("VIDEO_AGENT_MESSAGE_CLAIM_LOST",409,"Planner message claim expired");
});

const editContext=({projectId,userId})=>transaction(async client=>{
    const project=await ownedProject(client,{projectId,userId});
    const plan=(await client.query("SELECT * FROM video_agent_plans WHERE project_id=$1 AND revision=$2 ORDER BY created_at DESC LIMIT 1",[projectId,project.current_revision])).rows[0];
    if(!plan)return null;
    const run=(await client.query(`SELECT id FROM video_agent_runs WHERE project_id=$1 AND status IN ('completed','partially_completed')
        AND (plan_id=$2 OR id=$3::uuid) ORDER BY created_at DESC LIMIT 1`,[projectId,plan.id,plan.plan.edits?.baseRunId || null])).rows[0];
    return run?.id || null;
});

const planEditMessage=async(input,claim,{adapter,command,executeTools,signal})=>{
    let candidate=claim.pendingEdit?.candidate || null,requestId=null,model=null;
    if(!candidate){
        const runId=await editContext(input);
        if(!runId){const reply=/\p{Script=Han}/u.test(claim.context.latestRequest)?"请先完成一次任务，或恢复与结果对应的版本，再编辑。":
            "Finish a run or restore its matching version before editing the result.";
            const outcome={status:"needs_input",reply};
            return {...await completeMessage({...input,token:claim.token,outcome,requestId,model}),replayed:false};}
        const editable=await getEditableResults({...input,runId});
        const compactClips=editable.clips.map(clip=>({...clip,cues:(clip.cues.length>40?
            [...clip.cues.slice(0,20),...clip.cues.slice(-20)]:clip.cues).map(cue=>({...cue,
            sourceText:cue.sourceText.slice(0,80),translatedText:cue.translatedText.slice(0,80)}))}));
        let error;
        for(let attempt=0;attempt<3;attempt++){
            try{const suggestion=await adapter.suggest({context:{latestRequest:claim.context.latestRequest,
                conversation:claim.context.conversation,clips:compactClips},signal,repair:attempt>0});
                requestId=suggestion.requestId || requestId;model=suggestion.model || model;
                candidate=validateEditCandidate(suggestion.value ?? parsePlannerResponse(suggestion.raw),editable);break;
            }catch(failure){error=failure;if(!["VIDEO_AGENT_EDIT_FORMAT_INVALID","VIDEO_AGENT_PLANNER_RESPONSE_INVALID","VIDEO_AGENT_PLANNER_INCOMPLETE"].includes(failure.code) || attempt===2)throw failure;}
        }
        if(!candidate)throw error;
        if(candidate.status!=="ready")return {...await completeMessage({...input,token:claim.token,outcome:candidate,requestId,model}),replayed:false};
        await saveCandidate({...input,token:claim.token,outcome:{status:"edit_pending",candidate,expectedRevision:claim.revision}});
    }
    const receipt=await command({projectId:input.projectId,userId:input.userId,body:{type:candidate.action,expectedRevision:claim.pendingEdit?.expectedRevision ?? claim.revision,
        idempotencyKey:`planner_edit_${input.messageId.replaceAll("-","")}`,input:candidate.input}});
    let outcome={status:"ready",reply:candidate.reply,planId:receipt.planId,revision:receipt.revision,editAction:candidate.action};
    if(candidate.executionIntent==="execute"){
        try{const plan=(await getPlan({projectId:input.projectId,userId:input.userId,planId:receipt.planId})).plan.input;
            const execution=await executeTools({projectId:input.projectId,userId:input.userId,messageId:input.messageId,plan,
                planId:receipt.planId,revision:receipt.revision,command});
            outcome={...outcome,execution:{status:"started",runId:execution.runId,runStatus:execution.runStatus,admissionStatus:execution.admissionStatus,tools:execution.calls}};
        }catch(error){if(!(error.status>=400 && error.status<500 || ["VIDEO_AGENT_RUNS_NOT_ENABLED","VIDEO_AGENT_ADMISSION_NOT_ENABLED","VIDEO_AGENT_PIPELINE_NOT_READY"].includes(error.code)))throw error;
            outcome={...outcome,execution:{status:"blocked",errorCode:error.code || "VIDEO_AGENT_EXECUTION_BLOCKED"}};}
    }
    return {...await completeMessage({...input,token:claim.token,outcome,requestId,model}),replayed:false};
};

export const planMessage=async(input,{adapter=plannerAdapter,edit=editAdapter,command=submitCommand,executeTools=executePlanTools,resolveSource=resolveMessageSource}={})=>{
    if(typeof input.messageId!=="string" || !UUID.test(input.messageId))throw agentError("VIDEO_AGENT_MESSAGE_INVALID",400,"Invalid message id");
    const claim=await claimMessage(input);
    if(claim.replayed)return {message:claim.message,assistantMessage:claim.assistantMessage,outcome:claim.outcome,replayed:true};
    const signal=input.signal || new AbortController().signal;
    try{
        if(claim.pendingEdit || isEditRequest(claim.context.latestRequest))return await planEditMessage(input,claim,{adapter:edit,command,executeTools,signal});
        if(!claim.pendingOutcome){
            const source=await resolveSource({...input,content:claim.context.latestRequest,signal});
            if(source){
                if(source.status!=="ready")return await awaitSource({...input,token:claim.token,sourceId:source.id});
                claim.sources=[{id:source.id,filename:source.filename,probe:source.probe}];
                claim.context.readySources=[{id:source.id,label:source.filename,durationSeconds:source.probe?.durationSeconds ?? null}];
            }
        }
        let validated=claim.pendingOutcome?{outcome:claim.pendingOutcome,plan:claim.pendingOutcome.plan}:null,lastError,requestId=null,model=null;
        for(let attempt=0;!validated && attempt<3;attempt++){
            try{
                const suggestion=await adapter.suggest({context:claim.context,signal,repair:attempt>0});
                requestId=suggestion.requestId || requestId;model=suggestion.model || model;
                const value=suggestion.value ?? parsePlannerResponse(suggestion.raw);
                validated=validateCandidate(value,claim.sources,claim.context.latestRequest);break;
            }catch(error){lastError=error;if(!["VIDEO_AGENT_PLANNER_FORMAT_INVALID","VIDEO_AGENT_PLANNER_RESPONSE_INVALID","VIDEO_AGENT_PLANNER_INCOMPLETE"].includes(error.code) || attempt===2)throw error;}
        }
        if(!validated)throw lastError;
        let outcome=validated.outcome;
        if(validated.plan){
            if(!claim.pendingOutcome){outcome={...outcome,plan:validated.plan,expectedRevision:claim.revision};await saveCandidate({...input,token:claim.token,outcome});}
            const receipt=await command({projectId:input.projectId,userId:input.userId,body:{type:"create_plan",expectedRevision:outcome.expectedRevision,
                idempotencyKey:`planner_${input.messageId.replaceAll("-","")}`,input:validated.plan}});
            outcome={...outcome,planId:receipt.planId,revision:receipt.revision,plan:validated.plan};delete outcome.expectedRevision;
            if(outcome.executionIntent==="execute"){
                try{
                    const execution=await executeTools({projectId:input.projectId,userId:input.userId,messageId:input.messageId,plan:validated.plan,
                        planId:receipt.planId,revision:receipt.revision,command});
                    outcome={...outcome,execution:{status:"started",runId:execution.runId,runStatus:execution.runStatus,
                        admissionStatus:execution.admissionStatus,tools:execution.calls}};
                }catch(error){
                    const expected=error.status>=400 && error.status<500 || ["VIDEO_AGENT_RUNS_NOT_ENABLED","VIDEO_AGENT_ADMISSION_NOT_ENABLED","VIDEO_AGENT_PIPELINE_NOT_READY"].includes(error.code);
                    if(!expected)throw error;
                    outcome={...outcome,execution:{status:"blocked",errorCode:error.code || "VIDEO_AGENT_EXECUTION_BLOCKED"}};
                }
            }
        }
        return {...await completeMessage({...input,token:claim.token,outcome,requestId,model}),replayed:false};
    }catch(error){await failMessage({...input,token:claim.token,error}).catch(()=>{});throw error;}
};

export {validateCandidate};

export const resumePendingSourcePlans=async({limit=1,plan=planMessage}={})=>{
    const pending=(await agentQuery(`SELECT m.id,m.project_id,m.user_id,s.status AS source_status FROM video_agent_messages m
        JOIN video_agent_sources s ON s.origin_message_id=m.id AND s.project_id=m.project_id
        WHERE (m.status='awaiting_source' OR (m.status='processing' AND m.planner_claim_until<$2))
        AND s.status IN ('ready','failed','expired','deleting','deleted') ORDER BY m.created_at LIMIT $1`,[limit,Date.now()])).rows;
    for(const item of pending){
        if(terminalSourceStatuses.has(item.source_status)){
            await transaction(async client=>{
                await ownedProject(client,{projectId:item.project_id,userId:item.user_id,lock:true});
                await client.query(`UPDATE video_agent_messages SET status='failed',error_code='VIDEO_AGENT_SOURCE_INGEST_FAILED',planner_claim_token=NULL,planner_claim_until=NULL
                    WHERE id=$1 AND (status='awaiting_source' OR (status='processing' AND planner_claim_until<$2))`,[item.id,Date.now()]);
            });
            continue;
        }
        try{await plan({projectId:item.project_id,userId:item.user_id,messageId:item.id});}
        catch(error){if(error.code!=="VIDEO_AGENT_MESSAGE_PROCESSING")console.error(`[VIDEO AGENT] pending_source_plan_failed code=${error.code || "SERVER_ERROR"}`);}
    }
    return pending.length;
};
