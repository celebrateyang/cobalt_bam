import {
    claimExpiredAiVideoAssets,
    claimExpiredAiVideoUploadSessions,
    markAiVideoAssetCleanupRetry,
    markAiVideoAssetDeleted,
    markAiVideoUploadSessionAborted,
} from "../db/ai-video.js";
import { getAiVideoObjectStorage } from "../ai-video/object-storage.js";
import { decryptUploadSession } from "../ai-video/session-crypto.js";

const storage = getAiVideoObjectStorage();

const cleanupUploads = async () => {
    const sessions = await claimExpiredAiVideoUploadSessions({});
    for (const session of sessions) {
        try {
            await storage.abortResumableUpload({ sessionUri: decryptUploadSession(session.storage_session_encrypted) }).catch(() => {});
            await storage.deleteObject(session.object_key);
            await markAiVideoUploadSessionAborted({ sessionId: session.id });
        } catch (error) {
            console.warn(`[AI VIDEO CLEANUP] upload_session=${session.id} retry_next_run=true error=${error.message}`);
        }
    }
    return sessions.length;
};

const cleanupAssets = async () => {
    const assets = await claimExpiredAiVideoAssets({});
    for (const asset of assets) {
        try {
            await storage.deleteObject(asset.object_key, asset.object_generation);
            await markAiVideoAssetDeleted({ assetId: asset.id });
        } catch (error) {
            const delayMs = Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(asset.cleanup_attempts, 10));
            await markAiVideoAssetCleanupRetry({ assetId: asset.id, delayMs });
            console.warn(`[AI VIDEO CLEANUP] asset=${asset.id} retry_ms=${delayMs} error=${error.message}`);
        }
    }
    return assets.length;
};

Promise.all([cleanupUploads(), cleanupAssets()])
    .then(([uploads, assets]) => console.log(`[AI VIDEO CLEANUP] expired_uploads=${uploads} assets=${assets}`))
    .catch((error) => {
        console.error("[AI VIDEO CLEANUP] failed", error);
        process.exitCode = 1;
    });
