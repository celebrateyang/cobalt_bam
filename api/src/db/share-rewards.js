import { getClient, query } from "./pg-client.js";

export const SHARE_REWARD_POINTS = 300;
export const isShareRewardRequest = ({ userId, requestId, note }) =>
    Number.isSafeInteger(userId) && userId > 0 &&
    typeof requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) &&
    typeof note === "string" && note.trim().length > 0 && note.length <= 4000;

export const listShareRewards = async (userId, runQuery = query) => {
    const result = await runQuery(`SELECT id, awarded_points, admin_note, reviewed_by, reviewed_at
        FROM user_promotion_submissions WHERE user_id=$1 AND promotion_type='share' AND status='APPROVED'
        ORDER BY id DESC LIMIT 50`, [userId]);
    return result.rows;
};

// One UUID represents one manual approval, including retries after a lost reply.
// There is deliberately no per-account frequency limit.
export const awardShareReward = async ({ userId, requestId, note, reviewer }, clientFactory = getClient) => {
    if (!isShareRewardRequest({ userId, requestId, note })) return { ok: false, code: "INVALID_INPUT" };
    const client = await clientFactory();
    try {
        await client.query("BEGIN");
        // Serialize approvals and balance updates for this account.
        const users = await client.query("SELECT id, clerk_user_id, points FROM users WHERE id=$1 FOR UPDATE", [userId]);
        const user = users.rows[0];
        if (!user) { await client.query("ROLLBACK"); return { ok: false, code: "USER_NOT_FOUND" }; }
        const accessMethod = `whatsapp:${requestId}`;
        const previous = await client.query(`SELECT id, awarded_points, admin_note, reviewed_by, reviewed_at FROM user_promotion_submissions
            WHERE user_id=$1 AND promotion_type='share' AND access_method=$2 AND status='APPROVED'`, [userId, accessMethod]);
        if (previous.rows.length) {
            await client.query("COMMIT");
            return { ok: true, duplicate: true, points: user.points, reward: previous.rows[0] };
        }
        const now = Date.now();
        const result = await client.query(`INSERT INTO user_promotion_submissions
            (user_id,clerk_user_id,promotion_type,access_method,requested_points,status,awarded_points,admin_note,reviewed_by,reviewed_at,created_at,updated_at)
            VALUES($1,$2,'share',$3,$4,'APPROVED',$4,$5,$6,$7,$7,$7) RETURNING id,awarded_points,admin_note,reviewed_by,reviewed_at`,
            [userId, user.clerk_user_id, accessMethod, SHARE_REWARD_POINTS, note.trim(), reviewer, now]);
        const updated = await client.query("UPDATE users SET points=points+$2,updated_at=$3 WHERE id=$1 RETURNING points",
            [userId, SHARE_REWARD_POINTS, now]);
        await client.query("COMMIT");
        return { ok: true, duplicate: false, points: updated.rows[0].points, reward: result.rows[0] };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally { client.release(); }
};
