import { getClient } from './pg-client.js';

export const cleanupOneXFollowProof = async ({ storage, now = Date.now(), clientFactory = getClient, skipIds = [] }) => {
    const client = await clientFactory();
    let submissionId;
    try {
        await client.query('BEGIN');
        const result = await client.query(`SELECT p.*, s.status, s.reviewed_at FROM x_follow_objects p
            LEFT JOIN user_promotion_submissions s ON s.id=p.submission_id
            WHERE NOT (p.submission_id = ANY($3::int[])) AND (p.state='failed' OR (p.state='uploading' AND p.created_at < $1)
                OR (s.id IS NULL AND p.created_at < $1)
                OR (p.state='ready' AND s.status IN ('APPROVED','REJECTED') AND s.reviewed_at < $2))
            ORDER BY p.created_at LIMIT 1 FOR UPDATE OF p SKIP LOCKED`, [now - 3600000, now - 30 * 86400000, skipIds]);
        const proof = result.rows[0];
        if (!proof) { await client.query('COMMIT'); return false; }
        submissionId = proof.submission_id;
        let generation = proof.generation;
        if (!generation) {
            try { generation = (await storage.headObject(proof.object_key)).generation; }
            catch (error) { if (error.code !== 404 && error.statusCode !== 404 && error.code !== 'ENOENT') throw error; }
        }
        if (generation) await storage.deleteObject(proof.object_key, generation);
        await client.query("UPDATE user_promotion_submissions SET status='REJECTED',admin_note='Screenshot upload expired; please resubmit.',reviewed_at=$2,updated_at=$2 WHERE id=$1 AND status='UPLOADING'", [proof.submission_id, now]);
        await client.query('DELETE FROM x_follow_objects WHERE submission_id=$1', [proof.submission_id]);
        await client.query('COMMIT');
        return true;
    } catch (error) { await client.query('ROLLBACK'); if (submissionId) error.submissionId = submissionId; throw error; }
    finally { client.release(); }
};
