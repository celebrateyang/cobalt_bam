import ffprobeStatic from "ffprobe-static";
import { agentError } from "../db/video-agent.js";
import { downloadVerifiedSource,runAbortableProcess } from "./worker-media.js";
import { chunkHandler } from "./chunk-handler.js";
import { transcribeHandler } from "./transcribe-handler.js";
import { speechConfigured } from "./asr-config.js";
import { normalizeHandler } from "./normalize-handler.js";
import { selectHandler } from "./select-handler.js";
import { selectionConfigured } from "./select-config.js";
import {translateHandler} from "./translate-handler.js";
import {subtitleHandler} from "./subtitle-handler.js";
import {renderHandler} from "./render-handler.js";
import {verifyHandler,publishHandler} from "./verify-handler.js";
export { runAbortableProcess } from "./worker-media.js";

const probeHandler = async ({ claim,signal,workDir,artifact }) => {
    const snapshot=claim.run.source_snapshot;
    const input=await downloadVerifiedSource(claim,workDir,{signal});
    const result=await runAbortableProcess(ffprobeStatic.path,["-v","error","-show_streams","-show_format","-of","json",input],{ signal });
    const parsed=JSON.parse(result.stdout); const video=parsed.streams?.find((stream)=>stream.codec_type==="video"); const audio=parsed.streams?.find((stream)=>stream.codec_type==="audio");
    const durationMs=Math.round(Number(parsed.format?.duration)*1000);
    if(!video || !audio || video.width!==snapshot.width || video.height!==snapshot.height || !Number.isSafeInteger(durationMs) || durationMs<=0 || durationMs>3600000 || Math.abs(durationMs-snapshot.durationMs)>1000) throw agentError("VIDEO_AGENT_INVALID_MEDIA",422,"Invalid source media");
    const checkpoint={ durationMs,width:video.width,height:video.height,sourceId:snapshot.id };
    const asset=await artifact(checkpoint);
    return { checkpoint,assets:[asset],outputRefs:[asset.id] };
};
// Missing provider configuration prevents claiming provider-dependent stages.
export const productionHandlers = { probe:probeHandler,chunk:chunkHandler,transcribe:transcribeHandler,normalize:normalizeHandler,select_clips:selectHandler,translate_selected:translateHandler,build_subtitles:subtitleHandler,render:renderHandler,verify:verifyHandler,publish_results:publishHandler };
export const availableProductionHandlers=()=>Object.fromEntries(Object.entries({...productionHandlers,...(!speechConfigured()?{transcribe:undefined}:{}),...(!selectionConfigured()?{select_clips:undefined,translate_selected:undefined}:{})}).filter(([,handler])=>typeof handler==="function"));
