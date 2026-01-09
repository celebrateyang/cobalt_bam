import { getClient, query } from "./pg-client.js";

export const REFERRAL_REWARD_POINTS = 50;

export const initReferralDatabase = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS user_referrals (
            id SERIAL PRIMARY KEY,
            referrer_user_id INTEGER NOT NULL,
            referred_user_id INTEGER NOT NULL UNIQUE,
            referral_code TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_created_at
         ON user_referrals(referrer_user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_referrals_referral_code
         ON user_referrals(referral_code);`,
    );
};

export const getReferrerProfileByReferralCode = async (referralCode) => {
    const result = await query(
        `
        SELECT full_name, avatar_url
        FROM users
        WHERE referral_code = $1
          AND COALESCE(is_disabled, false) = false
        LIMIT 1;
        `,
        [referralCode],
    );

    const row = result.rows?.[0] ?? null;
    if (!row) return null;

    return {
        fullName: row.full_name ?? null,
        avatarUrl: row.avatar_url ?? null,
    };
};

export const claimReferralReward = async ({ referralCode, referredUserId }) => {
    const now = Date.now();
    const client = await getClient();

    try {
        await client.query("BEGIN");

        const referrerRes = await client.query(
            `
            SELECT id
            FROM users
            WHERE referral_code = $1
              AND COALESCE(is_disabled, false) = false
            LIMIT 1;
            `,
            [referralCode],
        );

        const referrerUserId = referrerRes.rows?.[0]?.id ?? null;
        if (!referrerUserId) {
            await client.query("ROLLBACK");
            return { ok: false, code: "INVALID_CODE" };
        }

        if (referrerUserId === referredUserId) {
            await client.query("ROLLBACK");
            return { ok: false, code: "SELF_REFERRAL" };
        }

        const insertRes = await client.query(
            `
            INSERT INTO user_referrals (
                referrer_user_id,
                referred_user_id,
                referral_code,
                created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (referred_user_id) DO NOTHING
            RETURNING id;
            `,
            [referrerUserId, referredUserId, referralCode, now],
        );

        if (!insertRes.rows?.[0]?.id) {
            await client.query("COMMIT");
            return { ok: true, claimed: false, code: "ALREADY_CLAIMED" };
        }

        const updatedRes = await client.query(
            `
            UPDATE users
            SET points = points + $1,
                updated_at = $2
            WHERE id = $3
            RETURNING points;
            `,
            [REFERRAL_REWARD_POINTS, now, referrerUserId],
        );

        await client.query("COMMIT");
        return {
            ok: true,
            claimed: true,
            rewardedPoints: REFERRAL_REWARD_POINTS,
            referrerUserId,
            referrerPoints: updatedRes.rows?.[0]?.points ?? null,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        throw error;
    } finally {
        client.release();
    }
};
