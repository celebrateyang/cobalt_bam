import { getClient, query, initPool } from "./pg-client.js";
import { env } from "../config.js";
import { initFeedbackDatabase } from "./feedback.js";
import { initReferralDatabase } from "./referrals.js";
import { initPromotionSubmissionsDatabase } from "./promotion-submissions.js";
import { ensureMembershipOrdersSchema } from "./membership-orders.js";
import { initDownloadAttemptsDatabase } from "./download-attempts.js";
import { initCuriousCatDatabase } from "./curious-cat.js";
import { nanoid } from "nanoid";
import { generateClipboardPersonalCode } from "../core/clipboard-personal.js";
import { evaluateMembershipFeatureEligibility } from "../core/membership-features.js";

const generateReferralCode = () => nanoid(10);
const isUniqueViolation = (error) =>
    error && typeof error === "object" && error.code === "23505";
export const FIRST_DOWNLOAD_GRACE_MAX_POINTS = 200;
const DOWNLOAD_REQUEST_LEASE_MS = 5 * 60 * 1000;
const DOWNLOAD_REQUEST_REPLAY_MS = 60 * 60 * 1000;

export const calculateFirstDownloadGraceCharge = ({
    requiredPoints,
    availablePoints,
    allowFirstDownloadGrace = false,
    maxGracePoints = FIRST_DOWNLOAD_GRACE_MAX_POINTS,
    firstDownloadGraceEligible = false,
    firstDownloadGraceUsed = false,
    downloadSuccessCount = 0,
    activeHoldCount = 0,
} = {}) => {
    const required = Math.max(0, Number(requiredPoints) || 0);
    const available = Number(availablePoints);
    const graceLimit = Math.max(0, Number(maxGracePoints) || 0);
    const gracePoints = Math.max(0, required - available);
    const useFirstDownloadGrace =
        Number.isFinite(available) &&
        allowFirstDownloadGrace &&
        firstDownloadGraceEligible &&
        !firstDownloadGraceUsed &&
        Number(downloadSuccessCount || 0) === 0 &&
        Number(activeHoldCount || 0) === 0 &&
        gracePoints > 0 &&
        gracePoints <= graceLimit;
    const allowed =
        Number.isFinite(available) &&
        (available >= required || useFirstDownloadGrace);

    return {
        allowed,
        useFirstDownloadGrace,
        chargedPoints: useFirstDownloadGrace
            ? Math.max(0, Math.min(required, available))
            : required,
        gracePoints: useFirstDownloadGrace ? gracePoints : 0,
    };
};

export const resolveDownloadRequestAction = ({
    request,
    sourceUrl,
    hold = null,
    now = Date.now(),
} = {}) => {
    if (!request || request.source_url !== sourceUrl) {
        return { action: "reject", code: "IDEMPOTENCY_CONFLICT" };
    }
    if (request.status === "completed") {
        if (hold?.status === "finalized") {
            return { action: "reject", code: "IDEMPOTENCY_FINALIZED" };
        }
        const replayableHold = !hold || (
            hold.status === "held" && Number(hold.expires_at) > now
        );
        if (
            replayableHold &&
            Number(request.replay_expires_at) > now &&
            request.response_body
        ) {
            return { action: "replay" };
        }
    }
    if (
        request.status === "processing" &&
        Number(request.lease_expires_at) > now
    ) {
        return { action: "reject", code: "IDEMPOTENCY_IN_PROGRESS" };
    }
    return { action: "claim" };
};

export const normalizeEmailForSignup = (email) => {
    if (typeof email !== "string") return null;

    const trimmed = email.trim().toLowerCase();
    const atIndex = trimmed.lastIndexOf("@");
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;

    let local = trimmed.slice(0, atIndex);
    let domain = trimmed.slice(atIndex + 1);

    if (!local || !domain) return null;

    if (domain === "googlemail.com") {
        domain = "gmail.com";
    }

    if (domain === "gmail.com") {
        local = local.split("+", 1)[0].replace(/\./g, "");
    }

    if (!local) return null;

    return `${local}@${domain}`;
};

let clipboardPersonalSchemaPromise = null;

