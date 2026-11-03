import '../config.js';
import { closePool } from '../db/pg-client.js';
import { cleanupOneXFollowProof } from '../db/x-follow-cleanup.js';
import { getXFollowStorage } from '../ai-video/x-follow-storage.js';

let deleted = 0;
const failed = [];
try {
    const storage = getXFollowStorage();
    for (let i = 0; i < 100; i++) {
        try {
            if (!await cleanupOneXFollowProof({ storage, skipIds: failed })) break;
            deleted++;
        } catch (error) {
            if (!error.submissionId) throw error;
            failed.push(error.submissionId);
            console.error(`[x-follow-cleanup] submission=${error.submissionId} failed:`, error.message);
        }
    }
    console.log(`[x-follow-cleanup] deleted=${deleted} failed=${failed.length} retention_days=30`);
    if (failed.length) process.exitCode = 1;
} catch (error) {
    console.error('[x-follow-cleanup] failed:', error);
    process.exitCode = 1;
} finally { await closePool(); }
