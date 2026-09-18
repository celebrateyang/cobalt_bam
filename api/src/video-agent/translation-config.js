import {agentError} from "../db/video-agent.js";
import {getSelectConfig} from "./select-config.js";
export const normalizeGlossary=(value=[])=>{
    if(!Array.isArray(value) || value.length>100)throw agentError("VIDEO_AGENT_PLAN_INVALID",400,"Invalid glossary");
    const seen=new Set();return value.map(item=>{
        if(!item || Object.keys(item).sort().join(",")!=="source,target" || typeof item.source!=="string" || !item.source.trim() || item.source.length>128 || typeof item.target!=="string" || !item.target.trim() || item.target.length>128 || seen.has(item.source.trim().normalize("NFC").toLocaleLowerCase("und")))throw agentError("VIDEO_AGENT_PLAN_INVALID",400,"Invalid glossary entry");
        const source=item.source.trim().normalize("NFC");seen.add(source.toLocaleLowerCase("und"));return {source,target:item.target.trim().normalize("NFC")};
    }).sort((a,b)=>a.source.localeCompare(b.source,"und"));
};
export const getTranslationConfig=plan=>{
    const {provider,model,endpointHash}=getSelectConfig();
    return {version:"translate-cues-v1",provider,model,endpointHash,sourceLanguage:plan.sourceLanguage,targetLanguage:plan.targetLanguage,glossary:normalizeGlossary(plan.glossary),maxBatchBytes:12000,maxCues:80,maxEstimatedTokens:3000,maxInputBytes:49152,maxOutputTokens:8192,maxNodes:30};
};