export const ensureClipboardPersonalSchema = async () => {
    if (clipboardPersonalSchemaPromise) {
        return clipboardPersonalSchemaPromise;
    }

    clipboardPersonalSchemaPromise = (async () => {
        await query(
            `ALTER TABLE users
                ADD COLUMN IF NOT EXISTS clipboard_personal_code TEXT;`,
        );
        await query(
            `ALTER TABLE users
                ADD COLUMN IF NOT EXISTS clipboard_personal_code_version INTEGER NOT NULL DEFAULT 1;`,
        );
        await query(
            `ALTER TABLE users
                ADD COLUMN IF NOT EXISTS clipboard_personal_code_updated_at BIGINT;`,
        );
        await query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clipboard_personal_code
             ON users(clipboard_personal_code)
             WHERE clipboard_personal_code IS NOT NULL;`,
        );

        await query(`
            CREATE TABLE IF NOT EXISTS user_clipboard_devices (
                id BIGSERIAL PRIMARY KEY,
                clerk_user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                device_name TEXT,
                platform TEXT NOT NULL DEFAULT 'unknown',
                last_seen_at BIGINT NOT NULL,
                last_ip TEXT,
                last_user_agent TEXT,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                UNIQUE (clerk_user_id, device_id)
            );
        `);

        await query(
            `CREATE INDEX IF NOT EXISTS idx_user_clipboard_devices_user_seen
             ON user_clipboard_devices(clerk_user_id, last_seen_at DESC);`,
        );
    })()
        .catch((error) => {
            clipboardPersonalSchemaPromise = null;
            throw error;
        });

    return clipboardPersonalSchemaPromise;
};

export const initUserDatabase = async () => {
    if (env.dbType && env.dbType !== "postgresql") {
        throw new Error(
            `User database requires PostgreSQL (DB_TYPE=postgresql). Received DB_TYPE=${env.dbType}`,
        );
    }

    initPool();

    // Core users table (Clerk is the source of truth for authentication)
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            clerk_user_id TEXT NOT NULL UNIQUE,
            primary_email TEXT,
            normalized_email TEXT,
            full_name TEXT,
            avatar_url TEXT,
            last_seen_at BIGINT,
            points INTEGER NOT NULL DEFAULT 20,
            download_success_count INTEGER NOT NULL DEFAULT 0,
            first_download_grace_eligible BOOLEAN NOT NULL DEFAULT true,
            first_download_grace_used BOOLEAN NOT NULL DEFAULT false,
            first_download_grace_used_at BIGINT,
            first_download_grace_extra_points INTEGER NOT NULL DEFAULT 0,
            referral_code TEXT,
            is_disabled BOOLEAN DEFAULT false,
            signup_block_reason TEXT,
            signup_blocked_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    // Migration: ensure points column exists for older databases
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 20;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS normalized_email TEXT;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS signup_block_reason TEXT;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS signup_blocked_at BIGINT;`,
    );

    // Migration: ensure default points for new users is correct
    await query(`ALTER TABLE users ALTER COLUMN points SET DEFAULT 20;`);
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS download_success_count INTEGER NOT NULL DEFAULT 0;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS first_download_grace_eligible BOOLEAN NOT NULL DEFAULT false;`,
    );
    await query(
        `ALTER TABLE users ALTER COLUMN first_download_grace_eligible SET DEFAULT true;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS first_download_grace_used BOOLEAN NOT NULL DEFAULT false;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS first_download_grace_used_at BIGINT;`,
    );
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS first_download_grace_extra_points INTEGER NOT NULL DEFAULT 0;`,
    );
    await query(
        `ALTER TABLE users ALTER COLUMN download_success_count SET DEFAULT 0;`,
    );
    await query(
        `ALTER TABLE users ALTER COLUMN first_download_grace_used SET DEFAULT false;`,
    );
    await query(
        `ALTER TABLE users ALTER COLUMN first_download_grace_extra_points SET DEFAULT 0;`,
    );

    // Migration: referral codes (invite links)
    await query(
        `ALTER TABLE users
            ADD COLUMN IF NOT EXISTS referral_code TEXT;`,
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_primary_email ON users(primary_email);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_normalized_email ON users(normalized_email);`,
    );
    await query(
        `
        UPDATE users
        SET normalized_email = lower(
            CASE
                WHEN split_part(lower(primary_email), '@', 2) IN ('gmail.com', 'googlemail.com')
                    THEN replace(split_part(split_part(lower(primary_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
                ELSE lower(primary_email)
            END
        )
        WHERE primary_email IS NOT NULL
          AND (normalized_email IS NULL OR normalized_email = '');
        `,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC);`,
    );

    await initFeedbackDatabase();
    await initReferralDatabase();
    await initPromotionSubmissionsDatabase();
    await initDownloadAttemptsDatabase();
    await initCuriousCatDatabase();

    // ==================== Collection download memory ====================
    await query(`
        CREATE TABLE IF NOT EXISTS user_collection_memories (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            collection_key TEXT NOT NULL,
            service TEXT NOT NULL,
            kind TEXT NOT NULL,
            collection_id TEXT NOT NULL,
            title TEXT,
            source_url TEXT,
            first_seen_at BIGINT NOT NULL,
            last_opened_at BIGINT NOT NULL,
            last_marked_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, collection_key)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memories_user_last_opened
         ON user_collection_memories(user_id, last_opened_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memories_user_collection
         ON user_collection_memories(user_id, service, kind, collection_id);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS user_collection_memory_items (
            id SERIAL PRIMARY KEY,
            memory_id INTEGER NOT NULL,
            item_key TEXT NOT NULL,
            item_url TEXT,
            item_title TEXT,
            downloaded_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (memory_id) REFERENCES user_collection_memories(id) ON DELETE CASCADE,
            UNIQUE (memory_id, item_key)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memory_items_memory_downloaded
         ON user_collection_memory_items(memory_id, downloaded_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_collection_memory_items_memory_item_key
         ON user_collection_memory_items(memory_id, item_key);`,
    );

    // ==================== Points holds (batch downloads) ====================
    await query(`
        CREATE TABLE IF NOT EXISTS user_points_holds (
            id SERIAL PRIMARY KEY,
            hold_id TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'held', -- held | finalized | released | expired
            reason TEXT,
            source_url TEXT,
            queue_id TEXT,
            required_points INTEGER,
            grace_points INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL,
            finalized_at BIGINT,
            released_at BIGINT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `ALTER TABLE user_points_holds
            ADD COLUMN IF NOT EXISTS queue_id TEXT;`,
    );
    await query(
        `ALTER TABLE user_points_holds
            ADD COLUMN IF NOT EXISTS required_points INTEGER;`,
    );
    await query(
        `ALTER TABLE user_points_holds
            ADD COLUMN IF NOT EXISTS grace_points INTEGER NOT NULL DEFAULT 0;`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_points_holds_user_status
         ON user_points_holds(user_id, status);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_points_holds_expires_at
         ON user_points_holds(expires_at);`,
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_points_holds_user_queue
         ON user_points_holds(user_id, queue_id)
         WHERE queue_id IS NOT NULL;`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS user_download_requests (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            queue_id TEXT NOT NULL,
            source_url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'processing',
            owner_token TEXT,
            response_status INTEGER,
            response_body JSONB,
            lease_expires_at BIGINT NOT NULL,
            replay_expires_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, queue_id)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_download_requests_expiry
         ON user_download_requests(lease_expires_at, replay_expires_at);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_download_requests_updated
         ON user_download_requests(updated_at);`,
    );

    // Credit orders (top-ups for points/credits)
    await query(`
        CREATE TABLE IF NOT EXISTS credit_orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            clerk_user_id TEXT NOT NULL,
            provider TEXT NOT NULL, -- wechat | polar
            product_key TEXT NOT NULL,
            points INTEGER NOT NULL,
            amount_fen INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CNY',
            out_trade_no TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'CREATED', -- CREATED | PAID | CLOSED | FAILED
            provider_transaction_id TEXT,
            provider_data JSONB,
            paid_at BIGINT,
            raw_notify JSONB,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await query(
        `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS provider_data JSONB;`,
    );
    await query(
        `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS raw_notify JSONB;`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_user_id ON credit_orders(user_id, created_at DESC);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_out_trade_no ON credit_orders(out_trade_no);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_credit_orders_status ON credit_orders(status);`,
    );

    // Roles (RBAC) - optional, for future admin / internal permissions
    await query(`
        CREATE TABLE IF NOT EXISTS roles (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id INTEGER NOT NULL,
            role_key TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (user_id, role_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_key) REFERENCES roles(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);`,
    );

    // Entitlements (feature flags) used for gating features like batch download
    await query(`
        CREATE TABLE IF NOT EXISTS entitlements (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_entitlements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual', -- manual | subscription | webhook | admin
            granted_at BIGINT NOT NULL,
            expires_at BIGINT,
            revoked_at BIGINT,
            metadata JSONB,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON user_entitlements(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_key ON user_entitlements(entitlement_key);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, entitlement_key, expires_at, revoked_at);`,
    );

    // Plans + subscriptions (future billing integration). A plan grants entitlements.
    await query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE, -- e.g. free | pro | enterprise
            name TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS plan_entitlements (
            plan_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            PRIMARY KEY (plan_id, entitlement_key),
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan_id ON plan_entitlements(plan_id);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            plan_id INTEGER,
            provider TEXT NOT NULL DEFAULT 'clerk', -- clerk | stripe | manual
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            status TEXT NOT NULL, -- active | trialing | past_due | canceled | incomplete | unpaid
            current_period_start BIGINT,
            current_period_end BIGINT,
            cancel_at_period_end BOOLEAN DEFAULT false,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
            UNIQUE (provider, provider_subscription_id)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS member_usage_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            subscription_id INTEGER,
            request_id TEXT,
            service TEXT,
            source_url TEXT,
            duration_seconds INTEGER,
            points_equivalent INTEGER,
            is_batch BOOLEAN DEFAULT false,
            status TEXT NOT NULL DEFAULT 'success',
            completed_at BIGINT,
            created_at BIGINT NOT NULL,
            metadata JSONB,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
        );
    `);

    await query(
        `ALTER TABLE member_usage_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';`,
    );
    await query(
        `ALTER TABLE member_usage_events ADD COLUMN IF NOT EXISTS completed_at BIGINT;`,
    );

    await query(
        `CREATE INDEX IF NOT EXISTS idx_member_usage_user_created_at ON member_usage_events(user_id, created_at DESC);`,
    );

    // Seed: core entitlements used by plans and feature gates.
    await query(
        `INSERT INTO entitlements (key, description)
         VALUES
            ('batch_download', 'Allows using the batch download feature'),
            ('member_download', 'Allows downloads without consuming points within fair-use limits'),
            ('ai_video_studio', 'Allows using AI video clipping and translated subtitles'),
            ('video_recording', 'Allows using the browser video recording studio'),
            ('random_chat', 'Allows using random video chat')
         ON CONFLICT (key) DO NOTHING;`,
    );

    await query(
        `INSERT INTO plans (key, name, description, is_active, created_at, updated_at)
         VALUES
            ('member_monthly', 'Monthly Member', 'Monthly membership for downloads without points', true, $1, $1),
            ('member_yearly', 'Yearly Member', 'Yearly membership for downloads without points', true, $1, $1)
         ON CONFLICT (key) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             is_active = EXCLUDED.is_active,
             updated_at = EXCLUDED.updated_at;`,
        [Date.now()],
    );

    await query(
        `INSERT INTO plan_entitlements (plan_id, entitlement_key)
         SELECT p.id, entitlement.key
         FROM plans p
         CROSS JOIN (
            VALUES
                ('member_download'),
                ('ai_video_studio'),
                ('video_recording'),
                ('random_chat')
         ) AS entitlement(key)
         WHERE p.key IN ('member_monthly', 'member_yearly')
         ON CONFLICT (plan_id, entitlement_key) DO NOTHING;`,
    );

    await ensureMembershipOrdersSchema();
    await ensureClipboardPersonalSchema();

    console.log("✅ User database initialized");
};

export const upsertUserFromClerk = async ({
    clerkUserId,
    primaryEmail,
    fullName,
    avatarUrl,
}) => {
    const client = await getClient();
    const now = Date.now();
    const referralCode = generateReferralCode();

    const normalizedPrimaryEmail = primaryEmail || null;
    const normalizedEmail = normalizeEmailForSignup(normalizedPrimaryEmail);
    const normalizedFullName = fullName || null;
    const normalizedAvatarUrl = avatarUrl || null;

    const findCanonicalSql = `
        SELECT clerk_user_id
        FROM users
        WHERE normalized_email = $1
          AND COALESCE(is_disabled, false) = false
        ORDER BY id ASC
        LIMIT 1;
    `;

    const shouldBlockDuplicateSignup = async () => {
        if (!normalizedEmail) return false;

        const canonical = await client.query(findCanonicalSql, [normalizedEmail]);
        const canonicalClerkUserId = canonical.rows[0]?.clerk_user_id;

        return !!canonicalClerkUserId && canonicalClerkUserId !== clerkUserId;
    };

    const updateSql = `
        UPDATE users
        SET primary_email = $2,
            normalized_email = $3,
            full_name = $4,
            avatar_url = $5,
            last_seen_at = $6,
            referral_code = COALESCE(referral_code, $7),
            points = CASE WHEN $8 THEN 0 ELSE points END,
            is_disabled = CASE WHEN $8 THEN true ELSE is_disabled END,
            signup_block_reason = CASE WHEN $8 THEN 'duplicate_normalized_email' ELSE signup_block_reason END,
            signup_blocked_at = CASE WHEN $8 THEN COALESCE(signup_blocked_at, $9) ELSE signup_blocked_at END,
            updated_at = $9
        WHERE clerk_user_id = $1
        RETURNING *;
    `;

    const updateParamsBase = [
        clerkUserId,
        normalizedPrimaryEmail,
        normalizedEmail,
        normalizedFullName,
        normalizedAvatarUrl,
        now,
    ];

    try {
        await client.query("BEGIN");
        if (normalizedEmail) {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1));", [
                normalizedEmail,
            ]);
        }

        const blockDuplicateSignup = await shouldBlockDuplicateSignup();

        let updateResult;
        try {
            updateResult = await client.query(updateSql, [
                ...updateParamsBase,
                referralCode,
                blockDuplicateSignup,
                now,
            ]);
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            updateResult = await client.query(updateSql, [
                ...updateParamsBase,
                generateReferralCode(),
                blockDuplicateSignup,
                now,
            ]);
        }

        if (updateResult.rows[0]) {
            await client.query("COMMIT");
            return updateResult.rows[0];
        }

        const insertSql = `
            INSERT INTO users (
                clerk_user_id,
                primary_email,
                normalized_email,
                full_name,
                avatar_url,
                last_seen_at,
                referral_code,
                points,
                is_disabled,
                signup_block_reason,
                signup_blocked_at,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;

        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const attemptReferralCode = attempt === 0 ? referralCode : generateReferralCode();

            try {
                const insertResult = await client.query(insertSql, [
                    clerkUserId,
                    normalizedPrimaryEmail,
                    normalizedEmail,
                    normalizedFullName,
                    normalizedAvatarUrl,
                    now,
                    attemptReferralCode,
                    blockDuplicateSignup ? 0 : 20,
                    blockDuplicateSignup,
                    blockDuplicateSignup ? "duplicate_normalized_email" : null,
                    blockDuplicateSignup ? now : null,
                    now,
                    now,
                ]);

                await client.query("COMMIT");
                return insertResult.rows[0];
            } catch (error) {
                lastError = error;
                if (!isUniqueViolation(error)) throw error;

                // Either: a race on clerk_user_id, or an extremely rare referral_code collision.
                try {
                    const retryUpdate = await client.query(updateSql, [
                        ...updateParamsBase,
                        generateReferralCode(),
                        blockDuplicateSignup,
                        now,
                    ]);
                    if (retryUpdate.rows[0]) {
                        await client.query("COMMIT");
                        return retryUpdate.rows[0];
                    }
                } catch (retryError) {
                    if (!isUniqueViolation(retryError)) throw retryError;
                }
            }
        }

        throw lastError;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

export const getUserByClerkId = async (clerkUserId) => {
    const result = await query(`SELECT * FROM users WHERE clerk_user_id = $1`, [
        clerkUserId,
    ]);
    return result.rows[0] || null;
};

const getNumericCodeVersion = (value) => {
    const parsed = Number.parseInt(String(value ?? "1"), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1;
    }
    return parsed;
};

const assignClipboardPersonalCodeWithRetry = async (
    client,
    userId,
    codeVersion,
    now,
) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidateCode = generateClipboardPersonalCode();
        try {
            const updateRes = await client.query(
                `
                UPDATE users
                SET clipboard_personal_code = $2,
                    clipboard_personal_code_version = $3,
                    clipboard_personal_code_updated_at = $4,
                    updated_at = $4
                WHERE id = $1
                RETURNING clipboard_personal_code, clipboard_personal_code_version, clipboard_personal_code_updated_at;
                `,
                [userId, candidateCode, codeVersion, now],
            );

            if (updateRes.rows[0]) {
                return updateRes.rows[0];
            }
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }
        }
    }

    throw new Error("Failed to assign unique clipboard personal code");
};

export const getOrCreateClipboardPersonalProfile = async (clerkUserId) => {
    await ensureClipboardPersonalSchema();

    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");

        const userRes = await client.query(
            `
            SELECT id, clipboard_personal_code, clipboard_personal_code_version, clipboard_personal_code_updated_at
            FROM users
            WHERE clerk_user_id = $1
            FOR UPDATE;
            `,
            [clerkUserId],
        );

        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }

        const row = userRes.rows[0];
        const codeVersion = getNumericCodeVersion(row.clipboard_personal_code_version);

        let profileRow = {
            clipboard_personal_code: row.clipboard_personal_code,
            clipboard_personal_code_version: codeVersion,
            clipboard_personal_code_updated_at: row.clipboard_personal_code_updated_at,
        };

        if (!profileRow.clipboard_personal_code) {
            profileRow = await assignClipboardPersonalCodeWithRetry(
                client,
                row.id,
                codeVersion,
                now,
            );
        }

        await client.query("COMMIT");

        return {
            personalCode: profileRow.clipboard_personal_code,
            codeVersion: getNumericCodeVersion(
                profileRow.clipboard_personal_code_version,
            ),
            codeUpdatedAt: profileRow.clipboard_personal_code_updated_at,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const rotateClipboardPersonalCode = async (clerkUserId) => {
    await ensureClipboardPersonalSchema();

    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");

        const userRes = await client.query(
            `
            SELECT id, clipboard_personal_code_version
            FROM users
            WHERE clerk_user_id = $1
            FOR UPDATE;
            `,
            [clerkUserId],
        );

        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }

        const row = userRes.rows[0];
        const previousCodeVersion = getNumericCodeVersion(
            row.clipboard_personal_code_version,
        );
        const nextCodeVersion = previousCodeVersion + 1;

        const rotated = await assignClipboardPersonalCodeWithRetry(
            client,
            row.id,
            nextCodeVersion,
            now,
        );

        await client.query("COMMIT");

        return {
            personalCode: rotated.clipboard_personal_code,
            codeVersion: getNumericCodeVersion(
                rotated.clipboard_personal_code_version,
            ),
            previousCodeVersion,
            rotatedAt: now,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const touchClipboardPersonalDevice = async ({
    clerkUserId,
    deviceId,
    deviceName = null,
    platform = "unknown",
    ip = null,
    userAgent = null,
}) => {
    await ensureClipboardPersonalSchema();

    const now = Date.now();
    await query(
        `
        INSERT INTO user_clipboard_devices (
            clerk_user_id,
            device_id,
            device_name,
            platform,
            last_seen_at,
            last_ip,
            last_user_agent,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $5, $5)
        ON CONFLICT (clerk_user_id, device_id)
        DO UPDATE
        SET device_name = EXCLUDED.device_name,
            platform = EXCLUDED.platform,
            last_seen_at = EXCLUDED.last_seen_at,
            last_ip = EXCLUDED.last_ip,
            last_user_agent = EXCLUDED.last_user_agent,
            updated_at = EXCLUDED.updated_at;
        `,
        [clerkUserId, deviceId, deviceName, platform, now, ip, userAgent],
    );
};

export const listUsers = async ({
    page = 1,
    limit = 20,
    search = "",
    sort = "created_at",
    order = "desc",
} = {}) => {
    const parsedPage = Number.parseInt(String(page), 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimitRaw =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const safeLimit = Math.min(Math.max(safeLimitRaw, 1), 200);

    const offset = (safePage - 1) * safeLimit;

    const allowedSort = {
        id: "id",
        created_at: "created_at",
        updated_at: "updated_at",
        last_seen_at: "last_seen_at",
        points: "points",
        primary_email: "primary_email",
        full_name: "full_name",
    };

    const sortKey = String(sort);
    const sortColumn = allowedSort[sortKey] || allowedSort.created_at;

    const orderDir = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = [];
    let paramIndex = 1;

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
        const term = `%${normalizedSearch}%`;
        where.push(
            `(primary_email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex} OR clerk_user_id ILIKE $${paramIndex})`,
        );
        params.push(term);
        paramIndex += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await query(
        `SELECT COUNT(*) as total FROM users ${whereSql}`,
        params,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10) || 0;

    const listResult = await query(
        `
        SELECT *
        FROM users
        ${whereSql}
        ORDER BY ${sortColumn} ${orderDir} NULLS LAST, id DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1};
        `,
        [...params, safeLimit, offset],
    );

    return {
        users: listResult.rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};

export const updateUserPoints = async (id, points) => {
    const now = Date.now();
    const result = await query(
        `
        UPDATE users
        SET points = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *;
        `,
        [id, points, now],
    );

    return result.rows[0] || null;
};

const expireUserPointsHolds = async (client, userId, now) => {
    await client.query(
        `
        UPDATE user_points_holds
        SET status = 'released',
            updated_at = $3,
            released_at = $3
        WHERE user_id = $1
          AND status = 'held'
          AND expires_at <= $2;
        `,
        [userId, now, now],
    );
};

const getActiveHoldPoints = async (client, userId, now) => {
    const result = await client.query(
        `
        SELECT COALESCE(SUM(points), 0) AS held
        FROM user_points_holds
        WHERE user_id = $1
          AND status = 'held'
          AND expires_at > $2;
        `,
        [userId, now],
    );

    const held = Number.parseInt(result.rows?.[0]?.held ?? "0", 10);
    return Number.isFinite(held) ? held : 0;
};

const getActiveHoldCount = async (client, userId, now) => {
    const result = await client.query(
        `
        SELECT COUNT(*) AS count
        FROM user_points_holds
        WHERE user_id = $1
          AND status = 'held'
          AND expires_at > $2;
        `,
        [userId, now],
    );
    const count = Number.parseInt(result.rows?.[0]?.count ?? "0", 10);
    return Number.isFinite(count) ? count : 0;
};

const lockDownloadRequestClaim = async (client, {
    userId,
    queueId,
    ownerToken,
}) => {
    if (!queueId || !ownerToken) return true;

    const result = await client.query(
        `
        SELECT id
        FROM user_download_requests
        WHERE user_id = $1
          AND queue_id = $2
          AND status = 'processing'
          AND owner_token = $3
        FOR UPDATE;
        `,
        [userId, queueId, ownerToken],
    );
    return result.rowCount > 0;
};

const completeDownloadRequestWithClient = async (client, {
    userId,
    queueId,
    ownerToken,
    responseStatus,
    responseBody,
    now = Date.now(),
}) => {
    if (!queueId || !ownerToken) return true;

    const result = await client.query(
        `
        UPDATE user_download_requests
        SET status = 'completed',
            response_status = $4,
            response_body = $5,
            replay_expires_at = $6,
            lease_expires_at = $3,
            updated_at = $3
        WHERE user_id = $1
          AND queue_id = $2
          AND status = 'processing'
          AND owner_token = $7;
        `,
        [
            userId,
            queueId,
            now,
            responseStatus,
            responseBody,
            now + DOWNLOAD_REQUEST_REPLAY_MS,
            ownerToken,
        ],
    );
    return result.rowCount > 0;
};

export const claimDownloadRequest = async ({
    userId,
    queueId,
    sourceUrl,
} = {}) => {
    if (!userId || !queueId || !sourceUrl) {
        return { ok: true, status: "skipped" };
    }

    const client = await getClient();
    const now = Date.now();
    const ownerToken = nanoid(20);
    const leaseExpiresAt = now + DOWNLOAD_REQUEST_LEASE_MS;

    try {
        await client.query("BEGIN");
        await client.query(
            `
            DELETE FROM user_download_requests
            WHERE id IN (
                SELECT id
                FROM user_download_requests
                WHERE updated_at < $1
                  AND (status <> 'processing' OR lease_expires_at <= $2)
                ORDER BY updated_at
                LIMIT 100
            );
            `,
            [now - 24 * 60 * 60 * 1000, now],
        );
        const inserted = await client.query(
            `
            INSERT INTO user_download_requests (
                user_id,
                queue_id,
                source_url,
                status,
                owner_token,
                lease_expires_at,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, 'processing', $4, $5, $6, $6)
            ON CONFLICT (user_id, queue_id) DO NOTHING
            RETURNING *;
            `,
            [userId, queueId, sourceUrl, ownerToken, leaseExpiresAt, now],
        );

        if (inserted.rowCount) {
            const legacyHoldRes = await client.query(
                `
                SELECT status, expires_at
                FROM user_points_holds
                WHERE user_id = $1 AND queue_id = $2;
                `,
                [userId, queueId],
            );
            const legacyHold = legacyHoldRes.rows?.[0] ?? null;
            if (legacyHold?.status === "finalized") {
                await client.query("ROLLBACK");
                return { ok: false, code: "IDEMPOTENCY_FINALIZED" };
            }
            if (
                legacyHold?.status === "held" &&
                Number(legacyHold.expires_at) > now
            ) {
                await client.query("ROLLBACK");
                return { ok: false, code: "IDEMPOTENCY_IN_PROGRESS" };
            }
            await client.query("COMMIT");
            return { ok: true, status: "claimed", ownerToken };
        }

        const existingRes = await client.query(
            `
            SELECT *
            FROM user_download_requests
            WHERE user_id = $1 AND queue_id = $2
            FOR UPDATE;
            `,
            [userId, queueId],
        );
        const existing = existingRes.rows?.[0];
        const holdRes = await client.query(
            `
            SELECT status, expires_at
            FROM user_points_holds
            WHERE user_id = $1 AND queue_id = $2;
            `,
            [userId, queueId],
        );
        const action = resolveDownloadRequestAction({
            request: existing,
            sourceUrl,
            hold: holdRes.rows?.[0] ?? null,
            now,
        });
        if (action.action === "reject") {
            await client.query("ROLLBACK");
            return { ok: false, code: action.code };
        }
        if (action.action === "replay") {
            await client.query("COMMIT");
            return {
                ok: true,
                status: "replay",
                responseStatus: existing.response_status,
                responseBody: existing.response_body,
            };
        }

        await client.query(
            `
            UPDATE user_download_requests
            SET status = 'processing',
                owner_token = $3,
                response_status = NULL,
                response_body = NULL,
                replay_expires_at = NULL,
                lease_expires_at = $4,
                updated_at = $5
            WHERE user_id = $1 AND queue_id = $2;
            `,
            [userId, queueId, ownerToken, leaseExpiresAt, now],
        );
        await client.query("COMMIT");
        return { ok: true, status: "claimed", ownerToken };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const completeDownloadRequest = async ({
    userId,
    queueId,
    ownerToken,
    responseStatus,
    responseBody,
} = {}) => {
    const client = await getClient();
    try {
        const completed = await completeDownloadRequestWithClient(client, {
            userId,
            queueId,
            ownerToken,
            responseStatus,
            responseBody,
        });
        return { ok: completed };
    } finally {
        client.release();
    }
};

export const failDownloadRequest = async ({
    userId,
    queueId,
    ownerToken,
} = {}) => {
    if (!userId || !queueId || !ownerToken) return { ok: true };
    const now = Date.now();
    const result = await query(
        `
        UPDATE user_download_requests
        SET status = 'failed',
            owner_token = NULL,
            lease_expires_at = $3,
            updated_at = $3
        WHERE user_id = $1
          AND queue_id = $2
          AND status = 'processing'
          AND owner_token = $4;
        `,
        [userId, queueId, now, ownerToken],
    );
    return { ok: result.rowCount > 0 };
};

export const createPointsHold = async ({
    userId,
    points,
    expiresAt,
    reason = null,
    sourceUrl = null,
    queueId = null,
    allowFirstDownloadGrace = false,
    maxGracePoints = FIRST_DOWNLOAD_GRACE_MAX_POINTS,
    idempotencyOwnerToken = null,
    responseStatus = null,
    responseBody = null,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        const userRes = await client.query(
            `SELECT
                points,
                download_success_count,
                first_download_grace_eligible,
                first_download_grace_used
             FROM users
             WHERE id = $1
             FOR UPDATE;`,
            [userId],
        );
        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "USER_NOT_FOUND" };
        }

        const userPoints = Number(userRes.rows[0]?.points ?? 0);
        const ownsDownloadRequest = await lockDownloadRequestClaim(client, {
            userId,
            queueId,
            ownerToken: idempotencyOwnerToken,
        });
        if (!ownsDownloadRequest) {
            await client.query("ROLLBACK");
            return { ok: false, code: "IDEMPOTENCY_LOST" };
        }

        const completeQueuedRequest = async (hold) => {
            if (!idempotencyOwnerToken) return true;
            return completeDownloadRequestWithClient(client, {
                userId,
                queueId,
                ownerToken: idempotencyOwnerToken,
                responseStatus,
                responseBody: {
                    ...responseBody,
                    points: {
                        outcome: "held",
                        required: hold.required_points ?? hold.points,
                        before: userPoints,
                        after: userPoints,
                        holdId: hold.hold_id,
                        holdExpiresAt: hold.expires_at,
                    },
                },
                now,
            });
        };

        let existingHold = null;
        if (queueId) {
            const existingRes = await client.query(
                `
                SELECT *
                FROM user_points_holds
                WHERE user_id = $1 AND queue_id = $2
                FOR UPDATE;
                `,
                [userId, queueId],
            );
            existingHold = existingRes.rows?.[0] ?? null;

            if (
                existingHold &&
                existingHold.source_url &&
                sourceUrl &&
                existingHold.source_url !== sourceUrl
            ) {
                await client.query("ROLLBACK");
                return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
            }

            if (existingHold?.status === "held") {
                const refreshedRes = await client.query(
                    `
                    UPDATE user_points_holds
                    SET updated_at = $2,
                        expires_at = GREATEST(expires_at, $3)
                    WHERE id = $1
                    RETURNING *;
                    `,
                    [existingHold.id, now, expiresAt],
                );
                existingHold = refreshedRes.rows[0];
                if (!await completeQueuedRequest(existingHold)) {
                    await client.query("ROLLBACK");
                    return { ok: false, code: "IDEMPOTENCY_LOST" };
                }
                await client.query("COMMIT");
                return {
                    ok: true,
                    status: "held",
                    reused: true,
                    holdId: existingHold.hold_id,
                    pointsBefore: userPoints,
                    pointsHeld: existingHold.points,
                    pointsRequired: existingHold.required_points ?? existingHold.points,
                    expiresAt: existingHold.expires_at,
                };
            }

            if (existingHold?.status === "finalized") {
                await client.query("ROLLBACK");
                return { ok: false, code: "IDEMPOTENCY_FINALIZED" };
            }
        }

        const heldPoints = await getActiveHoldPoints(client, userId, now);
        const activeHoldCount = await getActiveHoldCount(client, userId, now);
        const available = userPoints - heldPoints;
        const requiredPoints = existingHold?.required_points ?? points;
        const graceCharge = calculateFirstDownloadGraceCharge({
            requiredPoints,
            availablePoints: available,
            allowFirstDownloadGrace,
            maxGracePoints,
            firstDownloadGraceEligible:
                userRes.rows[0]?.first_download_grace_eligible === true,
            firstDownloadGraceUsed:
                userRes.rows[0]?.first_download_grace_used === true,
            downloadSuccessCount:
                userRes.rows[0]?.download_success_count ?? 0,
            activeHoldCount,
        });
        const holdPoints = graceCharge.chargedPoints;

        if (!graceCharge.allowed) {
            await client.query("ROLLBACK");
            return {
                ok: false,
                code: "INSUFFICIENT_POINTS",
                current: Number.isFinite(available) ? available : userPoints,
                required: requiredPoints,
            };
        }

        if (existingHold) {
            const reactivated = await client.query(
                `
                UPDATE user_points_holds
                SET status = 'held',
                    points = $2,
                    required_points = $3,
                    grace_points = $4,
                    reason = COALESCE($5, reason),
                    source_url = COALESCE(source_url, $6),
                    updated_at = $7,
                    expires_at = $8,
                    finalized_at = NULL,
                    released_at = NULL
                WHERE id = $1
                RETURNING *;
                `,
                [
                    existingHold.id,
                    holdPoints,
                    requiredPoints,
                    graceCharge.gracePoints,
                    reason,
                    sourceUrl,
                    now,
                    expiresAt,
                ],
            );
            if (!await completeQueuedRequest(reactivated.rows[0])) {
                await client.query("ROLLBACK");
                return { ok: false, code: "IDEMPOTENCY_LOST" };
            }
            await client.query("COMMIT");
            const hold = reactivated.rows[0];
            return {
                ok: true,
                status: "held",
                reused: true,
                holdId: hold.hold_id,
                pointsBefore: userPoints,
                pointsHeld: hold.points,
                pointsRequired: hold.required_points ?? hold.points,
                expiresAt: hold.expires_at,
            };
        }

        const holdId = nanoid(16);
        await client.query(
            `
            INSERT INTO user_points_holds (
                hold_id,
                user_id,
                points,
                status,
                reason,
                source_url,
                queue_id,
                required_points,
                grace_points,
                created_at,
                updated_at,
                expires_at
            ) VALUES ($1, $2, $3, 'held', $4, $5, $6, $7, $8, $9, $9, $10);
            `,
            [
                holdId,
                userId,
                holdPoints,
                reason,
                sourceUrl,
                queueId,
                requiredPoints,
                graceCharge.gracePoints,
                now,
                expiresAt,
            ],
        );

        const insertedHold = {
            hold_id: holdId,
            points: holdPoints,
            required_points: requiredPoints,
            expires_at: expiresAt,
        };
        if (!await completeQueuedRequest(insertedHold)) {
            await client.query("ROLLBACK");
            return { ok: false, code: "IDEMPOTENCY_LOST" };
        }

        await client.query("COMMIT");

        return {
            ok: true,
            status: "held",
            holdId,
            pointsBefore: userPoints,
            pointsHeld: holdPoints,
            pointsRequired: requiredPoints,
            expiresAt,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const finalizePointsHold = async ({
    userId,
    holdId,
    reason = null,
    markDownloadSuccess = false,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        // Keep the lock order consistent with createPointsHold (user -> hold)
        // so a retry cannot deadlock with finalization of the same task.
        const userRes = await client.query(
            `SELECT points FROM users WHERE id = $1 FOR UPDATE;`,
            [userId],
        );
        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "USER_NOT_FOUND" };
        }
        const userPoints = Number(userRes.rows?.[0]?.points ?? 0);

        const holdRes = await client.query(
            `
            SELECT *
            FROM user_points_holds
            WHERE hold_id = $1 AND user_id = $2
            FOR UPDATE;
            `,
            [holdId, userId],
        );

        if (!holdRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "HOLD_NOT_FOUND" };
        }

        const hold = holdRes.rows[0];

        if (hold.status !== "held") {
            await client.query("COMMIT");
            return {
                ok: true,
                status: hold.status,
                charged: 0,
            };
        }

        if (hold.expires_at <= now) {
            await client.query(
                `
                UPDATE user_points_holds
                SET status = 'released',
                    updated_at = $2,
                    released_at = $2,
                    reason = COALESCE(reason, $3)
                WHERE id = $1;
                `,
                [hold.id, now, reason || 'hold_expired'],
            );
            await client.query("COMMIT");
            return { ok: false, code: "HOLD_EXPIRED", status: "released" };
        }

        const gracePoints = Math.max(0, Number(hold.grace_points) || 0);
        const useFirstDownloadGrace = gracePoints > 0;

        if (!Number.isFinite(userPoints) || userPoints < hold.points) {
            await client.query(
                `
                UPDATE user_points_holds
                SET status = 'released',
                    updated_at = $2,
                    released_at = $2,
                    reason = COALESCE(reason, $3)
                WHERE id = $1;
                `,
                [hold.id, now, reason || "insufficient_points"],
            );
            await client.query("COMMIT");
            return { ok: false, code: "INSUFFICIENT_POINTS", status: "released" };
        }

        const updated = await client.query(
            `
            UPDATE users
            SET points = points - $2,
                updated_at = $3,
                download_success_count = COALESCE(download_success_count, 0) +
                    CASE WHEN $4 THEN 1 ELSE 0 END,
                first_download_grace_used = CASE
                    WHEN $5 THEN true
                    ELSE first_download_grace_used
                END,
                first_download_grace_used_at = CASE
                    WHEN $5 THEN $3
                    ELSE first_download_grace_used_at
                END,
                first_download_grace_extra_points =
                    COALESCE(first_download_grace_extra_points, 0) + $6
            WHERE id = $1
            RETURNING *;
            `,
            [
                userId,
                hold.points,
                now,
                markDownloadSuccess,
                useFirstDownloadGrace,
                gracePoints,
            ],
        );

        await client.query(
            `
            UPDATE user_points_holds
            SET status = 'finalized',
                updated_at = $2,
                finalized_at = $2,
                reason = COALESCE(reason, $3)
            WHERE id = $1;
            `,
            [hold.id, now, reason],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            status: "finalized",
            charged: hold.points,
            pointsBefore: userPoints,
            pointsAfter: updated.rows?.[0]?.points ?? null,
            usedFirstDownloadGrace: useFirstDownloadGrace,
            gracePoints,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const releasePointsHold = async ({
    userId,
    holdId,
    reason = null,
} = {}) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, userId, now);

        const holdRes = await client.query(
            `
            SELECT *
            FROM user_points_holds
            WHERE hold_id = $1 AND user_id = $2
            FOR UPDATE;
            `,
            [holdId, userId],
        );

        if (!holdRes.rowCount) {
            await client.query("ROLLBACK");
            return { ok: false, code: "HOLD_NOT_FOUND" };
        }

        const hold = holdRes.rows[0];

        if (hold.status !== "held") {
            await client.query("COMMIT");
            return {
                ok: true,
                status: hold.status,
            };
        }

        const nextStatus = "released";
        await client.query(
            `
            UPDATE user_points_holds
            SET status = $2,
                updated_at = $3,
                released_at = $3,
                reason = COALESCE(reason, $4)
            WHERE id = $1;
            `,
            [hold.id, nextStatus, now, reason],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            status: nextStatus,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const consumeUserPoints = async (
    id,
    points,
    {
        allowFirstDownloadGrace = false,
        maxGracePoints = FIRST_DOWNLOAD_GRACE_MAX_POINTS,
        markDownloadSuccess = false,
        queueId = null,
        idempotencyOwnerToken = null,
        responseStatus = null,
        responseBody = null,
    } = {},
) => {
    const client = await getClient();
    const now = Date.now();

    try {
        await client.query("BEGIN");
        await expireUserPointsHolds(client, id, now);

        const userRes = await client.query(
            `
            SELECT
                points,
                download_success_count,
                first_download_grace_eligible,
                first_download_grace_used
            FROM users
            WHERE id = $1
            FOR UPDATE;
            `,
            [id],
        );
        if (!userRes.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }

        const userPoints = Number(userRes.rows?.[0]?.points ?? 0);
        const downloadSuccessCount = Number(
            userRes.rows?.[0]?.download_success_count ?? 0,
        );
        const firstDownloadGraceUsed =
            userRes.rows?.[0]?.first_download_grace_used === true;
        const firstDownloadGraceEligible =
            userRes.rows?.[0]?.first_download_grace_eligible === true;
        const heldPoints = await getActiveHoldPoints(client, id, now);
        const activeHoldCount = await getActiveHoldCount(client, id, now);
        const available = userPoints - heldPoints;
        const graceCharge = calculateFirstDownloadGraceCharge({
            requiredPoints: points,
            availablePoints: available,
            allowFirstDownloadGrace,
            maxGracePoints,
            firstDownloadGraceEligible,
            firstDownloadGraceUsed,
            downloadSuccessCount,
            activeHoldCount,
        });
        const {
            useFirstDownloadGrace,
            chargedPoints,
            gracePoints,
        } = graceCharge;

        if (!graceCharge.allowed) {
            await client.query("ROLLBACK");
            return null;
        }

        const ownsDownloadRequest = await lockDownloadRequestClaim(client, {
            userId: id,
            queueId,
            ownerToken: idempotencyOwnerToken,
        });
        if (!ownsDownloadRequest) {
            await client.query("ROLLBACK");
            return null;
        }

        const result = await client.query(
            `
            UPDATE users
            SET points = points - $2,
                updated_at = $3,
                download_success_count = COALESCE(download_success_count, 0) +
                    CASE WHEN $4 THEN 1 ELSE 0 END,
                first_download_grace_used = CASE
                    WHEN $5 THEN true
                    ELSE first_download_grace_used
                END,
                first_download_grace_used_at = CASE
                    WHEN $5 THEN $3
                    ELSE first_download_grace_used_at
                END,
                first_download_grace_extra_points = COALESCE(first_download_grace_extra_points, 0) + $6
            WHERE id = $1
            RETURNING *;
            `,
            [
                id,
                chargedPoints,
                now,
                markDownloadSuccess,
                useFirstDownloadGrace,
                useFirstDownloadGrace ? gracePoints : 0,
            ],
        );

        if (idempotencyOwnerToken) {
            const completed = await completeDownloadRequestWithClient(client, {
                userId: id,
                queueId,
                ownerToken: idempotencyOwnerToken,
                responseStatus,
                responseBody,
                now,
            });
            if (!completed) {
                await client.query("ROLLBACK");
                return null;
            }
        }

        await client.query("COMMIT");

        const updatedUser = result.rows[0] || null;
        if (!updatedUser) return null;

        updatedUser.chargeMeta = {
            chargedPoints,
            gracePoints: useFirstDownloadGrace ? gracePoints : 0,
            pointsBefore: userPoints,
            pointsAfter: updatedUser.points ?? null,
            usedFirstDownloadGrace: useFirstDownloadGrace,
        };
        return updatedUser;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        throw error;
    } finally {
        client.release();
    }
};

export const MEMBER_DOWNLOAD_LIMITS = Object.freeze({
    dailySuccessfulDownloads: 100,
    monthlySuccessfulDownloads: 2000,
});

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

const startOfChinaDay = (now = Date.now()) => {
    const shifted = new Date(now + CHINA_TIME_OFFSET_MS);
    return Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
    ) - CHINA_TIME_OFFSET_MS;
};

const startOfChinaMonth = (now = Date.now()) => {
    const shifted = new Date(now + CHINA_TIME_OFFSET_MS);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) -
        CHINA_TIME_OFFSET_MS;
};

const normalizeMembershipRow = (row, usage = null) => {
    if (!row) return null;

    const limits = {
        dailySuccessfulDownloads: MEMBER_DOWNLOAD_LIMITS.dailySuccessfulDownloads,
        monthlySuccessfulDownloads: MEMBER_DOWNLOAD_LIMITS.monthlySuccessfulDownloads,
    };
    const usageCounts = usage || {
        dailySuccessfulDownloads: 0,
        monthlySuccessfulDownloads: 0,
    };

    return {
        active: true,
        subscriptionId: row.subscription_id,
        planId: row.plan_id,
        planKey: row.plan_key,
        planName: row.plan_name,
        provider: row.provider,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        entitlements: Array.isArray(row.entitlements)
            ? [...new Set(row.entitlements.filter(Boolean))].sort()
            : [],
        limits,
        usage: usageCounts,
        limitExceeded:
            usageCounts.dailySuccessfulDownloads >= limits.dailySuccessfulDownloads ||
            usageCounts.monthlySuccessfulDownloads >= limits.monthlySuccessfulDownloads,
    };
};

export const getActiveMembershipForUser = async (userId, now = Date.now()) => {
    const result = await query(
        `
        SELECT
            s.id AS subscription_id,
            s.plan_id,
            s.provider,
            s.status,
            s.current_period_start,
            s.current_period_end,
            p.key AS plan_key,
            p.name AS plan_name,
            ARRAY(
                SELECT pe.entitlement_key
                FROM plan_entitlements pe
                WHERE pe.plan_id = p.id
                ORDER BY pe.entitlement_key
            ) AS entitlements
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = $1
          AND s.status = 'active'
          AND p.is_active = true
          AND EXISTS (
              SELECT 1
              FROM plan_entitlements membership_entitlement
              WHERE membership_entitlement.plan_id = p.id
                AND membership_entitlement.entitlement_key = 'member_download'
          )
          AND (s.current_period_end IS NULL OR s.current_period_end > $2)
        ORDER BY COALESCE(s.current_period_end, 9223372036854775807) DESC, s.id DESC
        LIMIT 1;
        `,
        [userId, now],
    );

    const row = result.rows[0] || null;
    if (!row) return null;

    const usage = await getMembershipUsageCounts(userId, now);
    return normalizeMembershipRow(row, usage);
};

export const getMembershipFeatureEligibility = async (
    userId,
    feature,
    now = Date.now(),
) => {
    const membership = await getActiveMembershipForUser(userId, now);
    return evaluateMembershipFeatureEligibility({ feature, membership });
};

export const getMembershipUsageCounts = async (userId, now = Date.now()) => {
    const dayStart = startOfChinaDay(now);
    const monthStart = startOfChinaMonth(now);

    const result = await query(
        `
        SELECT
            COUNT(*) FILTER (WHERE created_at >= $2)::int AS daily_count,
            COUNT(*) FILTER (WHERE created_at >= $3)::int AS monthly_count
        FROM member_usage_events
        WHERE user_id = $1;
        `,
        [userId, dayStart, monthStart],
    );

    const row = result.rows[0] || {};
    return {
        dailySuccessfulDownloads: Number(row.daily_count || 0),
        monthlySuccessfulDownloads: Number(row.monthly_count || 0),
    };
};

export const checkMembershipDownloadAllowance = async (
    userId,
    now = Date.now(),
) => {
    const membership = await getActiveMembershipForUser(userId, now);
    if (!membership) {
        return { allowed: false, reason: "not_member", membership: null };
    }

    if (
        membership.usage.dailySuccessfulDownloads >=
        membership.limits.dailySuccessfulDownloads
    ) {
        return { allowed: false, reason: "daily_limit", membership };
    }

    if (
        membership.usage.monthlySuccessfulDownloads >=
        membership.limits.monthlySuccessfulDownloads
    ) {
        return { allowed: false, reason: "monthly_limit", membership };
    }

    return { allowed: true, reason: null, membership };
};

export const reserveMemberDownloadUsage = async ({
    userId,
    requestId = null,
    sourceUrl = null,
    isBatch = false,
    metadata = null,
}) => {
    const client = await getClient();
    const now = Date.now();
    const dayStart = startOfChinaDay(now);
    const monthStart = startOfChinaMonth(now);

    try {
        await client.query("BEGIN");

        const membershipResult = await client.query(
            `
            SELECT
                s.id AS subscription_id,
                s.plan_id,
                s.provider,
                s.status,
                s.current_period_start,
                s.current_period_end,
                p.key AS plan_key,
                p.name AS plan_name
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            JOIN plan_entitlements pe ON pe.plan_id = p.id
            WHERE s.user_id = $1
              AND s.status = 'active'
              AND p.is_active = true
              AND pe.entitlement_key = 'member_download'
              AND (s.current_period_end IS NULL OR s.current_period_end > $2)
            ORDER BY COALESCE(s.current_period_end, 9223372036854775807) DESC, s.id DESC
            LIMIT 1
            FOR UPDATE OF s;
            `,
            [userId, now],
        );

        const membershipRow = membershipResult.rows[0] || null;
        if (!membershipRow) {
            await client.query("ROLLBACK");
            return { allowed: false, reason: "not_member", membership: null };
        }

        const usageResult = await client.query(
            `
            SELECT
                COUNT(*) FILTER (WHERE created_at >= $2)::int AS daily_count,
                COUNT(*) FILTER (WHERE created_at >= $3)::int AS monthly_count
            FROM member_usage_events
            WHERE user_id = $1
              AND status IN ('reserved', 'success');
            `,
            [userId, dayStart, monthStart],
        );
        const usageRow = usageResult.rows[0] || {};
        const usage = {
            dailySuccessfulDownloads: Number(usageRow.daily_count || 0),
            monthlySuccessfulDownloads: Number(usageRow.monthly_count || 0),
        };
        const membership = normalizeMembershipRow(membershipRow, usage);

        if (
            usage.dailySuccessfulDownloads >=
            membership.limits.dailySuccessfulDownloads
        ) {
            await client.query("ROLLBACK");
            return { allowed: false, reason: "daily_limit", membership };
        }

        if (
            usage.monthlySuccessfulDownloads >=
            membership.limits.monthlySuccessfulDownloads
        ) {
            await client.query("ROLLBACK");
            return { allowed: false, reason: "monthly_limit", membership };
        }

        const insertResult = await client.query(
            `
            INSERT INTO member_usage_events (
                user_id,
                subscription_id,
                request_id,
                source_url,
                is_batch,
                status,
                created_at,
                metadata
            ) VALUES ($1,$2,$3,$4,$5,'reserved',$6,$7)
            RETURNING *;
            `,
            [
                userId,
                membership.subscriptionId,
                requestId,
                sourceUrl,
                isBatch === true,
                now,
                metadata,
            ],
        );

        await client.query("COMMIT");

        return {
            allowed: true,
            reason: null,
            membership: normalizeMembershipRow(membershipRow, {
                dailySuccessfulDownloads: usage.dailySuccessfulDownloads + 1,
                monthlySuccessfulDownloads: usage.monthlySuccessfulDownloads + 1,
            }),
            usageEvent: insertResult.rows[0] || null,
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

export const completeMemberDownloadUsage = async ({
    usageEventId,
    status = "success",
    service = null,
    durationSeconds = null,
    pointsEquivalent = null,
    metadata = null,
}) => {
    if (!usageEventId) return null;

    const now = Date.now();
    const normalizedStatus = status === "success" ? "success" : "failed";
    const result = await query(
        `
        UPDATE member_usage_events
        SET status = $2,
            service = COALESCE($3, service),
            duration_seconds = $4,
            points_equivalent = $5,
            completed_at = $6,
            metadata = COALESCE($7, metadata)
        WHERE id = $1
        RETURNING *;
        `,
        [
            usageEventId,
            normalizedStatus,
            service,
            Number.isFinite(Number(durationSeconds))
                ? Math.max(0, Math.round(Number(durationSeconds)))
                : null,
            Number.isFinite(Number(pointsEquivalent))
                ? Math.max(0, Math.round(Number(pointsEquivalent)))
                : null,
            now,
            metadata,
        ],
    );

    return result.rows[0] || null;
};

export const recordMemberDownloadUsage = async ({
    userId,
    subscriptionId = null,
    requestId = null,
    service = null,
    sourceUrl = null,
    durationSeconds = null,
    pointsEquivalent = null,
    isBatch = false,
    metadata = null,
}) => {
    const now = Date.now();
    const result = await query(
        `
        INSERT INTO member_usage_events (
            user_id,
            subscription_id,
            request_id,
            service,
            source_url,
            duration_seconds,
            points_equivalent,
            is_batch,
            created_at,
            metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *;
        `,
        [
            userId,
            subscriptionId,
            requestId,
            service,
            sourceUrl,
            Number.isFinite(Number(durationSeconds))
                ? Math.max(0, Math.round(Number(durationSeconds)))
                : null,
            Number.isFinite(Number(pointsEquivalent))
                ? Math.max(0, Math.round(Number(pointsEquivalent)))
                : null,
            isBatch === true,
            now,
            metadata,
        ],
    );

    return result.rows[0] || null;
};
