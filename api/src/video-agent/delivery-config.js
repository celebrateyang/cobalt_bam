export const SUBTITLE_CONFIG=Object.freeze({version:"clip-subtitles-v1",lineUnits:32,maxLines:2});
export const RENDER_CONFIG=Object.freeze({version:"aspect-aware-render-v2",width:1080,height:1920,maxLongEdge:1920,fps:30,maxBytes:256*1024*1024,scratchBytes:1536*1024*1024});
export const VERIFY_CONFIG=Object.freeze({version:"decode-verify-v1",toleranceMs:250});

const even=value=>Math.max(2,Math.floor(value/2)*2);
export const getRenderLayout=(video,source={})=>{
    if(video?.aspectRatio==="9:16" && video?.preset==="tiktok")return {width:RENDER_CONFIG.width,height:RENDER_CONFIG.height,mode:"crop"};
    const sourceWidth=Number(source.width),sourceHeight=Number(source.height);
    if(!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth<2 || sourceHeight<2)return null;
    const scale=Math.min(1,RENDER_CONFIG.maxLongEdge/Math.max(sourceWidth,sourceHeight));
    return {width:even(sourceWidth*scale),height:even(sourceHeight*scale),mode:"fit"};
};
